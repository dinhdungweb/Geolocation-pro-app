import { useEffect } from "react";
import {
  isRouteErrorResponse,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Banner, BlockStack, Page, Text } from "@shopify/polaris";

import { recoverEmbeddedApp } from "../utils/app-recovery";
import { reportClientError } from "../utils/client-error.client";

// Shopify auth responses (bounce/redirect/401 retry) must still go through
// boundary.error; any other error stays inside the app frame instead of
// replacing the whole embedded app with the root error page.
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return boundary.error(error);
  }

  return <RouteErrorFallback error={error} />;
}

function RouteErrorFallback({ error }: { error: unknown }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isRetrying = navigation.state !== "idle";

  useEffect(() => {
    reportClientError(error, "route");
  }, [error]);

  return (
    <Page>
      <Banner
        tone="critical"
        title="We couldn't load this page"
        action={{
          content: "Try again",
          loading: isRetrying,
          onAction: () =>
            navigate(`${location.pathname}${location.search}`, { replace: true }),
        }}
        secondaryAction={{
          content: "Reload app",
          onAction: recoverEmbeddedApp,
        }}
      >
        <BlockStack gap="200">
          <Text as="p">
            Something went wrong while loading this page. Your settings and rules
            are not affected.
          </Text>
          <Text as="p" tone="subdued">
            If the problem continues, contact support.
          </Text>
        </BlockStack>
      </Banner>
    </Page>
  );
}
