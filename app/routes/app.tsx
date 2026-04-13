import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { checkAndChargeOverage } from "../utils/billing.server";
import { cleanupOldLogs } from "../utils/cleanup.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const isTest = false;

  // Check and charge overage on every admin page load
  await checkAndChargeOverage(session.shop, billing, isTest);

  // Lazy cleanup: delete old visitor logs (fire-and-forget, max 1x/day)
  cleanupOldLogs().catch(() => { });

  // Get shop info for Crisp Support
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`
    #graphql
    query getShopInfo {
      shop {
        name
        email
        myshopifyDomain
      }
    }
  `);
  const { data: { shop: shopData } } = await response.json();

  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shopInfo: shopData
  };
};

export default function App() {
  const { apiKey, shopInfo } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).$crisp && shopInfo) {
      const crisp = (window as any).$crisp;
      // Identify the merchant
      crisp.push(["set", "user:email", [shopInfo.email]]);
      crisp.push(["set", "user:nickname", [shopInfo.name]]);
      // Store shop domain as session data for easy filtering
      crisp.push(["set", "session:data", [[["shop_domain", shopInfo.myshopifyDomain]]]]);
    }
  }, [shopInfo]);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/setup">Setup Guide</Link>
        <Link to="/app/rules">Geolocation Rules</Link>
        <Link to="/app/ip-rules">IP Rules</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/logs">Visitor Logs</Link>
        <Link to="/app/pricing">Pricing</Link>
        <Link to="/app/support">Support</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
