import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  data as responseData,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";
import {
  Badge,
  ActionList,
  Banner,
  BlockStack,
  Button,
  Card,
  Icon,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Popover,
  Spinner,
  Text,
  Tooltip,
  useIndexResourceState,
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  CheckIcon,
  CheckCircleIcon,
  ClipboardChecklistIcon,
  FilterIcon,
  InfoIcon,
  LockIcon,
  OrderIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
  UndoIcon,
  ViewIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { COUNTRY_MAP } from "../utils/countries";
import {
  getStableShopifyPlanFromBillingCheck,
  hasPaidPlanAccess,
  resolveEffectivePlan,
} from "../utils/effective-plan.server";
import { getStateName } from "../utils/states";
import {
  hasOrderScope,
  syncRecentOrderRisks,
} from "../utils/order-risk.server";
import {
  decryptProtectedData,
  hashProtectedData,
} from "../utils/secret-crypto.server";
import { shopifyBoundaryHeaders } from "../utils/shopify-boundary.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";

export { shopifyBoundaryHeaders as headers };

const PAGE_SIZE = 25;

function normalizeIPAddresses(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,]+/)
    .map((ip) => ip.trim())
    .filter(Boolean);
}

function hasPaidBillingConfig(billingConfig: any, settings: any) {
  const shopifyPlan = getStableShopifyPlanFromBillingCheck(
    billingConfig,
    settings?.currentPlan,
  );
  const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
  return (
    hasPaidPlanAccess(effectivePlan) ||
    billingConfig.hasActivePayment ||
    billingConfig.appSubscriptions.length > 0
  );
}

function normalizeFilter(value: string | null, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function decryptRiskSignals(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(decryptProtectedData(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function riskWhere(risk: string) {
  if (!["HIGH", "MEDIUM", "LOW", "PENDING", "NONE"].includes(risk)) {
    return {};
  }

  if (risk === "HIGH") {
    return {
      OR: [{ shopifyRiskLevel: "HIGH" }, { appRiskLevel: "HIGH" }],
    };
  }
  if (risk === "MEDIUM") {
    return {
      AND: [
        { OR: [{ shopifyRiskLevel: "MEDIUM" }, { appRiskLevel: "MEDIUM" }] },
        { shopifyRiskLevel: { not: "HIGH" } },
        { appRiskLevel: { not: "HIGH" } },
      ],
    };
  }
  if (risk === "LOW") {
    return {
      AND: [
        { OR: [{ shopifyRiskLevel: "LOW" }, { appRiskLevel: "LOW" }] },
        { shopifyRiskLevel: { notIn: ["HIGH", "MEDIUM"] } },
        { appRiskLevel: { notIn: ["HIGH", "MEDIUM"] } },
      ],
    };
  }
  if (risk === "PENDING") {
    return {
      AND: [
        { OR: [{ shopifyRiskLevel: "PENDING" }, { appRiskLevel: "PENDING" }] },
        { shopifyRiskLevel: { notIn: ["HIGH", "MEDIUM", "LOW"] } },
        { appRiskLevel: { notIn: ["HIGH", "MEDIUM", "LOW"] } },
      ],
    };
  }
  return {
    AND: [{ shopifyRiskLevel: "NONE" }, { appRiskLevel: "NONE" }],
  };
}

const RISK_RANK: Record<string, number> = {
  NONE: 0,
  PENDING: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
};

function overallRiskLevel(shopifyLevel: string, appLevel: string) {
  return (RISK_RANK[appLevel] || 0) > (RISK_RANK[shopifyLevel] || 0)
    ? appLevel
    : shopifyLevel;
}

async function getOfflineScope(shop: string, fallback?: string | null) {
  const offlineSession = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
    select: { scope: true },
  });
  return offlineSession?.scope || fallback || "";
}

async function getGrantedScopes(
  admin: { graphql: (query: string) => Promise<Response> },
  fallback?: string | null,
) {
  try {
    const response = await admin.graphql(
      `#graphql
        query GeoGrantedAccessScopes {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    );
    const body: any = await response.json();
    const handles = body?.data?.currentAppInstallation?.accessScopes
      ?.map((scope: any) => String(scope?.handle || "").trim())
      .filter(Boolean);

    return Array.isArray(handles) && handles.length > 0
      ? handles.join(",")
      : fallback || "";
  } catch (error) {
    console.error("[OrderRisk] Failed to verify granted scopes:", error);
    return fallback || "";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = normalizeFilter(url.searchParams.get("q"), "");
  const protectedQueryHash = query ? hashProtectedData(query) : "";
  const prefixedOrderQueryHash =
    query && !query.startsWith("#")
      ? hashProtectedData(`#${query}`)
      : protectedQueryHash;
  const risk = normalizeFilter(url.searchParams.get("risk"), "all").toUpperCase();
  const reviewStatus = normalizeFilter(
    url.searchParams.get("status"),
    "all",
  ).toLowerCase();
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;
  const periodStart = new Date();
  periodStart.setUTCDate(periodStart.getUTCDate() - 30);

  const filtersWhere = [
    query
      ? {
          OR: [
            { orderNameHash: protectedQueryHash },
            { orderNameHash: prefixedOrderQueryHash },
            { clientIpHash: protectedQueryHash },
            { lastRuleName: { contains: query, mode: "insensitive" } },
          ],
        }
      : null,
    risk === "ALL" ? null : riskWhere(risk),
  ].filter(Boolean);
  const where: any = {
    shop: session.shop,
    ...(reviewStatus === "all" ? {} : { reviewStatus }),
    ...(filtersWhere.length > 0 ? { AND: filtersWhere } : {}),
  };

  const [
    records,
    total,
    totalRecent,
    highRisk,
    needsReview,
    activeIpBlockRules,
    shopifyFlagged,
    scope,
    settings,
    billingConfig,
  ] = await Promise.all([
    prisma.orderRiskRecord.findMany({
      where,
      orderBy: { orderCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.orderRiskRecord.count({ where }),
    prisma.orderRiskRecord.count({
      where: { shop: session.shop, orderCreatedAt: { gte: periodStart } },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        orderCreatedAt: { gte: periodStart },
        ...riskWhere("HIGH"),
      },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        reviewStatus: "open",
        OR: [riskWhere("HIGH"), riskWhere("MEDIUM")],
      },
    }),
    prisma.redirectRule.findMany({
      where: {
        shop: session.shop,
        matchType: "ip",
        ruleType: "block",
        isActive: true,
      },
      select: { ipAddresses: true },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        shopifyRiskLevel: { in: ["LOW", "MEDIUM", "HIGH"] },
      },
    }),
    getGrantedScopes(
      admin,
      await getOfflineScope(session.shop, session.scope),
    ),
    prisma.settings.findUnique({ where: { shop: session.shop } }),
    checkBillingWithFallback(billing, isBillingTestMode()),
  ]);
  const blockedIps = new Set(
    activeIpBlockRules.flatMap((rule) =>
      normalizeIPAddresses(rule.ipAddresses),
    ),
  );

  return responseData({
    filters: { page, query, reviewStatus, risk },
    hasOrderAccess: hasOrderScope(scope),
    hasPaidPlan: hasPaidBillingConfig(billingConfig, settings),
    metrics: {
      highRisk,
      needsReview,
      shopifyFlagged,
      totalRecent,
    },
    records: records.map((record) => {
      const clientIp = decryptProtectedData(record.clientIp);
      const ipRegionCode = decryptProtectedData(record.ipRegionCode);
      const storedRegionName = decryptProtectedData(record.ipRegionName);
      const mappedRegionName = ipRegionCode
        ? getStateName(ipRegionCode)
        : "";

      return {
        ...record,
        clientIp,
        financialStatus: decryptProtectedData(record.financialStatus),
        fulfillmentStatus: decryptProtectedData(record.fulfillmentStatus),
        ipCity: decryptProtectedData(record.ipCity),
        ipCountryCode: decryptProtectedData(record.ipCountryCode),
        ipRegionCode,
        ipRegionName:
          storedRegionName ||
          (mappedRegionName !== ipRegionCode ? mappedRegionName : ""),
        legacyOrderId:
          decryptProtectedData(record.legacyOrderIdEncrypted) ||
          record.legacyOrderId,
        isIpBlocked: Boolean(clientIp && blockedIps.has(clientIp)),
        orderName: decryptProtectedData(record.orderName),
        createdAt: record.createdAt.toISOString(),
        orderCreatedAt: record.orderCreatedAt.toISOString(),
        processedAt: record.processedAt?.toISOString() || null,
        riskSignals: decryptRiskSignals(record.riskSignals),
        totalAmount: Number(
          decryptProtectedData(record.totalAmountEncrypted) ||
            record.totalAmount,
        ),
        updatedAt: record.updatedAt.toISOString(),
      };
    }),
    shop: session.shop,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "sync_orders") {
    const offline = await unauthenticated.admin(session.shop);
    const grantedScopes = await getGrantedScopes(
      offline.admin,
      offline.session.scope,
    );
    if (!hasOrderScope(grantedScopes)) {
      return responseData(
        {
          error:
            "Shopify has not issued an access token with Order permission yet. Approve the updated app permissions, reopen the app, then try again.",
        },
        { status: 403 },
      );
    }

    try {
      const result = await syncRecentOrderRisks({
        admin: offline.admin,
        limit: 25,
        publishAssessment: false,
        shop: session.shop,
      });
      return responseData({
        message: `Synced ${result.synced} of ${result.total} recent orders${
          result.errors.length ? `; ${result.errors.length} failed` : ""
        }.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sync Shopify orders";
      const isPermissionError =
        /access denied.*orders|not approved.*order|permission/i.test(message);

      console.error("[OrderRisk] Recent order sync failed:", error);
      return responseData(
        {
          error: isPermissionError
            ? "Shopify denied access to Orders for the current token. Reapprove the app permissions and reopen the app before syncing."
            : "Recent orders could not be synced. Please try again.",
        },
        { status: isPermissionError ? 403 : 502 },
      );
    }
  }

  if (intent === "load_risk_details") {
    const id = String(formData.get("id") || "");
    try {
      const record = await prisma.orderRiskRecord.findFirst({
        where: { id, shop: session.shop },
        select: {
          legacyOrderId: true,
          legacyOrderIdEncrypted: true,
        },
      });
      const decryptedLegacyId = decryptProtectedData(
        record?.legacyOrderIdEncrypted,
      );
      const legacyOrderId =
        decryptedLegacyId ||
        (/^\d+$/.test(record?.legacyOrderId || "")
          ? record?.legacyOrderId || ""
          : "");
      if (!legacyOrderId) {
        return responseData(
          {
            error: "The Shopify order ID is unavailable for this record.",
            recordId: id,
          },
          { status: 400 },
        );
      }

      const response = await admin.graphql(
        `#graphql
          query GeoOrderRiskDetails($id: ID!) {
            order(id: $id) {
              risk {
                recommendation
                assessments {
                  riskLevel
                  provider {
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
        {
          variables: {
            id: `gid://shopify/Order/${legacyOrderId}`,
          },
        },
      );
      const body: any = await response.json();
      if (body?.errors?.length) {
        throw new Error(
          body.errors
            .map((error: any) => error?.message)
            .filter(Boolean)
            .join("; ") || "Shopify risk details query failed",
        );
      }
      const order = body?.data?.order;
      if (!order) {
        return responseData(
          { error: "Shopify order not found.", recordId: id },
          { status: 404 },
        );
      }

      const assessments = Array.isArray(order.risk?.assessments)
        ? order.risk.assessments
            .map((assessment: any) => ({
              facts: Array.isArray(assessment?.facts)
                ? assessment.facts
                    .filter(
                      (fact: any) =>
                        typeof fact?.description === "string" &&
                        fact.description.trim(),
                    )
                    .slice(0, 50)
                    .map((fact: any) => ({
                      description: fact.description.trim().slice(0, 1000),
                      sentiment: ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(
                        String(fact.sentiment || "").toUpperCase(),
                      )
                        ? String(fact.sentiment).toUpperCase()
                        : "NEUTRAL",
                    }))
                : [],
              providerTitle:
                typeof assessment?.provider?.title === "string"
                  ? assessment.provider.title
                  : null,
              riskLevel: normalizeFilter(
                assessment?.riskLevel,
                "NONE",
              ).toUpperCase(),
            }))
            .slice(0, 20)
        : [];

      return responseData({
        recordId: id,
        riskDetails: {
          assessments,
          recommendation: normalizeFilter(
            order.risk?.recommendation,
            "NONE",
          ).toUpperCase(),
        },
      });
    } catch (error) {
      console.error("[OrderRisk] Failed to load Shopify risk details:", error);
      const message =
        error instanceof Error ? error.message : "Shopify request failed";
      return responseData(
        {
          error: /access denied|permission|scope/i.test(message)
            ? "Shopify denied access to order risk details. Reapprove the read_orders permission."
            : "Shopify risk details could not be loaded. Please try again.",
          recordId: id,
        },
        { status: /access denied|permission|scope/i.test(message) ? 403 : 502 },
      );
    }
  }

  if (intent === "set_review_status") {
    const id = String(formData.get("id") || "");
    const reviewStatus =
      String(formData.get("reviewStatus") || "") === "reviewed"
        ? "reviewed"
        : "open";
    const updated = await prisma.orderRiskRecord.updateMany({
      where: { id, shop: session.shop },
      data: { reviewStatus },
    });
    if (updated.count === 0) {
      return responseData({ error: "Order risk record not found." }, { status: 404 });
    }
    return responseData({
      message:
        reviewStatus === "reviewed"
          ? "Order marked as reviewed."
          : "Order returned to the review queue.",
    });
  }

  if (intent === "bulk_mark_reviewed") {
    const ids = Array.from(
      new Set(
        formData
          .getAll("ids")
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ).slice(0, 100);
    if (ids.length === 0) {
      return responseData(
        { error: "Select at least one order to mark as reviewed." },
        { status: 400 },
      );
    }

    const updated = await prisma.orderRiskRecord.updateMany({
      where: {
        id: { in: ids },
        shop: session.shop,
        reviewStatus: { not: "reviewed" },
      },
      data: { reviewStatus: "reviewed" },
    });
    if (updated.count === 0) {
      return responseData({
        message: "All selected orders are already reviewed.",
      });
    }

    return responseData({
      message: `${updated.count} selected order${
        updated.count === 1 ? "" : "s"
      } marked as reviewed.`,
    });
  }

  if (intent === "bulk_reopen_reviews") {
    const ids = Array.from(
      new Set(
        formData
          .getAll("ids")
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ).slice(0, 100);
    if (ids.length === 0) {
      return responseData(
        { error: "Select at least one reviewed order to reopen." },
        { status: 400 },
      );
    }

    const updated = await prisma.orderRiskRecord.updateMany({
      where: {
        id: { in: ids },
        shop: session.shop,
        reviewStatus: "reviewed",
      },
      data: { reviewStatus: "open" },
    });
    if (updated.count === 0) {
      return responseData({
        message: "All selected orders are already open for review.",
      });
    }

    return responseData({
      message: `${updated.count} selected order${
        updated.count === 1 ? "" : "s"
      } reopened for review.`,
    });
  }

  if (intent === "bulk_block_ips") {
    try {
      const ids = Array.from(
        new Set(
          formData
            .getAll("ids")
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ).slice(0, 100);
      if (ids.length === 0) {
        return responseData(
          { error: "Select at least one order with an IP address to block." },
          { status: 400 },
        );
      }

      const [billingConfig, settings, records] = await Promise.all([
        checkBillingWithFallback(billing, isBillingTestMode()),
        prisma.settings.findUnique({ where: { shop: session.shop } }),
        prisma.orderRiskRecord.findMany({
          where: {
            id: { in: ids },
            shop: session.shop,
          },
          select: { clientIp: true },
        }),
      ]);

      if (!hasPaidBillingConfig(billingConfig, settings)) {
        return responseData(
          { error: "IP blocking is available on paid plans only." },
          { status: 403 },
        );
      }

      const selectedIps = Array.from(
        new Set(
          records
            .map((record) => decryptProtectedData(record.clientIp))
            .map((ip) => ip.trim())
            .filter(Boolean),
        ),
      );
      if (selectedIps.length === 0) {
        return responseData(
          { error: "The selected orders do not have IP addresses to block." },
          { status: 400 },
        );
      }

      const existingRules = await prisma.redirectRule.findMany({
        where: {
          shop: session.shop,
          matchType: "ip",
          ruleType: "block",
          isActive: true,
        },
        select: { ipAddresses: true },
      });
      const blockedIps = new Set(
        existingRules.flatMap((rule) =>
          normalizeIPAddresses(rule.ipAddresses).map((ip) => ip.toLowerCase()),
        ),
      );
      const newIps = selectedIps.filter(
        (ip) => !blockedIps.has(ip.toLowerCase()),
      );

      if (newIps.length === 0) {
        return responseData({
          message: "All selected IP addresses are already blocked.",
        });
      }

      await prisma.redirectRule.create({
        data: {
          shop: session.shop,
          name: "Blocked from Order Risk (bulk)",
          ipAddresses: newIps.join(","),
          matchType: "ip",
          countryCodes: "",
          targetUrl: "",
          priority: 0,
          isActive: true,
          ruleType: "block",
          redirectMode: "auto_redirect",
          pageTargetingType: "all",
          pagePaths: null,
        },
      });
      invalidateStorefrontConfigCache(session.shop);

      const skippedCount = selectedIps.length - newIps.length;
      return responseData({
        message: `${newIps.length} IP address${
          newIps.length === 1 ? "" : "es"
        } blocked${skippedCount ? `; ${skippedCount} already blocked` : ""}.`,
      });
    } catch (error) {
      console.error("[OrderRisk] Failed to bulk block order IPs:", error);
      return responseData(
        {
          error:
            "The selected IP addresses could not be blocked. Please try again.",
        },
        { status: 500 },
      );
    }
  }

  if (intent === "block_ip") {
    try {
      const id = String(formData.get("id") || "");
      const [billingConfig, settings, record] = await Promise.all([
        checkBillingWithFallback(billing, isBillingTestMode()),
        prisma.settings.findUnique({ where: { shop: session.shop } }),
        prisma.orderRiskRecord.findFirst({
          where: { id, shop: session.shop },
          select: { clientIp: true },
        }),
      ]);

      if (!hasPaidBillingConfig(billingConfig, settings)) {
        return responseData(
          { error: "IP blocking is available on paid plans only." },
          { status: 403 },
        );
      }

      const clientIp = decryptProtectedData(record?.clientIp);
      if (!clientIp) {
        return responseData(
          { error: "This order does not have an IP address to block." },
          { status: 400 },
        );
      }

      const existingRules = await prisma.redirectRule.findMany({
        where: {
          shop: session.shop,
          matchType: "ip",
          ruleType: "block",
          isActive: true,
        },
        select: { ipAddresses: true },
      });
      const alreadyBlocked = existingRules.some((rule) =>
        normalizeIPAddresses(rule.ipAddresses).includes(clientIp),
      );

      if (alreadyBlocked) {
        return responseData({ message: `${clientIp} is already blocked.` });
      }

      await prisma.redirectRule.create({
        data: {
          shop: session.shop,
          name: "Blocked from Order Risk",
          ipAddresses: clientIp,
          matchType: "ip",
          countryCodes: "",
          targetUrl: "",
          priority: 0,
          isActive: true,
          ruleType: "block",
          redirectMode: "auto_redirect",
          pageTargetingType: "all",
          pagePaths: null,
        },
      });
      invalidateStorefrontConfigCache(session.shop);

      return responseData({
        message: `${clientIp} was added to IP Rules and blocked.`,
      });
    } catch (error) {
      console.error("[OrderRisk] Failed to block order IP:", error);
      return responseData(
        { error: "The IP address could not be blocked. Please try again." },
        { status: 500 },
      );
    }
  }

  return responseData({ error: "Unsupported action." }, { status: 400 });
};

function riskTone(level: string) {
  if (level === "HIGH") return "critical" as const;
  if (level === "MEDIUM") return "warning" as const;
  if (level === "LOW") return "info" as const;
  if (level === "PENDING") return "attention" as const;
  return "success" as const;
}

function riskLabel(level: string) {
  if (level === "NONE") return "No risk";
  if (level === "PENDING") return "Pending";
  return `${level.charAt(0)}${level.slice(1).toLowerCase()}`;
}

function humanizeStatus(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unavailable";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatMoney(amount: number, currencyCode: string) {
  const normalizedCurrency = String(currencyCode || "").toUpperCase();

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

function formatLocation(record: {
  ipCity: string | null;
  ipCountryCode: string | null;
  ipRegionCode: string | null;
  ipRegionName: string | null;
}) {
  const countryCode = String(record.ipCountryCode || "").toUpperCase();
  const values = [
    record.ipCity,
    record.ipRegionName || record.ipRegionCode,
    COUNTRY_MAP[countryCode] || countryCode,
  ].filter((value): value is string => Boolean(value));
  const uniqueValues = values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) => candidate.toLowerCase() === value.toLowerCase(),
      ) === index,
  );
  return uniqueValues.join(", ") || "Unknown location";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function adminOrderUrl(shop: string, legacyOrderId: string | null) {
  if (!legacyOrderId) return "";
  const shopHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${shopHandle}/orders/${legacyOrderId}`;
}

export default function OrderRiskPage() {
  const {
    filters,
    hasOrderAccess,
    hasPaidPlan,
    metrics,
    records,
    shop,
    total,
    totalPages,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const riskDetailFetcher = useFetcher<typeof action>();
  const bulkActionFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(filters.query);
  const [risk, setRisk] = useState(filters.risk);
  const [reviewStatus, setReviewStatus] = useState(filters.reviewStatus);
  const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
  const [riskPopoverOpen, setRiskPopoverOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{
    id: string;
    ip: string;
  } | null>(null);
  const [bulkBlockModalOpen, setBulkBlockModalOpen] = useState(false);
  const [riskDetailTarget, setRiskDetailTarget] = useState<
    (typeof records)[number] | null
  >(null);
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(records);
  const selectedRecords = records.filter((record) =>
    selectedResources.includes(record.id),
  );
  const selectedUnreviewedRecords = selectedRecords.filter(
    (record) => record.reviewStatus !== "reviewed",
  );
  const selectedReviewedRecords = selectedRecords.filter(
    (record) => record.reviewStatus === "reviewed",
  );
  const selectedBlockableRecords = selectedRecords.filter(
    (record) => record.clientIp && !record.isIpBlocked,
  );
  const selectedBlockableIpCount = new Set(
    selectedBlockableRecords.map((record) =>
      String(record.clientIp).toLowerCase(),
    ),
  ).size;
  const isSyncing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "sync_orders";
  const isBlockingIp =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "block_ip";
  const isBulkActionRunning = bulkActionFetcher.state !== "idle";
  const isBulkBlocking =
    isBulkActionRunning &&
    bulkActionFetcher.formData?.get("intent") === "bulk_block_ips";
  const metricsList = [
    {
      label: "Orders · 30 days",
      value: metrics.totalRecent,
      detail: "Orders analyzed in the last 30 days",
      icon: OrderIcon,
      tone: "blue",
    },
    {
      label: "High risk",
      value: metrics.highRisk,
      detail: "Orders requiring attention",
      icon: AlertTriangleIcon,
      tone: "orange",
    },
    {
      label: "Needs review",
      value: metrics.needsReview,
      detail: "Open review queue",
      icon: ClipboardChecklistIcon,
      tone: "purple",
    },
    {
      label: "Shopify flagged",
      value: metrics.shopifyFlagged,
      detail: "Orders with Shopify risk findings",
      icon: ShieldCheckMarkIcon,
      tone: "green",
    },
  ];
  const reviewViews = [
    { label: "All orders", value: "all" },
    { label: "Not reviewed", value: "open" },
    { label: "Reviewed", value: "reviewed" },
  ];
  const riskViews = [
    { label: "All risk levels", value: "ALL" },
    { label: "High", value: "HIGH" },
    { label: "Medium", value: "MEDIUM" },
    { label: "Low", value: "LOW" },
    { label: "Pending", value: "PENDING" },
    { label: "No risk found", value: "NONE" },
  ];
  const riskDetailSignals = (riskDetailTarget?.riskSignals || []) as Array<{
    code?: string;
    detail?: string;
    label?: string;
    severity?: string;
  }>;
  const riskDetailResponse = riskDetailFetcher.data as
    | {
        error?: string;
        recordId?: string;
        riskDetails?: {
          assessments?: Array<{
            facts?: Array<{
              description?: string;
              sentiment?: string;
            }>;
            providerTitle?: string | null;
            riskLevel?: string;
          }>;
          recommendation?: string;
        };
      }
    | undefined;
  const activeShopifyRiskDetails =
    riskDetailTarget &&
    riskDetailResponse?.recordId === riskDetailTarget.id
      ? riskDetailResponse.riskDetails
      : undefined;
  const activeRiskDetailError =
    riskDetailTarget &&
    riskDetailResponse?.recordId === riskDetailTarget.id
      ? riskDetailResponse.error
      : undefined;
  const isLoadingRiskDetails =
    Boolean(riskDetailTarget) &&
    riskDetailFetcher.state !== "idle" &&
    riskDetailFetcher.formData?.get("intent") === "load_risk_details";
  const shopifyRiskDetailItems: Array<{
    text: string;
    tone: "success" | "warning" | "subdued";
  }> = [];
  for (const assessment of activeShopifyRiskDetails?.assessments || []) {
    for (const fact of assessment.facts || []) {
      if (!fact.description) continue;
      const providerPrefix = assessment.providerTitle
        ? `${assessment.providerTitle}: `
        : "";
      shopifyRiskDetailItems.push({
        text: `${providerPrefix}${fact.description}`,
        tone:
          fact.sentiment === "POSITIVE"
            ? "success"
            : fact.sentiment === "NEGATIVE"
              ? "warning"
              : "subdued",
      });
    }
  }
  const appRiskDetailItems: Array<{
    text: string;
    tone: "success" | "warning" | "subdued";
  }> = [];
  if (riskDetailTarget) {
    appRiskDetailItems.push({
      text: `Geo risk assessment: ${riskLabel(riskDetailTarget.appRiskLevel)} (score ${riskDetailTarget.appRiskScore}/100).`,
      tone:
        riskDetailTarget.appRiskLevel === "NONE"
          ? "success"
          : ["HIGH", "MEDIUM"].includes(riskDetailTarget.appRiskLevel)
            ? "warning"
            : "subdued",
    });
    appRiskDetailItems.push({
      text: riskDetailTarget.clientIp
        ? `This order was placed from IP address ${riskDetailTarget.clientIp}.`
        : "The IP address used to place this order is unavailable.",
      tone: riskDetailTarget.clientIp ? "success" : "subdued",
    });
    appRiskDetailItems.push({
      text: `IP location: ${formatLocation(riskDetailTarget)}.`,
      tone: "subdued",
    });
    for (const signal of riskDetailSignals) {
      appRiskDetailItems.push({
        text: signal.detail || signal.label || signal.code || "Risk signal detected.",
        tone:
          signal.severity === "high" || signal.severity === "medium"
            ? "warning"
            : "subdued",
      });
    }
    if (riskDetailSignals.length === 0) {
      appRiskDetailItems.push({
        text: "No suspicious IP reputation or order-velocity signals were detected.",
        tone: "success",
      });
    }
  }
  const selectedReviewLabel =
    reviewViews.find((view) => view.value === reviewStatus)?.label ||
    "All orders";

  useEffect(() => {
    setQuery(filters.query);
    setRisk(filters.risk);
    setReviewStatus(filters.reviewStatus);
  }, [filters.query, filters.reviewStatus, filters.risk]);

  useEffect(() => {
    if (!actionData || !("message" in actionData) || !actionData.message) return;
    shopify.toast.show(actionData.message);
    setBlockTarget(null);
  }, [actionData, shopify]);

  useEffect(() => {
    if (bulkActionFetcher.state !== "idle" || !bulkActionFetcher.data) return;
    const result = bulkActionFetcher.data as {
      error?: string;
      message?: string;
    };
    if (result.error) {
      shopify.toast.show(result.error, { isError: true });
      return;
    }
    if (!result.message) return;
    shopify.toast.show(result.message);
    setBulkBlockModalOpen(false);
    clearSelection();
  }, [
    bulkActionFetcher.data,
    bulkActionFetcher.state,
    clearSelection,
    shopify,
  ]);

  const applyFilters = (next: {
    query?: string;
    risk?: string;
    reviewStatus?: string;
  }) => {
    const params = new URLSearchParams(searchParams);
    const nextQuery = next.query ?? query;
    const nextRisk = next.risk ?? risk;
    const nextReviewStatus = next.reviewStatus ?? reviewStatus;

    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    else params.delete("q");

    if (nextRisk !== "ALL") params.set("risk", nextRisk);
    else params.delete("risk");

    if (nextReviewStatus !== "all") params.set("status", nextReviewStatus);
    else params.delete("status");

    params.delete("page");
    navigate(params.size > 0 ? `?${params.toString()}` : "?");
  };

  const selectReviewView = (value: string) => {
    setReviewStatus(value);
    setReviewPopoverOpen(false);
    applyFilters({ reviewStatus: value });
  };

  const selectRiskView = (value: string) => {
    setRisk(value);
    setRiskPopoverOpen(false);
    applyFilters({ risk: value });
  };

  const submitBulkAction = (
    intent:
      | "bulk_block_ips"
      | "bulk_mark_reviewed"
      | "bulk_reopen_reviews",
  ) => {
    if (selectedResources.length === 0 || isBulkActionRunning) return;
    const ids =
      intent === "bulk_mark_reviewed"
        ? selectedUnreviewedRecords.map((record) => record.id)
        : intent === "bulk_reopen_reviews"
          ? selectedReviewedRecords.map((record) => record.id)
        : selectedResources;
    if (ids.length === 0) {
      shopify.toast.show(
        intent === "bulk_reopen_reviews"
          ? "All selected orders are already open for review."
          : "All selected orders are already reviewed.",
      );
      return;
    }
    const formData = new FormData();
    formData.append("intent", intent);
    for (const id of ids) formData.append("ids", id);
    bulkActionFetcher.submit(formData, { method: "post" });
  };

  const handleBulkBlock = () => {
    if (!hasPaidPlan) {
      shopify.toast.show("Upgrade to a paid plan to use IP blocking.");
      navigate("/app/pricing");
      return;
    }
    if (selectedBlockableRecords.length === 0) {
      shopify.toast.show(
        "The selected orders do not have any unblocked IP addresses.",
        { isError: true },
      );
      return;
    }
    setBulkBlockModalOpen(true);
  };

  const promotedBulkActions = [
    ...(selectedUnreviewedRecords.length > 0
      ? [
          {
            content: "Mark reviewed",
            disabled: isBulkActionRunning,
            onAction: () => submitBulkAction("bulk_mark_reviewed"),
          },
        ]
      : []),
    ...(selectedReviewedRecords.length > 0
      ? [
          {
            content: "Reopen",
            disabled: isBulkActionRunning,
            onAction: () => submitBulkAction("bulk_reopen_reviews"),
          },
        ]
      : []),
    {
      content: "Block IPs",
      disabled: isBulkActionRunning,
      onAction: handleBulkBlock,
    },
  ];

  const paginationUrl = useMemo(
    () => (page: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(page));
      return `?${params.toString()}`;
    },
    [searchParams],
  );

  const rows = records.map((record, index) => {
    const overallRisk = overallRiskLevel(
      record.shopifyRiskLevel,
      record.appRiskLevel,
    );
    const signals = record.riskSignals as Array<{
      code?: string;
      label?: string;
      detail?: string;
    }>;
    const orderUrl = adminOrderUrl(shop, record.legacyOrderId);
    const requiresReview =
      overallRisk === "HIGH" || overallRisk === "MEDIUM";

    return (
      <IndexTable.Row
        id={record.id}
        key={record.id}
        onClick={() => undefined}
        position={index}
        selected={selectedResources.includes(record.id)}
      >
        <IndexTable.Cell>
          <div
            className="order-risk-order"
            onClick={(event) => event.stopPropagation()}
          >
            {orderUrl ? (
              <a
                className="order-risk-order-link"
                href={orderUrl}
                target="_blank"
                rel="noreferrer"
              >
                {record.orderName}
              </a>
            ) : (
              <Text as="span" fontWeight="semibold">
                {record.orderName}
              </Text>
            )}
            <Text as="span" variant="bodyXs" tone="subdued">
              {formatDate(record.orderCreatedAt)}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <span className="order-risk-ip">
            {record.clientIp || "Unavailable"}
          </span>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" fontWeight="medium">
              {formatLocation(record)}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <span
            className="order-risk-money"
            title={`${record.totalAmount.toLocaleString()} ${record.currencyCode}`}
          >
            {formatMoney(record.totalAmount, record.currencyCode)}
          </span>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div className="order-risk-assessment">
            <span className="order-risk-badge">
              <Badge tone={riskTone(record.shopifyRiskLevel)}>
                {`Shopify: ${riskLabel(record.shopifyRiskLevel)}`}
              </Badge>
            </span>
            <span className="order-risk-badge">
              <Badge tone={riskTone(record.appRiskLevel)}>
                {`Geo: ${riskLabel(record.appRiskLevel)}`}
              </Badge>
            </span>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {signals.length > 0 ? (
            <div className="order-risk-signals">
              {signals
                .slice(0, 2)
                .map((signal) => signal.label || signal.code)
                .filter(Boolean)
                .join(" · ")}
              {signals.length > 2 ? ` +${signals.length - 2}` : ""}
            </div>
          ) : (
            <span className="order-risk-clear-signal">
              No suspicious signals
            </span>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              record.reviewStatus === "reviewed"
                ? "success"
                : requiresReview
                  ? "attention"
                  : undefined
            }
          >
            {record.reviewStatus === "reviewed"
              ? "Reviewed"
              : requiresReview
                ? "Needs review"
                : "Not reviewed"}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div
            className="order-risk-actions"
            onClick={(event) => event.stopPropagation()}
          >
            <Form method="post">
              <input type="hidden" name="intent" value="set_review_status" />
              <input type="hidden" name="id" value={record.id} />
              <input
                type="hidden"
                name="reviewStatus"
                value={
                  record.reviewStatus === "reviewed" ? "open" : "reviewed"
                }
              />
              <Tooltip
                content={
                  record.reviewStatus === "reviewed"
                    ? "Reopen review"
                    : "Mark as reviewed"
                }
              >
                <Button
                  size="slim"
                  variant="tertiary"
                  icon={
                    record.reviewStatus === "reviewed"
                      ? UndoIcon
                      : CheckIcon
                  }
                  accessibilityLabel={
                    record.reviewStatus === "reviewed"
                      ? "Reopen review"
                      : "Mark as reviewed"
                  }
                  submit
                />
              </Tooltip>
            </Form>
            <Tooltip
              content={
                record.isIpBlocked
                  ? "IP already blocked"
                  : !hasPaidPlan
                    ? "Upgrade to a paid plan to block IPs"
                    : record.clientIp
                      ? "Block IP address"
                      : "IP address unavailable"
              }
            >
              <Button
                size="slim"
                variant="tertiary"
                icon={LockIcon}
                accessibilityLabel={
                  record.isIpBlocked
                    ? "IP already blocked"
                    : !hasPaidPlan
                      ? "Upgrade to block IP address"
                      : "Block IP address"
                }
                disabled={!record.clientIp || record.isIpBlocked}
                onClick={() => {
                  if (!hasPaidPlan) {
                    shopify.toast.show(
                      "Upgrade to a paid plan to use IP blocking.",
                    );
                    navigate("/app/pricing");
                    return;
                  }
                  setBlockTarget({ id: record.id, ip: record.clientIp });
                }}
              />
            </Tooltip>
            <Tooltip content="View risk details">
              <Button
                size="slim"
                variant="tertiary"
                icon={ViewIcon}
                accessibilityLabel="View risk details"
                onClick={() => {
                  setRiskDetailTarget(record);
                  riskDetailFetcher.submit(
                    {
                      id: record.id,
                      intent: "load_risk_details",
                    },
                    { method: "post" },
                  );
                }}
              />
            </Tooltip>
          </div>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page fullWidth>
      <TitleBar title="Order Risk" />
      <style>
        {`
          .order-risk-page {
            display: grid;
            gap: 12px;
            padding: 4px 0 32px;
          }
          .order-risk-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 20px;
          }
          .order-risk-heading {
            display: grid;
            gap: 3px;
          }
          .order-risk-metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .order-risk-metric {
            align-items: flex-start;
            display: flex;
            gap: 12px;
            min-height: 122px;
            padding: 16px;
          }
          .order-risk-metric-icon {
            align-items: center;
            border-radius: 50%;
            display: inline-flex;
            flex: 0 0 auto;
            height: 42px;
            justify-content: center;
            width: 42px;
          }
          .order-risk-metric-icon .Polaris-Icon {
            height: 22px;
            width: 22px;
          }
          .order-risk-metric-icon .Polaris-Icon__Svg {
            fill: currentColor;
          }
          .order-risk-metric-icon.is-blue {
            background: #e8f0ff;
            color: #1769e0;
          }
          .order-risk-metric-icon.is-orange {
            background: #fff0e6;
            color: #d85b00;
          }
          .order-risk-metric-icon.is-purple {
            background: #f0e9ff;
            color: #7047eb;
          }
          .order-risk-metric-icon.is-green {
            background: #e6f5eb;
            color: #16834b;
          }
          .order-risk-metric-copy {
            display: grid;
            gap: 4px;
            min-width: 0;
          }
          .order-risk-toolbar {
            align-items: center;
            border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
            display: flex;
            gap: 8px;
            min-height: 44px;
            padding: 6px 12px;
          }
          .order-risk-search {
            align-items: center;
            border-radius: var(--p-border-radius-200, 8px);
            display: flex;
            flex: 1 1 320px;
            gap: 6px;
            min-width: 0;
            padding: 4px 8px;
            transition: background-color 120ms ease, box-shadow 120ms ease;
          }
          .order-risk-view {
            flex: 0 0 auto;
            min-width: max-content;
          }
          .order-risk-view .Polaris-Button__Content {
            white-space: nowrap;
          }
          .order-risk-search:focus-within {
            background: var(--p-color-bg-surface-secondary, #f7f7f7);
            box-shadow: inset 0 0 0 2px var(--p-color-border-focus, #005bd3);
          }
          .order-risk-search-input {
            background: transparent;
            border: 0;
            color: var(--p-color-text, #303030);
            flex: 1 1 auto;
            font: inherit;
            line-height: 24px;
            min-width: 0;
            outline: 0;
            padding: 0;
          }
          .order-risk-search-input::placeholder {
            color: var(--p-color-text-secondary, #616161);
          }
          .order-risk-search-input::-webkit-search-cancel-button {
            display: none;
          }
          .order-risk-search-icon,
          .order-risk-search-clear {
            align-items: center;
            display: inline-flex;
            flex: 0 0 20px;
            height: 20px;
            justify-content: center;
            width: 20px;
          }
          .order-risk-search-clear {
            background: transparent;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            padding: 0;
          }
          .order-risk-search-clear:hover {
            background: var(--p-color-bg-surface-hover, #f1f1f1);
          }
          .order-risk-filter {
            border-left: 1px solid var(--p-color-border-secondary, #ebebeb);
            flex: 0 0 auto;
            margin-left: auto;
            padding-left: 8px;
          }
          .order-risk-table-card {
            overflow: hidden;
            border: 1px solid var(--p-color-border-secondary, #e3e3e3);
            border-radius: 12px;
            background: var(--p-color-bg-surface, #fff);
          }
          .order-risk-table-card table {
            min-width: 1280px;
            table-layout: fixed;
            width: 100%;
          }
          .order-risk-table-card th:nth-child(1),
          .order-risk-table-card td:nth-child(1) {
            width: 44px;
          }
          .order-risk-table-card th:nth-child(2),
          .order-risk-table-card td:nth-child(2) {
            width: 11%;
          }
          .order-risk-table-card th:nth-child(3),
          .order-risk-table-card td:nth-child(3) {
            width: 10%;
          }
          .order-risk-table-card th:nth-child(4),
          .order-risk-table-card td:nth-child(4) {
            width: 21%;
          }
          .order-risk-table-card th:nth-child(5),
          .order-risk-table-card td:nth-child(5) {
            width: 10%;
          }
          .order-risk-table-card th:nth-child(6),
          .order-risk-table-card td:nth-child(6) {
            width: 12%;
          }
          .order-risk-table-card th:nth-child(7),
          .order-risk-table-card td:nth-child(7) {
            width: 15%;
          }
          .order-risk-table-card th:nth-child(8),
          .order-risk-table-card td:nth-child(8) {
            width: 9%;
          }
          .order-risk-table-card th:nth-child(9),
          .order-risk-table-card td:nth-child(9) {
            width: 8.5%;
          }
          .order-risk-signals {
            max-width: 260px;
            color: var(--p-color-text-secondary, #616161);
            font-size: 12px;
            line-height: 16px;
          }
          .order-risk-order {
            align-items: flex-start;
            display: grid;
            gap: 4px;
            justify-items: start;
            text-align: left;
            width: 100%;
          }
          .order-risk-order-link {
            color: var(--p-color-text-link, #005bd3);
            display: inline-block;
            font-weight: 600;
            margin: 0;
            padding: 0;
            text-align: left;
            text-decoration: none;
          }
          .order-risk-order-link:hover {
            text-decoration: underline;
          }
          .order-risk-ip {
            color: var(--p-color-text, #303030);
            font-family: var(--p-font-family-mono, ui-monospace, monospace);
            font-size: 12px;
            overflow-wrap: anywhere;
          }
          .order-risk-money {
            display: block;
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            text-align: right;
            white-space: nowrap;
          }
          .order-risk-table-card th:nth-child(5),
          .order-risk-table-card td:nth-child(5) {
            padding-right: 24px;
            text-align: right;
          }
          .order-risk-assessment {
            align-items: flex-start;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .order-risk-badge {
            align-self: flex-start;
            display: inline-flex;
            flex: 0 0 auto;
            max-width: max-content;
            width: auto;
          }
          .order-risk-badge .Polaris-Badge {
            width: auto !important;
          }
          .order-risk-actions {
            align-items: center;
            display: flex;
            flex-wrap: nowrap;
            gap: 8px;
            justify-content: flex-end;
            min-width: 0;
            width: 100%;
          }
          .order-risk-actions form {
            display: inline-flex;
            margin: 0;
          }
          .order-risk-table-card th:last-child,
          .order-risk-table-card td:last-child {
            box-sizing: border-box;
            padding-right: 20px;
            text-align: right;
          }
          .order-risk-detail-list {
            display: grid;
            gap: 8px;
            list-style: none;
            margin: 0;
            padding: 0;
          }
          .order-risk-detail-item {
            align-items: flex-start;
            display: grid;
            gap: 8px;
            grid-template-columns: 18px minmax(0, 1fr);
          }
          .order-risk-detail-item .Polaris-Icon {
            height: 16px;
            margin: 1px 0 0;
            width: 16px;
          }
          .order-risk-detail-copy {
            color: var(--p-color-text, #303030);
            font-size: 13px;
            line-height: 18px;
          }
          .order-risk-detail-note {
            border-top: 1px solid var(--p-color-border-secondary, #e1e3e5);
            color: var(--p-color-text-secondary, #616161);
            font-size: 13px;
            line-height: 18px;
            padding-top: 10px;
          }
          .order-risk-clear-signal {
            align-items: center;
            color: var(--p-color-text, #303030);
            display: inline-flex;
            font-size: 12px;
            line-height: 16px;
            white-space: nowrap;
          }
          .order-risk-pagination {
            display: flex;
            justify-content: flex-start;
            padding: 8px 12px;
            border-top: 1px solid var(--p-color-border-secondary, #e3e3e3);
          }
          @media (max-width: 64em) {
            .order-risk-metrics {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (max-width: 47.9975em) {
            .order-risk-header {
              align-items: stretch;
              flex-direction: column;
            }
            .order-risk-metrics {
              grid-template-columns: 1fr;
            }
            .order-risk-toolbar {
              gap: 4px;
              padding-inline: 8px;
            }
            .order-risk-toolbar .Polaris-Button {
              padding-inline: 8px;
            }
          }
        `}
      </style>

      <div className="order-risk-page">
        <header className="order-risk-header">
          <div className="order-risk-heading">
            <Text as="h1" variant="headingLg">
              Order Risk
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Review Shopify fraud signals alongside IP and geolocation activity.
            </Text>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="sync_orders" />
            <Button
              variant="primary"
              submit
              loading={isSyncing}
              disabled={!hasOrderAccess}
            >
              Sync recent orders
            </Button>
          </Form>
        </header>

        {!hasOrderAccess ? (
          <Banner tone="warning" title="Order permission required">
            <p>
              Approve the app&apos;s updated order and protected customer data
              permissions before syncing orders.
            </p>
          </Banner>
        ) : null}

        {actionData && "error" in actionData && actionData.error ? (
          <Banner tone="critical" title="Order risk update failed">
            <p>{actionData.error}</p>
          </Banner>
        ) : null}
        <div className="order-risk-metrics">
          {metricsList.map((metric) => (
            <Card key={metric.label} padding="0">
              <div className="order-risk-metric">
                <span
                  className={`order-risk-metric-icon is-${metric.tone}`}
                  aria-hidden="true"
                >
                  <Icon source={metric.icon} />
                </span>
                <div className="order-risk-metric-copy">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {metric.label}
                  </Text>
                  <Text as="p" variant="headingXl">
                    {metric.value.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {metric.detail}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="order-risk-table-card">
          <form
            className="order-risk-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ query });
            }}
          >
            <div className="order-risk-view">
              <Popover
                active={reviewPopoverOpen}
                activator={
                  <Button
                    size="slim"
                    variant="tertiary"
                    disclosure="select"
                    pressed={reviewPopoverOpen}
                    onClick={() => setReviewPopoverOpen((open) => !open)}
                  >
                    {selectedReviewLabel}
                  </Button>
                }
                onClose={() => setReviewPopoverOpen(false)}
                preferredAlignment="left"
                autofocusTarget="first-node"
              >
                <ActionList
                  actionRole="menuitem"
                  items={reviewViews.map((view) => ({
                    content: view.label,
                    active: reviewStatus === view.value,
                    prefix:
                      reviewStatus === view.value ? (
                        <Icon source={CheckIcon} />
                      ) : (
                        <span style={{ display: "block", width: "20px" }} />
                      ),
                    onAction: () => selectReviewView(view.value),
                  }))}
                />
              </Popover>
            </div>

            <div className="order-risk-search">
              <span className="order-risk-search-icon" aria-hidden="true">
                <Icon source={SearchIcon} tone="subdued" />
              </span>
              <input
                className="order-risk-search-input"
                type="search"
                aria-label="Search orders"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search order, IP, country, city or rule"
                autoComplete="off"
              />
              {query ? (
                <button
                  className="order-risk-search-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    applyFilters({ query: "" });
                  }}
                >
                  <Icon source={XIcon} tone="subdued" />
                </button>
              ) : null}
            </div>

            <div className="order-risk-filter">
              <Popover
                active={riskPopoverOpen}
                activator={
                  <Button
                    size="slim"
                    variant="tertiary"
                    icon={FilterIcon}
                    accessibilityLabel="Filter by risk level"
                    pressed={riskPopoverOpen || risk !== "ALL"}
                    onClick={() => setRiskPopoverOpen((open) => !open)}
                  />
                }
                onClose={() => setRiskPopoverOpen(false)}
                preferredAlignment="right"
                autofocusTarget="first-node"
              >
                <ActionList
                  actionRole="menuitem"
                  items={riskViews.map((view) => ({
                    content: view.label,
                    active: risk === view.value,
                    prefix:
                      risk === view.value ? (
                        <Icon source={CheckIcon} />
                      ) : (
                        <span style={{ display: "block", width: "20px" }} />
                      ),
                    onAction: () => selectRiskView(view.value),
                  }))}
                />
              </Popover>
            </div>
          </form>

          <IndexTable
            resourceName={{ singular: "order", plural: "orders" }}
            itemCount={records.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            promotedBulkActions={promotedBulkActions}
            headings={[
              { title: "Order" },
              { title: "IP address" },
              { title: "Location" },
              { title: "Order total", alignment: "end" },
              { title: "Risk assessment" },
              { title: "IP context" },
              { title: "Review status" },
              { title: "Action", alignment: "end" },
            ]}
            emptyState={
              <div style={{ padding: 32, textAlign: "center" }}>
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h3" variant="headingMd">
                    No order risk records yet
                  </Text>
                  <Text as="p" tone="subdued">
                    Sync recent orders or wait for the next Shopify order webhook.
                  </Text>
                </BlockStack>
              </div>
            }
          >
            {rows}
          </IndexTable>
          {total > PAGE_SIZE ? (
            <div className="order-risk-pagination">
              <Pagination
                hasPrevious={filters.page > 1}
                hasNext={filters.page < totalPages}
                onPrevious={() => navigate(paginationUrl(filters.page - 1))}
                onNext={() => navigate(paginationUrl(filters.page + 1))}
              />
            </div>
          ) : null}
        </div>

        <Modal
          open={Boolean(riskDetailTarget)}
          onClose={() => setRiskDetailTarget(null)}
          title="About this order"
        >
          <Modal.Section>
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="p" variant="headingSm">
                  {riskDetailTarget?.orderName || "Order"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Shopify fraud analysis with additional Geo IP context
                </Text>
              </BlockStack>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Shopify fraud analysis
                  </Text>
                  {activeShopifyRiskDetails ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Recommendation:{" "}
                      {humanizeStatus(
                        activeShopifyRiskDetails.recommendation,
                      )}
                    </Text>
                  ) : null}
                </BlockStack>
                {isLoadingRiskDetails ? (
                  <InlineStack align="center" gap="200">
                    <Spinner size="small" accessibilityLabel="Loading Shopify risk details" />
                    <Text as="span" variant="bodySm" tone="subdued">
                      Loading the latest fraud facts from Shopify…
                    </Text>
                  </InlineStack>
                ) : activeRiskDetailError ? (
                  <Banner tone="warning" title="Shopify details unavailable">
                    <p>{activeRiskDetailError}</p>
                  </Banner>
                ) : (
                  <ul className="order-risk-detail-list">
                    {(shopifyRiskDetailItems.length > 0
                      ? shopifyRiskDetailItems
                      : [
                          {
                            text: "Shopify returned no detailed fraud facts for this order.",
                            tone: "subdued" as const,
                          },
                        ]
                    ).map((item, index) => (
                      <li
                        className="order-risk-detail-item"
                        key={`shopify-${index}-${item.text}`}
                      >
                        <Icon
                          source={
                            item.tone === "success"
                              ? CheckCircleIcon
                              : item.tone === "warning"
                                ? AlertTriangleIcon
                                : InfoIcon
                          }
                          tone={item.tone}
                        />
                        <span className="order-risk-detail-copy">
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </BlockStack>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Geo risk analysis
                </Text>
                <ul className="order-risk-detail-list">
                  {appRiskDetailItems.map((item, index) => (
                    <li
                      className="order-risk-detail-item"
                      key={`geo-${index}-${item.text}`}
                    >
                      <Icon
                        source={
                          item.tone === "success"
                            ? CheckCircleIcon
                            : item.tone === "warning"
                              ? AlertTriangleIcon
                              : InfoIcon
                        }
                        tone={item.tone}
                      />
                      <span className="order-risk-detail-copy">
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </BlockStack>
              <div className="order-risk-detail-note">
                Shopify facts are loaded live from the Admin GraphQL API.
                Geo findings are calculated separately by this app.{" "}
                {riskDetailTarget &&
                adminOrderUrl(shop, riskDetailTarget.legacyOrderId) ? (
                  <a
                    href={adminOrderUrl(
                      shop,
                      riskDetailTarget.legacyOrderId,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the order in Shopify Admin
                  </a>
                ) : null}
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Modal
          open={bulkBlockModalOpen}
          onClose={() => {
            if (!isBulkBlocking) setBulkBlockModalOpen(false);
          }}
          title="Block selected IP addresses?"
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                This creates an active IP blocking rule for{" "}
                <strong>
                  {selectedBlockableIpCount} unique selected order IP
                  {selectedBlockableIpCount === 1 ? "" : "s"}
                </strong>
                . Orders without an IP address and IPs already blocked will be
                skipped.
              </Text>
              <InlineStack align="end" gap="200">
                <Button
                  onClick={() => setBulkBlockModalOpen(false)}
                  disabled={isBulkBlocking}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={isBulkBlocking}
                  onClick={() => submitBulkAction("bulk_block_ips")}
                >
                  Block selected IPs
                </Button>
              </InlineStack>
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Modal
          open={Boolean(blockTarget)}
          onClose={() => {
            if (!isBlockingIp) setBlockTarget(null);
          }}
          title="Block this IP address?"
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                This creates an active IP blocking rule for{" "}
                <strong>{blockTarget?.ip}</strong>. Future storefront requests
                from this IP will be blocked.
              </Text>
              <InlineStack align="end" gap="200">
                <Button
                  onClick={() => setBlockTarget(null)}
                  disabled={isBlockingIp}
                >
                  Cancel
                </Button>
                <Form method="post">
                  <input type="hidden" name="intent" value="block_ip" />
                  <input
                    type="hidden"
                    name="id"
                    value={blockTarget?.id || ""}
                  />
                  <Button
                    submit
                    variant="primary"
                    loading={isBlockingIp}
                  >
                    Block IP
                  </Button>
                </Form>
              </InlineStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </div>
    </Page>
  );
}
