import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  REVIEW_STATUS_REVIEWED,
  getReviewSnoozeUntil,
  isReviewMilestone,
  shouldRequestNativeReview,
} from "../utils/review-prompt";
import { getLifetimeReviewActionTotals } from "../utils/review-prompt.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

// Persists the merchant's answer to the review prompt and decides whether a
// milestone may show Shopify's native review modal. Called from the browser
// with a session token (see utils/review-request.client.ts).
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const intent = payload.intent;

  if (intent === "dismiss") {
    await prisma.settings.updateMany({
      where: { shop },
      data: { reviewPromptSnoozedUntil: getReviewSnoozeUntil() },
    });
    return Response.json({ ok: true });
  }

  if (intent === "reviewed") {
    await prisma.settings.updateMany({
      where: { shop },
      data: { reviewPromptStatus: REVIEW_STATUS_REVIEWED },
    });
    return Response.json({ ok: true });
  }

  const milestone = payload.milestone;
  if (!isReviewMilestone(milestone)) {
    return Response.json({ error: "Invalid milestone" }, { status: 400 });
  }

  if (intent === "milestone_check") {
    const [settings, totals] = await Promise.all([
      prisma.settings.findUnique({
        where: { shop },
        select: {
          reviewPromptStatus: true,
          reviewPromptSnoozedUntil: true,
          reviewRequestedMilestones: true,
        },
      }),
      getLifetimeReviewActionTotals(shop),
    ]);
    if (!settings) return Response.json({ request: false });

    return Response.json({
      request: shouldRequestNativeReview({
        state: settings,
        totals,
        milestone,
        requestedMilestones: settings.reviewRequestedMilestones,
      }),
    });
  }

  if (intent === "milestone_result") {
    const code = typeof payload.code === "string" ? payload.code : "";

    if (code === "success") {
      const settings = await prisma.settings.findUnique({
        where: { shop },
        select: { reviewRequestedMilestones: true },
      });
      if (settings && !settings.reviewRequestedMilestones.includes(milestone)) {
        await prisma.settings.update({
          where: { shop },
          data: { reviewRequestedMilestones: { push: milestone } },
        });
      }
    } else if (code === "already-reviewed") {
      await prisma.settings.updateMany({
        where: { shop },
        data: { reviewPromptStatus: REVIEW_STATUS_REVIEWED },
      });
    }
    // Cooldowns and other declines are not recorded, so the milestone can be
    // retried the next time it happens.
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
};
