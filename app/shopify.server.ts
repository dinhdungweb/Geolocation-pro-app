import "dotenv/config";
import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  LogSeverity,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

import { PREMIUM_PLAN, PLUS_PLAN } from "./billing.config";
import { initUsageCron } from "./utils/usage-cron.server";
import { sendAdminEmail, hasSentEmail } from "./utils/email.server";
import { getWelcomeEmailHtml } from "./utils/email-templates";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [PREMIUM_PLAN]: {
      lineItems: [
        {
          amount: 4.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
        {
          amount: 100.00, // Capped amount (Spending Limit)
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor) exceeded.",
        },
      ],
      trialDays: 7,
    },
    [PLUS_PLAN]: {
      lineItems: [
        {
          amount: 7.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
        {
          amount: 100.00, // Capped amount (Spending Limit)
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor) exceeded.",
        },
      ],
      trialDays: 7,
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  logger: {
    level: LogSeverity.Error,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session }) => {
      const shop = session.shop;
      const welcomed = await hasSentEmail(shop, 'welcome');
      if (!welcomed) {
        console.log(`[AfterAuth] Sending welcome email to ${shop}`);
        await sendAdminEmail({
          shop,
          type: 'welcome',
          subject: 'Welcome to Geo: Redirect & Country Block!',
          html: getWelcomeEmailHtml(shop)
        });
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

// Initialize Automated Usage Monitoring
if (process.env.NODE_ENV !== "test") {
  initUsageCron();
}
