import prisma from "../db.server";

// Retention period: 30 days
const LOG_RETENTION_DAYS = 30;

// In-memory tracker to avoid running cleanup too frequently
// Only runs once per server process per day
let lastCleanupDate = "";

/**
 * Lazy cleanup: delete old VisitorLogs older than LOG_RETENTION_DAYS.
 * Runs at most once per day per server process to avoid performance impact.
 * Called from layout loader (app.tsx) on every admin page load.
 */
export async function cleanupOldLogs() {
    const today = new Date().toISOString().slice(0, 10); // "2026-02-27"

    // Skip if already ran today
    if (lastCleanupDate === today) return;

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

        const result = await prisma.visitorLog.deleteMany({
            where: {
                timestamp: { lt: cutoffDate },
            },
        });

        lastCleanupDate = today;

        if (result.count > 0) {
            console.log(`[Cleanup] Deleted ${result.count} visitor logs older than ${LOG_RETENTION_DAYS} days`);
        }
    } catch (error) {
        console.error("[Cleanup] Failed to delete old logs:", error);
        // Don't block the request — cleanup is best-effort
    }
}
