let warnedAboutIgnoredOverride = false;

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() || "");
}

/**
 * Whether Shopify charges are created as test charges (no money moves).
 * Outside production this defaults to true and SHOPIFY_BILLING_TEST can turn it
 * off. In production a leftover SHOPIFY_BILLING_TEST=true (e.g. copied from
 * .env.example) would make every charge free, so it only takes effect together
 * with SHOPIFY_BILLING_TEST_ALLOW_PRODUCTION=true.
 */
export function isBillingTestMode() {
  const override = process.env.SHOPIFY_BILLING_TEST?.trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  if (!override) return !isProduction;

  const requested = isTruthy(override);
  if (isProduction && requested && !isTruthy(process.env.SHOPIFY_BILLING_TEST_ALLOW_PRODUCTION)) {
    if (!warnedAboutIgnoredOverride) {
      warnedAboutIgnoredOverride = true;
      console.error(
        "[Billing] SHOPIFY_BILLING_TEST=true is ignored in production. " +
        "Set SHOPIFY_BILLING_TEST_ALLOW_PRODUCTION=true as well if test charges are really intended.",
      );
    }
    return false;
  }
  return requested;
}
