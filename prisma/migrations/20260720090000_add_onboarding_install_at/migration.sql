ALTER TABLE "Settings"
ADD COLUMN "onboardingInstallAt" TIMESTAMP(3);

UPDATE "Settings"
SET "onboardingInstallAt" = "createdAt";

ALTER TABLE "Settings"
ALTER COLUMN "onboardingInstallAt" SET NOT NULL,
ALTER COLUMN "onboardingInstallAt" SET DEFAULT CURRENT_TIMESTAMP;
