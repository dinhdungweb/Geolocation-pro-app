import prisma from "../db.server";

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

// Only unscheduled, all-page country block rules apply at checkout. Rules that
// resolve to no concrete country (e.g. the "*" wildcard) are skipped: enforcing
// them would reject every order.
export async function getCheckoutEligibleRules(shop: string) {
  const rules = await prisma.redirectRule.findMany({
    where: {
      shop,
      isActive: true,
      ruleType: "block",
      matchType: "country",
      pageTargetingType: "all",
      scheduleEnabled: false,
    },
    select: { countryCodes: true },
  });

  return rules.filter((rule) => countryCodesOf(rule).length > 0);
}

async function getCheckoutConfiguration(shop: string) {
  const [settings, rules] = await Promise.all([
    prisma.settings.findUnique({
      where: { shop },
      select: {
        blockedMessage: true,
        checkoutProtectionEnabled: true,
        checkoutValidationId: true,
        isEnabled: true,
        mode: true,
      },
    }),
    getCheckoutEligibleRules(shop),
  ]);

  if (!settings) {
    throw new Error("Store settings were not found");
  }

  return {
    blockedCountries: normalizeCheckoutCountryCodes(rules),
    // Checkout must never stay stricter than the storefront: turning the app
    // off (or the mode to disabled) switches the validation off too.
    enabled:
      settings.checkoutProtectionEnabled &&
      settings.isEnabled &&
      settings.mode !== "disabled",
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
  const configuration = await getCheckoutConfiguration(shop);

  try {
    const validationId = await reconcileValidation(admin, configuration);

    await prisma.settings.update({
      where: { shop },
      data: {
        checkoutValidationId: validationId,
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
