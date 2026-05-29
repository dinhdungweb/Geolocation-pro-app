CREATE INDEX IF NOT EXISTS "VisitorLog_timestamp_idx"
ON "VisitorLog"("timestamp");

CREATE INDEX IF NOT EXISTS "BillableUsageEvent_createdAt_idx"
ON "BillableUsageEvent"("createdAt");

CREATE INDEX IF NOT EXISTS "BillableUsageActionEvent_createdAt_idx"
ON "BillableUsageActionEvent"("createdAt");
