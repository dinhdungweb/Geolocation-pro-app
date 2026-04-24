CREATE TABLE IF NOT EXISTS "BillableUsageEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "ruleId" TEXT,
    "action" TEXT NOT NULL,
    "countryCode" TEXT,
    "path" TEXT,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillableUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillableUsageEvent_eventKey_key" ON "BillableUsageEvent"("eventKey");
CREATE INDEX IF NOT EXISTS "BillableUsageEvent_shop_yearMonth_idx" ON "BillableUsageEvent"("shop", "yearMonth");
CREATE INDEX IF NOT EXISTS "BillableUsageEvent_shop_createdAt_idx" ON "BillableUsageEvent"("shop", "createdAt");
