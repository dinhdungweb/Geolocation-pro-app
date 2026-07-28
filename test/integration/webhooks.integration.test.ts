import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";
import { authenticate } from "../../app/shopify.server";
import { processPendingShopCleanupJobs } from "../../app/utils/cleanup.server";
import { action as gdprAction } from "../../app/routes/webhooks.app.gdpr";
import { action as scopesUpdateAction } from "../../app/routes/webhooks.app.scopes_update";
import { action as subscriptionUpdateAction } from "../../app/routes/webhooks.app.subscriptions.update";
import { action as uninstallAction } from "../../app/routes/webhooks.app.uninstalled";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

vi.mock("../../app/utils/billing-period.server", () => ({
  fetchShopifyUsagePeriod: vi.fn().mockResolvedValue(null),
  syncUsagePeriodForShop: vi.fn(),
}));

const uninstallShop = "uninstall-webhook.integration.test";
const redactShop = "redact-webhook.integration.test";
const subscriptionShop = "subscription-webhook.integration.test";
const scopesShop = "scopes-webhook.integration.test";
const webhookAuth = vi.mocked(authenticate.webhook);

function adminWithActiveSubscriptions(
  activeSubscriptions: Array<{ id: string; name: string; status: string }>,
) {
  return {
    graphql: vi.fn().mockResolvedValue(
      Response.json({
        data: {
          currentAppInstallation: {
            activeSubscriptions,
          },
        },
      }),
    ),
  };
}

function webhookRequest(
  topic: string,
  shop: string,
  options: { validHmac?: boolean } = {},
) {
  const body = JSON.stringify({ id: 123, myshopify_domain: shop });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-shopify-api-version": "2026-04",
    "x-shopify-shop-domain": shop,
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": `webhook-${topic}`,
  };

  if (options.validHmac) {
    headers["x-shopify-hmac-sha256"] = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
      .update(body)
      .digest("base64");
  }

  return new Request("https://app.test/webhooks", {
    body,
    headers,
    method: "POST",
  });
}

async function seedShop(shop: string) {
  await prisma.settings.create({
    data: {
      shop,
      currentPlan: "elite",
      isEnabled: true,
      blockVpn: true,
    },
  });
  await prisma.session.create({
    data: {
      accessToken: "test-token",
      id: `offline_${shop}`,
      isOnline: false,
      shop,
      state: "test-state",
    },
  });
  await prisma.redirectRule.create({
    data: {
      countryCodes: "US",
      name: "Test rule",
      shop,
      targetUrl: "https://example.test",
    },
  });
  await prisma.visitorLog.create({
    data: {
      action: "visit",
      ipAddress: "203.0.113.20",
      shop,
    },
  });
}

async function clearShop(shop: string) {
  await prisma.shopCleanupJob.deleteMany({ where: { shop } });
  await prisma.adminEmailLog.deleteMany({ where: { shop } });
  await prisma.visitorLog.deleteMany({ where: { shop } });
  await prisma.redirectRule.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
  await prisma.settings.deleteMany({ where: { shop } });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.clearAllMocks();
  await clearShop(uninstallShop);
  await clearShop(redactShop);
  await clearShop(subscriptionShop);
  await clearShop(scopesShop);
});

describe("Shopify webhook cleanup integration", () => {
  it("deactivates an uninstalled shop and completes background cleanup", async () => {
    await seedShop(uninstallShop);

    const response = await uninstallAction({
      context: {},
      params: {},
      request: webhookRequest("APP_UNINSTALLED", uninstallShop, {
        validHmac: true,
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await prisma.session.count({ where: { shop: uninstallShop } })).toBe(0);
    expect(
      await prisma.settings.findUniqueOrThrow({ where: { shop: uninstallShop } }),
    ).toMatchObject({
      blockVpn: false,
      currentPlan: "free",
      isEnabled: false,
    });
    expect(
      await prisma.shopCleanupJob.findFirstOrThrow({ where: { shop: uninstallShop } }),
    ).toMatchObject({ reason: "app_uninstalled", status: "pending" });

    await processPendingShopCleanupJobs();

    expect(await prisma.settings.count({ where: { shop: uninstallShop } })).toBe(0);
    expect(await prisma.redirectRule.count({ where: { shop: uninstallShop } })).toBe(0);
    expect(await prisma.visitorLog.count({ where: { shop: uninstallShop } })).toBe(0);
    expect(
      await prisma.shopCleanupJob.findFirstOrThrow({ where: { shop: uninstallShop } }),
    ).toMatchObject({ attempts: 1, status: "completed" });
  });

  it("redacts shop data including email audit history", async () => {
    await seedShop(redactShop);
    await prisma.adminEmailLog.create({
      data: {
        deliveryKey: "redact-delivery-key",
        shop: redactShop,
        type: "welcome",
      },
    });
    webhookAuth.mockResolvedValue({
      shop: redactShop,
      topic: "SHOP_REDACT",
    } as never);

    const response = await gdprAction({
      context: {},
      params: {},
      request: webhookRequest("SHOP_REDACT", redactShop),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    await processPendingShopCleanupJobs();

    expect(await prisma.settings.count({ where: { shop: redactShop } })).toBe(0);
    expect(await prisma.adminEmailLog.count({ where: { shop: redactShop } })).toBe(0);
    expect(
      await prisma.shopCleanupJob.findFirstOrThrow({ where: { shop: redactShop } }),
    ).toMatchObject({ reason: "shop_redact", status: "completed" });
  });

  it("rejects an invalid uninstall HMAC without mutating the shop", async () => {
    await seedShop(uninstallShop);

    const response = await uninstallAction({
      context: {},
      params: {},
      request: webhookRequest("APP_UNINSTALLED", uninstallShop),
    } as never);

    expect(response.status).toBe(401);
    expect(await prisma.settings.count({ where: { shop: uninstallShop } })).toBe(1);
    expect(await prisma.shopCleanupJob.count({ where: { shop: uninstallShop } })).toBe(0);
  });

  it("syncs an active subscription plan from Shopify", async () => {
    await seedShop(subscriptionShop);
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([
        {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "ACTIVE",
        },
      ]),
      payload: {
        app_subscription: {
          name: "Plus",
          status: "ACTIVE",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({ currentPlan: "plus" });
  });

  it("keeps Plus when the merchant declines a pending Elite upgrade", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: {
        billingPlanName: "plus",
        billingSubscriptionId: "gid://shopify/AppSubscription/plus",
        currentPlan: "plus",
      },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([
        {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "ACTIVE",
        },
      ]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/elite-pending",
          name: "Elite",
          status: "DECLINED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      billingPlanName: "plus",
      billingSubscriptionId: "gid://shopify/AppSubscription/plus",
      blockVpn: true,
      currentPlan: "plus",
    });
  });

  it("keeps Plus when Shopify briefly returns no active plan after declining Elite", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: {
        billingPlanName: "plus",
        billingSubscriptionId: "gid://shopify/AppSubscription/plus",
        currentPlan: "plus",
      },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/elite-pending",
          name: "Elite",
          status: "DECLINED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      billingPlanName: "plus",
      billingSubscriptionId: "gid://shopify/AppSubscription/plus",
      blockVpn: true,
      currentPlan: "plus",
    });
  });

  it("uses Elite when the old Plus cancellation webhook arrives after an upgrade", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: { currentPlan: "plus" },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([
        {
          id: "gid://shopify/AppSubscription/elite",
          name: "Elite",
          status: "ACTIVE",
        },
      ]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "CANCELLED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      blockVpn: true,
      currentPlan: "elite",
    });
  });

  it("keeps Plus when cancelling an Elite replacement briefly hides the active subscription", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: {
        currentPlan: "plus",
        billingPlanName: "plus",
        billingSubscriptionId: "gid://shopify/AppSubscription/plus",
      },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "CANCELLED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      billingPlanName: "plus",
      billingSubscriptionId: "gid://shopify/AppSubscription/plus",
      blockVpn: true,
      currentPlan: "plus",
    });
  });

  it("keeps Free when the explicit downgrade already updated the database", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: {
        currentPlan: "free",
        billingPlanName: null,
        billingSubscriptionId: null,
        blockVpn: false,
      },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "CANCELLED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      billingPlanName: null,
      billingSubscriptionId: null,
      blockVpn: false,
      currentPlan: "free",
    });
  });

  it("moves a frozen paid subscription to Free when Shopify reports no active subscription", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: {
        billingPlanName: "plus",
        billingSubscriptionId: "gid://shopify/AppSubscription/plus",
        currentPlan: "plus",
      },
    });
    webhookAuth.mockResolvedValue({
      admin: adminWithActiveSubscriptions([]),
      payload: {
        app_subscription: {
          id: "gid://shopify/AppSubscription/plus",
          name: "Plus",
          status: "FROZEN",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      billingPlanName: null,
      billingSubscriptionId: null,
      blockVpn: false,
      currentPlan: "free",
    });
  });

  it("preserves the stored plan and asks Shopify to retry after a query failure", async () => {
    await seedShop(subscriptionShop);
    await prisma.settings.update({
      where: { shop: subscriptionShop },
      data: { currentPlan: "plus" },
    });
    webhookAuth.mockResolvedValue({
      admin: {
        graphql: vi.fn().mockResolvedValue(
          Response.json({
            errors: [{ message: "Temporary Shopify API failure" }],
          }),
        ),
      },
      payload: {
        app_subscription: {
          name: "Elite",
          status: "DECLINED",
        },
      },
      shop: subscriptionShop,
      topic: "APP_SUBSCRIPTIONS_UPDATE",
    } as never);

    const response = await subscriptionUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SUBSCRIPTIONS_UPDATE", subscriptionShop),
    } as never);

    expect(response.status).toBe(500);
    expect(
      await prisma.settings.findUniqueOrThrow({
        where: { shop: subscriptionShop },
      }),
    ).toMatchObject({
      blockVpn: true,
      currentPlan: "plus",
    });
  });

  it("updates stored session scopes after a Shopify scope change", async () => {
    await seedShop(scopesShop);
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: `offline_${scopesShop}` },
    });
    webhookAuth.mockResolvedValue({
      payload: { current: ["read_markets", "read_themes"] },
      session,
      shop: scopesShop,
      topic: "APP_SCOPES_UPDATE",
    } as never);

    const response = await scopesUpdateAction({
      context: {},
      params: {},
      request: webhookRequest("APP_SCOPES_UPDATE", scopesShop),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await prisma.session.findUniqueOrThrow({
        where: { id: session.id },
      }),
    ).toMatchObject({ scope: "read_markets,read_themes" });
  });
});
