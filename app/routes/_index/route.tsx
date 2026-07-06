import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  Page,
  Text,
  BlockStack,
  Box,
  InlineStack,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { Globe, ShieldCheck } from "lucide-react";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const APP_STORE_URL = "https://apps.shopify.com/geo-redirect-country-block";

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { polarisTranslations };
};

export default function App() {
  const { polarisTranslations } = useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f1f2f4"
      }}>
        <Page narrowWidth>
          <Box maxWidth="400px">
            <Card>
              <BlockStack gap="400">
                <Box paddingBlock="400">
                  <BlockStack gap="200" align="center">
                    <div style={{
                      backgroundColor: "#008060",
                      width: "48px",
                      height: "48px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px"
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 6L12 18M6 12L18 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <path d="M16 8L8 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <Text variant="headingXl" as="h1" alignment="center">
                      Geo: Redirect & Country Block
                    </Text>
                    <Text variant="bodyMd" as="p" alignment="center" tone="subdued">
                      Advanced Geolocation Redirects & Blocking to protect your store.
                    </Text>
                  </BlockStack>
                </Box>

                <BlockStack gap="300">
                  <Button variant="primary" url={APP_STORE_URL} fullWidth size="large">
                    Open in Shopify App Store
                  </Button>
                  <Text variant="bodySm" as="p" alignment="center" tone="subdued">
                    Install and open the app from Shopify-owned surfaces to keep your store secure.
                  </Text>
                </BlockStack>

                <Box paddingBlockStart="400" borderBlockStartWidth="050" borderColor="border-secondary">
                  <BlockStack gap="300">
                    <InlineStack gap="300" wrap={false}>
                      <Globe size={24} color="#008060" />
                      <BlockStack gap="050">
                        <Text variant="bodySm" fontWeight="bold" as="p">Smart Redirects</Text>
                        <Text variant="bodyXs" tone="subdued" as="p">Auto-route visitors to their local store.</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="300" wrap={false}>
                      <ShieldCheck size={24} color="#008060" />
                      <BlockStack gap="050">
                        <Text variant="bodySm" fontWeight="bold" as="p">IP Protection</Text>
                        <Text variant="bodyXs" tone="subdued" as="p">Block unwanted traffic and bots instantly.</Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Box>
        </Page>
      </div>
    </PolarisAppProvider>
  );
}
