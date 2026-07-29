CREATE TABLE "OrderRiskRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "legacyOrderId" TEXT,
    "orderName" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "financialStatus" TEXT,
    "fulfillmentStatus" TEXT,
    "clientIp" TEXT,
    "ipCountryCode" TEXT,
    "ipRegionCode" TEXT,
    "ipRegionName" TEXT,
    "ipCity" TEXT,
    "shippingCountryCode" TEXT,
    "shippingRegionCode" TEXT,
    "shippingCity" TEXT,
    "lastVisitorAction" TEXT,
    "lastRuleName" TEXT,
    "shopifyRiskLevel" TEXT NOT NULL DEFAULT 'NONE',
    "shopifyRecommendation" TEXT NOT NULL DEFAULT 'NONE',
    "appRiskLevel" TEXT NOT NULL DEFAULT 'NONE',
    "appRiskScore" INTEGER NOT NULL DEFAULT 0,
    "riskSignals" JSONB NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'open',
    "assessmentFingerprint" TEXT,
    "assessmentSyncedAt" TIMESTAMP(3),
    "assessmentError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRiskRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderRiskRecord_shop_orderGid_key"
ON "OrderRiskRecord"("shop", "orderGid");

CREATE INDEX "OrderRiskRecord_shop_orderCreatedAt_idx"
ON "OrderRiskRecord"("shop", "orderCreatedAt");

CREATE INDEX "OrderRiskRecord_shop_appRiskLevel_orderCreatedAt_idx"
ON "OrderRiskRecord"("shop", "appRiskLevel", "orderCreatedAt");

CREATE INDEX "OrderRiskRecord_shop_reviewStatus_orderCreatedAt_idx"
ON "OrderRiskRecord"("shop", "reviewStatus", "orderCreatedAt");

CREATE INDEX "OrderRiskRecord_shop_clientIp_orderCreatedAt_idx"
ON "OrderRiskRecord"("shop", "clientIp", "orderCreatedAt");
