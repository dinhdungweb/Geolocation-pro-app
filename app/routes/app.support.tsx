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
} from "@shopify/polaris";
import {
    EmailIcon,
    ExternalIcon,
} from "@shopify/polaris-icons";

export default function Support() {
    return (
        <Page
            title="Support"
            subtitle="We're here to help you get the most out of Geo: Redirect & Country Block."
        >
            <Layout>
                {/* Contact Support */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Contact Support</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                                Have a question or issue? Our support team is ready to help you. We typically respond within 24 hours.
                            </Text>
                            <Divider />
                            <InlineStack gap="300" align="start" blockAlign="center">
                                <Text as="p" variant="bodyMd">Email us at:</Text>
                                <Button
                                    url="mailto:support@bluepeaks.top"
                                    target="_blank"
                                    icon={EmailIcon}
                                    variant="primary"
                                >
                                    support@bluepeaks.top
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* FAQ */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Frequently Asked Questions</Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                                Find answers to common questions about our app.
                            </Text>
                            <Divider />

                            <BlockStack gap="500">
                                <BlockStack gap="150">
                                    <Text as="h3" variant="headingSm">Is coding knowledge required?</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        No! Geo: Redirect &amp; Country Block is designed to be "No Code." You can set up redirection and blocking rules directly from the simple dashboard.
                                    </Text>
                                </BlockStack>

                                <BlockStack gap="150">
                                    <Text as="h3" variant="headingSm">Does it slow down my store?</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Our app is optimized for speed. Geolocation checks happen asynchronously and are cached to ensure your store's loading speed remains unaffected.
                                    </Text>
                                </BlockStack>

                                <BlockStack gap="150">
                                    <Text as="h3" variant="headingSm">Is there a free trial?</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Yes, all paid plans come with a 7-day free trial so you can test all features risk-free.
                                    </Text>
                                </BlockStack>

                                <BlockStack gap="150">
                                    <Text as="h3" variant="headingSm">What happens if I exceed my visitor limit?</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        If you are on a paid plan, overage charges may apply. For the Free plan, geolocation features will pause until the next billing cycle.
                                    </Text>
                                </BlockStack>

                                <BlockStack gap="150">
                                    <Text as="h3" variant="headingSm">Why is the redirect not working for me?</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Please ensure you are testing from an IP address that matches your rule. Also, clear your browser cookies or try Incognito mode, as the app remembers your choice to avoid redirect loops.
                                    </Text>
                                </BlockStack>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Resources */}
                <Layout.Section variant="oneThird">
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">Useful Resources</Text>
                                <Divider />
                                <BlockStack gap="300">
                                    <Button
                                        url="https://apps.shopify.com/geo-redirect-country-block"
                                        target="_blank"
                                        icon={ExternalIcon}
                                        variant="plain"
                                    >
                                        App Store Page
                                    </Button>
                                    <Button
                                        url="https://apps.shopify.com/geo-redirect-country-block?#modal-show=WriteReviewModal"
                                        target="_blank"
                                        icon={ExternalIcon}
                                        variant="plain"
                                    >
                                        Leave a Review
                                    </Button>
                                    <Button
                                        url="mailto:support@bluepeaks.top"
                                        icon={EmailIcon}
                                        variant="plain"
                                    >
                                        Email Support
                                    </Button>
                                </BlockStack>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">Response Times</Text>
                                <Divider />
                                <BlockStack gap="200">
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Email Support</Text>
                                        <Text as="span" variant="bodyMd" tone="subdued">Within 24 hours</Text>
                                    </InlineStack>
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Business Days</Text>
                                        <Text as="span" variant="bodyMd" tone="subdued">Mon – Fri</Text>
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
