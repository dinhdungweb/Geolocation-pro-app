// Rules for when the app may ask a merchant for an App Store review.
// Asking only after the app has visibly done work for the store keeps the
// request honest and avoids reviews from merchants who never got it running.
// Every eligible merchant is asked the same way, whatever their opinion:
// no rating-based routing and no incentives (Shopify App Store policy).

export const REVIEW_MIN_ACTIONS = 50;
export const REVIEW_SNOOZE_DAYS = 30;
export const REVIEW_EMAIL_MIN_INSTALL_DAYS = 3;

export const REVIEW_STATUS_PENDING = "pending";
export const REVIEW_STATUS_REVIEWED = "reviewed";

export const REVIEW_MILESTONES = [
  "setup_confirmed",
  "plan_upgraded",
  "order_risk_reviewed",
] as const;
export type ReviewMilestone = (typeof REVIEW_MILESTONES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewActionTotals = {
  redirects: number;
  blocked: number;
};

export type ReviewPromptState = {
  reviewPromptStatus: string;
  reviewPromptSnoozedUntil: Date | null;
};

export function isReviewMilestone(value: unknown): value is ReviewMilestone {
  return (
    typeof value === "string" &&
    (REVIEW_MILESTONES as readonly string[]).includes(value)
  );
}

export function totalReviewActions(totals: ReviewActionTotals) {
  return Math.max(0, totals.redirects || 0) + Math.max(0, totals.blocked || 0);
}

export function hasDeliveredValue(totals: ReviewActionTotals) {
  return totalReviewActions(totals) >= REVIEW_MIN_ACTIONS;
}

export function isReviewPromptSnoozed(
  state: ReviewPromptState,
  now: Date = new Date(),
) {
  return Boolean(
    state.reviewPromptSnoozedUntil &&
      state.reviewPromptSnoozedUntil.getTime() > now.getTime(),
  );
}

export function getReviewSnoozeUntil(now: Date = new Date()) {
  return new Date(now.getTime() + REVIEW_SNOOZE_DAYS * DAY_MS);
}

// The in-app rating banner on the Home page.
export function shouldShowReviewBanner({
  state,
  totals,
  isAppActive,
  isEmbedEnabled,
  activeRules,
  now = new Date(),
}: {
  state: ReviewPromptState;
  totals: ReviewActionTotals;
  isAppActive: boolean;
  isEmbedEnabled: boolean;
  activeRules: number;
  now?: Date;
}) {
  if (state.reviewPromptStatus === REVIEW_STATUS_REVIEWED) return false;
  if (isReviewPromptSnoozed(state, now)) return false;
  if (!isAppActive || !isEmbedEnabled || activeRules < 1) return false;
  return hasDeliveredValue(totals);
}

// Shopify's native review modal, requested once per milestone. Shopify applies
// its own cooldown and eligibility rules on top of this.
export function shouldRequestNativeReview({
  state,
  totals,
  milestone,
  requestedMilestones,
}: {
  state: ReviewPromptState;
  totals: ReviewActionTotals;
  milestone: ReviewMilestone;
  requestedMilestones: readonly string[];
}) {
  if (state.reviewPromptStatus === REVIEW_STATUS_REVIEWED) return false;
  if (requestedMilestones.includes(milestone)) return false;
  return hasDeliveredValue(totals);
}

export function hasReachedReviewEmailAge(
  installedAt: Date | null | undefined,
  now: Date = new Date(),
) {
  if (!installedAt) return false;
  return (
    now.getTime() - installedAt.getTime() >=
    REVIEW_EMAIL_MIN_INSTALL_DAYS * DAY_MS
  );
}

// The one-time review request email sent by the usage cron.
export function shouldSendReviewEmail({
  installedAt,
  isAppEnabled,
  totals,
  now = new Date(),
}: {
  installedAt: Date | null | undefined;
  isAppEnabled: boolean;
  totals: ReviewActionTotals;
  now?: Date;
}) {
  if (!isAppEnabled || !hasReachedReviewEmailAge(installedAt, now)) return false;
  return hasDeliveredValue(totals);
}
