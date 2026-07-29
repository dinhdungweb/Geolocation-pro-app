ALTER TABLE "OrderRiskRecord"
ADD COLUMN "clientIpHash" TEXT;

ALTER TABLE "OrderRiskRecord"
ALTER COLUMN "riskSignals" TYPE TEXT
USING "riskSignals"::TEXT;

DROP INDEX IF EXISTS "OrderRiskRecord_shop_clientIp_orderCreatedAt_idx";

CREATE INDEX "OrderRiskRecord_shop_clientIpHash_orderCreatedAt_idx"
ON "OrderRiskRecord"("shop", "clientIpHash", "orderCreatedAt");

ALTER TABLE "OrderRiskRecord"
DROP COLUMN "shippingCountryCode",
DROP COLUMN "shippingRegionCode",
DROP COLUMN "shippingCity";
