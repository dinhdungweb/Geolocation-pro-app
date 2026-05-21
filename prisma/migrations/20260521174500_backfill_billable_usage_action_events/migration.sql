INSERT INTO "BillableUsageActionEvent" (
    "id",
    "shop",
    "yearMonth",
    "billingPeriodKey",
    "eventKey",
    "action",
    "createdAt"
)
SELECT
    CONCAT('legacy:', MD5("eventKey" || ':' || "action")),
    "shop",
    "yearMonth",
    "billingPeriodKey",
    "eventKey",
    "action",
    "createdAt"
FROM "BillableUsageEvent"
ON CONFLICT ("eventKey", "action") DO NOTHING;
