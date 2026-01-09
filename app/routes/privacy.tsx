import { Page, Card, BlockStack, Text, List } from "@shopify/polaris";
import type { LinksFunction } from "@remix-run/node";
import styles from "@shopify/polaris/build/esm/styles.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export default function PrivacyPolicy() {
    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
            <Page title="Privacy Policy">
                <BlockStack gap="500">
                    <Card>
                        <BlockStack gap="400">
                            <Text as="p">
                                Last updated: {new Date().toLocaleDateString()}
                            </Text>
                            <Text as="p">
                                This Privacy Policy describes how Geo: Redirect & Country Block (the "App") collects, uses, and discloses your Personal Information when you install or use the App in connection with your Shopify-supported store.
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">1. Information We Collect</Text>
                            <Text as="p">
                                When you install the App, we are automatically able to access certain types of information from your Shopify account:
                            </Text>
                            <List type="bullet">
                                <List.Item>Shop domain and configuration settings.</List.Item>
                                <List.Item>Customer IP addresses (strictly for geolocation purposes).</List.Item>
                                <List.Item>Browsing behavior on your storefront (to trigger redirects or blocks).</List.Item>
                            </List>
                            <Text as="p" fontWeight="bold">
                                We do NOT collect or store sensitive personal data such as customer names, emails, or payment details.
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">2. How We Use Your Information</Text>
                            <Text as="p">
                                We use the collected information for the following purposes:
                            </Text>
                            <List type="bullet">
                                <List.Item>To provide the geolocation redirection and blocking services.</List.Item>
                                <List.Item>To provide analytics on redirection and blocking events.</List.Item>
                                <List.Item>To improve and optimize our App's performance.</List.Item>
                            </List>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">3. Data Retention</Text>
                            <Text as="p">
                                We retain IP address logs for a limited period (typically 30 days) solely for the purpose of providing analytics and troubleshooting. After this period, data is automatically anonymized or deleted.
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">4. Changes</Text>
                            <Text as="p">
                                We may update this Privacy Policy from time to time in order to reflect, for example, changes to our practices or for other operational, legal, or regulatory reasons.
                            </Text>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">5. Contact Us</Text>
                            <Text as="p">
                                For more information about our privacy practices, if you have questions, or if you would like to make a complaint, please contact us by e-mail at support@bluepeaks.top.
                            </Text>
                        </BlockStack>
                    </Card>
                </BlockStack>
            </Page>
        </div>
    );
}
