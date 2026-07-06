import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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
              Open Geolocation Pro from Shopify
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
    </PolarisAppProvider>
  );
}
