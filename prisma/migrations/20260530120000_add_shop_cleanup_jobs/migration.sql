CREATE TABLE IF NOT EXISTS "ShopCleanupJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopCleanupJob_shop_reason_key"
ON "ShopCleanupJob"("shop", "reason");

CREATE INDEX IF NOT EXISTS "ShopCleanupJob_status_lockedAt_createdAt_idx"
ON "ShopCleanupJob"("status", "lockedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "ShopCleanupJob_shop_idx"
ON "ShopCleanupJob"("shop");
