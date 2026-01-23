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
} from "@shopify/polaris";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
    FREE_PLAN,
    PREMIUM_PLAN,
    PLUS_PLAN,
    ALL_PAID_PLANS,
    PLAN_LIMITS,
} from "../billing.config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { billing } = await authenticate.admin(request);
    const isTest = process.env.NODE_ENV !== "production";

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
    const { billing } = await authenticate.admin(request);
    const isTest = process.env.NODE_ENV !== "production";
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
                await billing.cancel({
                    subscriptionId: subscription.id,
                    isTest,
                    prorate: true,
                });
            }
            return null;
        }

        // Handling Paid Plans
        if (ALL_PAID_PLANS.includes(selectedPlan)) {
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
    hasTrial?: boolean;
    onSelect: () => void;
}

function PlanCard({ name, price, visitorLimit, features, isCurrentPlan, isFree, hasTrial, onSelect }: PlanCardProps) {
    return (
        <Card background={isCurrentPlan ? "bg-surface-success" : "bg-surface"}>
            <BlockStack gap="400">
                <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">{name}</Text>
                    <Text as="h2" variant="headingLg">
                        {isFree ? "Free" : `$${price}`}
                        {!isFree && <Text as="span" variant="bodySm" tone="subdued"> / month</Text>}
                    </Text>
                </BlockStack>
                <Divider />
                <BlockStack gap="200">
                    <Text as="p" fontWeight="bold">Features:</Text>
                    <BlockStack gap="100">
                        {features.map((feature, index) => (
                            <InlineStack key={index} gap="200" align="start">
                                <Text as="span" tone="success">✓</Text>
                                <Text as="span" variant="bodyMd">{feature}</Text>
                            </InlineStack>
                        ))}
                    </BlockStack>

                    {hasTrial && !isFree && (
                        <Box paddingBlockStart="200">
                            <Text as="p" variant="bodySm" tone="subdued">
                                7-day free trial
                            </Text>
                        </Box>
                    )}
                </BlockStack>
                {isCurrentPlan ? (
                    <Button disabled fullWidth>Current Plan</Button>
                ) : (
                    <Button variant={isFree ? "secondary" : "primary"} onClick={onSelect} fullWidth>
                        {isFree ? "Downgrade" : "Subscribe"}
                    </Button>
                )}
            </BlockStack>
        </Card>
    );
}

export default function PricingPage() {
    const { hasActivePayment, currentPlan } = useLoaderData<typeof loader>();
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
                `${PLAN_LIMITS[FREE_PLAN]} Visitors / month`,
                "Unlimited Redirect Rules",
                "Schedule Redirects",
                "Analytics Dashboard",
            ],
            isFree: true,
        },
        {
            name: PREMIUM_PLAN,
            price: "4.99",
            visitorLimit: PLAN_LIMITS[PREMIUM_PLAN],
            features: [
                `${PLAN_LIMITS[PREMIUM_PLAN]} Visitors / month`,
                "Includes all Free features",
                "Country Blocking",
                "IP Blocking & Redirects",
            ],
            hasTrial: true,
        },
        {
            name: PLUS_PLAN,
            price: "7.99",
            visitorLimit: PLAN_LIMITS[PLUS_PLAN],
            features: [
                `${PLAN_LIMITS[PLUS_PLAN]} Visitors / month`,
                "Includes all Premium features",
                "Dedicated Support",
                "High Traffic Priority",
            ],
            hasTrial: true,
        },
    ];

    return (
        <Page title="Pricing" backAction={{ url: "/app" }}>
            <BlockStack gap="500">
                <Box paddingBlockStart="200">
                    <Grid>
                        {plans.map((plan) => (
                            <Grid.Cell key={plan.name} columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                                <PlanCard
                                    name={plan.name}
                                    price={plan.price}
                                    visitorLimit={plan.visitorLimit}
                                    features={plan.features}
                                    isCurrentPlan={currentPlan === plan.name}
                                    isFree={plan.isFree}
                                    hasTrial={plan.hasTrial}
                                    onSelect={() => handleSelectPlan(plan.name)}
                                />
                            </Grid.Cell>
                        ))}
                    </Grid>
                </Box>

                <Box paddingBlockStart="800" paddingBlockEnd="400">
                    <BlockStack gap="600">
                        <Divider />
                        <InlineStack align="center" gap="800">
                            <Text as="span" variant="bodyMd" tone="subdued">✓ 7-day free trial</Text>
                            <Text as="span" variant="bodyMd" tone="subdued">✓ Cancel anytime</Text>
                            <Text as="span" variant="bodyMd" tone="subdued">✓ Secure payments via Shopify</Text>
                        </InlineStack>

                        <Box paddingBlockStart="400">
                            <BlockStack gap="400">
                                <Text as="h3" variant="headingMd" alignment="center">Frequently Asked Questions</Text>
                                <Grid>
                                    <Grid.Cell columnSpan={{ xs: 6, md: 3 }}>
                                        <Box padding="400">
                                            <BlockStack gap="200">
                                                <Text as="p" fontWeight="bold">How does the 7-day trial work?</Text>
                                                <Text as="p" tone="subdued">You can try all Pro features for 7 days. You won't be charged until the trial ends.</Text>
                                            </BlockStack>
                                        </Box>
                                    </Grid.Cell>
                                    <Grid.Cell columnSpan={{ xs: 6, md: 3 }}>
                                        <Box padding="400">
                                            <BlockStack gap="200">
                                                <Text as="p" fontWeight="bold">Can I change plans later?</Text>
                                                <Text as="p" tone="subdued">Yes, you can upgrade or downgrade your plan at any time from this page.</Text>
                                            </BlockStack>
                                        </Box>
                                    </Grid.Cell>
                                </Grid>
                            </BlockStack>
                        </Box>
                    </BlockStack>
                </Box>


            </BlockStack>
        </Page>
    );
}
