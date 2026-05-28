import { apiVersion } from "../shopify.server";

const APP_EMBED_BLOCK_HANDLE = "geolocation-popup";

export type AppEmbedStatusState = "enabled" | "disabled" | "missing_scope" | "unavailable";

export interface AppEmbedStatus {
  state: AppEmbedStatusState;
  label: string;
  helpText: string;
  themeName: string | null;
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

export async function getThemeAppEmbedStatus({
  shop,
  accessToken,
  scopeString,
}: {
  shop: string;
  accessToken: string;
  scopeString: string | null | undefined;
}): Promise<AppEmbedStatus> {
  if (!hasSessionScope(scopeString, "read_themes")) {
    return {
      state: "missing_scope",
      label: "Permission needed",
      helpText: "Approve the read_themes permission so the app can read your current theme and show the app embed status.",
      themeName: null,
    };
  }

  const headers = {
    "X-Shopify-Access-Token": accessToken,
    Accept: "application/json",
  };

  try {
    const themesResponse = await fetch(
      `https://${shop}/admin/api/${apiVersion}/themes.json?role=main`,
      { headers },
    );

    if (themesResponse.status === 401 || themesResponse.status === 403) {
      return {
        state: "missing_scope",
        label: "Permission needed",
        helpText: "Shopify did not allow theme access. Reapprove the app permissions, then reload this page.",
        themeName: null,
      };
    }

    if (!themesResponse.ok) {
      throw new Error(`Theme list request failed with ${themesResponse.status}`);
    }

    const themesData = await themesResponse.json() as {
      themes?: Array<{ id: number | string; name?: string; role?: string }>;
    };
    const mainTheme = themesData.themes?.find((theme) => theme.role === "main") || themesData.themes?.[0];

    if (!mainTheme?.id) {
      return {
        state: "unavailable",
        label: "Status unavailable",
        helpText: "The current theme could not be found. Open the theme editor and confirm the app embed manually.",
        themeName: null,
      };
    }

    const assetResponse = await fetch(
      `https://${shop}/admin/api/${apiVersion}/themes/${mainTheme.id}/assets.json?asset[key]=config%2Fsettings_data.json`,
      { headers },
    );

    if (assetResponse.status === 401 || assetResponse.status === 403) {
      return {
        state: "missing_scope",
        label: "Permission needed",
        helpText: "Shopify did not allow theme asset access. Reapprove the app permissions, then reload this page.",
        themeName: mainTheme.name || null,
      };
    }

    if (!assetResponse.ok) {
      throw new Error(`Theme asset request failed with ${assetResponse.status}`);
    }

    const assetData = await assetResponse.json() as { asset?: { value?: string } };
    const settingsValue = assetData.asset?.value;

    if (!settingsValue) {
      return {
        state: "disabled",
        label: "Not enabled",
        helpText: "The current theme does not include the app embed yet. Enable it in the theme editor and save.",
        themeName: mainTheme.name || null,
      };
    }

    const settingsData = JSON.parse(settingsValue) as {
      current?: { blocks?: Record<string, { type?: unknown; disabled?: unknown }> };
    };
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
        helpText: `The app embed is enabled in ${mainTheme.name || "the current theme"}.`,
        themeName: mainTheme.name || null,
      };
    }

    return {
      state: "disabled",
      label: "Not enabled",
      helpText: "The app embed is not enabled in the current theme. Enable it in the theme editor and save.",
      themeName: mainTheme.name || null,
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
