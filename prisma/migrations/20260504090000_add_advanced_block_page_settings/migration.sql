ALTER TABLE "Settings"
ADD COLUMN "blockedLogoUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "blockedBgColor" TEXT NOT NULL DEFAULT '#111827',
ADD COLUMN "blockedTextColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN "blockedAccentColor" TEXT NOT NULL DEFAULT '#2563eb',
ADD COLUMN "blockedSupportText" TEXT NOT NULL DEFAULT 'Contact support',
ADD COLUMN "blockedSupportUrl" TEXT NOT NULL DEFAULT '';
