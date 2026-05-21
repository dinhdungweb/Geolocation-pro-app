CREATE TABLE IF NOT EXISTS "BillableUsageActionEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "billingPeriodKey" TEXT,
    "eventKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillableUsageActionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillableUsageActionEvent_eventKey_action_key" ON "BillableUsageActionEvent"("eventKey", "action");
CREATE INDEX IF NOT EXISTS "BillableUsageActionEvent_shop_yearMonth_idx" ON "BillableUsageActionEvent"("shop", "yearMonth");
CREATE INDEX IF NOT EXISTS "BillableUsageActionEvent_shop_billingPeriodKey_idx" ON "BillableUsageActionEvent"("shop", "billingPeriodKey");
CREATE INDEX IF NOT EXISTS "BillableUsageActionEvent_shop_createdAt_idx" ON "BillableUsageActionEvent"("shop", "createdAt");
