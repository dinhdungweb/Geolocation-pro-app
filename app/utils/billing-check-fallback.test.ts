import { describe, expect, it, vi } from "vitest";

vi.mock("../db.server", () => ({
    default: {},
}));

vi.mock("../shopify.server", () => ({
    unauthenticated: {
        admin: vi.fn(),
    },
}));

vi.mock("./billing-period.server", () => ({
    syncUsagePeriodForShop: vi.fn(),
    usagePeriodFromSubscription: vi.fn(),
}));

import { checkBillingWithFallback } from "./billing.server";

describe("checkBillingWithFallback", () => {
    it("uses the stored plan when Shopify Billing has a transport failure", async () => {
        const error = Object.assign(
            new Error("Http request error, no response available: GraphQL Client: fetch failed"),
            { name: "HttpRequestError" },
        );
        const billing = {
            check: vi.fn().mockRejectedValue(error),
        };

        const result = await checkBillingWithFallback(billing, false, {
            fallbackPlan: "plus",
            logContext: "test loader",
        });

        expect(result).toMatchObject({
            hasActivePayment: true,
            appSubscriptions: [{ name: "plus", status: "ACTIVE" }],
        });
    });

    it("uses the stored plan for retryable Shopify server responses", async () => {
        const billing = {
            check: vi.fn().mockRejectedValue({
                message: "Shopify service unavailable",
                response: { code: 503 },
            }),
        };

        const result = await checkBillingWithFallback(billing, false, {
            fallbackPlan: "premium",
        });

        expect(result.hasActivePayment).toBe(true);
        expect(result.appSubscriptions[0]?.name).toBe("premium");
    });

    it("does not hide non-retryable billing errors", async () => {
        const error = new Error("Invalid billing plan configuration");
        const billing = {
            check: vi.fn().mockRejectedValue(error),
        };

        await expect(checkBillingWithFallback(billing, false)).rejects.toBe(error);
    });
});
