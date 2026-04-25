ALTER TABLE "Settings" ADD COLUMN "customPlanEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "customPlanName" TEXT NOT NULL DEFAULT 'Custom plan';
ALTER TABLE "Settings" ADD COLUMN "customPlanPrice" DECIMAL(10, 2) NOT NULL DEFAULT 79.99;
ALTER TABLE "Settings" ADD COLUMN "customPlanVisitorLimit" INTEGER;
ALTER TABLE "Settings" ADD COLUMN "customPlanNoOverage" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "customPlanTrialDays" INTEGER NOT NULL DEFAULT 7;

UPDATE "Settings"
SET "customPlanEnabled" = "allowUnlimitedPlan",
    "customPlanName" = 'Unlimited custom plan',
    "customPlanVisitorLimit" = NULL,
    "customPlanNoOverage" = true
WHERE "allowUnlimitedPlan" = true;
