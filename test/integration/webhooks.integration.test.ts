import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";
import { authenticate } from "../../app/shopify.server";
import { processPendingShopCleanupJobs } from "../../app/utils/cleanup.server";
import { action as gdprAction } from "../../app/routes/webhooks.app.gdpr";
import { action as uninstallAction } from "../../app/routes/webhooks.app.uninstalled";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

const uninstallShop = "uninstall-webhook.integration.test";
const redactShop = "redact-webhook.integration.test";
const webhookAuth = vi.mocked(authenticate.webhook);

function webhookRequest(topic: string, shop: string) {
  return new Request("https://app.test/webhooks", {
    method: "POST",
    headers: {
      "x-shopify-api-version": "2026-04",
      "x-shopify-shop-domain": shop,
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": `webhook-${topic}`,
    },
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
});

describe("Shopify webhook cleanup integration", () => {
  it("deactivates an uninstalled shop and completes background cleanup", async () => {
    await seedShop(uninstallShop);
    webhookAuth.mockResolvedValue({
      shop: uninstallShop,
      topic: "APP_UNINSTALLED",
    } as never);

    const response = await uninstallAction({
      context: {},
      params: {},
      request: webhookRequest("APP_UNINSTALLED", uninstallShop),
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

  it("returns Shopify authentication failures without mutating the shop", async () => {
    await seedShop(uninstallShop);
    webhookAuth.mockRejectedValue(new Response("Invalid webhook", { status: 401 }));

    const response = await uninstallAction({
      context: {},
      params: {},
      request: webhookRequest("APP_UNINSTALLED", uninstallShop),
    } as never);

    expect(response.status).toBe(401);
    expect(await prisma.settings.count({ where: { shop: uninstallShop } })).toBe(1);
    expect(await prisma.shopCleanupJob.count({ where: { shop: uninstallShop } })).toBe(0);
  });
});
