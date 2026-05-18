import "dotenv/config";
import { initUsageCron } from "./utils/usage-cron.server";

initUsageCron();
console.log("[Worker] Billing worker started.");
