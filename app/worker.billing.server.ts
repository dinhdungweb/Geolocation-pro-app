import "dotenv/config";
import { initUsageCron } from "./utils/usage-cron.server";
import { backfillMissingMarketRuleCountries } from "./utils/market-rule-backfill.server";

initUsageCron();
const initialBackfill = setTimeout(() => {
  void backfillMissingMarketRuleCountries();
}, 15_000);
initialBackfill.unref();

const recurringBackfill = setInterval(() => {
  void backfillMissingMarketRuleCountries();
}, 24 * 60 * 60_000);
recurringBackfill.unref();
console.log("[Worker] Billing worker started.");
