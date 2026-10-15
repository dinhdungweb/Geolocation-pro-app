-- Retention deletes AnalyticsCountry/AnalyticsRule rows by "date" across all
-- shops; the existing [shop, date] indexes can't serve that without a shop.
CREATE INDEX IF NOT EXISTS "AnalyticsCountry_date_idx" ON "AnalyticsCountry"("date");
CREATE INDEX IF NOT EXISTS "AnalyticsRule_date_idx" ON "AnalyticsRule"("date");
