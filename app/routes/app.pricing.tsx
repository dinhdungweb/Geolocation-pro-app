import {
    Page,
    Box,
    Button,
    Card,
    Text,
    Grid,
    BlockStack,
    Divider,
    InlineStack,
    Badge,
} from "@shopify/polaris";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
    FREE_PLAN,
    PREMIUM_PLAN,
    PLUS_PLAN,
    ELITE_PLAN,
    ALL_PAID_PLANS,
    PLAN_LIMITS,
    OVERAGE_RATE,
} from "../billing.config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { billing } = await authenticate.admin(request);
    const isTest = false;

    // Restore billing check
    const billingCheck = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest,
    });

    const currentPlan = billingCheck.appSubscriptions[0]?.name || FREE_PLAN;

    return json({
        hasActivePayment: billingCheck.hasActivePayment,
        currentPlan,
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { billing, session } = await authenticate.admin(request);
    const shop = session.shop;
    const isTest = false;
    const formData = await request.formData();
    const selectedPlan = formData.get("plan") as string;
    const currentPlan = formData.get("currentPlan") as string;

    if (selectedPlan) {
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
                const planLimit = PLAN_LIMITS[activePlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];
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
        if (ALL_PAID_PLANS.includes(selectedPlan)) {
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
    price: string;
    visitorLimit: number;
    features: string[];
    isCurrentPlan: boolean;
    isFree?: boolean;
    isRecommended?: boolean;
    hasTrial?: boolean;
    onSelect: () => void;
}

function formatPlanName(name: string) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function PlanCard({
    name,
    price,
    visitorLimit,
    features,
    isCurrentPlan,
    isFree,
    isRecommended,
    hasTrial,
    onSelect,
}: PlanCardProps) {
    return (
        <Card padding="0">
            <div className={`pricing-plan-card ${isCurrentPlan ? "pricing-plan-current" : ""}`}>
                <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start" gap="200">
                        <BlockStack gap="100">
                            <Text as="h2" variant="headingMd">{formatPlanName(name)}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                                {visitorLimit.toLocaleString()} visitors / month
                            </Text>
                        </BlockStack>
                        {isCurrentPlan ? (
                            <Badge tone="success">Current</Badge>
                        ) : isRecommended ? (
                            <Badge tone="info">Popular</Badge>
                        ) : hasTrial ? (
                            <Badge>Trial</Badge>
                        ) : null}
                    </InlineStack>

                    <BlockStack gap="100">
                        <InlineStack gap="100" blockAlign="end">
                            <Text as="p" variant="headingXl">
                                {isFree ? "Free" : `$${price}`}
                            </Text>
                            {!isFree && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                    / month
                                </Text>
                            )}
                        </InlineStack>
                        {hasTrial && !isFree && (
                            <Text as="p" variant="bodySm" tone="subdued">
                                7-day free trial included
                            </Text>
                        )}
                    </BlockStack>
                </BlockStack>

                <ul className="pricing-feature-list">
                    {features.map((feature) => (
                        <li key={feature}>{feature}</li>
                    ))}
                </ul>

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
        </Card>
    );
}

export default function PricingPage() {
    const { currentPlan } = useLoaderData<typeof loader>();
    const submit = useSubmit();

    const handleSelectPlan = (plan: string) => {
        // Pass both selected plan and current plan if needed
        submit({ plan, currentPlan }, { method: "POST" });
    };

    const plans = [
        {
            name: FREE_PLAN,
            price: "0",
            visitorLimit: PLAN_LIMITS[FREE_PLAN],
            features: [
                "Country redirects",
                "Unlimited redirect rules",
                "Schedule redirects",
                "Analytics dashboard",
            ],
            isFree: true,
        },
        {
            name: PREMIUM_PLAN,
            price: "4.99",
            visitorLimit: PLAN_LIMITS[PREMIUM_PLAN],
            features: [
                "Everything in Free",
                "Country blocking",
                "IP blocking and redirects",
                "Page-specific targeting",
            ],
            hasTrial: true,
        },
        {
            name: PLUS_PLAN,
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
        },
        {
            name: ELITE_PLAN,
            price: "14.99",
            visitorLimit: PLAN_LIMITS[ELITE_PLAN],
            features: [
                "Everything in Plus",
                "Highest monthly limit",
                "VIP support",
                "Highest traffic priority",
            ],
            hasTrial: true,
        },
    ];

    const currentLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

    return (
        <Page
            title="Pricing"
            subtitle="Choose the monthly visitor limit that matches your store traffic."
            backAction={{ url: "/app" }}
        >
            <TitleBar title="Pricing" />
            <style>
                {`
                    .pricing-plan-card {
                        min-height: 100%;
                        display: flex;
                        flex-direction: column;
                        gap: 20px;
                        padding: 20px;
                        border: 1px solid transparent;
                        border-radius: 8px;
                    }
                    .pricing-plan-current {
                        border-color: var(--p-color-border-success, #008060);
                        background: var(--p-color-bg-surface-success, #f1f8f5);
                    }
                    .pricing-feature-list {
                        flex: 1;
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
                    @media (max-width: 47.9975em) {
                        .pricing-note-grid {
                            grid-template-columns: 1fr;
                        }
                    }
                `}
            </style>
            <BlockStack gap="500">
                <Card>
                    <InlineStack align="space-between" blockAlign="center" gap="400">
                        <BlockStack gap="100">
                            <Text as="h2" variant="headingMd">Current plan: {formatPlanName(currentPlan)}</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                                Your current monthly limit is {currentLimit.toLocaleString()} visitors.
                            </Text>
                        </BlockStack>
                        <Badge tone={currentPlan === FREE_PLAN ? "attention" : "success"}>
                            {currentPlan === FREE_PLAN ? "Free plan" : "Paid plan"}
                        </Badge>
                    </InlineStack>
                </Card>

                <Grid>
                    {plans.map((plan) => (
                        <Grid.Cell key={plan.name} columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}>
                            <PlanCard
                                name={plan.name}
                                price={plan.price}
                                visitorLimit={plan.visitorLimit}
                                features={plan.features}
                                isCurrentPlan={currentPlan === plan.name}
                                isFree={plan.isFree}
                                isRecommended={plan.isRecommended}
                                hasTrial={plan.hasTrial}
                                onSelect={() => handleSelectPlan(plan.name)}
                            />
                        </Grid.Cell>
                    ))}
                </Grid>

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
                                    <Text as="p" tone="subdued">Paid plans charge extra visitors through Shopify billing when limits are exceeded.</Text>
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
