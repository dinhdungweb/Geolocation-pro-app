ALTER TABLE "VisitorLog"
ADD COLUMN "ipHash" TEXT,
ADD COLUMN "ipRiskScore" INTEGER,
ADD COLUMN "ipRiskLevel" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "ipRiskSignals" JSONB,
ADD COLUMN "ipRiskProvider" TEXT,
ADD COLUMN "ipRiskStatus" TEXT NOT NULL DEFAULT 'skipped',
ADD COLUMN "ipRiskCheckedAt" TIMESTAMP(3);

CREATE INDEX "VisitorLog_shop_ipRiskLevel_timestamp_idx"
ON "VisitorLog"("shop", "ipRiskLevel", "timestamp");

CREATE INDEX "VisitorLog_shop_ipHash_timestamp_idx"
ON "VisitorLog"("shop", "ipHash", "timestamp");

CREATE TABLE "IpRiskCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL DEFAULT 'v1',
    "ipHash" TEXT NOT NULL,
    "score" INTEGER,
    "level" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "isProxy" BOOLEAN NOT NULL DEFAULT false,
    "isVpn" BOOLEAN NOT NULL DEFAULT false,
    "isTor" BOOLEAN NOT NULL DEFAULT false,
    "isResidential" BOOLEAN NOT NULL DEFAULT false,
    "isHosting" BOOLEAN NOT NULL DEFAULT false,
    "hasRecentAbuse" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "lastError" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpRiskCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IpRiskCache_provider_providerVersion_ipHash_key"
ON "IpRiskCache"("provider", "providerVersion", "ipHash");

CREATE INDEX "IpRiskCache_expiresAt_idx"
ON "IpRiskCache"("expiresAt");
