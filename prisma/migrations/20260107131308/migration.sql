-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCodes" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "ruleType" TEXT NOT NULL DEFAULT 'redirect',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'popup',
    "template" TEXT NOT NULL DEFAULT 'modal',
    "popupTitle" TEXT NOT NULL DEFAULT 'Would you like to switch to a local version?',
    "popupMessage" TEXT NOT NULL DEFAULT 'We noticed you are visiting from {country}. Would you like to go to {target}?',
    "confirmBtnText" TEXT NOT NULL DEFAULT 'Go now',
    "cancelBtnText" TEXT NOT NULL DEFAULT 'Stay here',
    "popupBgColor" TEXT NOT NULL DEFAULT '#ffffff',
    "popupTextColor" TEXT NOT NULL DEFAULT '#333333',
    "popupBtnColor" TEXT NOT NULL DEFAULT '#007bff',
    "blockedTitle" TEXT NOT NULL DEFAULT 'Access Denied',
    "blockedMessage" TEXT NOT NULL DEFAULT 'We do not offer services in your country/region.',
    "excludeBots" BOOLEAN NOT NULL DEFAULT true,
    "excludedIPs" TEXT NOT NULL DEFAULT '',
    "cookieDuration" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsCountry" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "countryCode" TEXT NOT NULL,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "popupShown" INTEGER NOT NULL DEFAULT 0,
    "redirected" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "clickedYes" INTEGER NOT NULL DEFAULT 0,
    "clickedNo" INTEGER NOT NULL DEFAULT 0,
    "dismissed" INTEGER NOT NULL DEFAULT 0,
    "autoRedirected" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedirectRule_shop_idx" ON "RedirectRule"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");

-- CreateIndex
CREATE INDEX "AnalyticsCountry_shop_date_idx" ON "AnalyticsCountry"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsCountry_shop_date_countryCode_key" ON "AnalyticsCountry"("shop", "date", "countryCode");

-- CreateIndex
CREATE INDEX "AnalyticsRule_shop_date_idx" ON "AnalyticsRule"("shop", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsRule_shop_date_ruleId_key" ON "AnalyticsRule"("shop", "date", "ruleId");
