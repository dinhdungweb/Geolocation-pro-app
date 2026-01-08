-- AlterTable
ALTER TABLE "RedirectRule" ADD COLUMN     "ipAddresses" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "matchType" TEXT NOT NULL DEFAULT 'country',
ALTER COLUMN "countryCodes" SET DEFAULT '',
ALTER COLUMN "targetUrl" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "RedirectRule_shop_matchType_idx" ON "RedirectRule"("shop", "matchType");
