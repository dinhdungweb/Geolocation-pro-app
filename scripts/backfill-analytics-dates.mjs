import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

const positionalArgs = args.filter((value) => !value.startsWith("--"));

const apply =
  args.includes("--apply") ||
  positionalArgs.includes("apply") ||
  process.env.npm_config_apply === "true";
const allShops =
  args.includes("--all-shops") || process.env.npm_config_all_shops === "true";
const shop =
  option("--shop") || process.env.npm_config_shop || positionalArgs[1] || null;
const legacyTimeZone =
  option("--legacy-time-zone") ||
  process.env.npm_config_legacy_time_zone ||
  positionalArgs[0] ||
  null;
const requestedBatchSize = Number.parseInt(
  option("--batch-size") || process.env.npm_config_batch_size || "100",
  10,
);
const batchSize = Number.isFinite(requestedBatchSize)
  ? Math.min(500, Math.max(1, requestedBatchSize))
  : 100;

if (!legacyTimeZone || !validTimeZone(legacyTimeZone)) {
  throw new Error(
    "Provide the old server IANA timezone, for example --legacy-time-zone Asia/Ho_Chi_Minh",
  );
}

if (apply && !shop && !allShops) {
  throw new Error("Use --shop <domain> or explicitly confirm --all-shops with --apply");
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function canonicalDate(date) {
  return new Date(`${dateKeyInTimeZone(date, legacyTimeZone)}T00:00:00.000Z`);
}

async function legacyCountryRows(take) {
  return prisma.$queryRaw(Prisma.sql`
    SELECT *
    FROM "AnalyticsCountry"
    WHERE "date" <> date_trunc('day', "date")
      ${shop ? Prisma.sql`AND "shop" = ${shop}` : Prisma.empty}
    ORDER BY "date" ASC, "id" ASC
    LIMIT ${take}
  `);
}

async function legacyRuleRows(take) {
  return prisma.$queryRaw(Prisma.sql`
    SELECT *
    FROM "AnalyticsRule"
    WHERE "date" <> date_trunc('day', "date")
      ${shop ? Prisma.sql`AND "shop" = ${shop}` : Prisma.empty}
    ORDER BY "date" ASC, "id" ASC
    LIMIT ${take}
  `);
}

async function moveCountryRow(row) {
  const date = canonicalDate(row.date);
  await prisma.$transaction(async (tx) => {
    await tx.analyticsCountry.upsert({
      where: {
        shop_date_countryCode: {
          shop: row.shop,
          date,
          countryCode: row.countryCode,
        },
      },
      update: {
        visitors: { increment: row.visitors },
        popupShown: { increment: row.popupShown },
        redirected: { increment: row.redirected },
        blocked: { increment: row.blocked },
      },
      create: {
        shop: row.shop,
        date,
        countryCode: row.countryCode,
        visitors: row.visitors,
        popupShown: row.popupShown,
        redirected: row.redirected,
        blocked: row.blocked,
      },
    });
    await tx.analyticsCountry.delete({ where: { id: row.id } });
  });
}

async function moveRuleRow(row) {
  const date = canonicalDate(row.date);
  await prisma.$transaction(async (tx) => {
    await tx.analyticsRule.upsert({
      where: {
        shop_date_ruleId: {
          shop: row.shop,
          date,
          ruleId: row.ruleId,
        },
      },
      update: {
        ruleName: row.ruleName,
        seen: { increment: row.seen },
        clickedYes: { increment: row.clickedYes },
        clickedNo: { increment: row.clickedNo },
        dismissed: { increment: row.dismissed },
        autoRedirected: { increment: row.autoRedirected },
        blocked: { increment: row.blocked },
      },
      create: {
        shop: row.shop,
        date,
        ruleId: row.ruleId,
        ruleName: row.ruleName,
        seen: row.seen,
        clickedYes: row.clickedYes,
        clickedNo: row.clickedNo,
        dismissed: row.dismissed,
        autoRedirected: row.autoRedirected,
        blocked: row.blocked,
      },
    });
    await tx.analyticsRule.delete({ where: { id: row.id } });
  });
}

async function runBackfill(label, readRows, moveRow) {
  let processed = 0;
  while (true) {
    const rows = await readRows(batchSize);
    if (rows.length === 0) break;

    if (!apply) {
      return {
        candidatesInSample: rows.length,
        sample: rows.slice(0, 10).map((row) => ({
          shop: row.shop,
          from: row.date.toISOString(),
          to: canonicalDate(row.date).toISOString(),
        })),
      };
    }

    for (const row of rows) {
      await moveRow(row);
      processed += 1;
    }
    console.log(`${label}: moved ${processed} rows`);
  }
  return { processed };
}

try {
  const countries = await runBackfill("AnalyticsCountry", legacyCountryRows, moveCountryRow);
  const rules = await runBackfill("AnalyticsRule", legacyRuleRows, moveRuleRow);
  console.log(JSON.stringify({ apply, legacyTimeZone, shop: shop || "all", countries, rules }, null, 2));
  if (!apply) {
    console.log("Dry run only. Re-run with --apply after reviewing the sample.");
  }
} finally {
  await prisma.$disconnect();
}
