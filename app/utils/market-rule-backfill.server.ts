import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { invalidateStorefrontConfigCache } from "./storefront-config-cache.server";
import { getShopifyMarkets } from "./shopify-markets.server";

type MarketCoverage = {
  handle: string;
  countryCodes: string[];
};

export function resolveMarketCountryCodes(
  marketHandles: string,
  markets: MarketCoverage[],
) {
  const countriesByHandle = new Map(
    markets.map((market) => [market.handle, market.countryCodes] as const),
  );

  return Array.from(new Set(
    marketHandles
      .split(",")
      .map((handle) => handle.trim())
      .filter(Boolean)
      .flatMap((handle) => countriesByHandle.get(handle) || [])
      .map((countryCode) => countryCode.trim().toUpperCase())
      .filter(Boolean),
  ));
}

export async function backfillMissingMarketRuleCountries() {
  const rules = await prisma.redirectRule.findMany({
    where: {
      matchType: "market",
      marketCountryCodes: "",
      marketHandles: { not: "" },
    },
    select: {
      id: true,
      marketHandles: true,
      shop: true,
    },
  });
  const rulesByShop = new Map<string, typeof rules>();
  for (const rule of rules) {
    const shopRules = rulesByShop.get(rule.shop) || [];
    shopRules.push(rule);
    rulesByShop.set(rule.shop, shopRules);
  }
  let updated = 0;

  for (const [shop, shopRules] of rulesByShop) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const result = await getShopifyMarkets(admin, shop);
      if (result.error || result.markets.length === 0) continue;

      const updates = shopRules
        .map((rule) => ({
          id: rule.id,
          countryCodes: resolveMarketCountryCodes(rule.marketHandles, result.markets),
        }))
        .filter((rule) => rule.countryCodes.length > 0);
      if (updates.length === 0) continue;

      await prisma.$transaction(
        updates.map((rule) =>
          prisma.redirectRule.update({
            where: { id: rule.id, shop },
            data: { marketCountryCodes: rule.countryCodes.join(",") },
          }),
        ),
      );
      invalidateStorefrontConfigCache(shop);
      updated += updates.length;
    } catch (error) {
      console.error(`[MarketBackfill] Failed for ${shop}:`, error);
    }
  }

  if (rules.length > 0) {
    console.info(`[MarketBackfill] Updated ${updated}/${rules.length} market rules.`);
  }
  return { scanned: rules.length, updated };
}
