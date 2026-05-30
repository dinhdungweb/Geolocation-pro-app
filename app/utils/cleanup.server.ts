import prisma from "../db.server";

// Retention periods
const LOG_RETENTION_DAYS = 30;
const BILLABLE_EVENT_RETENTION_DAYS = 62; // Must exceed max billing period (~30d) + buffer
const FAILED_ANALYTICS_QUEUE_RETENTION_DAYS = 7;
const DELETE_BATCH_SIZE = Number.parseInt(process.env.CLEANUP_DELETE_BATCH_SIZE || "10000", 10);
const MAX_BATCHES_PER_RUN = Number.parseInt(process.env.CLEANUP_MAX_BATCHES_PER_RUN || "50", 10);
const SHOP_CLEANUP_MAX_JOBS_PER_RUN = Number.parseInt(process.env.SHOP_CLEANUP_MAX_JOBS_PER_RUN || "5", 10);
const SHOP_CLEANUP_LOCK_STALE_MINUTES = Number.parseInt(process.env.SHOP_CLEANUP_LOCK_STALE_MINUTES || "15", 10);
const SHOP_CLEANUP_MAX_ATTEMPTS = Number.parseInt(process.env.SHOP_CLEANUP_MAX_ATTEMPTS || "5", 10);

export type ShopCleanupReason = "app_uninstalled" | "shop_redact";

function deleteBatchSize() {
    return Number.isFinite(DELETE_BATCH_SIZE) && DELETE_BATCH_SIZE > 0 ? DELETE_BATCH_SIZE : 10_000;
}

function maxBatchesPerRun() {
    return Number.isFinite(MAX_BATCHES_PER_RUN) && MAX_BATCHES_PER_RUN > 0 ? MAX_BATCHES_PER_RUN : 50;
}

function maxCleanupJobsPerRun() {
    return Number.isFinite(SHOP_CLEANUP_MAX_JOBS_PER_RUN) && SHOP_CLEANUP_MAX_JOBS_PER_RUN > 0
        ? SHOP_CLEANUP_MAX_JOBS_PER_RUN
        : 5;
}

function staleCleanupLockCutoff() {
    const minutes = Number.isFinite(SHOP_CLEANUP_LOCK_STALE_MINUTES) && SHOP_CLEANUP_LOCK_STALE_MINUTES > 0
        ? SHOP_CLEANUP_LOCK_STALE_MINUTES
        : 15;
    return new Date(Date.now() - minutes * 60 * 1000);
}

function maxCleanupAttempts() {
    return Number.isFinite(SHOP_CLEANUP_MAX_ATTEMPTS) && SHOP_CLEANUP_MAX_ATTEMPTS > 0
        ? SHOP_CLEANUP_MAX_ATTEMPTS
        : 5;
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

async function deleteShopVisitorLogBatch(shop: string) {
    return prisma.$executeRaw`
        DELETE FROM "VisitorLog"
        WHERE "id" IN (
            SELECT "id"
            FROM "VisitorLog"
            WHERE "shop" = ${shop}
            ORDER BY "timestamp" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteShopBillableUsageEventBatch(shop: string) {
    return prisma.$executeRaw`
        DELETE FROM "BillableUsageEvent"
        WHERE "id" IN (
            SELECT "id"
            FROM "BillableUsageEvent"
            WHERE "shop" = ${shop}
            ORDER BY "createdAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteShopBillableUsageActionEventBatch(shop: string) {
    return prisma.$executeRaw`
        DELETE FROM "BillableUsageActionEvent"
        WHERE "id" IN (
            SELECT "id"
            FROM "BillableUsageActionEvent"
            WHERE "shop" = ${shop}
            ORDER BY "createdAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteShopStorefrontAnalyticsQueueBatch(shop: string) {
    return prisma.$executeRaw`
        DELETE FROM "StorefrontAnalyticsEventQueue"
        WHERE "id" IN (
            SELECT "id"
            FROM "StorefrontAnalyticsEventQueue"
            WHERE "shop" = ${shop}
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

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export async function enqueueShopCleanupJob(shop: string, reason: ShopCleanupReason) {
    await prisma.shopCleanupJob.upsert({
        where: {
            shop_reason: {
                shop,
                reason,
            },
        },
        update: {
            status: "pending",
            attempts: 0,
            lockedAt: null,
            lastError: null,
            completedAt: null,
        },
        create: {
            shop,
            reason,
        },
    });
}

async function cleanupShopData(shop: string) {
    await prisma.session.deleteMany({ where: { shop } });
    await prisma.settings.deleteMany({ where: { shop } });
    await prisma.redirectRule.deleteMany({ where: { shop } });
    await prisma.analyticsCountry.deleteMany({ where: { shop } });
    await prisma.analyticsRule.deleteMany({ where: { shop } });
    await prisma.monthlyUsage.deleteMany({ where: { shop } });
    await prisma.usageChargeAttempt.deleteMany({ where: { shop } });

    const deletedBillableEvents = await deleteInBatches(() => deleteShopBillableUsageEventBatch(shop));
    const deletedBillableActionEvents = await deleteInBatches(() => deleteShopBillableUsageActionEventBatch(shop));
    const deletedVisitorLogs = await deleteInBatches(() => deleteShopVisitorLogBatch(shop));
    const deletedAnalyticsQueue = await deleteInBatches(() => deleteShopStorefrontAnalyticsQueueBatch(shop));

    await prisma.adminEmailLog.deleteMany({ where: { shop } });
    await prisma.automation.deleteMany({ where: { shop } });
    await prisma.emailTemplate.deleteMany({ where: { shop } });
    await prisma.campaign.deleteMany({ where: { shop } });
    await prisma.emailBlacklist.deleteMany({ where: { shop } });

    console.log(
        `[ShopCleanup] Deleted data for ${shop}: visitorLogs=${deletedVisitorLogs}, billableEvents=${deletedBillableEvents}, billableActionEvents=${deletedBillableActionEvents}, analyticsQueue=${deletedAnalyticsQueue}`,
    );
}

export async function processPendingShopCleanupJobs() {
    const jobs = await prisma.shopCleanupJob.findMany({
        where: {
            status: { in: ["pending", "failed"] },
            attempts: { lt: maxCleanupAttempts() },
            OR: [
                { lockedAt: null },
                { lockedAt: { lt: staleCleanupLockCutoff() } },
            ],
        },
        orderBy: { createdAt: "asc" },
        take: maxCleanupJobsPerRun(),
    });

    for (const job of jobs) {
        const locked = await prisma.shopCleanupJob.updateMany({
            where: {
                id: job.id,
                status: { in: ["pending", "failed"] },
                attempts: { lt: maxCleanupAttempts() },
                OR: [
                    { lockedAt: null },
                    { lockedAt: { lt: staleCleanupLockCutoff() } },
                ],
            },
            data: {
                status: "running",
                lockedAt: new Date(),
                attempts: { increment: 1 },
                lastError: null,
            },
        });

        if (locked.count === 0) continue;

        try {
            console.log(`[ShopCleanup] Processing ${job.reason} cleanup for ${job.shop}`);
            await cleanupShopData(job.shop);
            await prisma.shopCleanupJob.update({
                where: { id: job.id },
                data: {
                    status: "completed",
                    lockedAt: null,
                    lastError: null,
                    completedAt: new Date(),
                },
            });
        } catch (error) {
            const message = errorMessage(error).slice(0, 2000);
            console.error(`[ShopCleanup] Failed for ${job.shop}:`, error);
            await prisma.shopCleanupJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    lockedAt: null,
                    lastError: message,
                },
            });
        }
    }
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
