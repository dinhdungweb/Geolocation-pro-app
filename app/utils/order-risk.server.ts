import crypto from "node:crypto";

import prisma from "../db.server";
import { getCachedIpRiskByHash } from "./ip-risk.server";
import { getGeoFromIP } from "./maxmind.server";
import {
  encryptProtectedData,
  hashProtectedData,
} from "./secret-crypto.server";

const VISITOR_CONTEXT_DAYS = 7;
const ORDER_VELOCITY_HOURS = 24;
const RECENT_ORDER_WINDOW_DAYS = 30;

const BLOCK_ACTIONS = new Set([
  "blocked",
  "ip_block",
  "vpn_blocked",
]);

type RiskSignal = {
  code: string;
  label: string;
  detail: string;
  weight: number;
  severity: "low" | "medium" | "high";
};

type ShopifyAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type SyncOrderRiskOptions = {
  admin: ShopifyAdmin;
  orderId: string;
  publishAssessment: boolean;
  shop: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeEnum(value: unknown, fallback = "NONE") {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : fallback;
}

function asDate(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function orderGid(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("gid://shopify/Order/")
    ? raw
    : `gid://shopify/Order/${raw}`;
}

function maxShopifyRiskLevel(assessments: any[]) {
  const weights: Record<string, number> = {
    NONE: 0,
    PENDING: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
  };

  return assessments
    .filter((assessment) => !assessment?.provider)
    .map((assessment) => normalizeEnum(assessment?.riskLevel))
    .reduce(
      (highest, level) =>
        (weights[level] || 0) > (weights[highest] || 0) ? level : highest,
      "NONE",
    );
}

function appRiskLevel(score: number) {
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

function assessmentFingerprint(level: string, signals: RiskSignal[]) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        level,
        signals: signals.map((signal) => ({
          code: signal.code,
          detail: signal.detail,
          weight: signal.weight,
        })),
      }),
    )
    .digest("hex");
}

export function hasOrderScope(scope: string | null | undefined) {
  const scopes = new Set(
    String(scope || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return scopes.has("read_orders") || scopes.has("write_orders");
}

export function hasWriteOrderScope(scope: string | null | undefined) {
  return String(scope || "")
    .split(",")
    .map((value) => value.trim())
    .includes("write_orders");
}

export function getOrderIdFromWebhookPayload(payload: any) {
  return orderGid(
    payload?.admin_graphql_api_id ||
      payload?.adminGraphqlApiId ||
      payload?.order_id ||
      payload?.orderId ||
      payload?.id,
  );
}

async function fetchOrder(admin: ShopifyAdmin, id: string) {
  const response = await admin.graphql(
    `#graphql
      query GeoOrderRisk($id: ID!) {
        order(id: $id) {
          id
          legacyResourceId
          name
          createdAt
          processedAt
          clientIp
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          risk {
            recommendation
            assessments {
              riskLevel
              provider {
                id
                title
              }
              facts {
                description
                sentiment
              }
            }
          }
        }
      }
    `,
    { variables: { id } },
  );
  const body: any = await response.json();
  if (body?.errors?.length) {
    throw new Error(
      body.errors
        .map((error: any) => error?.message)
        .filter(Boolean)
        .join("; ") || "Shopify order query failed",
    );
  }
  return body?.data?.order || null;
}

async function getVisitorContext(
  shop: string,
  orderId: string,
  clientIp: string,
  clientIpHash: string,
  orderCreatedAt: Date,
) {
  if (!clientIp) {
    return {
      blockedBeforeOrder: false,
      lastLog: null,
      orderCount24Hours: 0,
      orderCount30Days: 0,
      vpnDetected: false,
    };
  }

  const contextStart = new Date(
    orderCreatedAt.getTime() - VISITOR_CONTEXT_DAYS * 24 * 60 * 60 * 1000,
  );
  const velocityStart = new Date(
    orderCreatedAt.getTime() - ORDER_VELOCITY_HOURS * 60 * 60 * 1000,
  );
  const recentOrderStart = new Date(
    orderCreatedAt.getTime() - RECENT_ORDER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [logs, orderCount24Hours, orderCount30Days] = await Promise.all([
    prisma.visitorLog.findMany({
      where: {
        shop,
        ipAddress: clientIp,
        timestamp: {
          gte: contextStart,
          lte: orderCreatedAt,
        },
      },
      orderBy: { timestamp: "desc" },
      take: 50,
      select: {
        action: true,
        city: true,
        countryCode: true,
        regionCode: true,
        regionName: true,
        ruleName: true,
        timestamp: true,
      },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop,
        clientIpHash,
        orderGid: { not: orderId },
        orderCreatedAt: {
          gte: velocityStart,
          lte: orderCreatedAt,
        },
      },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop,
        clientIpHash,
        orderGid: { not: orderId },
        orderCreatedAt: {
          gte: recentOrderStart,
          lte: orderCreatedAt,
        },
      },
    }),
  ]);

  return {
    blockedBeforeOrder: logs.some((log) => BLOCK_ACTIONS.has(log.action)),
    lastLog: logs[0] || null,
    orderCount24Hours,
    orderCount30Days,
    vpnDetected: logs.some((log) => log.action === "vpn_blocked"),
  };
}

function buildRiskSignals({
  blockedBeforeOrder,
  ipRiskLevel,
  ipRiskScore,
  ipRiskSignals,
  orderCount24Hours,
  orderCount30Days,
  vpnDetected,
}: {
  blockedBeforeOrder: boolean;
  ipRiskLevel: string | null;
  ipRiskScore: number | null;
  ipRiskSignals: string[];
  orderCount24Hours: number;
  orderCount30Days: number;
  vpnDetected: boolean;
}) {
  const signals: RiskSignal[] = [];

  if (ipRiskLevel === "HIGH") {
    signals.push({
      code: "high_ip_reputation",
      label: "High-risk IP reputation",
      detail: `IP reputation is high risk${ipRiskScore === null ? "" : ` (score ${ipRiskScore})`}${ipRiskSignals.length > 0 ? `: ${ipRiskSignals.slice(0, 3).join(", ")}` : "."}`,
      weight: 50,
      severity: "high",
    });
  } else if (ipRiskLevel === "MEDIUM") {
    signals.push({
      code: "suspicious_ip_reputation",
      label: "Suspicious IP reputation",
      detail: `IP reputation requires review${ipRiskScore === null ? "" : ` (score ${ipRiskScore})`}${ipRiskSignals.length > 0 ? `: ${ipRiskSignals.slice(0, 3).join(", ")}` : "."}`,
      weight: 25,
      severity: "medium",
    });
  } else if (ipRiskLevel === "LOW") {
    signals.push({
      code: "low_ip_reputation",
      label: "Low IP reputation signal",
      detail: `IP reputation returned a low-risk signal${ipRiskScore === null ? "" : ` (score ${ipRiskScore})`}.`,
      weight: 10,
      severity: "low",
    });
  }

  if (vpnDetected && ipRiskLevel !== "HIGH") {
    signals.push({
      code: "vpn_or_proxy",
      label: "VPN or proxy detected",
      detail: "This IP previously triggered the storefront VPN/proxy protection.",
      weight: 50,
      severity: "high",
    });
  } else if (blockedBeforeOrder) {
    signals.push({
      code: "previously_blocked",
      label: "Previously blocked IP",
      detail: "This IP triggered a blocking rule before the order was placed.",
      weight: 35,
      severity: "high",
    });
  }

  if (orderCount24Hours >= 5) {
    signals.push({
      code: "high_order_velocity",
      label: "High order velocity",
      detail: `${orderCount24Hours + 1} orders used this IP within 24 hours.`,
      weight: 35,
      severity: "high",
    });
  } else if (orderCount24Hours >= 2) {
    signals.push({
      code: "repeated_orders",
      label: "Repeated orders",
      detail: `${orderCount24Hours + 1} orders used this IP within 24 hours.`,
      weight: 20,
      severity: "medium",
    });
  } else if (orderCount30Days >= 4) {
    signals.push({
      code: "shared_ip",
      label: "Frequently used IP",
      detail: `${orderCount30Days + 1} orders used this IP in the last 30 days.`,
      weight: 15,
      severity: "low",
    });
  }

  return signals;
}

async function publishRiskAssessment({
  admin,
  orderId,
  level,
  signals,
}: {
  admin: ShopifyAdmin;
  orderId: string;
  level: string;
  signals: RiskSignal[];
}) {
  const response = await admin.graphql(
    `#graphql
      mutation GeoOrderRiskAssessment($input: OrderRiskAssessmentCreateInput!) {
        orderRiskAssessmentCreate(orderRiskAssessmentInput: $input) {
          orderRiskAssessment {
            riskLevel
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: {
          orderId,
          riskLevel: level,
          facts: signals.slice(0, 5).map((signal) => ({
            description: signal.detail.slice(0, 256),
            sentiment: "NEGATIVE",
          })),
        },
      },
    },
  );
  const body: any = await response.json();
  if (body?.errors?.length) {
    throw new Error(
      body.errors
        .map((error: any) => error?.message)
        .filter(Boolean)
        .join("; ") || "Shopify risk assessment mutation failed",
    );
  }
  const userErrors =
    body?.data?.orderRiskAssessmentCreate?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(
      userErrors
        .map((error: any) => error?.message)
        .filter(Boolean)
        .join("; "),
    );
  }
}

export async function syncOrderRisk({
  admin,
  orderId,
  publishAssessment,
  shop,
}: SyncOrderRiskOptions) {
  const normalizedOrderId = orderGid(orderId);
  if (!normalizedOrderId) throw new Error("Missing Shopify order ID");
  const orderRecordKey = hashProtectedData(normalizedOrderId);

  const order = await fetchOrder(admin, normalizedOrderId);
  if (!order) throw new Error(`Shopify order not found: ${normalizedOrderId}`);

  const createdAt = asDate(order.createdAt) || new Date();
  const clientIp =
    typeof order.clientIp === "string" ? order.clientIp.trim() : "";
  const clientIpHash = clientIp ? hashProtectedData(clientIp) : "";
  const visitorContext = await getVisitorContext(
    shop,
    orderRecordKey,
    clientIp,
    clientIpHash,
    createdAt,
  );
  const fallbackGeo = clientIp
    ? await getGeoFromIP(clientIp)
    : { countryCode: "", regionCode: "", regionName: "", city: "" };
  const ipCountryCode = String(
    visitorContext.lastLog?.countryCode || fallbackGeo.countryCode || "",
  ).toUpperCase();
  const ipRegionCode = String(
    visitorContext.lastLog?.regionCode || fallbackGeo.regionCode || "",
  );
  const ipRegionName = String(
    visitorContext.lastLog?.regionName || fallbackGeo.regionName || "",
  );
  const ipCity = String(
    visitorContext.lastLog?.city || fallbackGeo.city || "",
  );
  const ipRisk = clientIpHash
    ? await getCachedIpRiskByHash(clientIpHash)
    : null;
  const signals = buildRiskSignals({
    blockedBeforeOrder: visitorContext.blockedBeforeOrder,
    ipRiskLevel: ipRisk?.level || null,
    ipRiskScore: ipRisk?.score ?? null,
    ipRiskSignals: ipRisk?.signals || [],
    orderCount24Hours: visitorContext.orderCount24Hours,
    orderCount30Days: visitorContext.orderCount30Days,
    vpnDetected: visitorContext.vpnDetected,
  });
  const riskScore = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.weight, 0),
  );
  const riskLevel = appRiskLevel(riskScore);
  const shopifyAssessments = Array.isArray(order.risk?.assessments)
    ? order.risk.assessments
    : [];
  const shopifyRiskLevel = maxShopifyRiskLevel(shopifyAssessments);
  const totalAmount = Number(order.totalPriceSet?.shopMoney?.amount || 0);
  const storedTotalAmount = Number.isFinite(totalAmount) ? totalAmount : 0;
  const legacyOrderId = order.legacyResourceId
    ? String(order.legacyResourceId)
    : "";
  const orderName =
    order.name || String(order.legacyResourceId || "Order");
  const fingerprint = assessmentFingerprint(riskLevel, signals);
  const existing = await prisma.orderRiskRecord.findUnique({
    where: {
      shop_orderGid: {
        shop,
        orderGid: orderRecordKey,
      },
    },
    select: {
      assessmentFingerprint: true,
    },
  });

  const record = await prisma.orderRiskRecord.upsert({
    where: {
      shop_orderGid: {
        shop,
        orderGid: orderRecordKey,
      },
    },
    update: {
      appRiskLevel: riskLevel,
      appRiskScore: riskScore,
      assessmentError: null,
      clientIp: clientIp ? encryptProtectedData(clientIp) : null,
      clientIpHash: clientIpHash || null,
      currencyCode:
        order.totalPriceSet?.shopMoney?.currencyCode || "USD",
      financialStatus: order.displayFinancialStatus
        ? encryptProtectedData(order.displayFinancialStatus)
        : null,
      fulfillmentStatus: order.displayFulfillmentStatus
        ? encryptProtectedData(order.displayFulfillmentStatus)
        : null,
      ipCity: ipCity ? encryptProtectedData(ipCity) : null,
      ipCountryCode: ipCountryCode
        ? encryptProtectedData(ipCountryCode)
        : null,
      ipRegionCode: ipRegionCode
        ? encryptProtectedData(ipRegionCode)
        : null,
      ipRegionName: ipRegionName
        ? encryptProtectedData(ipRegionName)
        : null,
      lastRuleName: visitorContext.lastLog?.ruleName || null,
      lastVisitorAction: visitorContext.lastLog?.action || null,
      legacyOrderId: legacyOrderId
        ? hashProtectedData(legacyOrderId)
        : null,
      legacyOrderIdEncrypted: legacyOrderId
        ? encryptProtectedData(legacyOrderId)
        : null,
      orderCreatedAt: createdAt,
      orderName: encryptProtectedData(orderName),
      orderNameHash: hashProtectedData(orderName),
      processedAt: asDate(order.processedAt),
      riskSignals: encryptProtectedData(JSON.stringify(signals)),
      shopifyRecommendation: normalizeEnum(order.risk?.recommendation),
      shopifyRiskLevel,
      totalAmount: 0,
      totalAmountEncrypted: encryptProtectedData(String(storedTotalAmount)),
    },
    create: {
      appRiskLevel: riskLevel,
      appRiskScore: riskScore,
      clientIp: clientIp ? encryptProtectedData(clientIp) : null,
      clientIpHash: clientIpHash || null,
      currencyCode:
        order.totalPriceSet?.shopMoney?.currencyCode || "USD",
      financialStatus: order.displayFinancialStatus
        ? encryptProtectedData(order.displayFinancialStatus)
        : null,
      fulfillmentStatus: order.displayFulfillmentStatus
        ? encryptProtectedData(order.displayFulfillmentStatus)
        : null,
      ipCity: ipCity ? encryptProtectedData(ipCity) : null,
      ipCountryCode: ipCountryCode
        ? encryptProtectedData(ipCountryCode)
        : null,
      ipRegionCode: ipRegionCode
        ? encryptProtectedData(ipRegionCode)
        : null,
      ipRegionName: ipRegionName
        ? encryptProtectedData(ipRegionName)
        : null,
      lastRuleName: visitorContext.lastLog?.ruleName || null,
      lastVisitorAction: visitorContext.lastLog?.action || null,
      legacyOrderId: legacyOrderId
        ? hashProtectedData(legacyOrderId)
        : null,
      legacyOrderIdEncrypted: legacyOrderId
        ? encryptProtectedData(legacyOrderId)
        : null,
      orderCreatedAt: createdAt,
      orderGid: orderRecordKey,
      orderName: encryptProtectedData(orderName),
      orderNameHash: hashProtectedData(orderName),
      processedAt: asDate(order.processedAt),
      riskSignals: encryptProtectedData(JSON.stringify(signals)),
      shop,
      shopifyRecommendation: normalizeEnum(order.risk?.recommendation),
      shopifyRiskLevel,
      totalAmount: 0,
      totalAmountEncrypted: encryptProtectedData(String(storedTotalAmount)),
    },
  });

  if (
    !publishAssessment ||
    riskLevel === "NONE" ||
    existing?.assessmentFingerprint === fingerprint
  ) {
    return record;
  }

  try {
    await publishRiskAssessment({
      admin,
      orderId: normalizedOrderId,
      level: riskLevel,
      signals,
    });
    return await prisma.orderRiskRecord.update({
      where: { id: record.id },
      data: {
        assessmentError: null,
        assessmentFingerprint: fingerprint,
        assessmentSyncedAt: new Date(),
      },
    });
  } catch (error) {
    const message = errorMessage(error).slice(0, 1000);
    console.error(`[OrderRisk] Failed to publish assessment for ${shop}:`, error);
    await prisma.orderRiskRecord.update({
      where: { id: record.id },
      data: { assessmentError: message },
    });
    return record;
  }
}

export async function syncRecentOrderRisks({
  admin,
  limit = 25,
  publishAssessment,
  shop,
}: {
  admin: ShopifyAdmin;
  limit?: number;
  publishAssessment: boolean;
  shop: string;
}) {
  const take = Math.max(1, Math.min(50, Math.floor(limit)));
  const response = await admin.graphql(
    `#graphql
      query GeoRecentOrders($first: Int!) {
        orders(first: $first, reverse: true, sortKey: CREATED_AT) {
          nodes {
            id
          }
        }
      }
    `,
    { variables: { first: take } },
  );
  const body: any = await response.json();
  if (body?.errors?.length) {
    throw new Error(
      body.errors
        .map((error: any) => error?.message)
        .filter(Boolean)
        .join("; ") || "Unable to load Shopify orders",
    );
  }

  const orderIds = (body?.data?.orders?.nodes || [])
    .map((order: any) => orderGid(order?.id))
    .filter(Boolean);
  const errors: Array<{ orderId: string; error: string }> = [];
  let synced = 0;

  for (const id of orderIds) {
    try {
      await syncOrderRisk({
        admin,
        orderId: id,
        publishAssessment,
        shop,
      });
      synced += 1;
    } catch (error) {
      errors.push({ orderId: id, error: errorMessage(error) });
    }
  }

  return { errors, synced, total: orderIds.length };
}
