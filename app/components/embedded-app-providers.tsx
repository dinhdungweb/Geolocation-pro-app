import type { ReactNode } from "react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";

interface EmbeddedAppProvidersProps {
  apiKey: string;
  children: ReactNode;
}

export function EmbeddedAppProviders({
  apiKey,
  children,
}: EmbeddedAppProvidersProps) {
  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={polarisTranslations}>
        {children}
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}
