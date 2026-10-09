const SHOPIFY_APP_HANDLE = "geolocation-app-4";
const SHOP_STORAGE_KEY = "geo_redirect_embedded_shop";

function getShopHandle(shop: string | null) {
  if (!shop) return null;

  const normalizedShop = shop.trim().toLowerCase();
  const match = normalizedShop.match(
    /^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/,
  );

  return match?.[1] || null;
}

export function getShopifyAdminAppUrl(
  currentUrl: string,
  rememberedShop: string | null = null,
) {
  try {
    const url = new URL(currentUrl);
    const shopHandle =
      getShopHandle(url.searchParams.get("shop")) ||
      getShopHandle(rememberedShop);

    if (!shopHandle) return null;

    return `https://admin.shopify.com/store/${shopHandle}/apps/${SHOPIFY_APP_HANDLE}/app`;
  } catch {
    return null;
  }
}

export function rememberEmbeddedShop(shop: string) {
  if (!getShopHandle(shop)) return;

  try {
    window.sessionStorage.setItem(SHOP_STORAGE_KEY, shop);
  } catch {
    // Recovery still works from the URL when browser storage is unavailable.
  }
}

export function recoverEmbeddedApp() {
  let rememberedShop: string | null = null;

  try {
    rememberedShop = window.sessionStorage.getItem(SHOP_STORAGE_KEY);
  } catch {
    // Continue with the current embedded URL.
  }

  const adminAppUrl = getShopifyAdminAppUrl(
    window.location.href,
    rememberedShop,
  );

  if (adminAppUrl && window.top && window.top !== window) {
    // A user-initiated top-level navigation makes Shopify create a fresh
    // embedded-app context instead of reloading the failed iframe in place.
    window.open(adminAppUrl, "_top");
    return;
  }

  if (adminAppUrl) {
    window.location.assign(adminAppUrl);
    return;
  }

  window.location.reload();
}
