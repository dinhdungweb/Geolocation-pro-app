export function isBillingTestMode() {
  const override = process.env.SHOPIFY_BILLING_TEST?.trim().toLowerCase();
  if (override) {
    return ["1", "true", "yes", "on"].includes(override);
  }

  return process.env.NODE_ENV !== "production";
}
