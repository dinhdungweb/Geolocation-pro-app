import { Page, Card, BlockStack, Text, Accordion, List } from "@shopify/polaris";
import type { LinksFunction } from "@remix-run/node";
import styles from "@shopify/polaris/build/esm/styles.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export default function FAQ() {
    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
            <Page title="Frequently Asked Questions">
                <BlockStack gap="500">
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">General</Text>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Is coding knowledge required?</Text>
                                <Text as="p">
                                    No! Geo: Redirect & Country Block is designed to be "No Code." You can set up redirection and blocking rules directly from the simple dashboard.
                                </Text>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Does it slow down my store?</Text>
                                <Text as="p">
                                    Our app is optimized for speed. Geolocation checks happen asynchronously and are cached to ensure your store's loading speed remains unaffected.
                                </Text>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Billing & Plans</Text>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Is there a free trial?</Text>
                                <Text as="p">
                                    Yes, all paid plans come with a 14-day free trial so you can test all features risk-free.
                                </Text>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">What happens if I exceed my visitor limit?</Text>
                                <Text as="p">
                                    If you are on a paid plan, overage charges may apply. For the Free plan, geolocation features will pause until the next billing cycle.
                                </Text>
                            </BlockStack>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Troubleshooting</Text>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Why is the redirect not working for me?</Text>
                                <Text as="p">
                                    Please ensure you are testing from an IP address that matches your rule. Also, clear your browser cookies or try Incegnito mode, as the app remembers your choice to avoid redirect loops.
                                </Text>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">How do I contact support?</Text>
                                <Text as="p">
                                    You can reach our support team anytime at support@bluepeaks.top. We typically respond within 24 hours.
                                </Text>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </BlockStack>
            </Page>
        </div>
    );
}
