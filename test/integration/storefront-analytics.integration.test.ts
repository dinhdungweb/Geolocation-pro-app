import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";
import {
  enqueueStorefrontAnalyticsEvent,
  processQueuedStorefrontAnalyticsEvents,
  type RecordStorefrontAnalyticsEventInput,
} from "../../app/utils/storefront-analytics.server";

const SHOP = "analytics-queue.integration.test";

function analyticsInput(
  overrides: Partial<RecordStorefrontAnalyticsEventInput> = {},
): RecordStorefrontAnalyticsEventInput {
  return {
    countryCode: "US",
    ipAddress: "203.0.113.10",
    path: "/products/example",
    regionCode: "CA",
    regionName: "California",
    ruleId: "rule-1",
    ruleName: "US visitors",
    shop: SHOP,
    targetUrl: null,
    type: "visit",
    userAgent: "integration-test",
    ...overrides,
  };
}

async function clearAnalyticsData() {
  await prisma.storefrontAnalyticsEventQueue.deleteMany({ where: { shop: SHOP } });
  await prisma.analyticsRule.deleteMany({ where: { shop: SHOP } });
  await prisma.analyticsCountry.deleteMany({ where: { shop: SHOP } });
  await prisma.visitorLog.deleteMany({ where: { shop: SHOP } });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await clearAnalyticsData();
});

describe("storefront analytics queue integration", () => {
  it("persists, processes, and removes a queued visit", async () => {
    await enqueueStorefrontAnalyticsEvent(analyticsInput());

    await vi.waitFor(async () => {
      expect(await prisma.visitorLog.count({ where: { shop: SHOP } })).toBe(1);
      expect(
        await prisma.storefrontAnalyticsEventQueue.count({ where: { shop: SHOP } }),
      ).toBe(0);
    });

    const country = await prisma.analyticsCountry.findFirst({
      where: { shop: SHOP, countryCode: "US" },
    });
    expect(country?.visitors).toBe(1);
  });

  it("backs off after a transient failure and succeeds on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queued = await prisma.storefrontAnalyticsEventQueue.create({
      data: {
        shop: SHOP,
        type: "visit",
        payload: JSON.parse(JSON.stringify(analyticsInput())),
      },
    });
    const originalCreateLog = prisma.visitorLog.create.bind(prisma.visitorLog);
    const createLog = vi
      .spyOn(prisma.visitorLog, "create")
      .mockRejectedValueOnce(new Error("forced transient database error"));

    const firstRun = await processQueuedStorefrontAnalyticsEvents();
    expect(firstRun).toMatchObject({ processed: 0, skipped: false });

    const pending = await prisma.storefrontAnalyticsEventQueue.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(pending).toMatchObject({
      attempts: 1,
      status: "pending",
    });
    expect(pending.lastError).toContain("forced transient database error");
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    createLog.mockImplementation(originalCreateLog);
    await prisma.storefrontAnalyticsEventQueue.update({
      where: { id: queued.id },
      data: { nextAttemptAt: new Date(0) },
    });

    const secondRun = await processQueuedStorefrontAnalyticsEvents();
    expect(secondRun).toMatchObject({ processed: 1, skipped: false });
    expect(
      await prisma.storefrontAnalyticsEventQueue.count({ where: { id: queued.id } }),
    ).toBe(0);
    expect(await prisma.visitorLog.count({ where: { shop: SHOP } })).toBe(1);
  });

  it("marks malformed payloads as failed without retrying them forever", async () => {
    const queued = await prisma.storefrontAnalyticsEventQueue.create({
      data: {
        shop: SHOP,
        type: "visit",
        payload: { malformed: true },
      },
    });

    await processQueuedStorefrontAnalyticsEvents();

    const failed = await prisma.storefrontAnalyticsEventQueue.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(failed).toMatchObject({
      attempts: 1,
      lastError: "Invalid analytics payload",
      status: "failed",
    });
  });
});
