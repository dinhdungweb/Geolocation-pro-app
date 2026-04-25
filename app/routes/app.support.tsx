import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineStack,
    Button,
    Divider,
    Box,
    Badge,
} from "@shopify/polaris";
import {
    ChevronRightIcon,
    EmailIcon,
    ExternalIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

const supportEmail = "support@bluepeaks.top";
const appStoreUrl = "https://apps.shopify.com/geo-redirect-country-block";
const reviewUrl = "https://apps.shopify.com/geo-redirect-country-block?#modal-show=WriteReviewModal";

const faqItems = [
    {
        question: "Is coding knowledge required?",
        answer: "No. Setup is handled through app embeds, rules, and settings inside Shopify admin.",
    },
    {
        question: "Does it slow down my store?",
        answer: "The storefront check is lightweight and cached so it has minimal impact on loading speed.",
    },
    {
        question: "Why is my redirect not working?",
        answer: "Confirm the app embed is enabled, the rule is active, and test with cleared cookies or an incognito window.",
    },
    {
        question: "Why does testing from my browser behave differently?",
        answer: "The app remembers visitor choices with cookies to avoid repeated prompts and redirect loops.",
    },
    {
        question: "What happens when I exceed my visitor limit?",
        answer: "Paid plans can charge overage through Shopify billing. Free plan traffic may pause until the next billing cycle.",
    },
];

export default function Support() {
    return (
        <Page
            title="Support"
            subtitle="Find setup help, troubleshooting notes, and direct contact options."
        >
            <TitleBar title="Support" />
            <style>
                {`
                    .support-action-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 12px;
                    }
                    .support-action-card {
                        padding: 12px;
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 8px;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .support-faq-row {
                        padding: 16px 20px;
                    }
                    .support-resource-link {
                        width: 100%;
                    }
                    .support-check-list {
                        margin: 0;
                        padding-left: 18px;
                        color: var(--p-color-text-secondary, #6d7175);
                        font-size: 13px;
                        line-height: 1.45;
                    }
                    .support-check-list li + li {
                        margin-top: 6px;
                    }
                    @media (max-width: 47.9975em) {
                        .support-action-grid {
                            grid-template-columns: 1fr;
                        }
                    }
                `}
            </style>
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="400">
                                <InlineStack align="space-between" blockAlign="center" gap="400">
                                    <BlockStack gap="100">
                                        <InlineStack gap="200" blockAlign="center">
                                            <Text as="h2" variant="headingMd">Contact support</Text>
                                            <Badge tone="success">Within 24 hours</Badge>
                                        </InlineStack>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Send us your shop URL, the rule name, and what result you expected. That gives us enough context to investigate quickly.
                                        </Text>
                                    </BlockStack>
                                    <Button
                                        url={`mailto:${supportEmail}`}
                                        target="_blank"
                                        icon={EmailIcon}
                                        variant="primary"
                                    >
                                        Email Support
                                    </Button>
                                </InlineStack>

                                <div className="support-action-grid">
                                    <div className="support-action-card">
                                        <BlockStack gap="100">
                                            <Text as="p" fontWeight="semibold">1. Include the rule</Text>
                                            <Text as="p" variant="bodySm" tone="subdued">Rule name, action, country/IP, and target URL.</Text>
                                        </BlockStack>
                                    </div>
                                    <div className="support-action-card">
                                        <BlockStack gap="100">
                                            <Text as="p" fontWeight="semibold">2. Include the test</Text>
                                            <Text as="p" variant="bodySm" tone="subdued">Country, IP, browser, and whether cookies were cleared.</Text>
                                        </BlockStack>
                                    </div>
                                    <div className="support-action-card">
                                        <BlockStack gap="100">
                                            <Text as="p" fontWeight="semibold">3. Include logs</Text>
                                            <Text as="p" variant="bodySm" tone="subdued">A screenshot or timestamp from Visitor Logs helps confirm behavior.</Text>
                                        </BlockStack>
                                    </div>
                                </div>
                            </BlockStack>
                        </Card>

                        <Card padding="0">
                            <BlockStack gap="0">
                                <div className="support-faq-row">
                                    <BlockStack gap="100">
                                        <Text as="h2" variant="headingMd">Frequently asked questions</Text>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Common setup and testing issues.
                                        </Text>
                                    </BlockStack>
                                </div>
                                <Divider />
                                {faqItems.map((item, index) => (
                                    <div key={item.question}>
                                        <div className="support-faq-row">
                                            <BlockStack gap="150">
                                                <Text as="h3" variant="headingSm">{item.question}</Text>
                                                <Text as="p" variant="bodyMd" tone="subdued">{item.answer}</Text>
                                            </BlockStack>
                                        </div>
                                        {index < faqItems.length - 1 && <Divider />}
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
                                <Text as="h2" variant="headingMd">Resources</Text>
                                <BlockStack gap="200">
                                    <div className="support-resource-link">
                                        <Button
                                            url="/app/setup"
                                            icon={ChevronRightIcon}
                                            variant="plain"
                                        >
                                            Setup Guide
                                        </Button>
                                    </div>
                                    <div className="support-resource-link">
                                        <Button
                                            url="/app/logs"
                                            icon={ChevronRightIcon}
                                            variant="plain"
                                        >
                                            Visitor Logs
                                        </Button>
                                    </div>
                                    <div className="support-resource-link">
                                        <Button
                                            url={appStoreUrl}
                                            target="_blank"
                                            icon={ExternalIcon}
                                            variant="plain"
                                        >
                                            App Store Page
                                        </Button>
                                    </div>
                                    <div className="support-resource-link">
                                        <Button
                                            url={reviewUrl}
                                            target="_blank"
                                            icon={ExternalIcon}
                                            variant="plain"
                                        >
                                            Leave a Review
                                        </Button>
                                    </div>
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Before testing</Text>
                                <ul className="support-check-list">
                                    <li>Confirm the app embed is enabled in the current theme.</li>
                                    <li>Make sure the rule is active and has the right priority.</li>
                                    <li>Clear cookies or use incognito mode for a fresh session.</li>
                                    <li>Check Visitor Logs after testing.</li>
                                </ul>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="300">
                                <Text as="h2" variant="headingMd">Response times</Text>
                                <BlockStack gap="200">
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Email support</Text>
                                        <Text as="span" variant="bodyMd" tone="subdued">Within 24 hours</Text>
                                    </InlineStack>
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Business days</Text>
                                        <Text as="span" variant="bodyMd" tone="subdued">Mon-Fri</Text>
                                    </InlineStack>
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
