-- The trigram indexes from 20260529171000_add_visitor_log_search_indexes were
-- never declared in schema.prisma (so `db push` / `migrate dev` treat them as
-- drift) and cannot serve the only text search over VisitorLog: the logs search
-- ORs ten columns and five of them have no trigram index, so Postgres can't
-- build a BitmapOr and falls back to the [shop, timestamp] index plus a filter.
-- They only add write cost to the hottest insert path, so drop them.
DROP INDEX IF EXISTS "VisitorLog_ipAddress_trgm_idx";
DROP INDEX IF EXISTS "VisitorLog_regionName_trgm_idx";
DROP INDEX IF EXISTS "VisitorLog_ruleName_trgm_idx";
DROP INDEX IF EXISTS "VisitorLog_path_trgm_idx";
DROP INDEX IF EXISTS "VisitorLog_userAgent_trgm_idx";
