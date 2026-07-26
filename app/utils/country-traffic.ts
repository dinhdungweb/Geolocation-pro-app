export type CountryTrafficCounters = {
  visitors?: number | null;
  popupShown?: number | null;
  redirected?: number | null;
  blocked?: number | null;
};

function nonNegative(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, value || 0) : 0;
}

/**
 * Uses the strongest observed country counter as a conservative traffic total.
 * Popup and redirect events can describe the same visit, so they must not be
 * added together.
 */
export function resolveCountryTrafficTotal(
  counters: CountryTrafficCounters,
) {
  return Math.max(
    nonNegative(counters.visitors),
    nonNegative(counters.popupShown),
    nonNegative(counters.redirected),
    nonNegative(counters.blocked),
  );
}

/**
 * Counts every recorded storefront action. Unlike traffic totals, popup,
 * redirect, and block events are separate user-visible actions and should be
 * added together.
 */
export function resolveCountryActionTotal(
  counters: CountryTrafficCounters,
) {
  return (
    nonNegative(counters.popupShown) +
    nonNegative(counters.redirected) +
    nonNegative(counters.blocked)
  );
}
