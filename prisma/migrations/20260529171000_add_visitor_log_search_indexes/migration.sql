DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_trgm'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_trgm';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "VisitorLog_ipAddress_trgm_idx"
      ON "VisitorLog" USING GIN ("ipAddress" gin_trgm_ops)';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "VisitorLog_regionName_trgm_idx"
      ON "VisitorLog" USING GIN ("regionName" gin_trgm_ops)';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "VisitorLog_ruleName_trgm_idx"
      ON "VisitorLog" USING GIN ("ruleName" gin_trgm_ops)';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "VisitorLog_path_trgm_idx"
      ON "VisitorLog" USING GIN ("path" gin_trgm_ops)';

    EXECUTE 'CREATE INDEX IF NOT EXISTS "VisitorLog_userAgent_trgm_idx"
      ON "VisitorLog" USING GIN ("userAgent" gin_trgm_ops)';
  END IF;
END $$;
