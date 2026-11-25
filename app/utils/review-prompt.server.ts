import prisma from "../db.server";
import type { ReviewActionTotals } from "./review-prompt";

// Lifetime redirects + blocks the app has performed for a shop, read from the
// daily country aggregates (indexed by shop, kept for ANALYTICS_RETENTION_DAYS).
export async function getLifetimeReviewActionTotals(
  shop: string,
): Promise<ReviewActionTotals> {
  const result = await prisma.analyticsCountry.aggregate({
    where: { shop },
    _sum: { redirected: true, blocked: true },
  });

  return {
    redirects: result._sum.redirected || 0,
    blocked: result._sum.blocked || 0,
  };
}
