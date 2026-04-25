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
} from "@shopify/polaris";
import {
    ChevronRightIcon,
    EmailIcon,
    ExternalIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopName = session.shop.replace(".myshopify.com", "");
    return json({ shopName });
};

type StepTone = "start" | "required" | "optional" | "verify";

interface Step {
    number: number;
    title: string;
    description: string;
    tone: StepTone;
    action?: {
        label: string;
        url: string;
        internal?: boolean;
        external?: boolean;
    };
    checklist: string[];
}

function getStepBadge(tone: StepTone) {
    if (tone === "start") return <Badge tone="info">Start here</Badge>;
    if (tone === "optional") return <Badge>Optional</Badge>;
    if (tone === "verify") return <Badge tone="success">Verify</Badge>;
    return <Badge tone="attention">Required</Badge>;
}

export default function SetupGuide() {
    const { shopName } = useLoaderData<typeof loader>();

    const themeEditorUrl = `https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`;

    const steps: Step[] = [
        {
            number: 1,
            title: "Enable the app embed",
            description: "Turn on the storefront script in your current theme so rules can run for visitors.",
            tone: "start",
            action: {
                label: "Open Theme Editor",
                url: themeEditorUrl,
                external: true,
            },
            checklist: [
                "Open App embeds in the left panel.",
                "Enable Geo: Redirect & Country Block.",
                "Click Save in the top-right corner.",
            ],
        },
        {
            number: 2,
            title: "Create a geolocation rule",
            description: "Redirect, block, or show a popup based on the visitor country.",
            tone: "required",
            action: {
                label: "Geolocation Rules",
                url: "/app/rules",
                internal: true,
            },
            checklist: [
                "Select one or more countries.",
                "Choose Redirect, Block, or Popup.",
                "Keep the rule active when ready.",
            ],
        },
        {
            number: 3,
            title: "Review app settings",
            description: "Set popup text, redirect behavior, cookies, and bot/VPN handling.",
            tone: "required",
            action: {
                label: "Settings",
                url: "/app/settings",
                internal: true,
            },
            checklist: [
                "Choose popup or auto-redirect behavior.",
                "Customize visitor-facing messages.",
                "Set how long visitor choices are remembered.",
            ],
        },
        {
            number: 4,
            title: "Add IP rules when needed",
            description: "Block or redirect specific IPs and CIDR ranges before country rules are checked.",
            tone: "optional",
            action: {
                label: "IP Rules",
                url: "/app/ip-rules",
                internal: true,
            },
            checklist: [
                "Use one IP or CIDR range per comma-separated entry.",
                "Use IP rules for known bots, abuse traffic, or internal testing.",
            ],
        },
        {
            number: 5,
            title: "Test and confirm",
            description: "Use a fresh browser session and visitor logs to confirm rules are firing.",
            tone: "verify",
            action: {
                label: "Visitor Logs",
                url: "/app/logs",
                internal: true,
            },
            checklist: [
                "Clear cookies or use an incognito window.",
                "Test from a matching country or IP.",
                "Check logs for visits, redirects, and blocks.",
            ],
        },
    ];

    return (
        <Page
            title="Setup Guide"
            subtitle="A compact checklist for getting Geo: Redirect & Country Block live on your storefront."
        >
            <TitleBar title="Setup Guide" />
            <style>
                {`
                    .setup-summary-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 12px;
                    }
                    .setup-summary-item {
                        padding: 12px;
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 8px;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .setup-step-row {
                        display: grid;
                        grid-template-columns: 36px minmax(0, 1fr) auto;
                        gap: 16px;
                        padding: 18px 20px;
                    }
                    .setup-step-row-start {
                        background: var(--p-color-bg-surface-info, #eef4ff);
                    }
                    .setup-step-number {
                        width: 32px;
                        height: 32px;
                        border-radius: 999px;
                        background: var(--p-color-bg-fill-brand, #005bd3);
                        color: #fff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 13px;
                    }
                    .setup-step-number-muted {
                        background: var(--p-color-bg-fill-secondary, #e4e5e7);
                        color: var(--p-color-text-secondary, #6d7175);
                    }
                    .setup-step-checklist {
                        margin: 0;
                        padding-left: 18px;
                        color: var(--p-color-text-secondary, #6d7175);
                        font-size: 13px;
                        line-height: 1.45;
                    }
                    .setup-step-checklist li + li {
                        margin-top: 4px;
                    }
                    .setup-side-link {
                        width: 100%;
                    }
                    @media (max-width: 47.9975em) {
                        .setup-summary-grid {
                            grid-template-columns: 1fr;
                        }
                        .setup-step-row {
                            grid-template-columns: 32px minmax(0, 1fr);
                        }
                        .setup-step-action {
                            grid-column: 2;
                        }
                    }
                `}
            </style>
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="400">
                                <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <BlockStack gap="100">
                                        <Text as="h2" variant="headingMd">Launch checklist</Text>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Complete the embed first, then add rules and verify traffic.
                                        </Text>
                                    </BlockStack>
                                    <Button
                                        url={themeEditorUrl}
                                        target="_blank"
                                        icon={ExternalIcon}
                                        variant="primary"
                                    >
                                        Open Theme Editor
                                    </Button>
                                </InlineStack>

                                <div className="setup-summary-grid">
                                    <div className="setup-summary-item">
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">Step 1</Text>
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Enable embed</Text>
                                        </BlockStack>
                                    </div>
                                    <div className="setup-summary-item">
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">Step 2-4</Text>
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Create rules</Text>
                                        </BlockStack>
                                    </div>
                                    <div className="setup-summary-item">
                                        <BlockStack gap="100">
                                            <Text as="p" variant="bodySm" tone="subdued">Step 5</Text>
                                            <Text as="p" variant="bodyMd" fontWeight="semibold">Verify logs</Text>
                                        </BlockStack>
                                    </div>
                                </div>
                            </BlockStack>
                        </Card>

                        <Card padding="0">
                            <BlockStack gap="0">
                                {steps.map((step, index) => (
                                    <div key={step.number}>
                                        <div className={`setup-step-row ${step.tone === "start" ? "setup-step-row-start" : ""}`}>
                                            <div
                                                className={`setup-step-number ${step.tone === "optional" ? "setup-step-number-muted" : ""}`}
                                                aria-hidden="true"
                                            >
                                                {step.number}
                                            </div>
                                            <BlockStack gap="200">
                                                <InlineStack gap="200" blockAlign="center">
                                                    <Text as="h3" variant="headingSm">{step.title}</Text>
                                                    {getStepBadge(step.tone)}
                                                </InlineStack>
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    {step.description}
                                                </Text>
                                                <ul className="setup-step-checklist">
                                                    {step.checklist.map((item) => (
                                                        <li key={item}>{item}</li>
                                                    ))}
                                                </ul>
                                            </BlockStack>
                                            {step.action && (
                                                <div className="setup-step-action">
                                                    <Button
                                                        url={step.action.url}
                                                        target={step.action.external ? "_blank" : undefined}
                                                        icon={ChevronRightIcon}
                                                        variant={step.tone === "start" ? "primary" : "secondary"}
                                                    >
                                                        {step.action.label}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {index < steps.length - 1 && <Divider />}
                                    </div>
                                ))}
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Need help?</Text>
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Send us your store URL and the rule you are testing. We typically respond within 24 hours.
                                </Text>
                                <Button
                                    url="mailto:support@bluepeaks.top"
                                    target="_blank"
                                    icon={EmailIcon}
                                    variant="primary"
                                >
                                    Email Support
                                </Button>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Quick links</Text>
                                <BlockStack gap="200">
                                    <div className="setup-side-link">
                                        <Button url="/app/rules" variant="plain" icon={ChevronRightIcon}>Geolocation Rules</Button>
                                    </div>
                                    <div className="setup-side-link">
                                        <Button url="/app/ip-rules" variant="plain" icon={ChevronRightIcon}>IP Rules</Button>
                                    </div>
                                    <div className="setup-side-link">
                                        <Button url="/app/settings" variant="plain" icon={ChevronRightIcon}>Settings</Button>
                                    </div>
                                    <div className="setup-side-link">
                                        <Button url="/app/logs" variant="plain" icon={ChevronRightIcon}>Visitor Logs</Button>
                                    </div>
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
