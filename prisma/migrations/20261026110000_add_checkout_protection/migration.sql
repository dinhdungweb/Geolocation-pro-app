ALTER TABLE "Settings"
ADD COLUMN "checkoutProtectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "checkoutValidationId" TEXT,
ADD COLUMN "checkoutProtectionSyncedAt" TIMESTAMP(3),
ADD COLUMN "checkoutProtectionError" TEXT;
