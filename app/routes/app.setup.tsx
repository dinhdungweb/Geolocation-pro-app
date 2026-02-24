import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineStack,
    Badge,
    Button,
    Divider,
    Box,
    List,
    Icon,
} from "@shopify/polaris";
import {
    CheckCircleIcon,
    ChevronRightIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopName = session.shop.replace(".myshopify.com", "");
    return json({ shopName });
};

type StepStatus = "done" | "active" | "pending";

interface Step {
    number: number;
    title: string;
    description: string;
    status: StepStatus;
    action?: {
        label: string;
        url: string;
        internal?: boolean;
    };
    tips: string[];
}

export default function SetupGuide() {
    const { shopName } = useLoaderData<typeof loader>();

    const themeEditorUrl = `https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`;

    const steps: Step[] = [
        {
            number: 1,
            title: "Enable App Embed in Theme Editor",
            description:
                "The app works via a Theme App Embed. You must enable it in your Shopify Theme Editor for the geolocation script to run on your store.",
            status: "active",
            action: {
                label: "Open Theme Editor",
                url: themeEditorUrl,
            },
            tips: [
                "Click \"App embeds\" in the left panel of the Theme Editor.",
                "Find \"Geo: Redirect & Country Block\" and toggle it ON.",
                "Click Save in the top right corner.",
            ],
        },
        {
            number: 2,
            title: "Create Your First Geolocation Rule",
            description:
                "Set up rules to redirect or block visitors based on their country. For example, redirect US visitors to your .com store, or block a specific country.",
            status: "pending",
            action: {
                label: "Go to Geolocation Rules",
                url: "/app/rules",
                internal: true,
            },
            tips: [
                "Click \"Create Rule\" and select a country.",
                "Choose the action: Redirect, Block, or show a Popup.",
                "Set the target URL for redirects.",
                "Toggle the rule ON to activate it.",
            ],
        },
        {
            number: 3,
            title: "Configure App Settings",
            description:
                "Adjust the app behavior: set the redirect mode (popup or auto-redirect), configure popup appearance, and set cookie duration.",
            status: "pending",
            action: {
                label: "Go to Settings",
                url: "/app/settings",
                internal: true,
            },
            tips: [
                "Popup Mode: Asks visitors before redirecting.",
                "Auto-Redirect: Redirects visitors instantly without a popup.",
                "Cookie Duration: How long the app remembers a visitor's choice.",
                "You can customize the popup message and button text.",
            ],
        },
        {
            number: 4,
            title: "(Optional) Add IP-Based Rules",
            description:
                "In addition to country rules, you can block or redirect specific IP addresses. Useful for blocking known bots or competitors.",
            status: "pending",
            action: {
                label: "Go to IP Rules",
                url: "/app/ip-rules",
                internal: true,
            },
            tips: [
                "Add individual IPs or CIDR ranges (e.g. 192.168.1.0/24).",
                "IP rules take priority over country rules.",
            ],
        },
        {
            number: 5,
            title: "Verify the Setup",
            description:
                "Test your configuration by visiting your store from a different location, or use a VPN to simulate a visit from your target country.",
            status: "pending",
            tips: [
                "Clear your browser cookies before testing (the app remembers your choice).",
                "Use Incognito/Private mode for a clean test.",
                "Check Visitor Logs to confirm the app is tracking correctly.",
            ],
            action: {
                label: "View Visitor Logs",
                url: "/app/logs",
                internal: true,
            },
        },
    ];

    const getStatusBadge = (status: StepStatus) => {
        if (status === "done") return <Badge tone="success">Done</Badge>;
        if (status === "active") return <Badge tone="info">Start here</Badge>;
        return <Badge tone="attention">Pending</Badge>;
    };

    return (
        <Page
            title="Setup Guide"
            subtitle="Follow these steps to get Geo: Redirect & Country Block working on your store."
        >
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        {steps.map((step) => (
                            <Card key={step.number}>
                                <BlockStack gap="400">
                                    {/* Step header */}
                                    <InlineStack align="space-between" blockAlign="start">
                                        <InlineStack gap="300" blockAlign="center">
                                            <div
                                                style={{
                                                    width: "32px",
                                                    height: "32px",
                                                    borderRadius: "50%",
                                                    background:
                                                        step.status === "done"
                                                            ? "#008060"
                                                            : step.status === "active"
                                                                ? "#005bd3"
                                                                : "#e4e5e7",
                                                    color:
                                                        step.status === "pending"
                                                            ? "#6d7175"
                                                            : "#fff",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontWeight: "700",
                                                    fontSize: "14px",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {step.status === "done" ? (
                                                    <Icon source={CheckCircleIcon} tone="base" />
                                                ) : (
                                                    step.number
                                                )}
                                            </div>
                                            <Text as="h2" variant="headingMd">
                                                {step.title}
                                            </Text>
                                        </InlineStack>
                                        {getStatusBadge(step.status)}
                                    </InlineStack>

                                    {/* Description */}
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        {step.description}
                                    </Text>

                                    <Divider />

                                    {/* Tips */}
                                    <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" fontWeight="semibold">
                                            How to do it:
                                        </Text>
                                        <List type="bullet">
                                            {step.tips.map((tip, i) => (
                                                <List.Item key={i}>{tip}</List.Item>
                                            ))}
                                        </List>
                                    </BlockStack>

                                    {/* Action button */}
                                    {step.action && (
                                        <div>
                                            <Button
                                                url={step.action.url}
                                                target={step.action.internal ? undefined : "_blank"}
                                                icon={ChevronRightIcon}
                                                variant={
                                                    step.status === "active" ? "primary" : "secondary"
                                                }
                                            >
                                                {step.action.label}
                                            </Button>
                                        </div>
                                    )}
                                </BlockStack>
                            </Card>
                        ))}
                    </BlockStack>
                </Layout.Section>

                {/* Sidebar */}
                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Need help?</Text>
                                <Divider />
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    If you're having trouble setting up the app, our support team is happy to help.
                                </Text>
                                <Button url="mailto:support@bluepeaks.top" target="_blank" variant="primary">
                                    Email Support
                                </Button>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Quick Links</Text>
                                <Divider />
                                <BlockStack gap="200">
                                    <Button url="/app/rules" variant="plain" icon={ChevronRightIcon}>Geolocation Rules</Button>
                                    <Button url="/app/ip-rules" variant="plain" icon={ChevronRightIcon}>IP Rules</Button>
                                    <Button url="/app/settings" variant="plain" icon={ChevronRightIcon}>Settings</Button>
                                    <Button url="/app/logs" variant="plain" icon={ChevronRightIcon}>Visitor Logs</Button>
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Tips</Text>
                                <Divider />
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        ✅ Always clear your browser cookies when testing rules.
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        ✅ Try Incognito mode for a fresh visitor experience.
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        ✅ Use Visitor Logs to confirm the app is detecting countries correctly.
                                    </Text>
                                </BlockStack>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section>
                    <Box paddingBlockEnd="800" />
                </Layout.Section>
            </Layout>
        </Page>
    );
}
