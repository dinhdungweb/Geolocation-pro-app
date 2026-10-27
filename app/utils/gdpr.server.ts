import prisma from "../db.server";
import { hashIP } from "./analytics-token.server";
import {
  decryptProtectedData,
  encryptProtectedData,
  hashProtectedData,
} from "./secret-crypto.server";

// Order IDs arrive as numbers in GDPR payloads; records store them plain
// (older rows) or keyed with hashProtectedData.
function orderIdLookupKeys(payload: unknown, field: "orders_requested" | "orders_to_redact") {
  const raw = (payload as Record<string, unknown> | null)?.[field];
  const ids = Array.isArray(raw) ? raw.map((id) => String(id)).filter(Boolean) : [];
  return { ids, keys: [...ids, ...ids.map((id) => hashProtectedData(id))] };
}

function findLinkedOrderRiskRecords(shop: string, keys: string[]) {
  if (keys.length === 0) return Promise.resolve([]);
  return prisma.orderRiskRecord.findMany({
    where: { shop, legacyOrderId: { in: keys } },
  });
}

function decrypt(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decryptProtectedData(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * customers/data_request: records what this app holds about the customer so it
 * can be handed to the merchant within Shopify's 30-day window. The app links
 * customer data only through orders (order risk records and the visitor logs of
 * the order's IP), so the export covers exactly those. Stored encrypted.
 */
export async function recordCustomerDataRequest(shop: string, payload: unknown) {
  const { ids, keys } = orderIdLookupKeys(payload, "orders_requested");
  const records = await findLinkedOrderRiskRecords(shop, keys);

  const ipHashes = records
    .map((record) => decrypt(record.clientIp))
    .filter((ip): ip is string => Boolean(ip))
    .map((ip) => hashIP(ip));
  const visitorLogs = ipHashes.length
    ? await prisma.visitorLog.findMany({
        where: { shop, ipHash: { in: ipHashes } },
        select: {
          timestamp: true,
          action: true,
          countryCode: true,
          regionName: true,
          city: true,
          path: true,
          ipAddress: true,
          userAgent: true,
        },
        orderBy: { timestamp: "desc" },
        take: 500,
      })
    : [];

  const exportData = {
    generatedAt: new Date().toISOString(),
    customerId: String((payload as any)?.customer?.id ?? ""),
    ordersRequested: ids,
    orderRiskRecords: records.map((record) => ({
      orderId: decrypt(record.legacyOrderIdEncrypted) || record.legacyOrderId,
      orderName: decrypt(record.orderName),
      orderCreatedAt: record.orderCreatedAt,
      clientIp: decrypt(record.clientIp),
      ipCountryCode: decrypt(record.ipCountryCode),
      ipRegionName: decrypt(record.ipRegionName),
      ipCity: decrypt(record.ipCity),
      riskLevel: record.appRiskLevel,
      riskScore: record.appRiskScore,
    })),
    visitorLogs,
  };

  await prisma.gdprDataRequest.create({
    data: {
      shop,
      customerId: exportData.customerId || null,
      ordersRequested: ids.join(","),
      exportEncrypted: encryptProtectedData(JSON.stringify(exportData)),
      status: "pending",
    },
  });

  return { orders: ids.length, records: records.length, visitorLogs: visitorLogs.length };
}

/**
 * customers/redact: deletes the order risk records of the listed orders and
 * the visitor logs tied to those orders' IP addresses.
 */
export async function redactCustomerData(shop: string, payload: unknown) {
  const { ids, keys } = orderIdLookupKeys(payload, "orders_to_redact");
  if (keys.length === 0) return { orders: 0, visitorLogs: 0 };

  const records = await findLinkedOrderRiskRecords(shop, keys);
  const ips = records
    .map((record) => decrypt(record.clientIp))
    .filter((ip): ip is string => Boolean(ip));

  let deletedVisitorLogs = 0;
  if (ips.length > 0) {
    const result = await prisma.visitorLog.deleteMany({
      where: {
        shop,
        OR: [{ ipHash: { in: ips.map((ip) => hashIP(ip)) } }, { ipAddress: { in: ips } }],
      },
    });
    deletedVisitorLogs = result.count;
  }

  await prisma.orderRiskRecord.deleteMany({ where: { shop, legacyOrderId: { in: keys } } });
  return { orders: ids.length, visitorLogs: deletedVisitorLogs };
}
