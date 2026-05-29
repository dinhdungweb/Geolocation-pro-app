CREATE INDEX IF NOT EXISTS "VisitorLog_shop_action_timestamp_idx"
ON "VisitorLog"("shop", "action", "timestamp");

CREATE INDEX IF NOT EXISTS "VisitorLog_shop_countryCode_timestamp_idx"
ON "VisitorLog"("shop", "countryCode", "timestamp");
