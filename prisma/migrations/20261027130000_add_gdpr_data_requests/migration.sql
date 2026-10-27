CREATE TABLE "GdprDataRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT,
    "ordersRequested" TEXT NOT NULL DEFAULT '',
    "exportEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GdprDataRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GdprDataRequest_shop_idx" ON "GdprDataRequest"("shop");
CREATE INDEX "GdprDataRequest_status_createdAt_idx" ON "GdprDataRequest"("status", "createdAt");
