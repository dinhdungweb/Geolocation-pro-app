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

const ANALYTICS_QUEUE_BATCH_SIZE = Number.parseInt(process.env.ANALYTICS_QUEUE_BATCH_SIZE || "100", 10);
const ANALYTICS_QUEUE_INTERVAL_MS = Number.parseInt(process.env.ANALYTICS_QUEUE_INTERVAL_MS || "2500", 10);
const ANALYTICS_QUEUE_MAX_ATTEMPTS = Number.parseInt(process.env.ANALYTICS_QUEUE_MAX_ATTEMPTS || "5", 10);
const ANALYTICS_QUEUE_STALE_LOCK_MS = Number.parseInt(process.env.ANALYTICS_QUEUE_STALE_LOCK_MS || "120000", 10);
let analyticsQueueWorkerStarted = false;
let analyticsQueuePumpActive = false;

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

function toJsonPayload(input: RecordStorefrontAnalyticsEventInput) {
  return JSON.parse(JSON.stringify(snapshotAnalyticsInput(input))) as Prisma.InputJsonObject;
}

function fromJsonPayload(value: Prisma.JsonValue): RecordStorefrontAnalyticsEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.shop !== "string" || typeof payload.type !== "string") return null;

  return {
    countryCode: typeof payload.countryCode === "string" ? payload.countryCode : null,
    ipAddress: typeof payload.ipAddress === "string" ? payload.ipAddress : null,
    path: typeof payload.path === "string" ? payload.path : null,
    regionCode: typeof payload.regionCode === "string" ? payload.regionCode : null,
    regionName: typeof payload.regionName === "string" ? payload.regionName : null,
    ruleId: typeof payload.ruleId === "string" ? payload.ruleId : null,
    ruleName: typeof payload.ruleName === "string" ? payload.ruleName : null,
    shop: payload.shop,
    targetUrl: typeof payload.targetUrl === "string" ? payload.targetUrl : null,
    tokenPayload:
      payload.tokenPayload && typeof payload.tokenPayload === "object" && !Array.isArray(payload.tokenPayload)
        ? (payload.tokenPayload as unknown as AnalyticsTokenPayload)
        : null,
    type: payload.type,
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent : null,
  };
}

function queueBatchSize() {
  return Number.isFinite(ANALYTICS_QUEUE_BATCH_SIZE) && ANALYTICS_QUEUE_BATCH_SIZE > 0
    ? Math.min(ANALYTICS_QUEUE_BATCH_SIZE, 500)
    : 100;
}

function queueMaxAttempts() {
  return Number.isFinite(ANALYTICS_QUEUE_MAX_ATTEMPTS) && ANALYTICS_QUEUE_MAX_ATTEMPTS > 0
    ? ANALYTICS_QUEUE_MAX_ATTEMPTS
    : 5;
}

function queueStaleLockMs() {
  return Number.isFinite(ANALYTICS_QUEUE_STALE_LOCK_MS) && ANALYTICS_QUEUE_STALE_LOCK_MS > 0
    ? ANALYTICS_QUEUE_STALE_LOCK_MS
    : 120_000;
}

function queueNextAttemptAt(attempts: number) {
  const backoffMs = Math.min(5 * 60 * 1000, 5_000 * Math.max(1, attempts));
  return new Date(Date.now() + backoffMs);
}

type QueuedAnalyticsRow = {
  id: string;
  attempts: number;
  payload: Prisma.JsonValue;
};

export async function enqueueStorefrontAnalyticsEvent(input: RecordStorefrontAnalyticsEventInput) {
  const payload = toJsonPayload(input);

  await prisma.storefrontAnalyticsEventQueue.create({
    data: {
      shop: input.shop,
      type: input.type,
      payload,
    },
  });

  queueMicrotask(() => {
    void processQueuedStorefrontAnalyticsEvents();
  });

  return true;
}

export async function processQueuedStorefrontAnalyticsEvents() {
  if (analyticsQueuePumpActive) return { processed: 0, skipped: true };
  analyticsQueuePumpActive = true;

  try {
    const staleBefore = new Date(Date.now() - queueStaleLockMs());
    const now = new Date();
    const rows = await prisma.$transaction(async (tx) => {
      const selected = await tx.$queryRaw<QueuedAnalyticsRow[]>`
        SELECT "id", "attempts", "payload"
        FROM "StorefrontAnalyticsEventQueue"
        WHERE (
          "status" = 'pending'
          AND "nextAttemptAt" <= ${now}
        ) OR (
          "status" = 'processing'
          AND "lockedAt" < ${staleBefore}
        )
        ORDER BY "createdAt" ASC
        LIMIT ${queueBatchSize()}
        FOR UPDATE SKIP LOCKED
      `;

      if (selected.length > 0) {
        await tx.storefrontAnalyticsEventQueue.updateMany({
          where: { id: { in: selected.map((row) => row.id) } },
          data: {
            lockedAt: now,
            status: "processing",
          },
        });
      }

      return selected;
    });

    let processed = 0;

    for (const row of rows) {
      const input = fromJsonPayload(row.payload);
      if (!input) {
        await prisma.storefrontAnalyticsEventQueue.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lastError: "Invalid analytics payload",
            lockedAt: null,
            status: "failed",
          },
        });
        continue;
      }

      try {
        await recordStorefrontAnalyticsDetails(input, { retryableLogErrors: true });
        await prisma.storefrontAnalyticsEventQueue.delete({ where: { id: row.id } });
        processed++;
      } catch (error) {
        const attempts = row.attempts + 1;
        const failed = attempts >= queueMaxAttempts();
        await prisma.storefrontAnalyticsEventQueue.update({
          where: { id: row.id },
          data: {
            attempts,
            lastError: String(error instanceof Error ? error.message : error).slice(0, 1000),
            lockedAt: null,
            nextAttemptAt: failed ? new Date() : queueNextAttemptAt(attempts),
            status: failed ? "failed" : "pending",
          },
        });
      }
    }

    return { processed, skipped: false };
  } finally {
    analyticsQueuePumpActive = false;
  }
}

export function startStorefrontAnalyticsQueueWorker() {
  if (
    analyticsQueueWorkerStarted ||
    process.env.NODE_ENV === "test" ||
    process.env.DISABLE_ANALYTICS_QUEUE_WORKER === "true"
  ) {
    return;
  }

  analyticsQueueWorkerStarted = true;
  const intervalMs =
    Number.isFinite(ANALYTICS_QUEUE_INTERVAL_MS) && ANALYTICS_QUEUE_INTERVAL_MS > 0
      ? ANALYTICS_QUEUE_INTERVAL_MS
      : 2_500;

  setInterval(() => {
    processQueuedStorefrontAnalyticsEvents().catch((error) => {
      console.error("[Analytics Queue] Failed to process queued events:", error);
    });
  }, intervalMs).unref?.();

  queueMicrotask(() => {
    void processQueuedStorefrontAnalyticsEvents();
  });
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

  if (result.inserted) {
    setTimeout(async () => {
      try {
        const { checkAndSendLimitEmailIfNeeded } = await import("./usage-cron.server");
        const settings = await prisma.settings.findUnique({
          where: { shop: payload.shop },
        });
        if (!settings) return;

        const { resolveEffectivePlan } = await import("./effective-plan.server");
        const { getPlanLimit } = await import("../billing.config");
        const { getUsagePeriodForShop } = await import("./billing-period.server");

        const shopifyPlan = settings.currentPlan || "free";
        const { effectivePlan: currentPlan } = resolveEffectivePlan({
          settings,
          shopifyPlan,
        });

        const planLimit = getPlanLimit(currentPlan, settings);
        const usagePeriod = await getUsagePeriodForShop({ shop: payload.shop, currentPlan, settings });

        await checkAndSendLimitEmailIfNeeded({
          shop: payload.shop,
          usagePeriod,
          currentPlan,
          planLimit,
          settings,
        });
      } catch (err) {
        console.error("[Realtime Limit Check] Background check error:", err);
      }
    }, 0);
  }

  return result;
}

export async function recordStorefrontAnalyticsDetails(
  {
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
  }: RecordStorefrontAnalyticsEventInput,
  options: { retryableLogErrors?: boolean } = {},
) {
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
    if (options.retryableLogErrors) throw logError;
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
