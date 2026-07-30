import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authenticateAdmin: vi.fn(),
    checkBilling: vi.fn(),
    findLog: vi.fn(),
    findRules: vi.fn(),
    createRule: vi.fn(),
    findSettings: vi.fn(),
    invalidateCache: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
    authenticate: {
        admin: mocks.authenticateAdmin,
    },
}));

vi.mock("../db.server", () => ({
    default: {
        visitorLog: {
            findFirst: mocks.findLog,
        },
        redirectRule: {
            findMany: mocks.findRules,
            create: mocks.createRule,
        },
        settings: {
            findUnique: mocks.findSettings,
        },
    },
}));

vi.mock("../utils/billing.server", () => ({
    checkBillingWithFallback: mocks.checkBilling,
}));

vi.mock("../utils/billing-mode.server", () => ({
    isBillingTestMode: () => false,
}));

vi.mock("../utils/storefront-config-cache.server", () => ({
    invalidateStorefrontConfigCache: mocks.invalidateCache,
}));

import { action } from "./app.logs";

describe("Visitor Logs IP blocking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.authenticateAdmin.mockResolvedValue({
            billing: {},
            session: { shop: "logs-test.myshopify.com" },
        });
        mocks.checkBilling.mockResolvedValue({
            appSubscriptions: [{}],
            hasActivePayment: true,
        });
        mocks.findSettings.mockResolvedValue({ currentPlan: "plus" });
        mocks.findLog.mockResolvedValue({ ipAddress: "203.0.113.42" });
        mocks.findRules.mockResolvedValue([]);
        mocks.createRule.mockResolvedValue({});
    });

    it("creates an active IP block rule from a shop-scoped log", async () => {
        const formData = new FormData();
        formData.set("intent", "block_ip");
        formData.set("id", "visitor-log-id");
        const response = await action({
            context: {},
            params: {},
            request: new Request("https://app.test/app/logs", {
                method: "POST",
                body: formData,
            }),
        } as never);

        expect(response.init?.status ?? 200).toBe(200);
        expect(response.data).toEqual({
            message: "203.0.113.42 was added to IP Rules and blocked.",
        });
        expect(mocks.findLog).toHaveBeenCalledWith({
            where: {
                id: "visitor-log-id",
                shop: "logs-test.myshopify.com",
            },
            select: { ipAddress: true },
        });
        expect(mocks.createRule).toHaveBeenCalledWith({
            data: expect.objectContaining({
                ipAddresses: "203.0.113.42",
                isActive: true,
                matchType: "ip",
                name: "Blocked from Visitor Logs",
                ruleType: "block",
                shop: "logs-test.myshopify.com",
            }),
        });
        expect(mocks.invalidateCache).toHaveBeenCalledWith(
            "logs-test.myshopify.com",
        );
    });
});
