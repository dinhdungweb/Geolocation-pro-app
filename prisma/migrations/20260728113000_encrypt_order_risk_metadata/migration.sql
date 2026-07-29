ALTER TABLE "OrderRiskRecord"
ADD COLUMN "legacyOrderIdEncrypted" TEXT,
ADD COLUMN "orderNameHash" TEXT,
ADD COLUMN "totalAmountEncrypted" TEXT;
