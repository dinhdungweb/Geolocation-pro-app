CREATE TABLE IF NOT EXISTS "StorefrontAnalyticsEventQueue" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontAnalyticsEventQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StorefrontAnalyticsEventQueue_status_nextAttemptAt_createdAt_idx"
ON "StorefrontAnalyticsEventQueue"("status", "nextAttemptAt", "createdAt");

CREATE INDEX IF NOT EXISTS "StorefrontAnalyticsEventQueue_status_lockedAt_idx"
ON "StorefrontAnalyticsEventQueue"("status", "lockedAt");

CREATE INDEX IF NOT EXISTS "StorefrontAnalyticsEventQueue_shop_createdAt_idx"
ON "StorefrontAnalyticsEventQueue"("shop", "createdAt");

CREATE INDEX IF NOT EXISTS "StorefrontAnalyticsEventQueue_createdAt_idx"
ON "StorefrontAnalyticsEventQueue"("createdAt");
