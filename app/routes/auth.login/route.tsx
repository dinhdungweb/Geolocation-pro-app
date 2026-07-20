import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  BlockStack,
  Button,
  Card,
  Page,
  Text,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const APP_STORE_URL = "https://apps.shopify.com/geo-redirect-country-block";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If the request has Shopify embedded context indicators (shop, host, embedded params),
  // redirect to /app to trigger a fresh token exchange auth flow instead of showing the login page.
  // This prevents the "Open from Shopify" page from appearing inside the embedded app.
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const embedded = url.searchParams.get("embedded");

  if (shop || host || embedded) {
    const params = new URLSearchParams();
    if (shop) params.set("shop", shop);
    if (host) params.set("host", host);
    if (embedded) params.set("embedded", embedded);
    throw redirect(`/app?${params.toString()}`);
  }

  const errors = loginErrorMessage(await login(request));

  return { errors, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page narrowWidth>
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">
              Open Geo: Redirect & Country Block from Shopify
            </Text>
            <Text as="p" tone="subdued">
              For security, install and launch the app from the Shopify App Store or your Shopify admin Apps page.
            </Text>
            {errors.shop && (
              <Text as="p" tone="caution">
                {errors.shop}
              </Text>
            )}
            <Button variant="primary" url={APP_STORE_URL}>
              Open in Shopify App Store
            </Button>
          </BlockStack>
        </Card>
      </Page>

      {/* Fallback: if we somehow still end up here inside an iframe, auto-redirect */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                if (window !== window.top) {
                  window.location.replace("/app");
                }
              } catch(e) {
                window.location.replace("/app");
              }
            })();
          `,
        }}
      />
    </PolarisAppProvider>
  );
}
