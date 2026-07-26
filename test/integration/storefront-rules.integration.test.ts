import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";
import { authenticate } from "../../app/shopify.server";
import { loader as configLoader } from "../../app/routes/proxy.config";
import { getUsagePeriodForShop } from "../../app/utils/billing-period.server";
import { getGeoFromIP } from "../../app/utils/maxmind.server";
import {
  enqueueStorefrontAnalyticsEvent,
  recordBillableUsage,
} from "../../app/utils/storefront-analytics.server";
import { invalidateStorefrontConfigCache } from "../../app/utils/storefront-config-cache.server";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: vi.fn(),
    },
  },
}));

vi.mock("../../app/utils/billing-period.server", () => ({
  getUsagePeriodForShop: vi.fn(),
}));

vi.mock("../../app/utils/maxmind.server", () => ({
  getGeoFromIP: vi.fn(),
}));

vi.mock("../../app/utils/storefront-analytics.server", () => ({
  enqueueStorefrontAnalyticsEvent: vi.fn(),
  recordBillableUsage: vi.fn(),
  startStorefrontAnalyticsQueueWorker: vi.fn(),
}));

const SHOP = "storefront-rules.integration.test";
const PERIOD_KEY = "integration:storefront-rules";
const VISITOR_IP = "203.0.113.42";

const appProxyAuth = vi.mocked(authenticate.public.appProxy);
const geoLookup = vi.mocked(getGeoFromIP);
const usagePeriodLookup = vi.mocked(getUsagePeriodForShop);
const recordUsage = vi.mocked(recordBillableUsage);
const enqueueAnalytics = vi.mocked(enqueueStorefrontAnalyticsEvent);

type RuleOverrides = Partial<{
  countryCodes: string;
  daysOfWeek: string | null;
  endTime: string | null;
  ipAddresses: string;
  isActive: boolean;
  marketCountryCodes: string;
  marketHandles: string;
  matchType: string;
  name: string;
  pagePaths: string | null;
  pageTargetingType: string;
  priority: number;
  redirectMode: string;
  ruleType: string;
  scheduleEnabled: boolean;
  startTime: string | null;
  stateCodes: string;
  cityNames: string;
  cityCountryCode: string;
  cityRegionCode: string;
  targetUrl: string;
  timezone: string | null;
}>;

async function seedSettings(currentPlan = "plus") {
  return prisma.settings.create({
    data: {
      currentPlan,
      excludeBots: false,
      isEnabled: true,
      mode: "popup",
      shop: SHOP,
    },
  });
}

async function seedRule(overrides: RuleOverrides = {}) {
  return prisma.redirectRule.create({
    data: {
      countryCodes: "US",
      matchType: "country",
      name: "Default country rule",
      pageTargetingType: "all",
      priority: 10,
      redirectMode: "popup",
      ruleType: "redirect",
      shop: SHOP,
      targetUrl: "https://store.example/us",
      ...overrides,
    },
  });
}

function configRequest({
  cookie,
  country = "US",
  marketHandle,
  marketId,
  origin = "https://store.example",
  path = "/products/widget",
  userAgent = "Mozilla/5.0",
}: {
  cookie?: string;
  country?: string;
  marketHandle?: string;
  marketId?: string;
  origin?: string;
  path?: string;
  userAgent?: string;
} = {}) {
  const query = new URLSearchParams({
    country,
    origin,
    path,
    shop: SHOP,
  });
  if (marketHandle) query.set("market_handle", marketHandle);
  if (marketId) query.set("market_id", marketId);

  const headers = new Headers({
    "user-agent": userAgent,
    "x-forwarded-for": VISITOR_IP,
  });
  if (cookie) headers.set("cookie", cookie);

  return new Request(`https://app.test/proxy/config?${query}`, { headers });
}

async function loadConfig(options?: Parameters<typeof configRequest>[0]) {
  const response = await configLoader({
    context: {},
    params: {},
    request: configRequest(options),
  } as never);

  return {
    body: (await response.json()) as Record<string, any>,
    response,
  };
}

beforeEach(() => {
  invalidateStorefrontConfigCache(SHOP);
  appProxyAuth.mockResolvedValue({} as never);
  geoLookup.mockResolvedValue({
    city: "Los Angeles",
    countryCode: "US",
    regionCode: "US-CA",
    regionName: "California",
  });
  usagePeriodLookup.mockResolvedValue({
    billingPeriodEnd: null,
    billingPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    billingSubscriptionId: null,
    billingUsageLineItemId: null,
    chargedVisitors: 0,
    key: PERIOD_KEY,
    source: "calendar",
    yearMonth: "2026-07",
  });
  recordUsage.mockResolvedValue({
    actionInserted: false,
    duplicateAction: null,
    inserted: false,
  });
  enqueueAnalytics.mockResolvedValue(false);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  invalidateStorefrontConfigCache(SHOP);
  vi.clearAllMocks();
  await prisma.storefrontAnalyticsEventQueue.deleteMany({ where: { shop: SHOP } });
  await prisma.billableUsageActionEvent.deleteMany({ where: { shop: SHOP } });
  await prisma.billableUsageEvent.deleteMany({ where: { shop: SHOP } });
  await prisma.monthlyUsage.deleteMany({ where: { shop: SHOP } });
  await prisma.redirectRule.deleteMany({ where: { shop: SHOP } });
  await prisma.settings.deleteMany({ where: { shop: SHOP } });
});

describe("storefront rule resolution integration", () => {
  it("returns a paid country auto-redirect and records the server-side action", async () => {
    await seedSettings("plus");
    const rule = await seedRule({
      name: "US automatic redirect",
      redirectMode: "auto_redirect",
    });
    recordUsage.mockResolvedValue({
      actionInserted: true,
      duplicateAction: null,
      inserted: true,
    });

    const { body, response } = await loadConfig();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      action: "auto_redirect",
      analyticsEvent: "auto_redirected",
      countryCode: "US",
      currentPlan: "plus",
      enabled: true,
      rule: {
        name: "US automatic redirect",
        ruleId: rule.id,
        source: "country",
      },
      usage: 0,
    });
    expect(body.eventToken).toEqual(expect.any(String));
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: "US",
        path: "/products/widget",
        type: "auto_redirected",
      }),
    );
    expect(enqueueAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: rule.id,
        shop: SHOP,
        type: "auto_redirected",
      }),
    );
  });

  it("gives a matching IP block precedence over a higher-priority country rule", async () => {
    await seedSettings("elite");
    await seedRule({
      name: "High priority country redirect",
      priority: 100,
      redirectMode: "auto_redirect",
    });
    const ipRule = await seedRule({
      countryCodes: "",
      ipAddresses: "203.0.113.0/24",
      matchType: "ip",
      name: "Blocked test network",
      priority: 1,
      ruleType: "block",
      targetUrl: "",
    });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "block",
      analyticsEvent: "ip_blocked",
      enabled: true,
      rule: {
        name: "Blocked test network",
        ruleId: ipRule.id,
        source: "ip",
      },
    });
  });

  it("blocks paid traffic when the configured VPN provider flags the visitor", async () => {
    await seedSettings("elite");
    await prisma.settings.update({
      where: { shop: SHOP },
      data: { blockVpn: true },
    });
    await seedRule({
      name: "Country fallback",
      redirectMode: "auto_redirect",
    });
    vi.stubEnv("VPN_CHECK_API_URL", "https://vpn-check.example/lookup");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        proxy: false,
        tor: false,
        vpn: true,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "block",
      analyticsEvent: "vpn_blocked",
      enabled: true,
      rule: {
        name: "Anti-Fraud Shield",
        ruleId: "vpn-shield",
        source: "vpn",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "vpn-check.example",
        search: `?ip=${VISITOR_IP}`,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("selects a Shopify Market rule before state and country rules", async () => {
    await seedSettings("plus");
    await seedRule({
      name: "Country fallback",
      priority: 100,
    });
    await seedRule({
      countryCodes: "",
      matchType: "state",
      name: "California fallback",
      priority: 100,
      stateCodes: "US-CA",
    });
    const marketRule = await seedRule({
      countryCodes: "",
      marketHandles: "north-america",
      matchType: "market",
      name: "North America market",
      priority: 1,
      redirectMode: "auto_redirect",
    });

    const { body } = await loadConfig({ marketHandle: "north-america" });

    expect(body).toMatchObject({
      action: "auto_redirect",
      rule: {
        name: "North America market",
        ruleId: marketRule.id,
        source: "market",
      },
    });
  });

  it("matches a paid state block from the resolved region", async () => {
    await seedSettings("plus");
    const stateRule = await seedRule({
      countryCodes: "",
      matchType: "state",
      name: "California block",
      ruleType: "block",
      stateCodes: "US-CA",
      targetUrl: "",
    });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "block",
      analyticsEvent: "blocked",
      regionCode: "US-CA",
      regionName: "California",
      rule: {
        ruleId: stateRule.id,
        source: "state",
      },
    });
  });

  it("matches a paid city rule before state and country rules", async () => {
    await seedSettings("plus");
    await seedRule({
      name: "Country fallback",
      priority: 100,
    });
    await seedRule({
      countryCodes: "",
      matchType: "state",
      name: "California fallback",
      priority: 100,
      stateCodes: "US-CA",
    });
    const cityRule = await seedRule({
      cityCountryCode: "US",
      cityNames: "Los Angeles,San Francisco",
      cityRegionCode: "US-CA",
      countryCodes: "",
      matchType: "city",
      name: "Los Angeles redirect",
      priority: 1,
      redirectMode: "auto_redirect",
    });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "auto_redirect",
      city: "Los Angeles",
      rule: {
        name: "Los Angeles redirect",
        ruleId: cityRule.id,
        source: "city",
      },
    });
  });

  it("allows a Free country popup but skips paid-only country blocking", async () => {
    await seedSettings("free");
    await seedRule({
      name: "Paid country block",
      priority: 100,
      ruleType: "block",
      targetUrl: "",
    });
    const popupRule = await seedRule({
      name: "Free country popup",
      priority: 10,
    });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "popup",
      currentPlan: "free",
      enabled: true,
      rule: {
        name: "Free country popup",
        ruleId: popupRule.id,
        source: "country",
      },
    });
  });

  it("skips page-targeted country rules on Free and uses an all-pages rule", async () => {
    await seedSettings("free");
    await seedRule({
      name: "Paid page-targeted redirect",
      pagePaths: "/products/*",
      pageTargetingType: "include",
      priority: 100,
    });
    const allPagesRule = await seedRule({
      name: "Free all-pages redirect",
      priority: 10,
    });

    const { body } = await loadConfig({ path: "/products/widget" });

    expect(body.rule).toMatchObject({
      name: "Free all-pages redirect",
      ruleId: allPagesRule.id,
    });
  });

  it("stops all Free actions after the monthly visitor limit is reached", async () => {
    await seedSettings("free");
    await seedRule({ redirectMode: "auto_redirect" });
    await prisma.monthlyUsage.create({
      data: {
        billingPeriodKey: PERIOD_KEY,
        shop: SHOP,
        totalVisitors: 100,
        yearMonth: "2026-07",
      },
    });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "none",
      currentPlan: "free",
      enabled: false,
      limitExceeded: true,
      planLimit: 100,
      rule: null,
      usage: 100,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("does not run a scheduled rule outside its configured day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00.000Z")); // Sunday
    await seedSettings("plus");
    await seedRule({
      daysOfWeek: "1", // Monday
      name: "Monday only",
      priority: 100,
      scheduleEnabled: true,
      timezone: "UTC",
    });
    const fallback = await seedRule({
      name: "Always active fallback",
      priority: 10,
    });

    const { body } = await loadConfig();

    expect(body.rule).toMatchObject({
      name: "Always active fallback",
      ruleId: fallback.id,
    });
  });

  it("suppresses a popup after the visitor has already made a choice", async () => {
    await seedSettings("plus");
    await seedRule({ name: "Remembered popup" });

    const { body } = await loadConfig({ cookie: "geo_choice=redirected" });

    expect(body).toMatchObject({
      action: "none",
      enabled: false,
      rule: null,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("does not resolve rules for an excluded visitor IP", async () => {
    await seedSettings("elite");
    await prisma.settings.update({
      where: { shop: SHOP },
      data: { excludedIPs: `198.51.100.1, ${VISITOR_IP}` },
    });
    await seedRule({ redirectMode: "auto_redirect" });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "none",
      enabled: false,
      rule: null,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("prevents redirect loops when the visitor is already on the target path", async () => {
    await seedSettings("plus");
    await seedRule({
      redirectMode: "auto_redirect",
      targetUrl: "https://store.example/en-us",
    });

    const { body } = await loadConfig({
      origin: "https://store.example",
      path: "/en-us/",
    });

    expect(body).toMatchObject({
      action: "none",
      enabled: false,
      rule: null,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("does not resolve rules while the app is disabled", async () => {
    await seedSettings("plus");
    await prisma.settings.update({
      where: { shop: SHOP },
      data: { isEnabled: false },
    });
    await seedRule({ redirectMode: "auto_redirect" });

    const { body } = await loadConfig();

    expect(body).toMatchObject({
      action: "none",
      enabled: false,
      rule: null,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("does not resolve rules for excluded bots", async () => {
    await seedSettings("plus");
    await prisma.settings.update({
      where: { shop: SHOP },
      data: { excludeBots: true },
    });
    await seedRule({ redirectMode: "auto_redirect" });

    const { body } = await loadConfig({ userAgent: "Googlebot/2.1" });

    expect(body).toMatchObject({
      action: "none",
      enabled: false,
      rule: null,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
