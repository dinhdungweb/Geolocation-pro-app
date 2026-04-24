-- Align deployed databases with the current Prisma schema.
-- This migration is intentionally additive/idempotent because some deployments
-- have historically used `prisma db push` instead of `prisma migrate deploy`.

-- Settings additions
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "currentPlan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "emailSenderEmail" TEXT DEFAULT 'noreply@geopro.bluepeaks.top';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "emailSenderName" TEXT DEFAULT 'Geo Admin';
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "smtpHost" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "smtpPass" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "smtpSecure" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "smtpUser" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "blockVpn" BOOLEAN NOT NULL DEFAULT false;

-- Redirect rule additions
ALTER TABLE "RedirectRule" ADD COLUMN IF NOT EXISTS "redirectMode" TEXT NOT NULL DEFAULT 'popup';
ALTER TABLE "RedirectRule" ADD COLUMN IF NOT EXISTS "pagePaths" TEXT;
ALTER TABLE "RedirectRule" ADD COLUMN IF NOT EXISTS "pageTargetingType" TEXT NOT NULL DEFAULT 'all';

-- Analytics additions
ALTER TABLE "AnalyticsRule" ADD COLUMN IF NOT EXISTS "blocked" INTEGER NOT NULL DEFAULT 0;

-- Usage and logging
CREATE TABLE IF NOT EXISTS "MonthlyUsage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "totalVisitors" INTEGER NOT NULL DEFAULT 0,
    "redirected" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chargedVisitors" INTEGER NOT NULL DEFAULT 0,
    "popupShown" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MonthlyUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyUsage_shop_yearMonth_key" ON "MonthlyUsage"("shop", "yearMonth");
CREATE INDEX IF NOT EXISTS "MonthlyUsage_shop_idx" ON "MonthlyUsage"("shop");

CREATE TABLE IF NOT EXISTS "VisitorLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "countryCode" TEXT,
    "city" TEXT,
    "action" TEXT NOT NULL,
    "ruleName" TEXT,
    "targetUrl" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" TEXT,
    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VisitorLog_shop_timestamp_idx" ON "VisitorLog"("shop", "timestamp");

-- Admin email and messaging
CREATE TABLE IF NOT EXISTS "AdminEmailLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "html" TEXT,
    CONSTRAINT "AdminEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminEmailLog_shop_type_idx" ON "AdminEmailLog"("shop", "type");

CREATE TABLE IF NOT EXISTS "Automation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "config" TEXT NOT NULL DEFAULT '[]',
    "html" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT DEFAULT 'Untitled Automation',
    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Automation_shop_type_key" ON "Automation"("shop", "type");
CREATE INDEX IF NOT EXISTS "Automation_shop_idx" ON "Automation"("shop");

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "config" TEXT NOT NULL DEFAULT '[]',
    "html" TEXT DEFAULT '',
    "thumb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_idx" ON "EmailTemplate"("shop");

CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "salesAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "html" TEXT,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Campaign_shop_status_idx" ON "Campaign"("shop", "status");

CREATE TABLE IF NOT EXISTS "EmailBlacklist" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailBlacklist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailBlacklist_shop_key" ON "EmailBlacklist"("shop");
