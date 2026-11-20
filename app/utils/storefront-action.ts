import type { StorefrontAction } from "./analytics-token.server";

/**
 * The storefront action a matched rule takes. An "allow" rule claims the
 * visitor, so lower tiers (e.g. a country-wide block after a city allow) never
 * run, but takes no action: no popup, block, analytics event or billed usage.
 */
export function getActionForRule(rule: {
  ruleType: string;
  redirectMode?: string | null;
}): StorefrontAction {
  if (rule.ruleType === "allow") return "none";
  if (rule.ruleType === "block") return "block";
  return rule.redirectMode === "auto_redirect" ? "auto_redirect" : "popup";
}
