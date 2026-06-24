import "dotenv/config";
import "@shopify/shopify-app-remix/adapters/node";
import type { ApiVersion } from "@shopify/shopify-app-remix/server";
import {
  AppDistribution,
  BillingInterval,
  LogSeverity,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

import {
  DEFAULT_TRIAL_DAYS,
  PREMIUM_PLAN,
  PLUS_PLAN,
  ELITE_PLAN,
  UNLIMITED_PLAN,
  CUSTOM_PLAN,
  OVERAGE_MONTHLY_CAP_AMOUNT,
} from "./billing.config";
import { sendAdminEmail, hasSentEmail } from "./utils/email.server";
import { getWelcomeEmailHtml } from "./utils/email-templates";

const shopifyScopes = (process.env.SCOPES || "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2026-04" as ApiVersion,
  scopes: shopifyScopes,
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
          amount: OVERAGE_MONTHLY_CAP_AMOUNT, // Capped amount (Spending Limit)
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor), capped at $99.99/month.",
        },
      ],
      trialDays: DEFAULT_TRIAL_DAYS,
    },
    [PLUS_PLAN]: {
      lineItems: [
        {
          amount: 7.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
        {
          amount: OVERAGE_MONTHLY_CAP_AMOUNT, // Capped amount (Spending Limit)
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor), capped at $99.99/month.",
        },
      ],
      trialDays: DEFAULT_TRIAL_DAYS,
    },
    [ELITE_PLAN]: {
      lineItems: [
        {
          amount: 14.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
        {
          amount: OVERAGE_MONTHLY_CAP_AMOUNT, // Capped amount (Spending Limit)
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "Overage: $100 per 50,000 visitors (~$0.002/visitor), capped at $99.99/month.",
        },
      ],
      trialDays: DEFAULT_TRIAL_DAYS,
    },
    [UNLIMITED_PLAN]: {
      lineItems: [
        {
          amount: 79.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: DEFAULT_TRIAL_DAYS,
    },
    [CUSTOM_PLAN]: {
      lineItems: [
        {
          amount: 79.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: DEFAULT_TRIAL_DAYS,
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  logger: {
    level: LogSeverity.Error,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session, admin }) => {
      const shop = session.shop;

      // 1. Fetch shop email via GraphQL if missing (Shopify doesn't provide it in session by default)
      let shopEmail = (session as any).email;
      if (!shopEmail && admin) {
        try {
          const response = await admin.graphql(
            `#graphql
            query {
              shop {
                email
              }
            }`
          );
          const data = await response.json();
          shopEmail = data?.data?.shop?.email;
          
          if (shopEmail) {
            console.log(`[AfterAuth] Fetched email for ${shop}: ${shopEmail}`);
            // Update the session record in DB so we have it for future use
            await prisma.session.update({
              where: { id: session.id },
              data: { email: shopEmail }
            });
          }
        } catch (e) {
          console.error(`[AfterAuth] Error fetching shop email for ${shop}:`, e);
        }
      }

      // 2. Send welcome email if not already sent
      const uninstallCleanup = await prisma.shopCleanupJob.findFirst({
        where: {
          shop,
          reason: "app_uninstalled",
          status: { in: ["pending", "running", "failed"] },
        },
        select: { status: true },
      });

      if (uninstallCleanup) {
        console.log(
          `[AfterAuth] Skipping welcome email for ${shop}; uninstall cleanup is ${uninstallCleanup.status}`,
        );
        return;
      }

      const welcomed = await hasSentEmail(shop, 'welcome');
      if (!welcomed) {
        console.log(`[AfterAuth] Triggering welcome email to ${shop}`);
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

type OfflineSessionForMigration = {
  id: string;
  shop: string;
  isOnline: boolean;
  accessToken?: string;
  refreshToken?: string;
  expires?: Date;
};

type OfflineTokenExchangeResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope?: string;
};

async function hasExpiringOfflineSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      expires: true,
      refreshToken: true,
    },
  });

  return Boolean(session?.expires && session.refreshToken);
}

async function migrateOfflineSessionToExpiringIfNeeded(
  session: OfflineSessionForMigration,
) {
  if (
    session.isOnline ||
    !session.accessToken ||
    session.refreshToken ||
    session.expires
  ) {
    return false;
  }

  const currentSession = await prisma.session.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      shop: true,
      isOnline: true,
      accessToken: true,
      refreshToken: true,
      expires: true,
    },
  });

  if (
    !currentSession ||
    currentSession.isOnline ||
    !currentSession.accessToken ||
    currentSession.refreshToken ||
    currentSession.expires
  ) {
    return false;
  }

  try {
    const response = await fetch(
      `https://${currentSession.shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_API_KEY,
          client_secret: process.env.SHOPIFY_API_SECRET || "",
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: currentSession.accessToken,
          subject_token_type:
            "urn:shopify:params:oauth:token-type:offline-access-token",
          requested_token_type:
            "urn:shopify:params:oauth:token-type:offline-access-token",
          expiring: "1",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      if (await hasExpiringOfflineSession(currentSession.id)) return true;

      console.error(
        `[OfflineTokenMigration] Failed for ${currentSession.shop}: ${response.status} ${body}`,
      );
      return false;
    }

    const token = (await response.json()) as OfflineTokenExchangeResponse;
    const now = Date.now();

    await prisma.session.update({
      where: { id: currentSession.id },
      data: {
        accessToken: token.access_token,
        scope: token.scope,
        expires: new Date(now + token.expires_in * 1000),
        refreshToken: token.refresh_token,
        refreshTokenExpires: new Date(
          now + token.refresh_token_expires_in * 1000,
        ),
      },
    });

    console.log(
      `[OfflineTokenMigration] Migrated ${currentSession.shop} to expiring offline token`,
    );
    return true;
  } catch (error) {
    if (await hasExpiringOfflineSession(currentSession.id)) return true;

    console.error(
      `[OfflineTokenMigration] Error for ${currentSession.shop}:`,
      error,
    );
    return false;
  }
}

const baseAuthenticate = shopify.authenticate;
const baseUnauthenticated = shopify.unauthenticated;

export default shopify;
export const apiVersion = "2026-04" as ApiVersion;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = {
  ...baseAuthenticate,
  admin: async (request: Request) => {
    const context = await baseAuthenticate.admin(request);
    const migrated = await migrateOfflineSessionToExpiringIfNeeded(
      context.session,
    );

    if (!migrated) return context;

    const refreshedContext = await baseUnauthenticated.admin(
      context.session.shop,
    );
    return {
      ...context,
      admin: refreshedContext.admin,
      session: refreshedContext.session,
    };
  },
} as typeof shopify.authenticate;
export const unauthenticated = {
  ...baseUnauthenticated,
  admin: async (shop: string) => {
    const context = await baseUnauthenticated.admin(shop);
    const migrated = await migrateOfflineSessionToExpiringIfNeeded(
      context.session,
    );

    return migrated ? baseUnauthenticated.admin(shop) : context;
  },
} as typeof shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
