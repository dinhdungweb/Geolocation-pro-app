import { apiVersion } from "../shopify.server";
import { createExpiringAsyncCache } from "./expiring-async-cache.server";

const APP_EMBED_BLOCK_HANDLE = "geolocation-popup";
const THEME_STATUS_TIMEOUT_MS = 3_000;
const THEME_STATUS_ENABLED_TTL_MS = 60_000;
const THEME_STATUS_DISABLED_TTL_MS = 15_000;
const THEME_STATUS_UNAVAILABLE_TTL_MS = 5_000;

export type AppEmbedStatusState = "enabled" | "disabled" | "missing_scope" | "unavailable";

export interface AppEmbedStatus {
  state: AppEmbedStatusState;
  label: string;
  helpText: string;
  themeName: string | null;
}

const themeAppEmbedStatusCache = createExpiringAsyncCache<AppEmbedStatus>();

function getThemeStatusTtl(status: AppEmbedStatus) {
  if (status.state === "enabled" || status.state === "missing_scope") {
    return THEME_STATUS_ENABLED_TTL_MS;
  }

  if (status.state === "disabled") return THEME_STATUS_DISABLED_TTL_MS;
  return THEME_STATUS_UNAVAILABLE_TTL_MS;
}

export function getThemeEditorUrl(shop: string) {
  const shopName = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`;
}

function hasSessionScope(scopeString: string | null | undefined, requiredScope: string) {
  return (scopeString || "")
    .split(",")
    .map((scope) => scope.trim())
    .includes(requiredScope);
}

const MAIN_THEME_SETTINGS_QUERY = `#graphql
  query GeoMainThemeSettings {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"], first: 1) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

type MainThemeSettingsResponse = {
  data?: {
    themes?: {
      nodes?: Array<{
        id?: string;
        name?: string;
        files?: { nodes?: Array<{ body?: { content?: string } }> };
      }>;
    };
  };
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
};

function missingScopeStatus(sessionHasThemeScope: boolean, themeName: string | null): AppEmbedStatus {
  return {
    state: "missing_scope",
    label: "Permission needed",
    helpText: sessionHasThemeScope
      ? "Shopify did not allow theme access. Reapprove the app permissions, then reload this page."
      : "Approve the read_themes permission so the app can read your current theme and show the app embed status.",
    themeName,
  };
}

// settings_data.json often starts with an auto-generated /* ... */ notice.
function parseThemeSettings(content: string) {
  return JSON.parse(content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")) as {
    current?: { blocks?: Record<string, { type?: unknown; disabled?: unknown }> };
  };
}

async function loadThemeAppEmbedStatus({
  shop,
  accessToken,
  scopeString,
}: {
  shop: string;
  accessToken: string;
  scopeString: string | null | undefined;
}): Promise<AppEmbedStatus> {
  const sessionHasThemeScope = hasSessionScope(scopeString, "read_themes");

  try {
    // GraphQL Admin API: public apps may not use the REST Admin API.
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: MAIN_THEME_SETTINGS_QUERY }),
      signal: AbortSignal.timeout(THEME_STATUS_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return missingScopeStatus(sessionHasThemeScope, null);
    }
    if (!response.ok) {
      throw new Error(`Theme query failed with ${response.status}`);
    }

    const payload = await response.json() as MainThemeSettingsResponse;
    if (payload.errors?.length) {
      const accessDenied = payload.errors.some(
        (error) =>
          error.extensions?.code === "ACCESS_DENIED" ||
          /access denied|read_themes/i.test(error.message || ""),
      );
      if (accessDenied) return missingScopeStatus(sessionHasThemeScope, null);
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    const mainTheme = payload.data?.themes?.nodes?.[0];
    if (!mainTheme?.id) {
      return {
        state: "unavailable",
        label: "Status unavailable",
        helpText: "The current theme could not be found. Open the theme editor and confirm the app embed manually.",
        themeName: null,
      };
    }

    const themeName = mainTheme.name || null;
    const settingsValue = mainTheme.files?.nodes?.[0]?.body?.content;

    if (!settingsValue) {
      return {
        state: "disabled",
        label: "Not enabled",
        helpText: "The current theme does not include the app embed yet. Enable it in the theme editor and save.",
        themeName,
      };
    }

    const settingsData = parseThemeSettings(settingsValue);
    const blocks = settingsData.current?.blocks && typeof settingsData.current.blocks === "object"
      ? Object.values(settingsData.current.blocks)
      : [];
    const appEmbedBlock = blocks.find((block) => {
      const blockType = typeof block.type === "string" ? block.type : "";
      return blockType.includes(`/blocks/${APP_EMBED_BLOCK_HANDLE}/`) || blockType.includes(APP_EMBED_BLOCK_HANDLE);
    });

    if (appEmbedBlock && appEmbedBlock.disabled !== true) {
      return {
        state: "enabled",
        label: "Enabled",
        helpText: `The app embed is enabled in ${themeName || "the current theme"}.`,
        themeName,
      };
    }

    return {
      state: "disabled",
      label: "Not enabled",
      helpText: "The app embed is not enabled in the current theme. Enable it in the theme editor and save.",
      themeName,
    };
  } catch (error) {
    console.error("[ThemeAppEmbed] Failed to read theme app embed status:", error);
    return {
      state: "unavailable",
      label: "Status unavailable",
      helpText: "Theme status could not be checked right now. You can still open the theme editor and verify the app embed manually.",
      themeName: null,
    };
  }
}

export function getThemeAppEmbedStatus(args: {
  shop: string;
  accessToken: string;
  scopeString: string | null | undefined;
}) {
  return themeAppEmbedStatusCache.get(
    args.shop,
    () => loadThemeAppEmbedStatus(args),
    getThemeStatusTtl,
  );
}

export function invalidateThemeAppEmbedStatusCache(shop?: string) {
  themeAppEmbedStatusCache.invalidate(shop);
}
