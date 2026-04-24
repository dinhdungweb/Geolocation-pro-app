import prisma from "../db.server";

// Retention periods
const LOG_RETENTION_DAYS = 30;
const BILLABLE_EVENT_RETENTION_DAYS = 30;

// In-memory tracker to avoid running cleanup too frequently
// Only runs once per server process per day
let lastCleanupDate = "";

/**
 * Lazy cleanup: delete old VisitorLogs and BillableUsageEvents.
 * Runs at most once per day per server process to avoid performance impact.
 * Called from layout loader (app.tsx) on every admin page load.
 */
export async function cleanupOldLogs() {
    const today = new Date().toISOString().slice(0, 10); // "2026-02-27"

    // Skip if already ran today
    if (lastCleanupDate === today) return;

    try {
        const logCutoff = new Date();
        logCutoff.setDate(logCutoff.getDate() - LOG_RETENTION_DAYS);

        const billableCutoff = new Date();
        billableCutoff.setDate(billableCutoff.getDate() - BILLABLE_EVENT_RETENTION_DAYS);

        const [logResult, billableResult] = await Promise.all([
            prisma.visitorLog.deleteMany({
                where: { timestamp: { lt: logCutoff } },
            }),
            prisma.billableUsageEvent.deleteMany({
                where: { createdAt: { lt: billableCutoff } },
            }),
        ]);

        lastCleanupDate = today;

        if (logResult.count > 0) {
            console.log(`[Cleanup] Deleted ${logResult.count} visitor logs older than ${LOG_RETENTION_DAYS} days`);
        }
        if (billableResult.count > 0) {
            console.log(`[Cleanup] Deleted ${billableResult.count} billable events older than ${BILLABLE_EVENT_RETENTION_DAYS} days`);
        }
    } catch (error) {
        console.error("[Cleanup] Failed to delete old records:", error);
        // Don't block the request — cleanup is best-effort
    }
}
