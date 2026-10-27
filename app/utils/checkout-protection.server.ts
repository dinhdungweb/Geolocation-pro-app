import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { unauthenticated } from "../shopify.server";
import { resolveEffectivePlan } from "./effective-plan.server";
import { createExpiringAsyncCache } from "./expiring-async-cache.server";
import { isExternalRedirectTarget, normalizeHost } from "./redirect-target";

export const CHECKOUT_VALIDATION_FUNCTION_HANDLE = "geo-checkout-validation";
export const CHECKOUT_VALIDATION_METAFIELD_NAMESPACE =
  "$app:geo-checkout-validation";
export const CHECKOUT_VALIDATION_METAFIELD_KEY = "configuration";

const CHECKOUT_VALIDATION_TITLE = "Geo: country checkout protection";
const DEFAULT_CHECKOUT_MESSAGE =
  "We cannot accept orders with a shipping or billing address in this country.";
const MISSING_SCOPE_MESSAGE =
  "The app needs the updated checkout validation permission. Open the app from Shopify admin and approve the new permissions, then save again.";

type ShopifyAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type CheckoutRule = {
  countryCodes: string;
};

type OwnValidation = {
  id: string;
};

export type CheckoutProtectionSyncResult = {
  blockedCountries: string[];
  enabled: boolean;
  error?: string;
  validationId: string | null;
};

class ValidationNotFoundError extends Error {}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function countryCodesOf(rule: CheckoutRule) {
  return String(rule.countryCodes || "")
    .split(/[\s,]+/)
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
}

export function normalizeCheckoutCountryCodes(rules: CheckoutRule[]) {
  return Array.from(new Set(rules.flatMap(countryCodesOf))).sort();
}

function normalizeCheckoutMessage(message: string | null | undefined) {
  const normalized = String(message || "").trim();
  return (normalized || DEFAULT_CHECKOUT_MESSAGE).slice(0, 255);
}

const SHOP_HOSTS_TTL_MS = 15 * 60_000;
const shopHostsCache = createExpiringAsyncCache<string[]>();

// Every host that serves this store: the .myshopify.com domain, the primary
// domain and each market's own domain. Cached; failures fall back to the
// myshopify domain alone.
async function loadShopHosts(admin: ShopifyAdmin, shop: string) {
  const hosts = new Set([normalizeHost(shop)]);
  try {
    const payload = await runGraphql(
      admin,
      `#graphql
        query GeoCheckoutShopHosts {
          shop {
            myshopifyDomain
            primaryDomain {
              host
            }
          }
          webPresences(first: 50) {
            nodes {
              domain {
                host
              }
              rootUrls {
                url
              }
            }
          }
        }
      `,
      {},
    );
    hosts.add(normalizeHost(payload?.data?.shop?.myshopifyDomain));
    hosts.add(normalizeHost(payload?.data?.shop?.primaryDomain?.host));
    for (const presence of payload?.data?.webPresences?.nodes || []) {
      hosts.add(normalizeHost(presence?.domain?.host));
      for (const rootUrl of presence?.rootUrls || []) {
        try {
          hosts.add(normalizeHost(new URL(rootUrl?.url).hostname));
        } catch {
          // ignore malformed root URLs
        }
      }
    }
  } catch (error) {
    console.error(`[CheckoutProtection] Could not load domains for ${shop}:`, errorMessage(error));
  }
  hosts.delete("");
  return Array.from(hosts);
}

export function getShopHosts(admin: ShopifyAdmin, shop: string) {
  return shopHostsCache.get(shop, () => loadShopHosts(admin, shop), SHOP_HOSTS_TTL_MS);
}

/**
 * For page loaders: never waits longer than timeoutMs. On a slow Shopify
 * response it returns the myshopify domain alone while the lookup finishes in
 * the background and fills the cache for the next load.
 */
export function getShopHostsWithin(admin: ShopifyAdmin, shop: string, timeoutMs = 2_500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fallback = new Promise<string[]>((resolve) => {
    timer = setTimeout(() => resolve([shop]), timeoutMs);
  });
  return Promise.race([getShopHosts(admin, shop), fallback]).finally(() => clearTimeout(timer));
}

export { isExternalRedirectTarget };

type EligibleRuleRow = CheckoutRule & {
  redirectFrequency: string | null;
  redirectMode: string;
  ruleType: string;
  targetUrl: string;
};

/**
 * Rules enforced at checkout (unscheduled, all-page, country-matched):
 * - every Block rule;
 * - Redirect rules that always auto-redirect to another store. Popup and
 *   "redirect once" rules let the visitor stay, and redirects within this
 *   store (e.g. a market subfolder) send them somewhere they should be able to
 *   buy. A legacy rule without a frequency always redirects to another store.
 * Rules resolving to no concrete country (the "*" wildcard) are skipped:
 * enforcing them would reject every order.
 */
export async function getCheckoutEligibleRules(
  shop: string,
  admin: ShopifyAdmin,
  // Page loaders pass a cap so a slow Shopify response can't stall the page.
  options: { hostLookupTimeoutMs?: number } = {},
) {
  const rules: EligibleRuleRow[] = await prisma.redirectRule.findMany({
    where: {
      shop,
      isActive: true,
      ruleType: { in: ["block", "redirect"] },
      matchType: "country",
      pageTargetingType: "all",
      scheduleEnabled: false,
    },
    select: {
      countryCodes: true,
      redirectFrequency: true,
      redirectMode: true,
      ruleType: true,
      targetUrl: true,
    },
  });

  const withCountries = rules.filter((rule) => countryCodesOf(rule).length > 0);
  const blockRules = withCountries.filter((rule) => rule.ruleType === "block");
  const redirectRules = withCountries.filter(
    (rule) =>
      rule.ruleType === "redirect" &&
      rule.redirectMode === "auto_redirect" &&
      (rule.redirectFrequency ?? "always") === "always",
  );
  if (redirectRules.length === 0) return blockRules;

  const ownHosts = options.hostLookupTimeoutMs
    ? await getShopHostsWithin(admin, shop, options.hostLookupTimeoutMs)
    : await getShopHosts(admin, shop);
  return [
    ...blockRules,
    ...redirectRules.filter((rule) => isExternalRedirectTarget(rule.targetUrl, shop, ownHosts)),
  ];
}

type CheckoutDesiredStateInput = {
  billingOverrideEnabled: boolean;
  billingOverridePlan: string | null;
  checkoutProtectionEnabled: boolean;
  currentPlan: string;
  isEnabled: boolean;
  mode: string;
};

/**
 * Whether the validation should be enforcing right now. Checkout protection is
 * a paid-plan feature, and checkout must never stay stricter than the
 * storefront: turning the app off (or the mode to disabled) switches it off
 * too. The merchant's toggle is kept, so it comes back on after an upgrade.
 */
export function isCheckoutProtectionDesired(settings: CheckoutDesiredStateInput) {
  const { effectivePlan } = resolveEffectivePlan({ settings });
  return (
    settings.checkoutProtectionEnabled &&
    effectivePlan !== FREE_PLAN &&
    settings.isEnabled &&
    settings.mode !== "disabled"
  );
}

async function getCheckoutSettings(shop: string) {
  const settings = await prisma.settings.findUnique({
    where: { shop },
    select: {
      billingOverrideEnabled: true,
      billingOverridePlan: true,
      blockedMessage: true,
      checkoutProtectionEnabled: true,
      checkoutProtectionError: true,
      checkoutValidationId: true,
      currentPlan: true,
      isEnabled: true,
      mode: true,
    },
  });

  if (!settings) {
    throw new Error("Store settings were not found");
  }
  return settings;
}

async function getCheckoutConfiguration(
  admin: ShopifyAdmin,
  shop: string,
  settings: Awaited<ReturnType<typeof getCheckoutSettings>>,
) {
  const rules = await getCheckoutEligibleRules(shop, admin);

  return {
    blockedCountries: normalizeCheckoutCountryCodes(rules),
    enabled: isCheckoutProtectionDesired(settings),
    message: normalizeCheckoutMessage(settings.blockedMessage),
    validationId: settings.checkoutValidationId,
  };
}

function metafieldInput(blockedCountries: string[], message: string) {
  return {
    namespace: CHECKOUT_VALIDATION_METAFIELD_NAMESPACE,
    key: CHECKOUT_VALIDATION_METAFIELD_KEY,
    type: "json",
    value: JSON.stringify({
      version: 1,
      blockedCountries,
      message,
    }),
  };
}

function getGraphqlErrors(payload: any, mutationName?: string) {
  return [
    ...(payload?.errors || []).map((error: any) => ({
      code: error?.extensions?.code,
      message: error?.message,
    })),
    ...(mutationName ? payload?.data?.[mutationName]?.userErrors || [] : []).map(
      (error: any) => ({ code: error?.code, message: error?.message }),
    ),
  ].filter((error) => error.message);
}

function throwIfGraphqlErrors(payload: any, mutationName?: string) {
  const errors = getGraphqlErrors(payload, mutationName);
  if (errors.length === 0) return;

  const message = errors.map((error) => error.message).join("; ");
  if (/access denied|write_validations|read_validations/i.test(message)) {
    throw new Error(MISSING_SCOPE_MESSAGE);
  }
  if (
    errors.some(
      (error) =>
        error.code === "NOT_FOUND" ||
        /not found|does not exist|invalid id/i.test(error.message),
    )
  ) {
    throw new ValidationNotFoundError(message);
  }
  throw new Error(message);
}

async function runGraphql(
  admin: ShopifyAdmin,
  query: string,
  variables: Record<string, unknown>,
  mutationName?: string,
) {
  const response = await admin.graphql(query, { variables });
  const payload: any = await response.json();
  throwIfGraphqlErrors(payload, mutationName);
  return payload;
}

// Validations backed by this app's checkout function. Used to adopt an existing
// validation instead of creating a duplicate (lost DB ID, failed write after a
// create) — a duplicate would keep enforcing a stale country list on its own.
async function listOwnValidations(admin: ShopifyAdmin): Promise<OwnValidation[]> {
  const payload = await runGraphql(
    admin,
    `#graphql
      query GeoCheckoutValidations {
        validations(first: 25) {
          nodes {
            id
            shopifyFunction {
              handle
              appKey
            }
          }
        }
      }
    `,
    {},
  );

  const apiKey = process.env.SHOPIFY_API_KEY;
  return (payload?.data?.validations?.nodes || [])
    .filter(
      (node: any) =>
        node?.shopifyFunction?.handle === CHECKOUT_VALIDATION_FUNCTION_HANDLE &&
        (!apiKey || node?.shopifyFunction?.appKey === apiKey),
    )
    .map((node: any) => ({ id: String(node.id) }));
}

async function createValidation({
  admin,
  blockedCountries,
  message,
}: {
  admin: ShopifyAdmin;
  blockedCountries: string[];
  message: string;
}) {
  const payload = await runGraphql(
    admin,
    `#graphql
      mutation GeoCheckoutValidationCreate($validation: ValidationCreateInput!) {
        validationCreate(validation: $validation) {
          validation {
            id
            enabled
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      validation: {
        blockOnFailure: false,
        enable: true,
        functionHandle: CHECKOUT_VALIDATION_FUNCTION_HANDLE,
        metafields: [metafieldInput(blockedCountries, message)],
        title: CHECKOUT_VALIDATION_TITLE,
      },
    },
    "validationCreate",
  );

  const id = payload?.data?.validationCreate?.validation?.id;
  if (!id) throw new Error("Shopify did not return the checkout validation ID");
  return String(id);
}

async function updateValidation({
  admin,
  blockedCountries,
  enabled,
  message,
  validationId,
}: {
  admin: ShopifyAdmin;
  blockedCountries: string[];
  enabled: boolean;
  message: string;
  validationId: string;
}) {
  await runGraphql(
    admin,
    `#graphql
      mutation GeoCheckoutValidationUpdate(
        $id: ID!
        $validation: ValidationUpdateInput!
      ) {
        validationUpdate(id: $id, validation: $validation) {
          validation {
            id
            enabled
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `,
    {
      id: validationId,
      validation: {
        blockOnFailure: false,
        enable: enabled,
        metafields: [metafieldInput(blockedCountries, message)],
        title: CHECKOUT_VALIDATION_TITLE,
      },
    },
    "validationUpdate",
  );
}

async function deleteValidation(admin: ShopifyAdmin, validationId: string) {
  try {
    await runGraphql(
      admin,
      `#graphql
        mutation GeoCheckoutValidationDelete($id: ID!) {
          validationDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      { id: validationId },
      "validationDelete",
    );
  } catch (error) {
    if (!(error instanceof ValidationNotFoundError)) throw error;
  }
}

async function reconcileValidation(
  admin: ShopifyAdmin,
  configuration: Awaited<ReturnType<typeof getCheckoutConfiguration>>,
) {
  const { blockedCountries, enabled, message } = configuration;

  // Fast path: one mutation when the stored validation still exists.
  if (configuration.validationId) {
    try {
      await updateValidation({
        admin,
        blockedCountries,
        enabled,
        message,
        validationId: configuration.validationId,
      });
      return configuration.validationId;
    } catch (error) {
      // Shopify removes app validations on uninstall; fall through and adopt
      // or recreate instead of failing on the stale ID forever.
      if (!(error instanceof ValidationNotFoundError)) throw error;
    }
  }

  const [primary, ...duplicates] = await listOwnValidations(admin);
  for (const duplicate of duplicates) {
    await deleteValidation(admin, duplicate.id);
  }

  if (primary) {
    await updateValidation({
      admin,
      blockedCountries,
      enabled,
      message,
      validationId: primary.id,
    });
    return primary.id;
  }

  return enabled ? createValidation({ admin, blockedCountries, message }) : null;
}

async function syncCheckoutProtectionUnlocked(
  admin: ShopifyAdmin,
  shop: string,
): Promise<CheckoutProtectionSyncResult> {
  const settings = await getCheckoutSettings(shop);

  // Never used (toggle off, no validation on Shopify): nothing to reconcile.
  // Skipping avoids a Shopify call on every rule/settings save, and an error
  // for shops that haven't approved the validation scopes and don't use this.
  if (!settings.checkoutProtectionEnabled && !settings.checkoutValidationId) {
    if (settings.checkoutProtectionError) {
      await prisma.settings.updateMany({
        where: { shop },
        data: { checkoutProtectionError: null },
      });
    }
    return { blockedCountries: [], enabled: false, validationId: null };
  }

  try {
    const configuration = await getCheckoutConfiguration(admin, shop, settings);
    const validationId = await reconcileValidation(admin, configuration);

    await prisma.settings.update({
      where: { shop },
      data: {
        checkoutValidationId: validationId,
        checkoutValidationActive: Boolean(validationId) && configuration.enabled,
        checkoutProtectionSyncedAt: new Date(),
        checkoutProtectionError: null,
      },
    });

    return {
      blockedCountries: configuration.blockedCountries,
      enabled: configuration.enabled,
      validationId,
    };
  } catch (error) {
    const message = errorMessage(error).slice(0, 2000);
    await prisma.settings.updateMany({
      where: { shop },
      data: { checkoutProtectionError: message },
    });
    throw new Error(message);
  }
}

// Serializes syncs per shop within this process so two quick saves can't both
// run validationCreate and leave an orphaned validation behind.
const shopSyncQueue = new Map<string, Promise<unknown>>();

function withShopSyncLock<T>(shop: string, task: () => Promise<T>): Promise<T> {
  const previous = shopSyncQueue.get(shop) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  shopSyncQueue.set(shop, current);
  void current
    .catch(() => undefined)
    .finally(() => {
      if (shopSyncQueue.get(shop) === current) shopSyncQueue.delete(shop);
    });
  return current;
}

export function syncCheckoutProtection({
  admin,
  shop,
}: {
  admin: ShopifyAdmin;
  shop: string;
}): Promise<CheckoutProtectionSyncResult> {
  return withShopSyncLock(shop, () => syncCheckoutProtectionUnlocked(admin, shop));
}

/**
 * Re-syncs after a plan or billing-override change, so a downgrade to Free
 * switches the validation off (and an upgrade back on). Skips shops that never
 * used the feature. Without a request-scoped admin (cron, admin panel) it uses
 * the shop's offline session. Never throws.
 */
export async function resyncCheckoutProtectionAfterPlanChange(
  shop: string,
  admin?: ShopifyAdmin | null,
) {
  try {
    const settings = await prisma.settings.findUnique({
      where: { shop },
      select: { checkoutProtectionEnabled: true, checkoutValidationId: true },
    });
    if (!settings?.checkoutProtectionEnabled && !settings?.checkoutValidationId) return;

    const client = admin ?? (await unauthenticated.admin(shop)).admin;
    await syncCheckoutProtectionSafely({ admin: client, shop });
  } catch (error) {
    console.error(
      `[CheckoutProtection] Plan-change resync failed for ${shop}:`,
      errorMessage(error),
    );
  }
}

/**
 * Safety net for plan changes that skipped an immediate resync: many code paths
 * write `currentPlan`, and a webhook that finds the plan already updated does
 * nothing. Compares the desired state with what the last sync left on Shopify
 * and resyncs only shops that drifted, so it costs a DB query when nothing
 * changed. Run from the usage cron. Never throws.
 */
export async function reconcileCheckoutProtectionDrift() {
  const candidates = await prisma.settings.findMany({
    where: {
      OR: [{ checkoutProtectionEnabled: true }, { checkoutValidationId: { not: null } }],
    },
    select: {
      shop: true,
      billingOverrideEnabled: true,
      billingOverridePlan: true,
      checkoutProtectionEnabled: true,
      checkoutValidationActive: true,
      currentPlan: true,
      isEnabled: true,
      mode: true,
    },
  });

  let resynced = 0;
  for (const settings of candidates) {
    if (isCheckoutProtectionDesired(settings) === settings.checkoutValidationActive) continue;
    await resyncCheckoutProtectionAfterPlanChange(settings.shop);
    resynced++;
  }
  if (resynced > 0) {
    console.log(`[CheckoutProtection] Re-synced ${resynced} shop(s) whose checkout state drifted`);
  }
  return resynced;
}

export async function syncCheckoutProtectionSafely({
  admin,
  shop,
}: {
  admin: ShopifyAdmin;
  shop: string;
}): Promise<CheckoutProtectionSyncResult> {
  try {
    return await syncCheckoutProtection({ admin, shop });
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[CheckoutProtection] Sync failed for ${shop}:`, message);
    const settings = await prisma.settings.findUnique({
      where: { shop },
      select: {
        checkoutProtectionEnabled: true,
        checkoutValidationId: true,
      },
    });
    return {
      blockedCountries: [],
      enabled: settings?.checkoutProtectionEnabled || false,
      error: message,
      validationId: settings?.checkoutValidationId || null,
    };
  }
}
