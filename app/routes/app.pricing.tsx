import {
    Page,
    Box,
    Button,
    Card,
    Text,
    BlockStack,
    Divider,
    InlineStack,
    Badge,
} from "@shopify/polaris";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
    FREE_PLAN,
    PREMIUM_PLAN,
    PLUS_PLAN,
    ELITE_PLAN,
    UNLIMITED_PLAN,
    CUSTOM_PLAN,
    ALL_PAID_PLANS,
    PLAN_LIMITS,
    OVERAGE_RATE,
    getPlanLimit,
} from "../billing.config";

function redirectToBillingConfirmation(request: Request, shop: string, confirmationUrl: string) {
    const requestUrl = new URL(request.url);

    if (request.headers.get("authorization")) {
        throw new Response(undefined, {
            status: 401,
            statusText: "Unauthorized",
            headers: {
                "X-Shopify-API-Request-Failure-Reauthorize-Url": confirmationUrl,
            },
        });
    }

    if (requestUrl.searchParams.get("embedded") === "1" && requestUrl.searchParams.get("host")) {
        const params = new URLSearchParams({
            shop,
            host: requestUrl.searchParams.get("host")!,
            exitIframe: confirmationUrl,
        });
        throw redirect(`/auth/exit-iframe?${params.toString()}`);
    }

    throw redirect(confirmationUrl);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { billing, session } = await authenticate.admin(request);
    const isTest = false;

    // Restore billing check
    const billingCheck = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest,
    });

    const currentPlan = billingCheck.appSubscriptions[0]?.name || FREE_PLAN;
    const settings = await prisma.settings.upsert({
        where: { shop: session.shop },
        update: { currentPlan },
        create: { shop: session.shop, currentPlan },
        select: {
            allowUnlimitedPlan: true,
            customPlanEnabled: true,
            customPlanName: true,
            customPlanPrice: true,
            customPlanVisitorLimit: true,
            customPlanNoOverage: true,
            customPlanTrialDays: true,
        },
    });

    return json({
        canUseUnlimitedPlan: Boolean(settings?.allowUnlimitedPlan) || currentPlan === UNLIMITED_PLAN,
        canUseCustomPlan: Boolean(settings?.customPlanEnabled) || currentPlan === CUSTOM_PLAN,
        customPlan: settings ? {
            enabled: settings.customPlanEnabled,
            name: settings.customPlanName,
            price: Number(settings.customPlanPrice),
            visitorLimit: settings.customPlanVisitorLimit,
            noOverage: settings.customPlanNoOverage,
            trialDays: settings.customPlanTrialDays,
        } : null,
        hasActivePayment: billingCheck.hasActivePayment,
        currentPlan,
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { billing, session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const isTest = false;
    const formData = await request.formData();
    const selectedPlan = formData.get("plan") as string;
    const currentPlan = formData.get("currentPlan") as string;

    if (selectedPlan) {
        if (selectedPlan === UNLIMITED_PLAN) {
            const settings = await prisma.settings.findUnique({
                where: { shop },
                select: { allowUnlimitedPlan: true },
            });

            if (!settings?.allowUnlimitedPlan) {
                throw new Response("Unlimited plan is not available for this shop", { status: 403 });
            }
        }

        if (selectedPlan === CUSTOM_PLAN) {
            const settings = await prisma.settings.findUnique({
                where: { shop },
                select: {
                    customPlanEnabled: true,
                    customPlanName: true,
                    customPlanPrice: true,
                    customPlanVisitorLimit: true,
                    customPlanNoOverage: true,
                    customPlanTrialDays: true,
                },
            });

            if (!settings?.customPlanEnabled) {
                throw new Response("Custom plan is not available for this shop", { status: 403 });
            }

            const customPrice = Number(settings.customPlanPrice);
            if (!Number.isFinite(customPrice) || customPrice <= 0) {
                return json({ error: "Custom plan price is invalid" }, { status: 400 });
            }

            if (!settings.customPlanNoOverage && !settings.customPlanVisitorLimit) {
                return json({ error: "Custom plan visitor limit is required for overage billing" }, { status: 400 });
            }

            const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
            const returnUrl = new URL("/app/pricing", appUrl).toString();
            const lineItems: any[] = [
                {
                    plan: {
                        appRecurringPricingDetails: {
                            price: {
                                amount: customPrice,
                                currencyCode: "USD",
                            },
                            interval: "EVERY_30_DAYS",
                        },
                    },
                },
            ];

            if (!settings.customPlanNoOverage) {
                lineItems.push({
                    plan: {
                        appUsagePricingDetails: {
                            cappedAmount: {
                                amount: 100,
                                currencyCode: "USD",
                            },
                            terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor) exceeded.",
                        },
                    },
                });
            }

            const response = await admin.graphql(
                `#graphql
                mutation AppSubscriptionCreate(
                    $name: String!,
                    $returnUrl: URL!,
                    $lineItems: [AppSubscriptionLineItemInput!]!,
                    $test: Boolean!,
                    $trialDays: Int,
                    $replacementBehavior: AppSubscriptionReplacementBehavior
                ) {
                    appSubscriptionCreate(
                        name: $name,
                        returnUrl: $returnUrl,
                        lineItems: $lineItems,
                        test: $test,
                        trialDays: $trialDays,
                        replacementBehavior: $replacementBehavior
                    ) {
                        confirmationUrl
                        userErrors {
                            field
                            message
                        }
                    }
                }`,
                {
                    variables: {
                        name: CUSTOM_PLAN,
                        returnUrl,
                        lineItems,
                        test: isTest,
                        trialDays: settings.customPlanTrialDays,
                        replacementBehavior: "APPLY_IMMEDIATELY",
                    },
                },
            );
            const data = await response.json();
            const userErrors = data?.data?.appSubscriptionCreate?.userErrors || [];
            if (userErrors.length > 0) {
                return json({ error: userErrors[0].message }, { status: 400 });
            }

            const confirmationUrl = data?.data?.appSubscriptionCreate?.confirmationUrl;
            if (!confirmationUrl) {
                return json({ error: "Shopify did not return a billing confirmation URL" }, { status: 500 });
            }

            redirectToBillingConfirmation(request, shop, confirmationUrl);
        }

        // Handling Downgrade to Free Plan
        if (selectedPlan === FREE_PLAN) {
            // Get active subscription to cancel it
            const billingCheck = await billing.check({
                plans: ALL_PAID_PLANS as any,
                isTest,
            });

            const subscription = billingCheck.appSubscriptions[0];
            if (subscription) {
                // Bug #1 fix: Charge remaining overage BEFORE cancelling subscription
                const activePlan = subscription.name || currentPlan;
                const settings = await prisma.settings.findUnique({
                    where: { shop },
                    select: {
                        customPlanVisitorLimit: true,
                        customPlanNoOverage: true,
                    },
                });
                const planLimit = getPlanLimit(activePlan, settings);
                const now = new Date();
                const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const monthlyUsage = await prisma.monthlyUsage.findUnique({
                    where: { shop_yearMonth: { shop, yearMonth } },
                });

                if (monthlyUsage) {
                    const overageVisitors = monthlyUsage.totalVisitors - planLimit - monthlyUsage.chargedVisitors;
                    if (overageVisitors > 0) {
                        const chargeAmount = Number((overageVisitors * OVERAGE_RATE).toFixed(2));
                        // Skip if charge amount is too small (< $0.50) to avoid Shopify API issues
                        if (chargeAmount >= 0.50) {
                            try {
                                await billing.createUsageRecord({
                                    description: `Final overage before downgrade: ${overageVisitors} visitors beyond ${planLimit} limit`,
                                    price: { amount: chargeAmount, currencyCode: "USD" },
                                    isTest,
                                });
                                await prisma.monthlyUsage.update({
                                    where: { shop_yearMonth: { shop, yearMonth } },
                                    data: { chargedVisitors: { increment: overageVisitors } },
                                });
                                console.log(`[Billing] Final overage charge for ${shop}: $${chargeAmount.toFixed(2)} for ${overageVisitors} visitors`);
                            } catch (error) {
                                console.error("[Billing] Failed to charge final overage:", error);
                            }
                        } else {
                            console.log(`[Billing] Skipping final overage for ${shop}: $${chargeAmount.toFixed(2)} below minimum threshold`);
                        }
                    }
                }

                // Now cancel the subscription
                await billing.cancel({
                    subscriptionId: subscription.id,
                    isTest,
                    prorate: true,
                });
            }

            // Sync currentPlan to Settings for proxy limit check
            try {
                await prisma.settings.upsert({
                    where: { shop },
                    update: { currentPlan: FREE_PLAN },
                    create: { shop, currentPlan: FREE_PLAN },
                });
            } catch (err) {
                console.error("[Settings] Failed to sync currentPlan:", err);
            }

            return null;
        }

        // Handling Paid Plans
        if (ALL_PAID_PLANS.includes(selectedPlan) && selectedPlan !== CUSTOM_PLAN) {
            // Sync currentPlan to Settings for proxy limit check
            try {
                await prisma.settings.upsert({
                    where: { shop },
                    update: { currentPlan: selectedPlan },
                    create: { shop, currentPlan: selectedPlan },
                });
            } catch (err) {
                console.error("[Settings] Failed to sync currentPlan:", err);
            }

            await billing.require({
                plans: [selectedPlan] as any,
                isTest,
                onFailure: async () => {
                    return billing.request({
                        plan: selectedPlan as any,
                        isTest,
                    });
                },
            });
        }
    }

    return null;
};

interface PlanCardProps {
    name: string;
    displayName?: string;
    subtitle: string;
    price: string;
    visitorLimit?: number;
    visitorLimitLabel?: string;
    features: string[];
    isCurrentPlan: boolean;
    isFree?: boolean;
    isRecommended?: boolean;
    hasTrial?: boolean;
    trialDays?: number;
    noOverage?: boolean;
    ribbon: string;
    ribbonTone?: "green" | "blue";
    onSelect: () => void;
}

function formatPlanName(name: string) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function PlanCard({
    name,
    displayName,
    subtitle,
    price,
    visitorLimit,
    visitorLimitLabel,
    features,
    isCurrentPlan,
    isFree,
    isRecommended,
    hasTrial,
    trialDays,
    noOverage,
    ribbon,
    ribbonTone = "green",
    onSelect,
}: PlanCardProps) {
    return (
        <div className="pricing-plan-shell">
            <Card padding="0">
                <div className={`pricing-plan-card ${isCurrentPlan ? "pricing-plan-current" : ""}`}>
                    <div className={`pricing-plan-ribbon pricing-plan-ribbon-${ribbonTone}`}>
                        {ribbon}
                    </div>

                    <div className="pricing-plan-body">
                        <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
                                <BlockStack gap="100">
                                    <Text as="h2" variant="headingLg">{displayName || formatPlanName(name)}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {subtitle}
                                    </Text>
                                </BlockStack>
                                {isCurrentPlan ? (
                                    <Badge tone="success">Current</Badge>
                                ) : isRecommended ? (
                                    <Badge tone="success">Most popular</Badge>
                                ) : null}
                            </InlineStack>

                            <BlockStack gap="100">
                                <InlineStack gap="100" blockAlign="end">
                                    <Text as="p" variant="headingXl">
                                        {isFree ? "Free" : `$${price}`}
                                    </Text>
                                    {!isFree && (
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            USD / month
                                        </Text>
                                    )}
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    {isFree
                                        ? "No monthly charge"
                                        : hasTrial
                                            ? `${trialDays ?? 7}-day free trial included`
                                            : "Monthly Shopify billing"}
                                </Text>
                            </BlockStack>
                        </BlockStack>

                        <Divider />

                        <BlockStack gap="300">
                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                    Monthly usage
                                </Text>
                                <ul className="pricing-feature-list">
                                    <li>{visitorLimitLabel || `${visitorLimit?.toLocaleString()} visitors included`}</li>
                                    <li>Redirects, blocks and popups included</li>
                                    {!isFree && (
                                        <li>{noOverage ? "No overage charges" : "Overage billing available after limit"}</li>
                                    )}
                                </ul>
                            </BlockStack>

                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                    Standout features
                                </Text>
                                <ul className="pricing-feature-list">
                                    {features.map((feature) => (
                                        <li key={feature}>{feature}</li>
                                    ))}
                                </ul>
                            </BlockStack>
                        </BlockStack>

                        <div className="pricing-plan-action">
                            {isCurrentPlan ? (
                                <Button disabled fullWidth>Current plan</Button>
                            ) : (
                                <Button variant={isFree ? "secondary" : "primary"} onClick={onSelect} fullWidth>
                                    {isFree ? "Downgrade" : "Subscribe"}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default function PricingPage() {
    const { canUseUnlimitedPlan, canUseCustomPlan, customPlan, currentPlan } = useLoaderData<typeof loader>();
    const submit = useSubmit();

    const handleSelectPlan = (plan: string) => {
        // Pass both selected plan and current plan if needed
        submit({ plan, currentPlan }, { method: "POST" });
    };

    const openLiveChat = () => {
        if (typeof window === "undefined") return;

        const crisp = (window as any).$crisp;
        if (crisp?.push) {
            crisp.push(["do", "chat:show"]);
            crisp.push(["do", "chat:open"]);
            return;
        }

        window.location.href = "/app/support";
    };

    const customVisitorLimit = customPlan?.visitorLimit ?? null;
    const customNoOverage = customPlan?.noOverage ?? true;
    const customLimit = getPlanLimit(CUSTOM_PLAN, {
        customPlanVisitorLimit: customVisitorLimit,
        customPlanNoOverage: customNoOverage,
    });

    const plans = [
        {
            name: FREE_PLAN,
            subtitle: "For new stores testing geolocation",
            price: "0",
            visitorLimit: PLAN_LIMITS[FREE_PLAN],
            features: [
                "Country redirects",
                "Unlimited redirect rules",
                "Schedule redirects",
                "Analytics dashboard",
            ],
            isFree: true,
            ribbon: "Free plan",
        },
        {
            name: PREMIUM_PLAN,
            subtitle: "For stores that need blocking rules",
            price: "4.99",
            visitorLimit: PLAN_LIMITS[PREMIUM_PLAN],
            features: [
                "Everything in Free",
                "Country blocking",
                "IP blocking and redirects",
                "Page-specific targeting",
            ],
            hasTrial: true,
            ribbon: "7-day free trial",
        },
        {
            name: PLUS_PLAN,
            subtitle: "For growing stores with more traffic",
            price: "7.99",
            visitorLimit: PLAN_LIMITS[PLUS_PLAN],
            features: [
                "Everything in Premium",
                "Higher monthly limit",
                "Dedicated support",
                "High traffic priority",
            ],
            hasTrial: true,
            isRecommended: true,
            ribbon: "7-day free trial",
        },
        {
            name: ELITE_PLAN,
            subtitle: "For higher-volume storefronts",
            price: "14.99",
            visitorLimit: PLAN_LIMITS[ELITE_PLAN],
            features: [
                "Everything in Plus",
                "Highest monthly limit",
                "VIP support",
                "Highest traffic priority",
            ],
            hasTrial: true,
            ribbon: "Best for high traffic",
            ribbonTone: "blue" as const,
        },
        {
            name: UNLIMITED_PLAN,
            subtitle: "For stores that want predictable billing",
            price: "79.99",
            visitorLimit: PLAN_LIMITS[UNLIMITED_PLAN],
            visitorLimitLabel: "Unlimited visitors included",
            features: [
                "Everything in Elite",
                "Unlimited monthly visitors",
                "No overage charges",
                "Priority VIP support",
            ],
            hasTrial: true,
            noOverage: true,
            ribbon: "Unlimited usage",
            ribbonTone: "blue" as const,
        },
        {
            name: CUSTOM_PLAN,
            displayName: customPlan?.name || "Custom plan",
            subtitle: "Private plan configured for your store",
            price: (customPlan?.price ?? 79.99).toFixed(2),
            visitorLimit: customLimit,
            visitorLimitLabel: customLimit >= Number.MAX_SAFE_INTEGER
                ? "Unlimited visitors included"
                : `${customLimit.toLocaleString()} visitors included`,
            features: [
                "Private pricing for your store",
                customLimit >= Number.MAX_SAFE_INTEGER ? "Unlimited monthly visitors" : "Custom monthly visitor limit",
                customNoOverage ? "No overage charges" : "Overage billing after limit",
                "Priority support",
            ],
            hasTrial: (customPlan?.trialDays ?? 7) > 0,
            trialDays: customPlan?.trialDays ?? 7,
            noOverage: customNoOverage,
            ribbon: "Private plan",
            ribbonTone: "blue" as const,
        },
    ];
    const visiblePlans = plans.filter((plan) => {
        if (plan.name === UNLIMITED_PLAN) return currentPlan === UNLIMITED_PLAN && canUseUnlimitedPlan;
        if (plan.name === CUSTOM_PLAN) return canUseCustomPlan;
        return true;
    });

    return (
        <Page
            fullWidth
            title="Pricing plans"
            subtitle="Choose the monthly visitor limit and controls that match your store traffic."
            backAction={{ url: "/app" }}
        >
            <TitleBar title="Pricing" />
            <style>
                {`
                    .pricing-cards-grid {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 12px;
                        align-items: stretch;
                    }
                    .pricing-cards-grid-5 {
                        grid-template-columns: repeat(5, minmax(0, 1fr));
                    }
                    .pricing-custom-plan-card {
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 8px;
                        background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
                    }
                    .pricing-plan-shell {
                        min-height: 100%;
                        display: flex;
                    }
                    .pricing-plan-shell > *,
                    .pricing-plan-shell .Polaris-ShadowBevel,
                    .pricing-plan-shell .Polaris-Box {
                        flex: 1;
                        height: 100%;
                    }
                    .pricing-plan-card {
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        border: 1px solid transparent;
                        border-radius: 8px;
                        overflow: hidden;
                        background: var(--p-color-bg-surface, #ffffff);
                    }
                    .pricing-plan-current {
                        border-color: var(--p-color-border-success, #008060);
                        box-shadow: inset 0 0 0 1px var(--p-color-border-success, #008060);
                    }
                    .pricing-plan-ribbon {
                        padding: 8px 12px;
                        text-align: center;
                        font-size: 12px;
                        line-height: 16px;
                        font-weight: 700;
                    }
                    .pricing-plan-ribbon-green {
                        color: #063b22;
                        background: #35e489;
                    }
                    .pricing-plan-ribbon-blue {
                        color: #ffffff;
                        background: #2563eb;
                    }
                    .pricing-plan-body {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                        padding: 18px 14px 16px;
                        min-height: 0;
                    }
                    .pricing-feature-list {
                        margin: 0;
                        padding: 0;
                        list-style: none;
                        color: var(--p-color-text-secondary, #6d7175);
                        font-size: 13px;
                        line-height: 1.45;
                    }
                    .pricing-feature-list li {
                        position: relative;
                        padding-left: 16px;
                    }
                    .pricing-feature-list li + li {
                        margin-top: 8px;
                    }
                    .pricing-feature-list li::before {
                        content: "";
                        position: absolute;
                        left: 0;
                        top: 0.58em;
                        width: 6px;
                        height: 6px;
                        border-radius: 999px;
                        background: var(--p-color-bg-fill-success, #008060);
                    }
                    .pricing-plan-action {
                        margin-top: auto;
                    }
                    .pricing-plan-card .Polaris-Badge {
                        white-space: nowrap;
                    }
                    .pricing-note-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 16px;
                    }
                    .pricing-note-item {
                        padding: 12px;
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 8px;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    @media (max-width: 80em) {
                        .pricing-cards-grid {
                            grid-template-columns: repeat(3, minmax(0, 1fr));
                        }
                    }
                    @media (max-width: 64em) {
                        .pricing-cards-grid {
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                        }
                    }
                    @media (max-width: 47.9975em) {
                        .pricing-cards-grid {
                            grid-template-columns: 1fr;
                        }
                        .pricing-note-grid {
                            grid-template-columns: 1fr;
                        }
                    }
                `}
            </style>
            <BlockStack gap="500">
                {!canUseCustomPlan && (
                    <Card>
                        <div className="pricing-custom-plan-card">
                            <Box padding="400">
                                <InlineStack align="space-between" blockAlign="center" gap="400">
                                    <BlockStack gap="150">
                                        <InlineStack gap="200" blockAlign="center">
                                            <Text as="h2" variant="headingMd">Need a custom plan?</Text>
                                            <Badge tone="info">Custom plan</Badge>
                                        </InlineStack>
                                        <Text as="p" tone="subdued">
                                            High-volume stores can request private pricing, custom visitor limits and predictable monthly billing.
                                        </Text>
                                    </BlockStack>
                                    <InlineStack gap="200" blockAlign="center">
                                        <Button url="/app/support">Contact support</Button>
                                        <Button variant="primary" onClick={openLiveChat}>Open live chat</Button>
                                    </InlineStack>
                                </InlineStack>
                            </Box>
                        </div>
                    </Card>
                )}

                <div className={`pricing-cards-grid ${visiblePlans.length === 5 ? "pricing-cards-grid-5" : ""}`}>
                    {visiblePlans.map((plan) => (
                        <PlanCard
                            key={plan.name}
                            name={plan.name}
                            displayName={plan.displayName}
                            subtitle={plan.subtitle}
                            price={plan.price}
                            visitorLimit={plan.visitorLimit}
                            visitorLimitLabel={plan.visitorLimitLabel}
                            features={plan.features}
                            isCurrentPlan={currentPlan === plan.name}
                            isFree={plan.isFree}
                            isRecommended={plan.isRecommended}
                            hasTrial={plan.hasTrial}
                            trialDays={plan.trialDays}
                            noOverage={plan.noOverage}
                            ribbon={plan.ribbon}
                            ribbonTone={plan.ribbonTone}
                            onSelect={() => handleSelectPlan(plan.name)}
                        />
                    ))}
                </div>

                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">Billing notes</Text>
                        <div className="pricing-note-grid">
                            <div className="pricing-note-item">
                                <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">7-day trial</Text>
                                    <Text as="p" tone="subdued">Paid plans include a free trial before billing starts.</Text>
                                </BlockStack>
                            </div>
                            <div className="pricing-note-item">
                                <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Cancel anytime</Text>
                                    <Text as="p" tone="subdued">Upgrade or downgrade from this page when traffic changes.</Text>
                                </BlockStack>
                            </div>
                            <div className="pricing-note-item">
                                <BlockStack gap="100">
                                    <Text as="p" fontWeight="semibold">Overage</Text>
                                    <Text as="p" tone="subdued">
                                        {canUseCustomPlan && customNoOverage
                                            ? "Standard paid plans can charge extra visitors when limits are exceeded. Your custom plan has no overage charges."
                                            : "Paid plans can charge extra visitors through Shopify billing when limits are exceeded."}
                                    </Text>
                                </BlockStack>
                            </div>
                        </div>
                        <Divider />
                        <Text as="p" variant="bodySm" tone="subdued">
                            Payments are handled securely by Shopify. Overage billing is calculated at ${OVERAGE_RATE.toFixed(3)} per visitor.
                        </Text>
                    </BlockStack>
                </Card>

                <Box paddingBlockEnd="800" />
            </BlockStack>
        </Page>
    );
}
