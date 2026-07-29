import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  Form,
  data as responseData,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";
import {
  Badge,
  ActionList,
  Banner,
  BlockStack,
  Button,
  Card,
  Icon,
  IndexTable,
  Page,
  Pagination,
  Popover,
  Text,
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  CheckIcon,
  CheckCircleIcon,
  ClipboardChecklistIcon,
  FilterIcon,
  OrderIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";
import { COUNTRY_MAP } from "../utils/countries";
import { getStateName } from "../utils/states";
import {
  hasOrderScope,
  hasWriteOrderScope,
  syncRecentOrderRisks,
} from "../utils/order-risk.server";
import {
  decryptProtectedData,
  hashProtectedData,
} from "../utils/secret-crypto.server";
import { shopifyBoundaryHeaders } from "../utils/shopify-boundary.server";

export { shopifyBoundaryHeaders as headers };

const PAGE_SIZE = 25;
const RISK_WEIGHT: Record<string, number> = {
  NONE: 0,
  PENDING: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
};

function normalizeFilter(value: string | null, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function effectiveRisk(appRisk: string, shopifyRisk: string) {
  return (RISK_WEIGHT[appRisk] || 0) >= (RISK_WEIGHT[shopifyRisk] || 0)
    ? appRisk
    : shopifyRisk;
}

function decryptRiskSignals(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(decryptProtectedData(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function riskWhere(risk: string) {
  if (!["HIGH", "MEDIUM", "LOW", "PENDING", "NONE"].includes(risk)) {
    return {};
  }
  return {
    OR: [{ appRiskLevel: risk }, { shopifyRiskLevel: risk }],
  };
}

async function getOfflineScope(shop: string, fallback?: string | null) {
  const offlineSession = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
    select: { scope: true },
  });
  return offlineSession?.scope || fallback || "";
}

async function getGrantedScopes(
  admin: { graphql: (query: string) => Promise<Response> },
  fallback?: string | null,
) {
  try {
    const response = await admin.graphql(
      `#graphql
        query GeoGrantedAccessScopes {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    );
    const body: any = await response.json();
    const handles = body?.data?.currentAppInstallation?.accessScopes
      ?.map((scope: any) => String(scope?.handle || "").trim())
      .filter(Boolean);

    return Array.isArray(handles) && handles.length > 0
      ? handles.join(",")
      : fallback || "";
  } catch (error) {
    console.error("[OrderRisk] Failed to verify granted scopes:", error);
    return fallback || "";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = normalizeFilter(url.searchParams.get("q"), "");
  const protectedQueryHash = query ? hashProtectedData(query) : "";
  const prefixedOrderQueryHash =
    query && !query.startsWith("#")
      ? hashProtectedData(`#${query}`)
      : protectedQueryHash;
  const risk = normalizeFilter(url.searchParams.get("risk"), "all").toUpperCase();
  const reviewStatus = normalizeFilter(
    url.searchParams.get("status"),
    "all",
  ).toLowerCase();
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;
  const periodStart = new Date();
  periodStart.setUTCDate(periodStart.getUTCDate() - 30);

  const filtersWhere = [
    query
      ? {
          OR: [
            { orderNameHash: protectedQueryHash },
            { orderNameHash: prefixedOrderQueryHash },
            { clientIpHash: protectedQueryHash },
            { lastRuleName: { contains: query, mode: "insensitive" } },
          ],
        }
      : null,
    risk === "ALL" ? null : riskWhere(risk),
  ].filter(Boolean);
  const where: any = {
    shop: session.shop,
    ...(reviewStatus === "all" ? {} : { reviewStatus }),
    ...(filtersWhere.length > 0 ? { AND: filtersWhere } : {}),
  };

  const [
    records,
    total,
    totalRecent,
    highRisk,
    needsReview,
    protectedOrders,
    scope,
  ] = await Promise.all([
    prisma.orderRiskRecord.findMany({
      where,
      orderBy: { orderCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.orderRiskRecord.count({ where }),
    prisma.orderRiskRecord.count({
      where: { shop: session.shop, orderCreatedAt: { gte: periodStart } },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        orderCreatedAt: { gte: periodStart },
        OR: [{ appRiskLevel: "HIGH" }, { shopifyRiskLevel: "HIGH" }],
      },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        reviewStatus: "open",
        OR: [
          { appRiskLevel: { in: ["HIGH", "MEDIUM"] } },
          { shopifyRiskLevel: { in: ["HIGH", "MEDIUM"] } },
        ],
      },
    }),
    prisma.orderRiskRecord.count({
      where: {
        shop: session.shop,
        assessmentSyncedAt: { not: null },
      },
    }),
    getGrantedScopes(
      admin,
      await getOfflineScope(session.shop, session.scope),
    ),
  ]);

  return responseData({
    filters: { page, query, reviewStatus, risk },
    hasOrderAccess: hasOrderScope(scope),
    hasWriteOrderAccess: hasWriteOrderScope(scope),
    metrics: {
      highRisk,
      needsReview,
      protectedOrders,
      totalRecent,
    },
    records: records.map((record) => {
      const ipRegionCode = decryptProtectedData(record.ipRegionCode);
      const storedRegionName = decryptProtectedData(record.ipRegionName);
      const mappedRegionName = ipRegionCode
        ? getStateName(ipRegionCode)
        : "";

      return {
        ...record,
        clientIp: decryptProtectedData(record.clientIp),
        financialStatus: decryptProtectedData(record.financialStatus),
        fulfillmentStatus: decryptProtectedData(record.fulfillmentStatus),
        ipCity: decryptProtectedData(record.ipCity),
        ipCountryCode: decryptProtectedData(record.ipCountryCode),
        ipRegionCode,
        ipRegionName:
          storedRegionName ||
          (mappedRegionName !== ipRegionCode ? mappedRegionName : ""),
        legacyOrderId:
          decryptProtectedData(record.legacyOrderIdEncrypted) ||
          record.legacyOrderId,
        orderName: decryptProtectedData(record.orderName),
        createdAt: record.createdAt.toISOString(),
        orderCreatedAt: record.orderCreatedAt.toISOString(),
        processedAt: record.processedAt?.toISOString() || null,
        riskSignals: decryptRiskSignals(record.riskSignals),
        totalAmount: Number(
          decryptProtectedData(record.totalAmountEncrypted) ||
            record.totalAmount,
        ),
        updatedAt: record.updatedAt.toISOString(),
      };
    }),
    shop: session.shop,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "sync_orders") {
    const offline = await unauthenticated.admin(session.shop);
    const grantedScopes = await getGrantedScopes(
      offline.admin,
      offline.session.scope,
    );
    if (!hasOrderScope(grantedScopes)) {
      return responseData(
        {
          error:
            "Shopify has not issued an access token with Order permission yet. Approve the updated app permissions, reopen the app, then try again.",
        },
        { status: 403 },
      );
    }

    try {
      const result = await syncRecentOrderRisks({
        admin: offline.admin,
        limit: 25,
        publishAssessment: hasWriteOrderScope(grantedScopes),
        shop: session.shop,
      });
      return responseData({
        message: `Synced ${result.synced} of ${result.total} recent orders${
          result.errors.length ? `; ${result.errors.length} failed` : ""
        }.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sync Shopify orders";
      const isPermissionError =
        /access denied.*orders|not approved.*order|permission/i.test(message);

      console.error("[OrderRisk] Recent order sync failed:", error);
      return responseData(
        {
          error: isPermissionError
            ? "Shopify denied access to Orders for the current token. Reapprove the app permissions and reopen the app before syncing."
            : "Recent orders could not be synced. Please try again.",
        },
        { status: isPermissionError ? 403 : 502 },
      );
    }
  }

  if (intent === "set_review_status") {
    const id = String(formData.get("id") || "");
    const reviewStatus =
      String(formData.get("reviewStatus") || "") === "reviewed"
        ? "reviewed"
        : "open";
    const updated = await prisma.orderRiskRecord.updateMany({
      where: { id, shop: session.shop },
      data: { reviewStatus },
    });
    if (updated.count === 0) {
      return responseData({ error: "Order risk record not found." }, { status: 404 });
    }
    return responseData({
      message:
        reviewStatus === "reviewed"
          ? "Order marked as reviewed."
          : "Order returned to the review queue.",
    });
  }

  return responseData({ error: "Unsupported action." }, { status: 400 });
};

function riskTone(level: string) {
  if (level === "HIGH") return "critical" as const;
  if (level === "MEDIUM") return "warning" as const;
  if (level === "LOW") return "info" as const;
  if (level === "PENDING") return "attention" as const;
  return "success" as const;
}

function riskLabel(level: string) {
  if (level === "NONE") return "No risk";
  if (level === "PENDING") return "Pending";
  return `${level.charAt(0)}${level.slice(1).toLowerCase()}`;
}

function formatLocation(record: {
  ipCity: string | null;
  ipCountryCode: string | null;
  ipRegionCode: string | null;
  ipRegionName: string | null;
}) {
  const countryCode = String(record.ipCountryCode || "").toUpperCase();
  const values = [
    record.ipCity,
    record.ipRegionName || record.ipRegionCode,
    COUNTRY_MAP[countryCode] || countryCode,
  ].filter((value): value is string => Boolean(value));
  const uniqueValues = values.filter(
    (value, index) =>
      values.findIndex(
        (candidate) => candidate.toLowerCase() === value.toLowerCase(),
      ) === index,
  );
  return uniqueValues.join(", ") || "Unknown location";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function adminOrderUrl(shop: string, legacyOrderId: string | null) {
  if (!legacyOrderId) return "";
  const shopHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${shopHandle}/orders/${legacyOrderId}`;
}

export default function OrderRiskPage() {
  const {
    filters,
    hasOrderAccess,
    hasWriteOrderAccess,
    metrics,
    records,
    shop,
    total,
    totalPages,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(filters.query);
  const [risk, setRisk] = useState(filters.risk);
  const [reviewStatus, setReviewStatus] = useState(filters.reviewStatus);
  const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
  const [riskPopoverOpen, setRiskPopoverOpen] = useState(false);
  const isSyncing =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "sync_orders";
  const metricsList = [
    {
      label: "Orders · 30 days",
      value: metrics.totalRecent,
      detail: "Orders analyzed in the last 30 days",
      icon: OrderIcon,
      tone: "blue",
    },
    {
      label: "High risk",
      value: metrics.highRisk,
      detail: "Orders requiring attention",
      icon: AlertTriangleIcon,
      tone: "orange",
    },
    {
      label: "Needs review",
      value: metrics.needsReview,
      detail: "Open review queue",
      icon: ClipboardChecklistIcon,
      tone: "purple",
    },
    {
      label: "Assessments published",
      value: metrics.protectedOrders,
      detail: "Risk assessments sent to Shopify",
      icon: ShieldCheckMarkIcon,
      tone: "green",
    },
  ];
  const reviewViews = [
    { label: "All orders", value: "all" },
    { label: "Not reviewed", value: "open" },
    { label: "Reviewed", value: "reviewed" },
  ];
  const riskViews = [
    { label: "All risk levels", value: "ALL" },
    { label: "High", value: "HIGH" },
    { label: "Medium", value: "MEDIUM" },
    { label: "Low", value: "LOW" },
    { label: "Pending", value: "PENDING" },
    { label: "No risk found", value: "NONE" },
  ];
  const selectedReviewLabel =
    reviewViews.find((view) => view.value === reviewStatus)?.label ||
    "All orders";

  useEffect(() => {
    setQuery(filters.query);
    setRisk(filters.risk);
    setReviewStatus(filters.reviewStatus);
  }, [filters.query, filters.reviewStatus, filters.risk]);

  useEffect(() => {
    if (!actionData || !("message" in actionData) || !actionData.message) return;
    shopify.toast.show(actionData.message);
  }, [actionData, shopify]);

  const applyFilters = (next: {
    query?: string;
    risk?: string;
    reviewStatus?: string;
  }) => {
    const params = new URLSearchParams(searchParams);
    const nextQuery = next.query ?? query;
    const nextRisk = next.risk ?? risk;
    const nextReviewStatus = next.reviewStatus ?? reviewStatus;

    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    else params.delete("q");

    if (nextRisk !== "ALL") params.set("risk", nextRisk);
    else params.delete("risk");

    if (nextReviewStatus !== "all") params.set("status", nextReviewStatus);
    else params.delete("status");

    params.delete("page");
    navigate(params.size > 0 ? `?${params.toString()}` : "?");
  };

  const selectReviewView = (value: string) => {
    setReviewStatus(value);
    setReviewPopoverOpen(false);
    applyFilters({ reviewStatus: value });
  };

  const selectRiskView = (value: string) => {
    setRisk(value);
    setRiskPopoverOpen(false);
    applyFilters({ risk: value });
  };

  const paginationUrl = useMemo(
    () => (page: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(page));
      return `?${params.toString()}`;
    },
    [searchParams],
  );

  const rows = records.map((record, index) => {
    const overallRisk = effectiveRisk(
      record.appRiskLevel,
      record.shopifyRiskLevel,
    );
    const signals = record.riskSignals as Array<{
      code?: string;
      label?: string;
      detail?: string;
    }>;
    const orderUrl = adminOrderUrl(shop, record.legacyOrderId);
    const requiresReview =
      overallRisk === "HIGH" || overallRisk === "MEDIUM";

    return (
      <IndexTable.Row id={record.id} key={record.id} position={index}>
        <IndexTable.Cell>
          <div className="order-risk-order">
            {orderUrl ? (
              <a
                className="order-risk-order-link"
                href={orderUrl}
                target="_blank"
                rel="noreferrer"
              >
                {record.orderName}
              </a>
            ) : (
              <Text as="span" fontWeight="semibold">
                {record.orderName}
              </Text>
            )}
            <Text as="span" variant="bodyXs" tone="subdued">
              {formatDate(record.orderCreatedAt)}
            </Text>
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <span className="order-risk-ip">
            {record.clientIp || "Unavailable"}
          </span>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" fontWeight="medium">
              {formatLocation(record)}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {record.totalAmount.toLocaleString(undefined, {
              style: "currency",
              currency: record.currencyCode,
              currencyDisplay: "code",
              maximumFractionDigits: 0,
            })}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Badge tone={riskTone(overallRisk)}>
              {riskLabel(overallRisk)}
            </Badge>
            <Text as="span" variant="bodyXs" tone="subdued">
              Shopify: {riskLabel(record.shopifyRiskLevel)} · Geo:{" "}
              {record.appRiskScore}/100
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {signals.length > 0 ? (
            <div className="order-risk-signals">
              {signals
                .slice(0, 2)
                .map((signal) => signal.label || signal.code)
                .filter(Boolean)
                .join(" · ")}
              {signals.length > 2 ? ` +${signals.length - 2}` : ""}
            </div>
          ) : (
            <span className="order-risk-clear-signal">
              <Icon source={CheckCircleIcon} tone="success" />
              No suspicious signals
            </span>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge
            tone={
              record.reviewStatus === "reviewed"
                ? "success"
                : requiresReview
                  ? "attention"
                  : undefined
            }
          >
            {record.reviewStatus === "reviewed"
              ? "Reviewed"
              : requiresReview
                ? "Needs review"
                : "Not reviewed"}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Form method="post">
            <input type="hidden" name="intent" value="set_review_status" />
            <input type="hidden" name="id" value={record.id} />
            <input
              type="hidden"
              name="reviewStatus"
              value={record.reviewStatus === "reviewed" ? "open" : "reviewed"}
            />
            <Button size="slim" submit>
              {record.reviewStatus === "reviewed"
                ? "Reopen"
                : "Mark reviewed"}
            </Button>
          </Form>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page fullWidth>
      <TitleBar title="Order Risk" />
      <style>
        {`
          .order-risk-page {
            display: grid;
            gap: 12px;
            padding: 4px 0 32px;
          }
          .order-risk-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 20px;
          }
          .order-risk-heading {
            display: grid;
            gap: 3px;
          }
          .order-risk-metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .order-risk-metric {
            align-items: flex-start;
            display: flex;
            gap: 12px;
            min-height: 122px;
            padding: 16px;
          }
          .order-risk-metric-icon {
            align-items: center;
            border-radius: 50%;
            display: inline-flex;
            flex: 0 0 auto;
            height: 42px;
            justify-content: center;
            width: 42px;
          }
          .order-risk-metric-icon .Polaris-Icon {
            height: 22px;
            width: 22px;
          }
          .order-risk-metric-icon .Polaris-Icon__Svg {
            fill: currentColor;
          }
          .order-risk-metric-icon.is-blue {
            background: #e8f0ff;
            color: #1769e0;
          }
          .order-risk-metric-icon.is-orange {
            background: #fff0e6;
            color: #d85b00;
          }
          .order-risk-metric-icon.is-purple {
            background: #f0e9ff;
            color: #7047eb;
          }
          .order-risk-metric-icon.is-green {
            background: #e6f5eb;
            color: #16834b;
          }
          .order-risk-metric-copy {
            display: grid;
            gap: 4px;
            min-width: 0;
          }
          .order-risk-toolbar {
            align-items: center;
            border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
            display: flex;
            gap: 8px;
            min-height: 44px;
            padding: 6px 12px;
          }
          .order-risk-search {
            align-items: center;
            border-radius: var(--p-border-radius-200, 8px);
            display: flex;
            flex: 1 1 320px;
            gap: 6px;
            min-width: 0;
            padding: 4px 8px;
            transition: background-color 120ms ease, box-shadow 120ms ease;
          }
          .order-risk-view {
            flex: 0 0 auto;
            min-width: max-content;
          }
          .order-risk-view .Polaris-Button__Content {
            white-space: nowrap;
          }
          .order-risk-search:focus-within {
            background: var(--p-color-bg-surface-secondary, #f7f7f7);
            box-shadow: inset 0 0 0 2px var(--p-color-border-focus, #005bd3);
          }
          .order-risk-search-input {
            background: transparent;
            border: 0;
            color: var(--p-color-text, #303030);
            flex: 1 1 auto;
            font: inherit;
            line-height: 24px;
            min-width: 0;
            outline: 0;
            padding: 0;
          }
          .order-risk-search-input::placeholder {
            color: var(--p-color-text-secondary, #616161);
          }
          .order-risk-search-input::-webkit-search-cancel-button {
            display: none;
          }
          .order-risk-search-icon,
          .order-risk-search-clear {
            align-items: center;
            display: inline-flex;
            flex: 0 0 20px;
            height: 20px;
            justify-content: center;
            width: 20px;
          }
          .order-risk-search-clear {
            background: transparent;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            padding: 0;
          }
          .order-risk-search-clear:hover {
            background: var(--p-color-bg-surface-hover, #f1f1f1);
          }
          .order-risk-filter {
            border-left: 1px solid var(--p-color-border-secondary, #ebebeb);
            flex: 0 0 auto;
            margin-left: auto;
            padding-left: 8px;
          }
          .order-risk-table-card {
            overflow: hidden;
            border: 1px solid var(--p-color-border-secondary, #e3e3e3);
            border-radius: 12px;
            background: var(--p-color-bg-surface, #fff);
          }
          .order-risk-signals {
            max-width: 260px;
            color: var(--p-color-text-secondary, #616161);
            font-size: 12px;
            line-height: 16px;
          }
          .order-risk-order {
            align-items: flex-start;
            display: grid;
            gap: 4px;
            justify-items: start;
            text-align: left;
            width: 100%;
          }
          .order-risk-order-link {
            color: var(--p-color-text-link, #005bd3);
            display: inline-block;
            font-weight: 600;
            margin: 0;
            padding: 0;
            text-align: left;
            text-decoration: none;
          }
          .order-risk-order-link:hover {
            text-decoration: underline;
          }
          .order-risk-ip {
            color: var(--p-color-text, #303030);
            font-family: var(--p-font-family-mono, ui-monospace, monospace);
            font-size: 12px;
            overflow-wrap: anywhere;
          }
          .order-risk-clear-signal {
            align-items: center;
            color: var(--p-color-text-success, #0c5132);
            display: inline-flex;
            font-size: 12px;
            gap: 5px;
            line-height: 16px;
            white-space: nowrap;
          }
          .order-risk-clear-signal .Polaris-Icon {
            height: 16px;
            margin: 0;
            width: 16px;
          }
          .order-risk-pagination {
            display: flex;
            justify-content: flex-start;
            padding: 8px 12px;
            border-top: 1px solid var(--p-color-border-secondary, #e3e3e3);
          }
          @media (max-width: 64em) {
            .order-risk-metrics {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (max-width: 47.9975em) {
            .order-risk-header {
              align-items: stretch;
              flex-direction: column;
            }
            .order-risk-metrics {
              grid-template-columns: 1fr;
            }
            .order-risk-toolbar {
              gap: 4px;
              padding-inline: 8px;
            }
            .order-risk-toolbar .Polaris-Button {
              padding-inline: 8px;
            }
          }
        `}
      </style>

      <div className="order-risk-page">
        <header className="order-risk-header">
          <div className="order-risk-heading">
            <Text as="h1" variant="headingLg">
              Order Risk
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Review Shopify fraud signals alongside IP and geolocation activity.
            </Text>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="sync_orders" />
            <Button
              variant="primary"
              submit
              loading={isSyncing}
              disabled={!hasOrderAccess}
            >
              Sync recent orders
            </Button>
          </Form>
        </header>

        {!hasOrderAccess ? (
          <Banner tone="warning" title="Order permission required">
            <p>
              Approve the app&apos;s updated order and protected customer data
              permissions before syncing orders.
            </p>
          </Banner>
        ) : !hasWriteOrderAccess ? (
          <Banner tone="info" title="Read-only risk monitoring">
            <p>
              Order monitoring is available, but write_orders must be approved
              before Geo: Redirect can publish its assessment to Shopify.
            </p>
          </Banner>
        ) : null}

        {actionData && "error" in actionData && actionData.error ? (
          <Banner tone="critical" title="Order risk update failed">
            <p>{actionData.error}</p>
          </Banner>
        ) : null}
        <div className="order-risk-metrics">
          {metricsList.map((metric) => (
            <Card key={metric.label} padding="0">
              <div className="order-risk-metric">
                <span
                  className={`order-risk-metric-icon is-${metric.tone}`}
                  aria-hidden="true"
                >
                  <Icon source={metric.icon} />
                </span>
                <div className="order-risk-metric-copy">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {metric.label}
                  </Text>
                  <Text as="p" variant="headingXl">
                    {metric.value.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {metric.detail}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="order-risk-table-card">
          <form
            className="order-risk-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ query });
            }}
          >
            <div className="order-risk-view">
              <Popover
                active={reviewPopoverOpen}
                activator={
                  <Button
                    size="slim"
                    variant="tertiary"
                    disclosure="select"
                    pressed={reviewPopoverOpen}
                    onClick={() => setReviewPopoverOpen((open) => !open)}
                  >
                    {selectedReviewLabel}
                  </Button>
                }
                onClose={() => setReviewPopoverOpen(false)}
                preferredAlignment="left"
                autofocusTarget="first-node"
              >
                <ActionList
                  actionRole="menuitem"
                  items={reviewViews.map((view) => ({
                    content: view.label,
                    active: reviewStatus === view.value,
                    prefix:
                      reviewStatus === view.value ? (
                        <Icon source={CheckIcon} />
                      ) : (
                        <span style={{ display: "block", width: "20px" }} />
                      ),
                    onAction: () => selectReviewView(view.value),
                  }))}
                />
              </Popover>
            </div>

            <div className="order-risk-search">
              <span className="order-risk-search-icon" aria-hidden="true">
                <Icon source={SearchIcon} tone="subdued" />
              </span>
              <input
                className="order-risk-search-input"
                type="search"
                aria-label="Search orders"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search order, IP, country, city or rule"
                autoComplete="off"
              />
              {query ? (
                <button
                  className="order-risk-search-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    applyFilters({ query: "" });
                  }}
                >
                  <Icon source={XIcon} tone="subdued" />
                </button>
              ) : null}
            </div>

            <div className="order-risk-filter">
              <Popover
                active={riskPopoverOpen}
                activator={
                  <Button
                    size="slim"
                    variant="tertiary"
                    icon={FilterIcon}
                    accessibilityLabel="Filter by risk level"
                    pressed={riskPopoverOpen || risk !== "ALL"}
                    onClick={() => setRiskPopoverOpen((open) => !open)}
                  />
                }
                onClose={() => setRiskPopoverOpen(false)}
                preferredAlignment="right"
                autofocusTarget="first-node"
              >
                <ActionList
                  actionRole="menuitem"
                  items={riskViews.map((view) => ({
                    content: view.label,
                    active: risk === view.value,
                    prefix:
                      risk === view.value ? (
                        <Icon source={CheckIcon} />
                      ) : (
                        <span style={{ display: "block", width: "20px" }} />
                      ),
                    onAction: () => selectRiskView(view.value),
                  }))}
                />
              </Popover>
            </div>
          </form>

          <IndexTable
            resourceName={{ singular: "order", plural: "orders" }}
            itemCount={records.length}
            selectable={false}
            headings={[
              { title: "Order" },
              { title: "IP address" },
              { title: "Location" },
              { title: "Order total" },
              { title: "Risk assessment" },
              { title: "Risk signals" },
              { title: "Review status" },
              { title: "Action" },
            ]}
            emptyState={
              <div style={{ padding: 32, textAlign: "center" }}>
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h3" variant="headingMd">
                    No order risk records yet
                  </Text>
                  <Text as="p" tone="subdued">
                    Sync recent orders or wait for the next Shopify order webhook.
                  </Text>
                </BlockStack>
              </div>
            }
          >
            {rows}
          </IndexTable>
          {total > PAGE_SIZE ? (
            <div className="order-risk-pagination">
              <Pagination
                hasPrevious={filters.page > 1}
                hasNext={filters.page < totalPages}
                onPrevious={() => navigate(paginationUrl(filters.page - 1))}
                onNext={() => navigate(paginationUrl(filters.page + 1))}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
