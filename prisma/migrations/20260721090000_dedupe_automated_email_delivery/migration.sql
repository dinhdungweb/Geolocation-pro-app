ALTER TABLE "AdminEmailLog" ADD COLUMN "deliveryKey" TEXT;

CREATE UNIQUE INDEX "AdminEmailLog_deliveryKey_key" ON "AdminEmailLog"("deliveryKey");
