import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { loadCrisp, prepareCrisp } from "../utils/crisp";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const CRISP_BOOT_DELAY_MS = 1500;
const CRISP_IDLE_TIMEOUT_MS = 1500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (typeof window === "undefined") return;

    prepareCrisp(shop);

    let delayTimer: number | undefined;
    let idleCallbackId: number | undefined;
    let hasRequestedLoad = false;

    const intentEvents = ["pointerdown", "keydown", "touchstart"] as const;
    const listenerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
      once: true,
    };

    const removeIntentListeners = () => {
      for (const eventName of intentEvents) {
        window.removeEventListener(eventName, handleUserIntent, listenerOptions);
      }
    };

    const requestCrispLoad = () => {
      if (hasRequestedLoad) return;
      hasRequestedLoad = true;

      if (delayTimer !== undefined) {
        window.clearTimeout(delayTimer);
      }

      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      removeIntentListeners();
      loadCrisp({ shop });
    };

    function handleUserIntent() {
      requestCrispLoad();
    }

    const queueIdleLoad = () => {
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(requestCrispLoad, {
          timeout: CRISP_IDLE_TIMEOUT_MS,
        });
      } else {
        requestCrispLoad();
      }
    };

    for (const eventName of intentEvents) {
      window.addEventListener(eventName, handleUserIntent, listenerOptions);
    }

    delayTimer = window.setTimeout(queueIdleLoad, CRISP_BOOT_DELAY_MS);

    return () => {
      if (delayTimer !== undefined) {
        window.clearTimeout(delayTimer);
      }

      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      removeIntentListeners();
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
