import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { checkAndChargeOverage } from "../utils/billing.server";
import { cleanupOldLogs } from "../utils/cleanup.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const isTest = false;

  // Check and charge overage on every admin page load
  await checkAndChargeOverage(session.shop, billing, isTest);

  // Lazy cleanup: delete old visitor logs (fire-and-forget, max 1x/day)
  cleanupOldLogs().catch(() => { });

  // Lấy thông tin shop để hiển thị trong Crisp
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

  const crispInitialized = useRef(false);

  useEffect(() => {
    // Chỉ chạy ở phía Client và chỉ khởi tạo 1 lần duy nhất
    if (typeof window === "undefined" || crispInitialized.current) return;
    crispInitialized.current = true;

    // 1. Khởi tạo Crisp (chỉ khi chưa có script trong DOM)
    if (!(window as any).CRISP_WEBSITE_ID) {
      (window as any).$crisp = [];
      (window as any).CRISP_WEBSITE_ID = "b882709c-9f60-4bf7-b823-0f6bc6196f4a";

      const existingScript = document.querySelector('script[src*="crisp.chat"]');
      if (!existingScript) {
        const s = document.createElement("script");
        s.src = "https://client.crisp.chat/l.js";
        s.async = true;
        document.head.appendChild(s);
      }
    }

    // 2. Nhận diện Shop khi script đã tải xong
    const handleIdentify = () => {
      if ((window as any).$crisp && shopInfo) {
        const crisp = (window as any).$crisp;
        crisp.push(["set", "user:email", [shopInfo.email]]);
        crisp.push(["set", "user:nickname", [shopInfo.name]]);
        crisp.push(["set", "session:data", [[["shop", shopInfo.myshopifyDomain]]]]);
        crisp.push(["do", "chat:show"]);
      }
    };

    // Đợi một chút để Crisp init hoàn toàn
    const timer = setTimeout(handleIdentify, 1500);
    return () => clearTimeout(timer);
  }, []); // Empty deps: chỉ chạy 1 lần khi mount

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
