import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
  isBillableAnalyticsEvent,
  type AnalyticsTokenPayload,
} from "./analytics-token.server";
import { getVisitorIP } from "./request-ip.server";

export type RecordStorefrontAnalyticsEventInput = {
  countryCode: string | null;
  ipAddress?: string | null;
  path: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  request?: Request;
  ruleId: string | null;
  ruleName: string | null;
  shop: string;
  targetUrl: string | null;
  tokenPayload?: AnalyticsTokenPayload | null;
  type: string;
  userAgent?: string | null;
};

const ANALYTICS_QUEUE_MAX_SIZE = Number.parseInt(process.env.ANALYTICS_QUEUE_MAX_SIZE || "5000", 10);
const ANALYTICS_QUEUE_CONCURRENCY = Number.parseInt(process.env.ANALYTICS_QUEUE_CONCURRENCY || "4", 10);
const analyticsQueue: RecordStorefrontAnalyticsEventInput[] = [];
let analyticsQueueActive = 0;

function getInputIP(input: RecordStorefrontAnalyticsEventInput) {
  if (input.ipAddress) return input.ipAddress;
  return input.request ? getVisitorIP(input.request) : "unknown";
}

function getInputUserAgent(input: RecordStorefrontAnalyticsEventInput) {
  if (input.userAgent) return input.userAgent;
  return input.request?.headers.get("user-agent") || "Unknown";
}

function snapshotAnalyticsInput(input: RecordStorefrontAnalyticsEventInput): RecordStorefrontAnalyticsEventInput {
  return {
    ...input,
    ipAddress: getInputIP(input),
    request: undefined,
    userAgent: getInputUserAgent(input),
  };
}

function pumpAnalyticsQueue() {
  const concurrency =
    Number.isFinite(ANALYTICS_QUEUE_CONCURRENCY) && ANALYTICS_QUEUE_CONCURRENCY > 0
      ? ANALYTICS_QUEUE_CONCURRENCY
      : 4;

  while (analyticsQueueActive < concurrency && analyticsQueue.length > 0) {
    const input = analyticsQueue.shift()!;
    analyticsQueueActive++;

    recordStorefrontAnalyticsEvent(input)
      .catch((error) => {
        console.error("[Analytics Queue] Failed to process analytics event:", error);
      })
      .finally(() => {
        analyticsQueueActive--;
        pumpAnalyticsQueue();
      });
  }
}

export function enqueueStorefrontAnalyticsEvent(input: RecordStorefrontAnalyticsEventInput) {
  const maxSize = Number.isFinite(ANALYTICS_QUEUE_MAX_SIZE) && ANALYTICS_QUEUE_MAX_SIZE > 0
    ? ANALYTICS_QUEUE_MAX_SIZE
    : 5_000;

  if (analyticsQueue.length >= maxSize) {
    console.warn("[Analytics Queue] Dropped analytics event because the queue is full.");
    return false;
  }

  analyticsQueue.push(snapshotAnalyticsInput(input));
  queueMicrotask(pumpAnalyticsQueue);
  return true;
}

function actionFromType(type: string) {
  if (type === "redirected") return "clicked_redirect";
  if (type === "auto_redirected") return "auto_redirect";
  if (type === "ip_redirected") return "ip_redirect";
  if (type === "ip_blocked") return "ip_block";
  if (type === "vpn_blocked") return "vpn_block";
  if (type === "clicked_no") return "declined";
  return type;
}

function getUsageUpdateData(type: string) {
  const updateData: any = {};

  if (["redirected", "auto_redirected", "ip_redirected"].includes(type)) {
    updateData.redirected = { increment: 1 };
  }
  if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
    updateData.blocked = { increment: 1 };
  }
  if (type === "popup_shown") {
    updateData.popupShown = { increment: 1 };
  }

  return updateData;
}

function usageCreateData({
  actionInserted,
  billingPeriodKey,
  mainInserted,
  payload,
  type,
}: {
  actionInserted: boolean;
  billingPeriodKey: string;
  mainInserted: boolean;
  payload: AnalyticsTokenPayload;
  type: string;
}) {
  return {
    shop: payload.shop,
    yearMonth: payload.yearMonth,
    billingPeriodKey,
    totalVisitors: mainInserted ? 1 : 0,
    redirected:
      actionInserted && ["redirected", "auto_redirected", "ip_redirected"].includes(type)
        ? 1
        : 0,
    blocked:
      actionInserted && ["blocked", "ip_blocked", "vpn_blocked"].includes(type)
        ? 1
        : 0,
    popupShown: actionInserted && type === "popup_shown" ? 1 : 0,
  };
}

async function insertBillableUsageEvent({
  billingPeriodKey,
  countryCode,
  path,
  payload,
  tx,
  type,
}: {
  billingPeriodKey: string;
  countryCode: string | null;
  path: string | null;
  payload: AnalyticsTokenPayload;
  tx: Prisma.TransactionClient;
  type: string;
}) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "BillableUsageEvent" (
      "id",
      "shop",
      "yearMonth",
      "billingPeriodKey",
      "eventKey",
      "ruleId",
      "action",
      "countryCode",
      "path",
      "ipHash"
    )
    VALUES (
      ${randomUUID()},
      ${payload.shop},
      ${payload.yearMonth},
      ${billingPeriodKey},
      ${payload.eventKey},
      ${payload.ruleId},
      ${type},
      ${countryCode},
      ${path},
      ${payload.ipHash}
    )
    ON CONFLICT ("eventKey") DO NOTHING
    RETURNING "id"
  `;

  return rows.length > 0;
}

async function insertBillableUsageActionEvent({
  billingPeriodKey,
  payload,
  tx,
  type,
}: {
  billingPeriodKey: string;
  payload: AnalyticsTokenPayload;
  tx: Prisma.TransactionClient;
  type: string;
}) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "BillableUsageActionEvent" (
      "id",
      "shop",
      "yearMonth",
      "billingPeriodKey",
      "eventKey",
      "action"
    )
    VALUES (
      ${randomUUID()},
      ${payload.shop},
      ${payload.yearMonth},
      ${billingPeriodKey},
      ${payload.eventKey},
      ${type}
    )
    ON CONFLICT ("eventKey", "action") DO NOTHING
    RETURNING "id"
  `;

  return rows.length > 0;
}

export async function recordBillableUsage({
  countryCode,
  path,
  payload,
  type,
}: {
  countryCode: string | null;
  path: string | null;
  payload: AnalyticsTokenPayload;
  type: string;
}) {
  const billingPeriodKey = payload.billingPeriodKey || `calendar:${payload.yearMonth}`;

  return prisma.$transaction(async (tx) => {
    const mainInserted = await insertBillableUsageEvent({
      billingPeriodKey,
      countryCode,
      path,
      payload,
      tx,
      type,
    });
    const actionInserted = await insertBillableUsageActionEvent({
      billingPeriodKey,
      payload,
      tx,
      type,
    });

    const usageUpdateData = {
      ...(mainInserted ? { totalVisitors: { increment: 1 } } : {}),
      ...(actionInserted ? getUsageUpdateData(type) : {}),
    };

    if (Object.keys(usageUpdateData).length > 0) {
      await tx.monthlyUsage.upsert({
        where: {
          shop_billingPeriodKey: {
            shop: payload.shop,
            billingPeriodKey,
          },
        },
        update: usageUpdateData,
        create: usageCreateData({
          actionInserted,
          billingPeriodKey,
          mainInserted,
          payload,
          type,
        }),
      });
    }

    return {
      inserted: mainInserted,
      actionInserted,
      duplicateAction: mainInserted || actionInserted ? null : type,
    };
  });
}

export async function recordStorefrontAnalyticsDetails({
  countryCode,
  ipAddress,
  path,
  regionCode = null,
  regionName = null,
  request,
  ruleId,
  ruleName,
  shop,
  targetUrl,
  type,
  userAgent,
}: RecordStorefrontAnalyticsEventInput) {
  try {
    await prisma.visitorLog.create({
      data: {
        shop,
        ipAddress: getInputIP({ request, ipAddress, countryCode, path, ruleId, ruleName, shop, targetUrl, type }),
        countryCode,
        regionCode,
        regionName,
        city: null,
        action: actionFromType(type),
        ruleName,
        targetUrl,
        userAgent: getInputUserAgent({ request, userAgent, countryCode, path, ruleId, ruleName, shop, targetUrl, type }),
        path,
      },
    });
  } catch (logError) {
    console.error("[Analytics] Error saving visitor log:", logError);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (countryCode) {
    const updateData: any = {};
    if (type === "visit") updateData.visitors = { increment: 1 };
    if (type === "popup_shown") updateData.popupShown = { increment: 1 };
    if (["redirected", "auto_redirected", "ip_redirected"].includes(type)) {
      updateData.redirected = { increment: 1 };
    }
    if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
      updateData.blocked = { increment: 1 };
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.analyticsCountry.upsert({
        where: {
          shop_date_countryCode: { shop, date: today, countryCode },
        },
        update: updateData,
        create: {
          shop,
          date: today,
          countryCode,
          visitors: type === "visit" ? 1 : 0,
          popupShown: type === "popup_shown" ? 1 : 0,
          redirected: ["redirected", "auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
          blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
        },
      });
    }
  }

  if (ruleId) {
    const updateRuleData: any = {};
    if (type === "popup_shown") updateRuleData.seen = { increment: 1 };
    if (type === "redirected") updateRuleData.clickedYes = { increment: 1 };
    if (["auto_redirected", "ip_redirected"].includes(type)) {
      updateRuleData.autoRedirected = { increment: 1 };
    }
    if (type === "clicked_no") updateRuleData.clickedNo = { increment: 1 };
    if (type === "dismissed") updateRuleData.dismissed = { increment: 1 };
    if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
      updateRuleData.blocked = { increment: 1 };
    }

    if (Object.keys(updateRuleData).length > 0) {
      await prisma.analyticsRule.upsert({
        where: { shop_date_ruleId: { shop, date: today, ruleId } },
        update: {
          ...updateRuleData,
          ruleName: ruleName || undefined,
        },
        create: {
          shop,
          date: today,
          ruleId,
          ruleName: ruleName || "Unknown Rule",
          seen: type === "popup_shown" ? 1 : 0,
          clickedYes: type === "redirected" ? 1 : 0,
          autoRedirected: ["auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
          clickedNo: type === "clicked_no" ? 1 : 0,
          dismissed: type === "dismissed" ? 1 : 0,
          blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
        },
      });
    }
  }

  return {
    logged: true,
  };
}

export async function recordStorefrontAnalyticsEvent(input: RecordStorefrontAnalyticsEventInput) {
  let billableInserted = false;

  if (input.tokenPayload && isBillableAnalyticsEvent(input.type)) {
    const billableResult = await recordBillableUsage({
      countryCode: input.countryCode,
      path: input.path,
      payload: input.tokenPayload,
      type: input.type,
    });

    billableInserted = billableResult.inserted;

    if (!billableResult.inserted && billableResult.duplicateAction === input.type) {
      return {
        billableInserted,
        duplicate: true,
        logged: false,
      };
    }
  }

  await recordStorefrontAnalyticsDetails(input);

  return {
    billableInserted,
    duplicate: false,
    logged: true,
  };
}
