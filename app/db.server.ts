import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

// Initialize background tasks globally
if (process.env.NODE_ENV !== "test") {
  // Pre-warm MaxMind GeoIP reader so the first proxy request doesn't block
  import("./utils/maxmind.server")
    .then(({ preloadReader }) => preloadReader())
    .catch((error) => console.error("[Runtime] Failed to preload MaxMind:", error));

  // Initialize In-App Cron
  if (process.env.DISABLE_IN_APP_CRON !== "true") {
    import("./utils/usage-cron.server")
      .then(({ initUsageCron }) => initUsageCron())
      .catch((error) => console.error("[Runtime] Failed to initialize in-app cron:", error));
  }
}

export default prisma;
