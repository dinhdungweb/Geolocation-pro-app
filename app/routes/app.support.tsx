import {
    Badge,
    BlockStack,
    Button,
    Card,
    Divider,
    Icon,
    InlineStack,
    Page,
    Text,
} from "@shopify/polaris";
import {
    EmailIcon,
    ExternalIcon,
    ListBulletedIcon,
    SearchListIcon,
    SettingsIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

const supportEmail = "support@bluepeaks.top";
const appStoreUrl = "https://apps.shopify.com/geo-redirect-country-block";

const troubleshootingLinks = [
    {
        title: "Check storefront settings",
        description: "Review app status, popup behavior, cookies, and visitor protection.",
        action: "Open settings",
        url: "/app/settings",
        icon: SettingsIcon,
    },
    {
        title: "Review active rules",
        description: "Confirm targeting, priority, schedule, and redirect destination.",
        action: "View rules",
        url: "/app/rules",
        icon: ListBulletedIcon,
    },
    {
        title: "Inspect visitor activity",
        description: "Check whether a storefront visit matched and triggered a rule.",
        action: "View logs",
        url: "/app/logs",
        icon: SearchListIcon,
    },
];

const faqItems = [
    {
        question: "Why is my redirect not working?",
        answer: "Confirm that Geolocation and the theme app embed are enabled, then verify the rule is active and matches the visitor country, market, state, or IP address.",
    },
    {
        question: "Why does a repeated test behave differently?",
        answer: "The app stores visitor choices in a cookie to prevent redirect loops and repeated prompts. Test in an incognito window or clear the geolocation cookie.",
    },
    {
        question: "Does the app affect storefront speed?",
        answer: "The storefront check is lightweight and configuration is cached. Results can still vary with theme scripts, network conditions, and other installed apps.",
    },
    {
        question: "What happens when the visitor limit is reached?",
        answer: "Free plan traffic pauses until the next usage period. Eligible paid plans continue according to the overage terms shown on the Pricing page and in Shopify billing.",
    },
    {
        question: "What should I include in a support request?",
        answer: "Include the shop URL, rule name, expected result, test country or IP, approximate test time, and a screenshot when possible.",
    },
];

export default function Support() {
    return (
        <Page fullWidth>
            <TitleBar title="Support" />
            <style>{`
                .support-page {
                    width: 100%;
                    max-width: 1280px;
                    margin: 0 auto;
                    padding-bottom: 40px;
                }
                .support-page-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 20px;
                }
                .support-contact-card {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 24px;
                    padding: 20px;
                }
                .support-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .support-troubleshooting-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }
                .support-troubleshooting-card {
                    min-height: 184px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    gap: 20px;
                }
                .support-troubleshooting-icon {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    background: var(--p-color-bg-surface-secondary, #f3f3f3);
                }
                .support-troubleshooting-icon .Polaris-Icon {
                    width: 20px;
                    height: 20px;
                    margin: 0;
                }
                .support-section-header {
                    padding: 16px 20px;
                }
                .support-faq-item summary {
                    list-style: none;
                    cursor: pointer;
                    padding: 16px 20px;
                }
                .support-faq-item summary::-webkit-details-marker {
                    display: none;
                }
                .support-faq-summary {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 24px;
                    align-items: center;
                    gap: 16px;
                }
                .support-faq-summary::after {
                    content: "+";
                    color: var(--p-color-text-secondary, #616161);
                    font-size: 20px;
                    line-height: 1;
                    text-align: center;
                }
                .support-faq-item[open] .support-faq-summary::after {
                    content: "-";
                }
                .support-faq-answer {
                    max-width: 840px;
                    padding: 0 20px 18px;
                }
                .support-footer-action {
                    display: flex;
                    justify-content: flex-end;
                }
                @media (max-width: 47.9975em) {
                    .support-page-header,
                    .support-contact-card {
                        grid-template-columns: 1fr;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .support-troubleshooting-grid {
                        grid-template-columns: 1fr;
                    }
                    .support-troubleshooting-card {
                        min-height: 0;
                    }
                    .support-contact-card .Polaris-Button {
                        width: 100%;
                    }
                }
            `}</style>

            <div className="support-page">
                <BlockStack gap="500">
                    <div className="support-page-header">
                        <BlockStack gap="100">
                            <Text as="h1" variant="headingLg">Support</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                                Troubleshoot storefront behavior or contact our team.
                            </Text>
                        </BlockStack>
                        <Button url={appStoreUrl} target="_blank" icon={ExternalIcon}>App Store page</Button>
                    </div>

                    <Card padding="0">
                        <div className="support-contact-card">
                            <BlockStack gap="300">
                                <BlockStack gap="100">
                                    <Text as="h2" variant="headingMd">Contact support</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Send your shop URL, rule name, expected result, and approximate test time so we can investigate efficiently.
                                    </Text>
                                </BlockStack>
                                <div className="support-meta">
                                    <Badge tone="success">Reply within 24 hours</Badge>
                                    <Text as="span" variant="bodySm" tone="subdued">Monday-Friday</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">{supportEmail}</Text>
                                </div>
                            </BlockStack>
                            <Button url={`mailto:${supportEmail}`} target="_blank" icon={EmailIcon} variant="primary">
                                Email support
                            </Button>
                        </div>
                    </Card>

                    <BlockStack gap="300">
                        <BlockStack gap="100">
                            <Text as="h2" variant="headingMd">Troubleshooting</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">Start with the area related to the issue.</Text>
                        </BlockStack>
                        <div className="support-troubleshooting-grid">
                            {troubleshootingLinks.map((item) => (
                                <Card key={item.title} padding="0">
                                    <div className="support-troubleshooting-card">
                                        <BlockStack gap="300">
                                            <div className="support-troubleshooting-icon"><Icon source={item.icon} tone="base" /></div>
                                            <BlockStack gap="100">
                                                <Text as="h3" variant="headingSm">{item.title}</Text>
                                                <Text as="p" variant="bodySm" tone="subdued">{item.description}</Text>
                                            </BlockStack>
                                        </BlockStack>
                                        <InlineStack><Button url={item.url}>{item.action}</Button></InlineStack>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </BlockStack>

                    <Card padding="0">
                        <div className="support-section-header">
                            <BlockStack gap="100">
                                <Text as="h2" variant="headingMd">Frequently asked questions</Text>
                                <Text as="p" variant="bodyMd" tone="subdued">Answers to common setup, testing, and billing questions.</Text>
                            </BlockStack>
                        </div>
                        <Divider />
                        {faqItems.map((item, index) => (
                            <div key={item.question}>
                                <details className="support-faq-item">
                                    <summary><div className="support-faq-summary"><Text as="span" variant="bodyMd" fontWeight="semibold">{item.question}</Text></div></summary>
                                    <div className="support-faq-answer"><Text as="p" variant="bodyMd" tone="subdued">{item.answer}</Text></div>
                                </details>
                                {index < faqItems.length - 1 && <Divider />}
                            </div>
                        ))}
                    </Card>

                    <div className="support-footer-action">
                        <Button url="/app/logs" icon={SearchListIcon}>View visitor logs</Button>
                    </div>
                </BlockStack>
            </div>
        </Page>
    );
}
