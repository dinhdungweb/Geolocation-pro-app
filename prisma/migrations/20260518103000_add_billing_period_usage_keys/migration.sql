ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingPeriodKey" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingSubscriptionId" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingUsageLineItemId" TEXT;
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "billingPlanName" TEXT;

ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "billingPeriodKey" TEXT;
ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "billingPeriodEnd" TIMESTAMP(3);
ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "billingSubscriptionId" TEXT;
ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "billingUsageLineItemId" TEXT;

UPDATE "MonthlyUsage"
SET "billingPeriodKey" = 'calendar:' || "yearMonth"
WHERE "billingPeriodKey" IS NULL;

ALTER TABLE "MonthlyUsage" ALTER COLUMN "billingPeriodKey" SET NOT NULL;

DROP INDEX IF EXISTS "MonthlyUsage_shop_yearMonth_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyUsage_shop_billingPeriodKey_key" ON "MonthlyUsage"("shop", "billingPeriodKey");
CREATE INDEX IF NOT EXISTS "MonthlyUsage_shop_yearMonth_idx" ON "MonthlyUsage"("shop", "yearMonth");
CREATE INDEX IF NOT EXISTS "MonthlyUsage_shop_billingPeriodEnd_idx" ON "MonthlyUsage"("shop", "billingPeriodEnd");

ALTER TABLE "BillableUsageEvent" ADD COLUMN IF NOT EXISTS "billingPeriodKey" TEXT;

UPDATE "BillableUsageEvent"
SET "billingPeriodKey" = 'calendar:' || "yearMonth"
WHERE "billingPeriodKey" IS NULL;

CREATE INDEX IF NOT EXISTS "BillableUsageEvent_shop_billingPeriodKey_idx" ON "BillableUsageEvent"("shop", "billingPeriodKey");
