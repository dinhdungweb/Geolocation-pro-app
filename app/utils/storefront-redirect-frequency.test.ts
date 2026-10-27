import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const STOREFRONT_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../storefront/geolocation.js"),
  "utf8",
);
const ORIGIN = "https://mystore.com";

type Rule = {
  ruleId: string;
  targetUrl: string;
  redirectFrequency?: "always" | "once" | null;
};

// One browser profile: cookies persist across page loads, sessionStorage
// persists within the "session" (until newSession()).
function createBrowser() {
  const cookies = new Map<string, string>();
  let session = new Map<string, string>();

  return {
    cookies,
    newSession() {
      session = new Map();
    },
    // Loads `pathname` with the storefront script; resolves with the URL the
    // script navigated to, or null when the visitor stays.
    async visit(pathname: string, rule: Rule, search = "", designMode = false) {
      let navigatedTo: string | null = null;
      const location = {
        origin: ORIGIN,
        pathname,
        search,
        get href() {
          return `${ORIGIN}${pathname}`;
        },
        set href(value: string) {
          navigatedTo = value;
        },
        replace(value: string) {
          navigatedTo = value;
        },
      };
      const document = {
        get cookie() {
          return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
        },
        set cookie(raw: string) {
          const [pair, ...attributes] = raw.split(";");
          const [name, value] = pair.split("=");
          const expires = attributes.find((attr) => attr.trim().startsWith("expires="));
          if (expires && new Date(expires.split("=")[1]).getTime() < Date.now()) {
            cookies.delete(name.trim());
          } else {
            cookies.set(name.trim(), value);
          }
        },
        addEventListener() { /* no-op in tests */ },
        getElementById: () => null,
        body: null,
      };
      const sessionStorage = {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => void session.set(key, value),
        removeItem: (key: string) => void session.delete(key),
      };
      const config = {
        action: "auto_redirect",
        countryCode: "CA",
        rule: { name: "Canada", ruleType: "redirect", redirectMode: "auto_redirect", ...rule },
        popup: { cookieDuration: 7 },
      };
      const fetch = async (url: string) =>
        url.startsWith("/apps/geolocation/config")
          ? new Response(JSON.stringify(config))
          : new Response("{}");

      const window: Record<string, unknown> = {
        __GEOLOCATION_CONFIG__: {
          shop: "mystore.myshopify.com",
          proxyUrl: "/apps/geolocation/config",
          analyticsUrl: "/apps/geolocation/analytics",
        },
        location,
        addEventListener() { /* no-op in tests */ },
        ...(designMode ? { Shopify: { designMode: true } } : {}),
      };
      const context = vm.createContext({
        window,
        document,
        sessionStorage,
        fetch,
        navigator: {},
        console,
        URL,
        URLSearchParams,
        Response,
        Blob,
        setTimeout,
      });
      vm.runInContext(STOREFRONT_SOURCE, context);

      // Let the async init (config fetch + decision) finish.
      for (let tick = 0; tick < 20; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      return navigatedTo;
    },
  };
}

describe("storefront auto redirect frequency", () => {
  it("always: redirects on every visit to another store", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "r1", targetUrl: "https://ca.other.com", redirectFrequency: "always" };

    expect(await browser.visit("/", rule)).toBe("https://ca.other.com/");
    expect(await browser.visit("/", rule)).toBe("https://ca.other.com/");
  });

  it("once: redirects the first time per browser session, then lets the visitor stay", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "r2", targetUrl: "https://ca.other.com", redirectFrequency: "once" };

    expect(await browser.visit("/", rule)).toBe("https://ca.other.com/");
    // The visitor comes back in the same session: they may stay.
    expect(await browser.visit("/collections/all", rule)).toBeNull();
    // A new browser session redirects again.
    browser.newSession();
    expect(await browser.visit("/", rule)).toBe("https://ca.other.com/");
  });

  it("always within the same store keeps visitors inside the target section", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "r3", targetUrl: "/en-ca", redirectFrequency: "always" };

    expect(await browser.visit("/products/shirt", rule)).toBe("https://mystore.com/en-ca");
    expect(await browser.visit("/en-ca", rule)).toBeNull();
    expect(await browser.visit("/en-ca/products/shirt", rule)).toBeNull();
    expect(await browser.visit("/en-ca/cart", rule)).toBeNull();
    // Leaving the section sends them back, every time.
    expect(await browser.visit("/collections/all", rule)).toBe("https://mystore.com/en-ca");
  });

  it("does not treat a sibling path as inside the target section", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "r4", targetUrl: "/en-ca", redirectFrequency: "always" };

    expect(await browser.visit("/en-cart", rule)).toBe("https://mystore.com/en-ca");
  });

  it("legacy rules keep their old behavior", async () => {
    const browser = createBrowser();
    const internal: Rule = { ruleId: "r5", targetUrl: "/en-ca", redirectFrequency: null };
    const external: Rule = { ruleId: "r6", targetUrl: "https://ca.other.com", redirectFrequency: null };

    // Same store: once per browser session.
    expect(await browser.visit("/", internal)).toBe("https://mystore.com/en-ca");
    expect(await browser.visit("/products/x", internal)).toBeNull();
    browser.newSession();
    expect(await browser.visit("/", internal)).toBe("https://mystore.com/en-ca");

    // Another store: every visit. (New session so the storefront's per-path
    // config cache doesn't serve the previous rule.)
    browser.newSession();
    expect(await browser.visit("/", external)).toBe("https://ca.other.com/");
    expect(await browser.visit("/", external)).toBe("https://ca.other.com/");
  });
});

describe("storefront redirect safety", () => {
  it("does not let ?preview_theme_id= switch redirects off", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "s1", targetUrl: "https://ca.other.com", redirectFrequency: "always" };

    expect(await browser.visit("/", rule, "?preview_theme_id=123")).toBe("https://ca.other.com/");
  });

  it("stays inactive inside the theme editor", async () => {
    const browser = createBrowser();
    const rule: Rule = { ruleId: "s2", targetUrl: "https://ca.other.com", redirectFrequency: "always" };

    expect(await browser.visit("/", rule, "", true)).toBeNull();
  });

  it.each(["java	script:alert(1)", "javascript:alert(1)", "data:text/html,<script>1</script>"])(
    "never navigates to an unsafe target %j",
    async (targetUrl) => {
      const browser = createBrowser();
      expect(await browser.visit("/", { ruleId: "s3", targetUrl, redirectFrequency: "always" })).toBeNull();
    },
  );
});
