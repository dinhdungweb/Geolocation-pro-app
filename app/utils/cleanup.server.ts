import prisma from "../db.server";

// Retention periods
const LOG_RETENTION_DAYS = 30;
const BILLABLE_EVENT_RETENTION_DAYS = 62; // Must exceed max billing period (~30d) + buffer
const FAILED_ANALYTICS_QUEUE_RETENTION_DAYS = 7;
const DELETE_BATCH_SIZE = Number.parseInt(process.env.CLEANUP_DELETE_BATCH_SIZE || "10000", 10);
const MAX_BATCHES_PER_RUN = Number.parseInt(process.env.CLEANUP_MAX_BATCHES_PER_RUN || "50", 10);

function deleteBatchSize() {
    return Number.isFinite(DELETE_BATCH_SIZE) && DELETE_BATCH_SIZE > 0 ? DELETE_BATCH_SIZE : 10_000;
}

function maxBatchesPerRun() {
    return Number.isFinite(MAX_BATCHES_PER_RUN) && MAX_BATCHES_PER_RUN > 0 ? MAX_BATCHES_PER_RUN : 50;
}

// In-memory tracker to avoid running cleanup too frequently
// Only runs once per server process per day, even if startup and schedule overlap.
let lastCleanupDate = "";

async function deleteVisitorLogBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "VisitorLog"
        WHERE "id" IN (
            SELECT "id"
            FROM "VisitorLog"
            WHERE "timestamp" < ${cutoff}
            ORDER BY "timestamp" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteBillableUsageEventBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "BillableUsageEvent"
        WHERE "id" IN (
            SELECT "id"
            FROM "BillableUsageEvent"
            WHERE "createdAt" < ${cutoff}
            ORDER BY "createdAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteBillableUsageActionEventBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "BillableUsageActionEvent"
        WHERE "id" IN (
            SELECT "id"
            FROM "BillableUsageActionEvent"
            WHERE "createdAt" < ${cutoff}
            ORDER BY "createdAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteFailedAnalyticsQueueBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "StorefrontAnalyticsEventQueue"
        WHERE "id" IN (
            SELECT "id"
            FROM "StorefrontAnalyticsEventQueue"
            WHERE "status" = 'failed'
              AND "createdAt" < ${cutoff}
            ORDER BY "createdAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteInBatches(deleteBatch: () => Promise<number>) {
    let total = 0;

    for (let index = 0; index < maxBatchesPerRun(); index++) {
        const deleted = await deleteBatch();
        total += deleted;

        if (deleted < deleteBatchSize()) break;
    }

    return total;
}

/**
 * Deletes old VisitorLogs and BillableUsageEvents.
 * Runs at most once per day per server process to avoid performance impact.
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

        const failedAnalyticsQueueCutoff = new Date();
        failedAnalyticsQueueCutoff.setDate(failedAnalyticsQueueCutoff.getDate() - FAILED_ANALYTICS_QUEUE_RETENTION_DAYS);

        const [deletedLogs, deletedBillableEvents, deletedBillableActionEvents, deletedFailedAnalyticsQueue] = await Promise.all([
            deleteInBatches(() => deleteVisitorLogBatch(logCutoff)),
            deleteInBatches(() => deleteBillableUsageEventBatch(billableCutoff)),
            deleteInBatches(() => deleteBillableUsageActionEventBatch(billableCutoff)),
            deleteInBatches(() => deleteFailedAnalyticsQueueBatch(failedAnalyticsQueueCutoff)),
        ]);

        lastCleanupDate = today;

        if (deletedLogs > 0) {
            console.log(`[Cleanup] Deleted ${deletedLogs} visitor logs older than ${LOG_RETENTION_DAYS} days`);
        }
        if (deletedBillableEvents > 0) {
            console.log(`[Cleanup] Deleted ${deletedBillableEvents} billable events older than ${BILLABLE_EVENT_RETENTION_DAYS} days`);
        }
        if (deletedBillableActionEvents > 0) {
            console.log(`[Cleanup] Deleted ${deletedBillableActionEvents} billable action events older than ${BILLABLE_EVENT_RETENTION_DAYS} days`);
        }
        if (deletedFailedAnalyticsQueue > 0) {
            console.log(`[Cleanup] Deleted ${deletedFailedAnalyticsQueue} failed analytics queue events older than ${FAILED_ANALYTICS_QUEUE_RETENTION_DAYS} days`);
        }
    } catch (error) {
        console.error("[Cleanup] Failed to delete old records:", error);
        // Don't block the request — cleanup is best-effort
    }
}
