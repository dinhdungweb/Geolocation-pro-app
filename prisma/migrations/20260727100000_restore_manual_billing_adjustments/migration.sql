ALTER TABLE "MonthlyUsage"
ADD COLUMN "manualChargedVisitorsKey" TEXT;

ALTER TABLE "UsageChargeAttempt"
ADD COLUMN "manualAdjustmentKey" TEXT;
