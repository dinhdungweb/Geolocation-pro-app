ALTER TABLE "RedirectRule" ADD COLUMN "redirectFrequency" TEXT;

ALTER TABLE "Settings" ADD COLUMN "checkoutValidationActive" BOOLEAN NOT NULL DEFAULT false;

-- Best guess at what earlier releases left on Shopify. Shops whose real state
-- differs (e.g. a Free shop still enforcing checkout) are detected as drift and
-- re-synced by the usage cron.
UPDATE "Settings"
SET "checkoutValidationActive" = true
WHERE "checkoutValidationId" IS NOT NULL
  AND "checkoutProtectionEnabled" = true;
