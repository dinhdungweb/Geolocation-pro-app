ALTER TABLE "Settings" ALTER COLUMN "customPlanTrialDays" SET DEFAULT 3;

UPDATE "Settings"
SET "customPlanTrialDays" = 3
WHERE "customPlanTrialDays" = 7;
