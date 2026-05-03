import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { cleanupOldLogs } from "../utils/cleanup.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const CRISP_LOAD_DELAY_MS = 7000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Fire-and-forget cleanup so it cannot delay the initial admin iframe render.
  cleanupOldLogs().catch(() => {});

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  const crispInitialized = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let idleCallbackId: number | undefined;

    const loadCrisp = () => {
      if (crispInitialized.current) return;
      crispInitialized.current = true;

      const crisp = ((window as any).$crisp ||= []);
      if (!(window as any).CRISP_WEBSITE_ID) {
        (window as any).CRISP_WEBSITE_ID = "b882709c-9f60-4bf7-b823-0f6bc6196f4a";
      }

      crisp.push(["set", "session:data", [[["shop", shop]]]]);
      crisp.push(["do", "chat:show"]);

      // Defer chat loading so third-party JS cannot compete with LCP.
      const existingScript = document.querySelector('script[src*="crisp.chat"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://client.crisp.chat/l.js";
        script.async = true;
        document.head.appendChild(script);
      }
    };

    const delayTimer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(loadCrisp, { timeout: 3000 });
      } else {
        loadCrisp();
      }
    }, CRISP_LOAD_DELAY_MS);

    return () => {
      window.clearTimeout(delayTimer);
      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [shop]);

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
