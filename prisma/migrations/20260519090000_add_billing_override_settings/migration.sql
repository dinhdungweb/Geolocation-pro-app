ALTER TABLE "Settings" ADD COLUMN "billingOverrideEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "billingOverridePlan" TEXT;
ALTER TABLE "Settings" ADD COLUMN "billingOverrideReason" TEXT;
