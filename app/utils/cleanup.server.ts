import { Prisma } from "@prisma/client";
import prisma from "../db.server";

// Retention periods
const LOG_RETENTION_DAYS = Number.parseInt(process.env.LOG_RETENTION_DAYS || "7", 10);
const ORDER_RISK_RETENTION_DAYS = Number.parseInt(process.env.ORDER_RISK_RETENTION_DAYS || "60", 10);
const BILLABLE_EVENT_RETENTION_DAYS = Number.parseInt(process.env.BILLABLE_EVENT_RETENTION_DAYS || "35", 10); // Must exceed max billing period (~30d) + buffer
const FAILED_ANALYTICS_QUEUE_RETENTION_DAYS = 7;
// Daily aggregates: merchant UI reads at most 30 days; keep >1 year for admin reporting.
const ANALYTICS_RETENTION_DAYS = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || "400", 10);
// Email log rows back hasSentEmail() dedupe, so they are kept; only the rendered HTML is dropped.
const EMAIL_HTML_RETENTION_DAYS = Number.parseInt(process.env.EMAIL_HTML_RETENTION_DAYS || "90", 10);
// MonthlyUsage / settled UsageChargeAttempt rows are the billing audit trail (~25 months).
const BILLING_RECORD_RETENTION_DAYS = Number.parseInt(process.env.BILLING_RECORD_RETENTION_DAYS || "760", 10);
const FINISHED_SHOP_CLEANUP_JOB_RETENTION_DAYS = 30;
const DELETE_BATCH_SIZE = Number.parseInt(process.env.CLEANUP_DELETE_BATCH_SIZE || "10000", 10);
// Per-table time budget for one retention run. Runs are hourly, so a backlog
// drains over several runs instead of capping throughput at a fixed batch count.
const TABLE_TIME_BUDGET_MS = Number.parseInt(process.env.CLEANUP_TABLE_TIME_BUDGET_MS || "120000", 10);
const SHOP_CLEANUP_MAX_JOBS_PER_RUN = Number.parseInt(process.env.SHOP_CLEANUP_MAX_JOBS_PER_RUN || "5", 10);
const SHOP_CLEANUP_LOCK_STALE_MINUTES = Number.parseInt(process.env.SHOP_CLEANUP_LOCK_STALE_MINUTES || "15", 10);
const SHOP_CLEANUP_MAX_ATTEMPTS = Number.parseInt(process.env.SHOP_CLEANUP_MAX_ATTEMPTS || "5", 10);

export type ShopCleanupReason = "app_uninstalled" | "shop_redact";

function deleteBatchSize() {
    return Number.isFinite(DELETE_BATCH_SIZE) && DELETE_BATCH_SIZE > 0 ? DELETE_BATCH_SIZE : 10_000;
}

function tableTimeBudgetMs() {
    return Number.isFinite(TABLE_TIME_BUDGET_MS) && TABLE_TIME_BUDGET_MS > 0 ? TABLE_TIME_BUDGET_MS : 120_000;
}

function retentionDays(value: number, fallback: number) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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

// Prevents overlapping retention runs (startup run + hourly schedule) in one process.
let retentionCleanupRunning = false;

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

async function deleteOrderRiskRecordBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "OrderRiskRecord"
        WHERE "id" IN (
            SELECT "id"
            FROM "OrderRiskRecord"
            WHERE "orderCreatedAt" < ${cutoff}
            ORDER BY "orderCreatedAt" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteExpiredIpRiskCacheBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "IpRiskCache"
        WHERE "id" IN (
            SELECT "id"
            FROM "IpRiskCache"
            WHERE "expiresAt" < ${cutoff}
            ORDER BY "expiresAt" ASC
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

async function deleteAnalyticsCountryBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "AnalyticsCountry"
        WHERE "id" IN (
            SELECT "id"
            FROM "AnalyticsCountry"
            WHERE "date" < ${cutoff}
            ORDER BY "date" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteAnalyticsRuleBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "AnalyticsRule"
        WHERE "id" IN (
            SELECT "id"
            FROM "AnalyticsRule"
            WHERE "date" < ${cutoff}
            ORDER BY "date" ASC
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function clearAdminEmailHtmlBatch(cutoff: Date) {
    return prisma.$executeRaw`
        UPDATE "AdminEmailLog"
        SET "html" = NULL
        WHERE "id" IN (
            SELECT "id"
            FROM "AdminEmailLog"
            WHERE "createdAt" < ${cutoff}
              AND "html" IS NOT NULL
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteMonthlyUsageBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "MonthlyUsage"
        WHERE "id" IN (
            SELECT "id"
            FROM "MonthlyUsage"
            WHERE "updatedAt" < ${cutoff}
            LIMIT ${deleteBatchSize()}
        )
    `;
}

// Only settled attempts; pending / shopify_charged / db_update_failed rows still
// need reconciliation and are never removed automatically.
async function deleteSettledUsageChargeAttemptBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "UsageChargeAttempt"
        WHERE "id" IN (
            SELECT "id"
            FROM "UsageChargeAttempt"
            WHERE "createdAt" < ${cutoff}
              AND "status" IN ('succeeded', 'capped', 'failed')
            LIMIT ${deleteBatchSize()}
        )
    `;
}

async function deleteFinishedShopCleanupJobBatch(cutoff: Date) {
    return prisma.$executeRaw`
        DELETE FROM "ShopCleanupJob"
        WHERE "id" IN (
            SELECT "id"
            FROM "ShopCleanupJob"
            WHERE "status" IN ('completed', 'cancelled')
              AND "updatedAt" < ${cutoff}
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

// Runs batches until one comes back short (nothing left) or the time budget is
// spent. Without a budget it runs to completion, which shop cleanup relies on so
// a large shop is never marked "completed" with rows left behind.
async function deleteInBatches(deleteBatch: () => Promise<number>, budgetMs = Infinity) {
    const deadline = Date.now() + budgetMs;
    let total = 0;
    let deleted: number;

    do {
        deleted = await deleteBatch();
        total += deleted;
    } while (deleted >= deleteBatchSize() && Date.now() < deadline);

    return total;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export async function enqueueShopCleanupJob(shop: string, reason: ShopCleanupReason) {
    try {
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
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            await prisma.shopCleanupJob.updateMany({
                where: { shop, reason },
                data: {
                    status: "pending",
                    attempts: 0,
                    lockedAt: null,
                    lastError: null,
                    completedAt: null,
                },
            });
            return;
        }

        throw error;
    }
}

class ShopCleanupAbortedError extends Error {}

// The uninstall webhook deletes every session for the shop before the job runs,
// so a session existing now (or the job no longer being "running") means the
// merchant reinstalled. Deleting at that point would wipe the new install.
async function assertShopStillUninstalled(jobId: string, shop: string) {
    const [job, sessionCount] = await Promise.all([
        prisma.shopCleanupJob.findUnique({ where: { id: jobId }, select: { status: true } }),
        prisma.session.count({ where: { shop } }),
    ]);

    if (job?.status !== "running" || sessionCount > 0) {
        throw new ShopCleanupAbortedError(
            `Shop ${shop} was reinstalled (job=${job?.status ?? "missing"}, sessions=${sessionCount})`,
        );
    }
}

async function cleanupShopData(jobId: string, shop: string, reason: ShopCleanupReason) {
    if (reason === "app_uninstalled") {
        // Sessions were already removed by the webhook; never delete them here,
        // they can only belong to a reinstall.
        await assertShopStillUninstalled(jobId, shop);
    } else {
        await prisma.session.deleteMany({ where: { shop } });
    }
    await prisma.settings.deleteMany({ where: { shop } });
    await prisma.redirectRule.deleteMany({ where: { shop } });
    await prisma.analyticsCountry.deleteMany({ where: { shop } });
    await prisma.analyticsRule.deleteMany({ where: { shop } });
    await prisma.monthlyUsage.deleteMany({ where: { shop } });
    await prisma.usageChargeAttempt.deleteMany({ where: { shop } });
    await prisma.orderRiskRecord.deleteMany({ where: { shop } });

    if (reason === "app_uninstalled") {
        // The batched deletes below can take a while; re-check before them.
        await assertShopStillUninstalled(jobId, shop);
    }

    const deletedBillableEvents = await deleteInBatches(() => deleteShopBillableUsageEventBatch(shop));
    const deletedBillableActionEvents = await deleteInBatches(() => deleteShopBillableUsageActionEventBatch(shop));
    const deletedVisitorLogs = await deleteInBatches(() => deleteShopVisitorLogBatch(shop));
    const deletedAnalyticsQueue = await deleteInBatches(() => deleteShopStorefrontAnalyticsQueueBatch(shop));

    if (reason === "shop_redact") {
        await prisma.adminEmailLog.deleteMany({ where: { shop } });
        await prisma.gdprDataRequest.deleteMany({ where: { shop } });
    }
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
            await cleanupShopData(job.id, job.shop, job.reason as ShopCleanupReason);
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
            if (error instanceof ShopCleanupAbortedError) {
                console.log(`[ShopCleanup] Cancelled ${job.reason} cleanup for ${job.shop}: ${error.message}`);
                await prisma.shopCleanupJob.update({
                    where: { id: job.id },
                    data: {
                        status: "cancelled",
                        lockedAt: null,
                        lastError: error.message.slice(0, 2000),
                    },
                });
                continue;
            }


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

type RetentionTask = {
    label: string;
    run: (budgetMs: number) => Promise<number>;
};

function retentionTasks(): RetentionTask[] {
    const logCutoff = daysAgo(LOG_RETENTION_DAYS);
    const billableCutoff = daysAgo(BILLABLE_EVENT_RETENTION_DAYS);
    const orderRiskCutoff = daysAgo(ORDER_RISK_RETENTION_DAYS);
    const failedQueueCutoff = daysAgo(FAILED_ANALYTICS_QUEUE_RETENTION_DAYS);
    const analyticsCutoff = daysAgo(retentionDays(ANALYTICS_RETENTION_DAYS, 400));
    const emailHtmlCutoff = daysAgo(retentionDays(EMAIL_HTML_RETENTION_DAYS, 90));
    const billingRecordCutoff = daysAgo(retentionDays(BILLING_RECORD_RETENTION_DAYS, 760));
    const finishedJobCutoff = daysAgo(FINISHED_SHOP_CLEANUP_JOB_RETENTION_DAYS);
    const now = new Date();

    return [
        { label: `visitor logs older than ${LOG_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteVisitorLogBatch(logCutoff), b) },
        { label: `billable events older than ${BILLABLE_EVENT_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteBillableUsageEventBatch(billableCutoff), b) },
        { label: `billable action events older than ${BILLABLE_EVENT_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteBillableUsageActionEventBatch(billableCutoff), b) },
        { label: `order risk records older than ${ORDER_RISK_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteOrderRiskRecordBatch(orderRiskCutoff), b) },
        { label: "expired IP risk cache records", run: (b) => deleteInBatches(() => deleteExpiredIpRiskCacheBatch(now), b) },
        { label: `failed analytics queue events older than ${FAILED_ANALYTICS_QUEUE_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteFailedAnalyticsQueueBatch(failedQueueCutoff), b) },
        { label: "country analytics rows past retention", run: (b) => deleteInBatches(() => deleteAnalyticsCountryBatch(analyticsCutoff), b) },
        { label: "rule analytics rows past retention", run: (b) => deleteInBatches(() => deleteAnalyticsRuleBatch(analyticsCutoff), b) },
        { label: "admin email HTML bodies past retention (rows kept)", run: (b) => deleteInBatches(() => clearAdminEmailHtmlBatch(emailHtmlCutoff), b) },
        { label: "monthly usage rows past billing retention", run: (b) => deleteInBatches(() => deleteMonthlyUsageBatch(billingRecordCutoff), b) },
        { label: "settled usage charge attempts past billing retention", run: (b) => deleteInBatches(() => deleteSettledUsageChargeAttemptBatch(billingRecordCutoff), b) },
        { label: `finished shop cleanup jobs older than ${FINISHED_SHOP_CLEANUP_JOB_RETENTION_DAYS} days`, run: (b) => deleteInBatches(() => deleteFinishedShopCleanupJobBatch(finishedJobCutoff), b) },
    ];
}

/**
 * Applies retention to every growing table. Scheduled hourly: tables are
 * processed one at a time (no competing bulk deletes) and each gets a time
 * budget, so a large backlog drains across runs instead of being capped.
 */
export async function cleanupOldLogs() {
    if (retentionCleanupRunning) return;
    retentionCleanupRunning = true;

    try {
        for (const task of retentionTasks()) {
            try {
                const affected = await task.run(tableTimeBudgetMs());
                if (affected > 0) {
                    console.log(`[Cleanup] Processed ${affected} ${task.label}`);
                }
            } catch (error) {
                // Best-effort: one failing table must not stop the others.
                console.error(`[Cleanup] Failed to clean ${task.label}:`, error);
            }
        }
    } finally {
        retentionCleanupRunning = false;
    }
}
