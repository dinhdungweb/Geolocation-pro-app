ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingPeriodStart" TIMESTAMP(3);

ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "billingPeriodStart" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "MonthlyUsage_shop_billingPeriodStart_idx" ON "MonthlyUsage"("shop", "billingPeriodStart");

CREATE TABLE IF NOT EXISTS "UsageChargeAttempt" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "billingPeriodKey" TEXT NOT NULL,
    "billingUsageLineItemId" TEXT,
    "fromChargedVisitors" INTEGER NOT NULL,
    "toChargedVisitors" INTEGER NOT NULL,
    "overageVisitors" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopifyUsageRecordId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageChargeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsageChargeAttempt_idempotencyKey_key" ON "UsageChargeAttempt"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "UsageChargeAttempt_shop_billingPeriodKey_status_idx" ON "UsageChargeAttempt"("shop", "billingPeriodKey", "status");
CREATE INDEX IF NOT EXISTS "UsageChargeAttempt_shop_status_idx" ON "UsageChargeAttempt"("shop", "status");

CREATE TABLE IF NOT EXISTS "JobLock" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "JobLock_lockedUntil_idx" ON "JobLock"("lockedUntil");
