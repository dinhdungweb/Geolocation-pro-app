import { describe, expect, it } from "vitest";
import {
  REVIEW_MIN_ACTIONS,
  REVIEW_STATUS_PENDING,
  REVIEW_STATUS_REVIEWED,
  getReviewSnoozeUntil,
  hasDeliveredValue,
  hasReachedReviewEmailAge,
  isReviewMilestone,
  shouldRequestNativeReview,
  shouldSendReviewEmail,
  shouldShowReviewBanner,
} from "./review-prompt";

const NOW = new Date("2026-11-25T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const pending = { reviewPromptStatus: REVIEW_STATUS_PENDING, reviewPromptSnoozedUntil: null };
const enough = { redirects: REVIEW_MIN_ACTIONS - 10, blocked: 10 };
const tooFew = { redirects: 20, blocked: 5 };

const liveStore = {
  isAppActive: true,
  isEmbedEnabled: true,
  activeRules: 1,
  now: NOW,
};

describe("hasDeliveredValue", () => {
  it("counts redirects and blocks together against the threshold", () => {
    expect(hasDeliveredValue(enough)).toBe(true);
    expect(hasDeliveredValue(tooFew)).toBe(false);
    expect(hasDeliveredValue({ redirects: -5, blocked: REVIEW_MIN_ACTIONS })).toBe(true);
  });
});

describe("shouldShowReviewBanner", () => {
  it("shows for a live store once the app has delivered value", () => {
    expect(shouldShowReviewBanner({ state: pending, totals: enough, ...liveStore })).toBe(true);
  });

  it("stays hidden for a freshly installed store", () => {
    expect(shouldShowReviewBanner({ state: pending, totals: { redirects: 0, blocked: 0 }, ...liveStore })).toBe(false);
    expect(shouldShowReviewBanner({ state: pending, totals: tooFew, ...liveStore })).toBe(false);
  });

  it("stays hidden until the app is set up and running", () => {
    expect(shouldShowReviewBanner({ state: pending, totals: enough, ...liveStore, isEmbedEnabled: false })).toBe(false);
    expect(shouldShowReviewBanner({ state: pending, totals: enough, ...liveStore, isAppActive: false })).toBe(false);
    expect(shouldShowReviewBanner({ state: pending, totals: enough, ...liveStore, activeRules: 0 })).toBe(false);
  });

  it("respects a 30-day snooze and returns after it expires", () => {
    const snoozed = { reviewPromptStatus: REVIEW_STATUS_PENDING, reviewPromptSnoozedUntil: getReviewSnoozeUntil(NOW) };
    expect(shouldShowReviewBanner({ state: snoozed, totals: enough, ...liveStore })).toBe(false);
    expect(
      shouldShowReviewBanner({ state: snoozed, totals: enough, ...liveStore, now: new Date(NOW.getTime() + 31 * DAY) }),
    ).toBe(true);
  });

  it("never shows again once the merchant went to review", () => {
    const reviewed = { reviewPromptStatus: REVIEW_STATUS_REVIEWED, reviewPromptSnoozedUntil: null };
    expect(shouldShowReviewBanner({ state: reviewed, totals: enough, ...liveStore })).toBe(false);
  });
});

describe("shouldRequestNativeReview", () => {
  it("requests once per milestone after value is delivered", () => {
    const base = { state: pending, totals: enough, milestone: "plan_upgraded" as const };
    expect(shouldRequestNativeReview({ ...base, requestedMilestones: [] })).toBe(true);
    expect(shouldRequestNativeReview({ ...base, requestedMilestones: ["setup_confirmed"] })).toBe(true);
    expect(shouldRequestNativeReview({ ...base, requestedMilestones: ["plan_upgraded"] })).toBe(false);
  });

  it("does not request before value or after a review", () => {
    expect(
      shouldRequestNativeReview({ state: pending, totals: tooFew, milestone: "setup_confirmed", requestedMilestones: [] }),
    ).toBe(false);
    expect(
      shouldRequestNativeReview({
        state: { reviewPromptStatus: REVIEW_STATUS_REVIEWED, reviewPromptSnoozedUntil: null },
        totals: enough,
        milestone: "setup_confirmed",
        requestedMilestones: [],
      }),
    ).toBe(false);
  });
});

describe("shouldSendReviewEmail", () => {
  const installedAt = new Date(NOW.getTime() - 4 * DAY);

  it("sends after 3 days when the app is live and has delivered value", () => {
    expect(shouldSendReviewEmail({ installedAt, isAppEnabled: true, totals: enough, now: NOW })).toBe(true);
  });

  it("waits for the 3-day mark", () => {
    const recent = new Date(NOW.getTime() - 2 * DAY);
    expect(hasReachedReviewEmailAge(recent, NOW)).toBe(false);
    expect(shouldSendReviewEmail({ installedAt: recent, isAppEnabled: true, totals: enough, now: NOW })).toBe(false);
    expect(hasReachedReviewEmailAge(null, NOW)).toBe(false);
  });

  it("holds the email while the app has no real activity or is paused", () => {
    expect(shouldSendReviewEmail({ installedAt, isAppEnabled: true, totals: { redirects: 0, blocked: 0 }, now: NOW })).toBe(false);
    expect(shouldSendReviewEmail({ installedAt, isAppEnabled: false, totals: enough, now: NOW })).toBe(false);
  });
});

describe("isReviewMilestone", () => {
  it("accepts only known milestones", () => {
    expect(isReviewMilestone("order_risk_reviewed")).toBe(true);
    expect(isReviewMilestone("random")).toBe(false);
    expect(isReviewMilestone(1)).toBe(false);
  });
});
