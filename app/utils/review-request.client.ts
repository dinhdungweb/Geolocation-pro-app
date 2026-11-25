import type { ReviewMilestone } from "./review-prompt";

type ReviewIntent =
  | { intent: "dismiss" }
  | { intent: "reviewed" }
  | { intent: "milestone_check"; milestone: ReviewMilestone }
  | { intent: "milestone_result"; milestone: ReviewMilestone; code: string };

async function postReviewPrompt(body: ReviewIntent) {
  const token = await window.shopify?.idToken?.();
  if (!token) return null;

  const response = await fetch("/app/review-prompt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

export async function saveReviewPromptDismissed() {
  try {
    await postReviewPrompt({ intent: "dismiss" });
  } catch {
    // Best-effort: the banner is already hidden for this session.
  }
}

export async function saveReviewPromptReviewed() {
  try {
    await postReviewPrompt({ intent: "reviewed" });
  } catch {
    // Best-effort.
  }
}

// Shows Shopify's native review modal at a milestone, at most once per
// milestone and only after the app has delivered value to the store.
export async function requestReviewAtMilestone(milestone: ReviewMilestone) {
  try {
    const reviews = window.shopify?.reviews;
    if (!reviews || typeof reviews.request !== "function") return;

    const check = await postReviewPrompt({ intent: "milestone_check", milestone });
    if (check?.request !== true) return;

    const result = await reviews.request();
    await postReviewPrompt({
      intent: "milestone_result",
      milestone,
      code: result.code,
    });
  } catch {
    // Never let a review request break the page that triggered it.
  }
}
