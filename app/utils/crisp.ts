const CRISP_WEBSITE_ID = "b882709c-9f60-4bf7-b823-0f6bc6196f4a";
const CRISP_SCRIPT_SRC = "https://client.crisp.chat/l.js";
const CRISP_SCRIPT_ORIGIN = "https://client.crisp.chat";
const CRISP_SETTINGS_ORIGIN = "https://settings.crisp.chat";

type CrispCommand = [string, ...unknown[]];
type CrispApi = {
  push: (command: CrispCommand) => unknown;
};

type CrispWindow = Window & {
  $crisp?: CrispApi;
  CRISP_WEBSITE_ID?: string;
  __geoCrispScriptLoading?: boolean;
  __geoCrispShop?: string;
};

function getCrispWindow() {
  if (typeof window === "undefined") return null;
  return window as CrispWindow;
}

function ensureResourceHint(rel: "preconnect" | "dns-prefetch", href: string) {
  if (typeof document === "undefined") return;

  const marker = `${rel}:${href}`;
  if (document.querySelector(`link[data-geo-crisp="${marker}"]`)) return;

  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  link.dataset.geoCrisp = marker;

  if (rel === "preconnect") {
    link.crossOrigin = "anonymous";
  }

  document.head.appendChild(link);
}

function ensureCrispResourceHints() {
  ensureResourceHint("dns-prefetch", CRISP_SCRIPT_ORIGIN);
  ensureResourceHint("dns-prefetch", CRISP_SETTINGS_ORIGIN);
  ensureResourceHint("preconnect", CRISP_SCRIPT_ORIGIN);
}

export function prepareCrisp(shop?: string) {
  const crispWindow = getCrispWindow();
  if (!crispWindow) return null;

  ensureCrispResourceHints();

  const crisp = (crispWindow.$crisp ||= [] as unknown as CrispApi);
  crispWindow.CRISP_WEBSITE_ID ||= CRISP_WEBSITE_ID;

  if (shop && crispWindow.__geoCrispShop !== shop) {
    crisp.push(["set", "session:data", [[["shop", shop]]]]);
    crispWindow.__geoCrispShop = shop;
  }

  return crisp;
}

export function loadCrisp({ shop, open = false }: { shop?: string; open?: boolean } = {}) {
  const crispWindow = getCrispWindow();
  if (!crispWindow || typeof document === "undefined") return false;

  const crisp = prepareCrisp(shop);
  crisp?.push(["do", "chat:show"]);

  if (open) {
    crisp?.push(["do", "chat:open"]);
  }

  const existingScript = document.querySelector(
    `script[src="${CRISP_SCRIPT_SRC}"], script[src*="client.crisp.chat/l.js"]`,
  );
  if (existingScript || crispWindow.__geoCrispScriptLoading) return true;

  crispWindow.__geoCrispScriptLoading = true;

  const script = document.createElement("script");
  script.src = CRISP_SCRIPT_SRC;
  script.async = true;
  script.onload = () => {
    crispWindow.__geoCrispScriptLoading = false;
  };
  script.onerror = () => {
    crispWindow.__geoCrispScriptLoading = false;
    script.remove();
  };

  document.head.appendChild(script);
  return true;
}
