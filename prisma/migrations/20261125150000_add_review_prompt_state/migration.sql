-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "reviewPromptStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "reviewPromptSnoozedUntil" TIMESTAMP(3),
ADD COLUMN "reviewRequestedMilestones" TEXT[] DEFAULT ARRAY[]::TEXT[];
