import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
  isBillableAnalyticsEvent,
  type AnalyticsTokenPayload,
} from "./analytics-token.server";
import { getVisitorIP } from "./request-ip.server";

type RecordStorefrontAnalyticsEventInput = {
  countryCode: string | null;
  path: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  request: Request;
  ruleId: string | null;
  ruleName: string | null;
  shop: string;
  targetUrl: string | null;
  tokenPayload?: AnalyticsTokenPayload | null;
  type: string;
};

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
  const updateData: any = { totalVisitors: { increment: 1 } };

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

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.billableUsageEvent.create({
        data: {
          shop: payload.shop,
          yearMonth: payload.yearMonth,
          billingPeriodKey,
          eventKey: payload.eventKey,
          ruleId: payload.ruleId,
          action: type,
          countryCode,
          path,
          ipHash: payload.ipHash,
        },
      });

      const usageUpdateData = getUsageUpdateData(type);
      await tx.monthlyUsage.upsert({
      where: {
        shop_billingPeriodKey: {
          shop: payload.shop,
          billingPeriodKey,
        },
      },
      update: usageUpdateData,
      create: {
        shop: payload.shop,
        yearMonth: payload.yearMonth,
        billingPeriodKey,
        totalVisitors: 1,
        redirected: ["redirected", "auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
        blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
        popupShown: type === "popup_shown" ? 1 : 0,
      },
    });

      return {
        inserted: true,
        duplicateAction: null,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.billableUsageEvent.findUnique({
        where: { eventKey: payload.eventKey },
        select: { action: true },
      });

      return {
        inserted: false,
        duplicateAction: existing?.action || null,
      };
    }
    throw error;
  }
}

export async function recordStorefrontAnalyticsDetails({
  countryCode,
  path,
  regionCode = null,
  regionName = null,
  request,
  ruleId,
  ruleName,
  shop,
  targetUrl,
  type,
}: RecordStorefrontAnalyticsEventInput) {
  try {
    await prisma.visitorLog.create({
      data: {
        shop,
        ipAddress: getVisitorIP(request),
        countryCode,
        regionCode,
        regionName,
        city: null,
        action: actionFromType(type),
        ruleName,
        targetUrl,
        userAgent: request.headers.get("user-agent") || "Unknown",
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
