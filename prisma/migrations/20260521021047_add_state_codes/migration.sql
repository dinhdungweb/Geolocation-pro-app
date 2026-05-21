-- AlterTable
ALTER TABLE "JobLock" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RedirectRule" ADD COLUMN     "stateCodes" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "blockedBgColor" SET DEFAULT '#f8fafc',
ALTER COLUMN "blockedTextColor" SET DEFAULT '#0f172a';

-- AlterTable
ALTER TABLE "UsageChargeAttempt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VisitorLog" ADD COLUMN     "regionCode" TEXT;
