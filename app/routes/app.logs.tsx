import { isIP } from "node:net";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
    Await,
    Form,
    data as responseData,
    useActionData,
    useLoaderData,
    useNavigate,
    useNavigation,
    useSearchParams,
} from "react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
    Page,
    Layout,
    Card,
    IndexTable,
    InlineStack,
    Badge,
    Text,
    Pagination,
    EmptyState,
    BlockStack,
    Button,
    Icon,
    Popover,
    Select,
    TextField,
    Modal,
    Tooltip,
    useBreakpoints,
} from "@shopify/polaris";
import {
    CalendarIcon,
    FilterIcon,
    LockIcon,
    SearchIcon,
    XIcon,
} from "@shopify/polaris-icons";
import {
    FaAndroid,
    FaApple,
    FaChrome,
    FaCircleQuestion,
    FaDesktop,
    FaEdge,
    FaFirefoxBrowser,
    FaGlobe,
    FaInternetExplorer,
    FaLinux,
    FaMobileScreen,
    FaOpera,
    FaRobot,
    FaSafari,
    FaTabletScreenButton,
    FaWindows,
} from "react-icons/fa6";
import type { IconType } from "react-icons";
import { SiSamsung } from "react-icons/si";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { SimpleLoadingSkeleton } from "../components/simple-loading-skeleton";
import { authenticate } from "../shopify.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";
import prisma from "../db.server";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import {
    getStableShopifyPlanFromBillingCheck,
    hasPaidPlanAccess,
    resolveEffectivePlan,
} from "../utils/effective-plan.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { resolveVisitorLogRegionName } from "../utils/visitor-log-region.server";
import {
    addDaysToDateKey,
    dateFromDateKey,
    getCalendarDateInTimeZone,
    startOfDateKeyInTimeZone,
} from "../utils/shop-timezone";
import { ensureShopTimeZone } from "../utils/shop-timezone.server";

const LazyDatePicker = lazy(async () => {
    const { DatePicker } = await import("@shopify/polaris");
    return { default: DatePicker };
});

function formatActionLabel(action: string) {
    switch (action) {
        case "visit":
            return "Visit";
        case "redirected":
        case "clicked_redirect":
            return "Redirected";
        case "auto_redirect":
        case "auto_redirected":
            return "Auto Redirect";
        case "blocked":
        case "ip_block":
            return "Blocked";
        case "ip_redirect":
        case "ip_redirected":
            return "IP Redirect";
        case "clicked_no":
        case "declined":
            return "Declined";
        case "dismissed":
            return "Dismissed";
        case "popup_shown":
            return "Popup Shown";
        default:
            return action
                .split("_")
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ") || "Unknown";
    }
}

function parseDateFilter(value: string | null, endOfDay = false, timeZone = "UTC") {
    if (!value) return null;
    const boundaryDateKey = endOfDay ? addDaysToDateKey(value, 1) : value;
    return startOfDateKeyInTimeZone(boundaryDateKey, timeZone);
}

type DateRangePreset =
    | "all"
    | "today"
    | "yesterday"
    | "last24"
    | "last7"
    | "last30"
    | "thisMonth"
    | "lastMonth"
    | "custom";

type DateRangeValue = {
    start: Date;
    end: Date;
};

const logTableHeadings: [{ title: string }, ...Array<{ title: string }>] = [
    { title: "Timestamp" },
    { title: "IP Address" },
    { title: "IP Risk" },
    { title: "Country" },
    { title: "Region" },
    { title: "City" },
    { title: "Action" },
    { title: "Page Path" },
    { title: "Details / Rule" },
    { title: "Visitor" },
    { title: "Device" },
    { title: "OS" },
    { title: "Browser" },
    { title: "IP control" },
];

const datePresetOptions: Array<{ label: string; value: DateRangePreset }> = [
    { label: "All", value: "all" },
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 24 hours", value: "last24" },
    { label: "Last 7 days", value: "last7" },
    { label: "Last 30 days", value: "last30" },
    { label: "This month", value: "thisMonth" },
    { label: "Last month", value: "lastMonth" },
    { label: "Custom", value: "custom" },
];

const DATE_SCOPE_PARAM = "dateScope";
const DATE_SCOPE_ALL = "all";
const DEFAULT_LOG_WINDOW_DAYS = 30;
const LOGS_PAGE_SIZE = 50;

function normalizeIPAddresses(value: unknown) {
    if (typeof value !== "string") return [];
    return value
        .split(/[\n,]+/)
        .map((ip) => ip.trim())
        .filter(Boolean);
}

function hasPaidBillingConfig(billingConfig: any, settings: any) {
    const shopifyPlan = getStableShopifyPlanFromBillingCheck(
        billingConfig,
        settings?.currentPlan,
    );
    const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
    return (
        hasPaidPlanAccess(effectivePlan) ||
        billingConfig.hasActivePayment ||
        billingConfig.appSubscriptions.length > 0
    );
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
    const nextDate = startOfDay(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function getDefaultLogDateRange(today: Date): DateRangeValue {
    return {
        start: addDays(today, -(DEFAULT_LOG_WINDOW_DAYS - 1)),
        end: today,
    };
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function parseLocalDate(value: string) {
    if (!value) return null;

    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;

    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatDateParam(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isSameDate(firstDate: Date, secondDate: Date) {
    return formatDateParam(firstDate) === formatDateParam(secondDate);
}

function normalizeDateRange(range: DateRangeValue): DateRangeValue {
    return range.start.getTime() <= range.end.getTime()
        ? range
        : { start: range.end, end: range.start };
}

function getDefaultDateRange(from: string, to: string, today: Date): DateRangeValue {
    const fromDate = parseLocalDate(from);
    const toDate = parseLocalDate(to);
    const start = fromDate || toDate || today;
    const end = toDate || fromDate || today;

    return normalizeDateRange({ start, end });
}

function getDateRangeForPreset(preset: DateRangePreset, today: Date) {
    switch (preset) {
        case "today":
            return { start: today, end: today };
        case "yesterday": {
            const yesterday = addDays(today, -1);
            return { start: yesterday, end: yesterday };
        }
        case "last24":
            return { start: addDays(today, -1), end: today };
        case "last7":
            return { start: addDays(today, -6), end: today };
        case "last30":
            return { start: addDays(today, -29), end: today };
        case "thisMonth":
            return { start: startOfMonth(today), end: today };
        case "lastMonth": {
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
        }
        default:
            return null;
    }
}

function getMatchingDatePreset(from: string, to: string, today: Date): DateRangePreset {
    const fromDate = parseLocalDate(from);
    const toDate = parseLocalDate(to);

    if (!fromDate && !toDate) return "all";
    if (!fromDate || !toDate) return "custom";

    for (const preset of datePresetOptions) {
        if (preset.value === "all" || preset.value === "custom") continue;

        const presetRange = getDateRangeForPreset(preset.value, today);
        if (
            presetRange &&
            isSameDate(fromDate, presetRange.start) &&
            isSameDate(toDate, presetRange.end)
        ) {
            return preset.value;
        }
    }

    return "custom";
}

function formatDisplayDate(date: Date, includeWeekday = false) {
    return new Intl.DateTimeFormat("en-US", {
        ...(includeWeekday ? { weekday: "short" as const } : {}),
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date).replace(/,/g, "");
}

function formatDateRangeLabel(from: string, to: string, today: Date) {
    const fromDate = parseLocalDate(from);
    const toDate = parseLocalDate(to);

    if (!fromDate && !toDate) return "All dates";

    const start = fromDate || toDate;
    const end = toDate || fromDate;

    if (!start || !end) return "Custom dates";
    if (isSameDate(start, end) && isSameDate(start, today)) {
        return `Today - ${formatDisplayDate(start, true)}`;
    }
    if (isSameDate(start, end)) {
        return formatDisplayDate(start, true);
    }

    return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
}

function getEffectiveLogDateParams(
    filters: { from: string; to: string; dateScope: string },
    today: Date
) {
    if (filters.dateScope === DATE_SCOPE_ALL) {
        return {
            from: "",
            to: "",
            isAllDates: true,
        };
    }

    if (filters.from || filters.to) {
        const start = filters.from || filters.to;
        const end = filters.to || filters.from;

        return {
            from: start,
            to: end,
            isAllDates: false,
        };
    }

    const defaultRange = getDefaultLogDateRange(today);

    return {
        from: formatDateParam(defaultRange.start),
        to: formatDateParam(defaultRange.end),
        isAllDates: false,
    };
}

function formatMajorVersion(label: string, version?: string) {
    const majorVersion = version?.split(".")[0];
    return majorVersion ? `${label} ${majorVersion}` : label;
}

function parseVisitorUserAgent(userAgentValue?: string | null) {
    const userAgent = userAgentValue || "";

    if (!userAgent) {
        return {
            browser: "Unknown",
            device: "Unknown",
            os: "Unknown",
            visitorType: "Unknown",
        };
    }

    const isBot =
        /\b(bot|crawler|spider|crawling|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|slurp|facebookexternalhit|telegrambot|curl|wget|python-requests)\b/i.test(userAgent);

    const os =
        userAgent.match(/(?:iPhone|iPad|iPod).*OS\s([\d_]+)/)
            ? `iOS ${userAgent.match(/(?:iPhone|iPad|iPod).*OS\s([\d_]+)/)?.[1].replace(/_/g, ".")}`
            : userAgent.match(/Android\s([\d.]+)/)
                ? `Android ${userAgent.match(/Android\s([\d.]+)/)?.[1]}`
                : userAgent.match(/Mac OS X\s([\d_]+)/)
                    ? `macOS ${userAgent.match(/Mac OS X\s([\d_]+)/)?.[1].replace(/_/g, ".")}`
                    : /CrOS/i.test(userAgent)
                        ? "ChromeOS"
                        : /Windows NT 10\.0/i.test(userAgent)
                            ? "Windows 10/11"
                            : /Windows NT 6\.3/i.test(userAgent)
                                ? "Windows 8.1"
                                : /Windows NT 6\.2/i.test(userAgent)
                                    ? "Windows 8"
                                    : /Windows NT 6\.1/i.test(userAgent)
                                        ? "Windows 7"
                                        : /Windows/i.test(userAgent)
                                            ? "Windows"
                                            : /Linux/i.test(userAgent)
                                                ? "Linux"
                                                : "Unknown";

    const browser =
        userAgent.match(/EdgA?\/([\d.]+)/)
            ? formatMajorVersion("Edge", userAgent.match(/EdgA?\/([\d.]+)/)?.[1])
            : userAgent.match(/OPR\/([\d.]+)/)
                ? formatMajorVersion("Opera", userAgent.match(/OPR\/([\d.]+)/)?.[1])
                : userAgent.match(/SamsungBrowser\/([\d.]+)/)
                    ? formatMajorVersion("Samsung Internet", userAgent.match(/SamsungBrowser\/([\d.]+)/)?.[1])
                    : userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/)
                        ? formatMajorVersion("Chrome", userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/)?.[1])
                        : userAgent.match(/(?:Firefox|FxiOS)\/([\d.]+)/)
                            ? formatMajorVersion("Firefox", userAgent.match(/(?:Firefox|FxiOS)\/([\d.]+)/)?.[1])
                            : userAgent.match(/Version\/([\d.]+).*Safari\//)
                                ? formatMajorVersion("Safari", userAgent.match(/Version\/([\d.]+).*Safari\//)?.[1])
                                : /Trident|MSIE/i.test(userAgent)
                                    ? "Internet Explorer"
                                    : "Unknown";

    const device =
        isBot
            ? "Bot"
            : /iPad|Tablet|PlayBook|Silk/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))
                ? "Tablet"
                : /Mobi|iPhone|iPod|Android|IEMobile|Windows Phone/i.test(userAgent)
                    ? "Mobile"
                    : /Windows NT|Macintosh|X11|Linux/i.test(userAgent)
                        ? "Desktop"
                        : "Unknown";

    return { browser, device, os, visitorType: isBot ? "Bot" : "User" };
}

type VisitorLogFilterOptions = {
    actions: string[];
    countries: string[];
};

type VisitorLogFilters = {
    query: string;
    action: string;
    country: string;
    risk: string;
    from: string;
    to: string;
    dateScope: string;
};

type VisitorLogsData = {
    logs: any[];
    page: number;
    totalPages: number;
    totalLogs: number;
    filterOptions: VisitorLogFilterOptions;
};

const emptyFilterOptions: VisitorLogFilterOptions = {
    actions: [],
    countries: [],
};

const visitorLogActionFilterOptions = [
    { value: "visit", label: "Visit", actions: ["visit"] },
    { value: "popup_shown", label: "Popup Shown", actions: ["popup_shown"] },
    { value: "redirected", label: "Redirected", actions: ["redirected", "clicked_redirect"] },
    { value: "auto_redirect", label: "Auto Redirect", actions: ["auto_redirect", "auto_redirected"] },
    { value: "ip_redirect", label: "IP Redirect", actions: ["ip_redirect", "ip_redirected"] },
    { value: "blocked", label: "Blocked", actions: ["blocked", "ip_block"] },
    { value: "vpn_block", label: "VPN Block", actions: ["vpn_block"] },
    { value: "declined", label: "Declined", actions: ["declined", "clicked_no"] },
    { value: "dismissed", label: "Dismissed", actions: ["dismissed"] },
];

function getActionFilterGroup(action: string) {
    return visitorLogActionFilterOptions.find((option) =>
        option.value === action || option.actions.includes(action)
    );
}

function getActionFilterValue(action: string) {
    return getActionFilterGroup(action)?.value || action;
}

function getActionFilterActions(action: string) {
    return getActionFilterGroup(action)?.actions || [action];
}

async function getVisitorLogFilterOptions(
    shop: string,
    fromDateKey: string | null,
    toDateKey: string | null
): Promise<VisitorLogFilterOptions> {
    const where: any = { shop };
    const fromDate = fromDateKey ? dateFromDateKey(fromDateKey) : null;
    const toDate = toDateKey ? dateFromDateKey(toDateKey) : null;

    if (fromDate || toDate) {
        where.date = {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
        };
    }

    const countryRows = await prisma.analyticsCountry.findMany({
        where,
        distinct: ["countryCode"],
        select: { countryCode: true },
        orderBy: { countryCode: "asc" },
    });

    return {
        actions: visitorLogActionFilterOptions.map((option) => option.value),
        countries: countryRows
            .map((row) => row.countryCode)
                .filter((countryCode): countryCode is string => Boolean(countryCode))
            .sort(),
    };
}

function VisitorLogsTableSkeleton() {
    return (
        <SimpleLoadingSkeleton
            label="Loading visitor logs"
            minHeight={320}
            rows={6}
        />
    );
}

function getVisitorDetailIcon(type: "device" | "os" | "browser", value: string): IconType {
    if (!value || value === "Unknown") return FaCircleQuestion;

    if (type === "device") {
        if (value === "Mobile") return FaMobileScreen;
        if (value === "Tablet") return FaTabletScreenButton;
        if (value === "Bot") return FaRobot;
        return FaDesktop;
    }

    if (type === "os") {
        if (/^Windows/i.test(value)) return FaWindows;
        if (/^(macOS|iOS)/i.test(value)) return FaApple;
        if (/^Android/i.test(value)) return FaAndroid;
        if (/^Linux/i.test(value)) return FaLinux;
        if (/^ChromeOS/i.test(value)) return FaChrome;
        return FaCircleQuestion;
    }

    if (/^Chrome/i.test(value)) return FaChrome;
    if (/^Edge/i.test(value)) return FaEdge;
    if (/^Firefox/i.test(value)) return FaFirefoxBrowser;
    if (/^Safari/i.test(value)) return FaSafari;
    if (/^Opera/i.test(value)) return FaOpera;
    if (/^Samsung Internet/i.test(value)) return SiSamsung;
    if (/^Internet Explorer/i.test(value)) return FaInternetExplorer;
    return FaGlobe;
}

function VisitorDetailIcon({
    label,
    type,
}: {
    label: string;
    type: "device" | "os" | "browser";
}) {
    const DetailIcon = getVisitorDetailIcon(type, label);

    return (
        <span
            className="visitor-log-detail-icon"
            title={label}
            aria-label={label}
            tabIndex={0}
        >
            <DetailIcon aria-hidden="true" focusable="false" />
        </span>
    );
}

async function loadVisitorLogsData(
    shop: string,
    filters: VisitorLogFilters,
    page: number,
    timeZone: string,
): Promise<VisitorLogsData> {
    const today = getCalendarDateInTimeZone(new Date(), timeZone);
    const effectiveDateParams = getEffectiveLogDateParams(filters, today);
    const fromDate = effectiveDateParams.isAllDates
        ? null
        : parseDateFilter(effectiveDateParams.from, false, timeZone);
    const toDate = effectiveDateParams.isAllDates
        ? null
        : parseDateFilter(effectiveDateParams.to, true, timeZone);
    const limit = LOGS_PAGE_SIZE;
    const skip = (page - 1) * limit;

    const where: any = {
        shop,
    };

    if (filters.query) {
        where.OR = [
            { ipAddress: { contains: filters.query, mode: "insensitive" } },
            { countryCode: { contains: filters.query, mode: "insensitive" } },
            { regionCode: { contains: filters.query, mode: "insensitive" } },
            { regionName: { contains: filters.query, mode: "insensitive" } },
            { city: { contains: filters.query, mode: "insensitive" } },
            { action: { contains: filters.query, mode: "insensitive" } },
            { ruleName: { contains: filters.query, mode: "insensitive" } },
            { targetUrl: { contains: filters.query, mode: "insensitive" } },
            { path: { contains: filters.query, mode: "insensitive" } },
            { userAgent: { contains: filters.query, mode: "insensitive" } },
        ];
    }

    if (filters.action) {
        const actionValues = getActionFilterActions(filters.action);
        where.action = actionValues.length > 1 ? { in: actionValues } : actionValues[0];
    }

    if (filters.country) {
        where.countryCode = filters.country;
    }

    if (filters.risk) {
        where.ipRiskLevel = filters.risk;
    }

    if (fromDate || toDate) {
        where.timestamp = {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lt: toDate } : {}),
        };
    }

    const [logRows, filterOptions] = await Promise.all([
        prisma.visitorLog.findMany({
            where,
            orderBy: { timestamp: "desc" },
            skip,
            take: limit + 1,
            select: {
                id: true,
                shop: true,
                ipAddress: true,
                ipRiskScore: true,
                ipRiskLevel: true,
                ipRiskSignals: true,
                ipRiskProvider: true,
                ipRiskStatus: true,
                ipRiskCheckedAt: true,
                countryCode: true,
                regionCode: true,
                regionName: true,
                city: true,
                action: true,
                ruleName: true,
                userAgent: true,
                timestamp: true,
                path: true,
            },
        }),
        getVisitorLogFilterOptions(
            shop,
            effectiveDateParams.isAllDates ? null : effectiveDateParams.from,
            effectiveDateParams.isAllDates ? null : effectiveDateParams.to,
        ),
    ]);

    const hasNextPage = logRows.length > limit;
    const logs = logRows.slice(0, limit);
    const totalLogs = skip + logs.length + (hasNextPage ? 1 : 0);
    const totalPages = Math.max(1, page + (hasNextPage ? 1 : 0));

    const logsWithRegionNames = await Promise.all(logs.map(async (log) => ({
        ...log,
        regionName: await resolveVisitorLogRegionName(log, { useGeoLookupFallback: false }),
    })));

    return {
        logs: logsWithRegionNames,
        page,
        totalPages,
        totalLogs,
        filterOptions,
    };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, billing, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const filters: VisitorLogFilters = {
        query: (url.searchParams.get("q") || "").trim(),
        action: url.searchParams.get("action") || "",
        country: (url.searchParams.get("country") || "").trim().toUpperCase(),
        risk: (url.searchParams.get("risk") || "").trim().toUpperCase(),
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        dateScope: url.searchParams.get(DATE_SCOPE_PARAM) || "",
    };
    const shopTimeZone = await ensureShopTimeZone({ admin, shop: session.shop });
    const visitorLogsData = loadVisitorLogsData(
        session.shop,
        filters,
        page,
        shopTimeZone,
    );
    const [settings, billingConfig, activeIpBlockRules] = await Promise.all([
        prisma.settings.findUnique({ where: { shop: session.shop } }),
        checkBillingWithFallback(billing, isBillingTestMode()),
        prisma.redirectRule.findMany({
            where: {
                shop: session.shop,
                matchType: "ip",
                ruleType: "block",
                isActive: true,
            },
            select: { ipAddresses: true },
        }),
    ]);

    return {
        blockedIps: Array.from(new Set(
            activeIpBlockRules.flatMap((rule) =>
                normalizeIPAddresses(rule.ipAddresses),
            ),
        )),
        filters,
        hasPaidPlan: hasPaidBillingConfig(billingConfig, settings),
        shopTimeZone,
        visitorLogsData,
    };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { billing, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = String(formData.get("intent") || "");

    if (intent !== "block_ip") {
        return responseData({ error: "Unsupported action." }, { status: 400 });
    }

    try {
        const id = String(formData.get("id") || "");
        const [billingConfig, settings, log] = await Promise.all([
            checkBillingWithFallback(billing, isBillingTestMode()),
            prisma.settings.findUnique({ where: { shop: session.shop } }),
            prisma.visitorLog.findFirst({
                where: { id, shop: session.shop },
                select: { ipAddress: true },
            }),
        ]);

        if (!hasPaidBillingConfig(billingConfig, settings)) {
            return responseData(
                { error: "IP blocking is available on paid plans only." },
                { status: 403 },
            );
        }

        const clientIp = String(log?.ipAddress || "").trim();
        if (!clientIp || isIP(clientIp) === 0) {
            return responseData(
                { error: "This log does not have a valid IP address to block." },
                { status: 400 },
            );
        }

        const existingRules = await prisma.redirectRule.findMany({
            where: {
                shop: session.shop,
                matchType: "ip",
                ruleType: "block",
                isActive: true,
            },
            select: { ipAddresses: true },
        });
        const alreadyBlocked = existingRules.some((rule) =>
            normalizeIPAddresses(rule.ipAddresses).includes(clientIp),
        );

        if (alreadyBlocked) {
            return responseData({ message: `${clientIp} is already blocked.` });
        }

        await prisma.redirectRule.create({
            data: {
                shop: session.shop,
                name: "Blocked from Visitor Logs",
                ipAddresses: clientIp,
                matchType: "ip",
                countryCodes: "",
                targetUrl: "",
                priority: 0,
                isActive: true,
                ruleType: "block",
                redirectMode: "auto_redirect",
                pageTargetingType: "all",
                pagePaths: null,
            },
        });
        invalidateStorefrontConfigCache(session.shop);

        return responseData({
            message: `${clientIp} was added to IP Rules and blocked.`,
        });
    } catch (error) {
        console.error("[VisitorLogs] Failed to block visitor IP:", error);
        return responseData(
            { error: "The IP address could not be blocked. Please try again." },
            { status: 500 },
        );
    }
};

export default function VisitorLogs() {
    const { blockedIps, filters, hasPaidPlan, shopTimeZone, visitorLogsData } =
        useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const shopify = useAppBridge();
    const navigate = useNavigate();
    const navigation = useNavigation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { smUp } = useBreakpoints();
    const searchParamsString = searchParams.toString();
    const today = getCalendarDateInTimeZone(new Date(), shopTimeZone);
    const timestampFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat("en-US", {
                timeZone: shopTimeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }),
        [shopTimeZone],
    );
    const effectiveDateParams = getEffectiveLogDateParams(filters, today);
    const currentDateRange = effectiveDateParams.isAllDates
        ? getDefaultLogDateRange(today)
        : getDefaultDateRange(effectiveDateParams.from, effectiveDateParams.to, today);
    const currentDatePreset = effectiveDateParams.isAllDates
        ? "all"
        : getMatchingDatePreset(effectiveDateParams.from, effectiveDateParams.to, today);
    const hasFilters = Boolean(
        filters.query ||
        filters.action ||
        filters.country ||
        filters.risk ||
        filters.from ||
        filters.to ||
        filters.dateScope === DATE_SCOPE_ALL
    );
    const hasFilterMenuValues = Boolean(
        filters.action ||
        filters.country ||
        filters.risk ||
        filters.from ||
        filters.to ||
        filters.dateScope === DATE_SCOPE_ALL
    );
    const dateRangeLabel = effectiveDateParams.isAllDates
        ? "All dates"
        : formatDateRangeLabel(effectiveDateParams.from, effectiveDateParams.to, today);
    const [queryDraft, setQueryDraft] = useState(filters.query);
    const [datePopoverActive, setDatePopoverActive] = useState(false);
    const [filterPopoverActive, setFilterPopoverActive] = useState(false);
    const [draftDatePreset, setDraftDatePreset] = useState<DateRangePreset>(currentDatePreset);
    const [draftDateRange, setDraftDateRange] = useState<DateRangeValue>(currentDateRange);
    const [datePickerMonth, setDatePickerMonth] = useState(currentDateRange.start.getMonth());
    const [datePickerYear, setDatePickerYear] = useState(currentDateRange.start.getFullYear());
    const [blockTarget, setBlockTarget] = useState<{
        id: string;
        ip: string;
    } | null>(null);
    const isBlockingIp =
        navigation.state !== "idle" &&
        navigation.formData?.get("intent") === "block_ip";
    const isLogsRoutePending =
        navigation.state !== "idle" &&
        navigation.location?.pathname === "/app/logs";
    const shouldShowLogsSkeleton = isLogsRoutePending || queryDraft !== filters.query;
    const dateFieldIcon = (
        <span className="visitor-log-date-field-icon" aria-hidden="true">
            <Icon source={CalendarIcon} tone="subdued" />
        </span>
    );

    useEffect(() => {
        setQueryDraft(filters.query);
    }, [filters.query]);

    useEffect(() => {
        if (!actionData) return;
        if ("message" in actionData && actionData.message) {
            shopify.toast.show(actionData.message);
            setBlockTarget(null);
            return;
        }
        if ("error" in actionData && actionData.error) {
            shopify.toast.show(actionData.error, { isError: true });
        }
    }, [actionData, shopify]);

    useEffect(() => {
        if (queryDraft === filters.query) return;

        const handle = window.setTimeout(() => {
            const nextParams = new URLSearchParams(searchParamsString);
            nextParams.delete("page");

            if (queryDraft) {
                nextParams.set("q", queryDraft);
            } else {
                nextParams.delete("q");
            }

            setSearchParams(nextParams);
        }, 350);

        return () => window.clearTimeout(handle);
    }, [filters.query, queryDraft, searchParamsString, setSearchParams]);

    const updateSearchParam = (key: string, value: string) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("page");

        if (value && value !== "all") {
            nextParams.set(key, value);
        } else {
            nextParams.delete(key);
        }

        setSearchParams(nextParams);
    };

    const resetDraftDateSelection = () => {
        const nextDateParams = getEffectiveLogDateParams(filters, today);
        const nextDateRange = nextDateParams.isAllDates
            ? getDefaultLogDateRange(today)
            : getDefaultDateRange(nextDateParams.from, nextDateParams.to, today);

        setDraftDatePreset(
            nextDateParams.isAllDates
                ? "all"
                : getMatchingDatePreset(nextDateParams.from, nextDateParams.to, today)
        );
        setDraftDateRange(nextDateRange);
        setDatePickerMonth(nextDateRange.start.getMonth());
        setDatePickerYear(nextDateRange.start.getFullYear());
    };

    const handleDateActivatorClick = () => {
        if (!datePopoverActive) {
            resetDraftDateSelection();
        }

        setDatePopoverActive((active) => !active);
    };

    const handleDatePopoverClose = () => {
        resetDraftDateSelection();
        setDatePopoverActive(false);
    };

    const handleDatePresetSelect = (preset: DateRangePreset) => {
        setDraftDatePreset(preset);

        const presetRange = getDateRangeForPreset(preset, today);
        if (presetRange) {
            setDraftDateRange(presetRange);
            setDatePickerMonth(presetRange.start.getMonth());
            setDatePickerYear(presetRange.start.getFullYear());
        }
    };

    const handleDateRangeChange = (range: DateRangeValue) => {
        const nextRange = normalizeDateRange(range);

        setDraftDatePreset("custom");
        setDraftDateRange(nextRange);
        setDatePickerMonth(nextRange.start.getMonth());
        setDatePickerYear(nextRange.start.getFullYear());
    };

    const handleDraftDateInputChange = (key: "start" | "end", value: string) => {
        const date = parseLocalDate(value);
        if (!date) return;

        handleDateRangeChange({
            ...draftDateRange,
            [key]: date,
        });
    };

    const applyDateFilter = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("page");

        if (draftDatePreset === "all") {
            nextParams.delete("from");
            nextParams.delete("to");
            nextParams.set(DATE_SCOPE_PARAM, DATE_SCOPE_ALL);
        } else {
            const nextRange = normalizeDateRange(draftDateRange);
            nextParams.delete(DATE_SCOPE_PARAM);
            nextParams.set("from", formatDateParam(nextRange.start));
            nextParams.set("to", formatDateParam(nextRange.end));
        }

        setSearchParams(nextParams);
        setDatePopoverActive(false);
    };

    const clearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        ["q", "action", "country", "risk", "from", "to", DATE_SCOPE_PARAM, "page"].forEach((key) => nextParams.delete(key));
        setSearchParams(nextParams);
    };

    const getPageSearchParams = (nextPage: number) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("page", nextPage.toString());
        return nextParams;
    };

    const handleNextPage = (currentPage: number, totalPageCount: number) => {
        if (currentPage < totalPageCount) {
            setSearchParams(getPageSearchParams(currentPage + 1));
        }
    };

    const handlePreviousPage = (currentPage: number) => {
        if (currentPage > 1) {
            setSearchParams(getPageSearchParams(currentPage - 1));
        }
    };

    const getActionBadge = (action: string) => {
        const label = formatActionLabel(action);

        switch (action) {
            case "visit":
                return <Badge tone="info">{label}</Badge>;
            case "redirected":
            case "clicked_redirect":
                return <Badge tone="success">{label}</Badge>;
            case "auto_redirect":
            case "auto_redirected":
                return <Badge tone="success">{label}</Badge>;
            case "blocked":
            case "ip_block":
                return <Badge tone="attention">{label}</Badge>;
            case "ip_redirect":
            case "ip_redirected":
                return <Badge tone="warning">{label}</Badge>;
            case "clicked_no":
            case "declined":
                return <Badge>{label}</Badge>;
            case "dismissed":
                return <Badge>{label}</Badge>;
            case "popup_shown":
                return <Badge tone="info">{label}</Badge>;
            default:
                return <Badge>{label}</Badge>;
        }
    };

    const getRiskBadge = (log: any) => {
        const level = String(log.ipRiskLevel || "UNKNOWN").toUpperCase();
        const score = typeof log.ipRiskScore === "number" ? ` ${log.ipRiskScore}` : "";
        const signals = Array.isArray(log.ipRiskSignals)
            ? log.ipRiskSignals.filter((value: unknown) => typeof value === "string").join(", ")
            : "";
        const title = [
            log.ipRiskProvider ? `Provider: ${log.ipRiskProvider}` : "",
            signals ? `Signals: ${signals}` : "",
            log.ipRiskStatus === "failed" ? "Provider check failed" : "",
        ].filter(Boolean).join(" · ");

        if (level === "HIGH") {
            return <span title={title}><Badge tone="critical">{`High${score}`}</Badge></span>;
        }
        if (level === "MEDIUM") {
            return <span title={title}><Badge tone="warning">{`Medium${score}`}</Badge></span>;
        }
        if (level === "LOW") {
            return <span title={title}><Badge tone="info">{`Low${score}`}</Badge></span>;
        }
        if (level === "NONE") {
            return <span title={title}><Badge tone="success">No risk</Badge></span>;
        }
        return <span title={title || "IP reputation was not checked"}><Badge tone="attention">Unknown</Badge></span>;
    };

    const getVisitorTypeBadge = (visitorType: string) => {
        switch (visitorType) {
            case "Bot":
                return <Badge tone="warning">Bot</Badge>;
            case "User":
                return <Badge tone="success">User</Badge>;
            default:
                return <Badge>Unknown</Badge>;
        }
    };

    const resourceName = {
        singular: "log",
        plural: "logs",
    };

    const renderFilterControls = (filterOptions: VisitorLogFilterOptions) => {
        const selectedActionValue = filters.action ? getActionFilterValue(filters.action) : "all";
        const availableActions = selectedActionValue !== "all" && !filterOptions.actions.includes(selectedActionValue)
            ? [...filterOptions.actions, selectedActionValue]
            : filterOptions.actions;
        const availableCountries = filters.country && !filterOptions.countries.includes(filters.country)
            ? [...filterOptions.countries, filters.country].sort()
            : filterOptions.countries;
        const actionOptions = [
            { label: "All actions", value: "all" },
            ...availableActions.map((action) => {
                const actionGroup = getActionFilterGroup(action);

                return {
                    label: actionGroup?.label || formatActionLabel(action),
                    value: action,
                };
            }),
        ];

        const countryOptions = [
            { label: "All countries", value: "all" },
            ...availableCountries.map((countryCode) => ({
                label: countryCode,
                value: countryCode,
            })),
        ];
        const riskOptions = [
            { label: "All risk levels", value: "all" },
            { label: "High", value: "HIGH" },
            { label: "Medium", value: "MEDIUM" },
            { label: "Low", value: "LOW" },
            { label: "No risk", value: "NONE" },
            { label: "Unknown / not checked", value: "UNKNOWN" },
        ];

        return (
            <div className="visitor-log-filter-area">
                <div className="visitor-log-filter-bar">
                    <div className="visitor-log-filter-search">
                        <span className="visitor-log-filter-search-icon" aria-hidden="true">
                            <Icon source={SearchIcon} tone="subdued" />
                        </span>
                        <input
                            className="visitor-log-filter-search-input"
                            type="search"
                            aria-label="Search visitor logs"
                            placeholder="Search IP, city, rule, path..."
                            value={queryDraft}
                            onChange={(event) => setQueryDraft(event.currentTarget.value)}
                            autoComplete="off"
                        />
                        {queryDraft && (
                            <button
                                className="visitor-log-filter-search-clear"
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setQueryDraft("")}
                            >
                                <Icon source={XIcon} tone="subdued" />
                            </button>
                        )}
                    </div>
                    <div className="visitor-log-filter-menu">
                    <Popover
                        active={filterPopoverActive}
                        activator={
                            <Button
                                icon={FilterIcon}
                                variant="tertiary"
                                size="slim"
                                accessibilityLabel="Filter visitor logs"
                                pressed={filterPopoverActive || hasFilterMenuValues}
                                onClick={() => setFilterPopoverActive((active) => !active)}
                            />
                        }
                        onClose={() => setFilterPopoverActive(false)}
                        preferredAlignment="right"
                        preferredPosition="below"
                        preventCloseOnChildOverlayClick
                    >
                    <div className="visitor-log-filter-popover">
                    <div className="visitor-log-filter-popover-controls">
                    <div className="visitor-log-filter-field">
                        <Text as="p" variant="bodySm" fontWeight="medium">Date</Text>
                        <div className="visitor-log-filter-date-wrap">
                    <Popover
                        active={datePopoverActive}
                        activator={
                            <div className="visitor-log-date-filter">
                                <Button
                                    disclosure={datePopoverActive ? "up" : "down"}
                                    icon={CalendarIcon}
                                    onClick={handleDateActivatorClick}
                                    size="slim"
                                    fullWidth
                                    textAlign="start"
                                    variant="tertiary"
                                >
                                    {dateRangeLabel}
                                </Button>
                            </div>
                        }
                        onClose={handleDatePopoverClose}
                        fluidContent
                        preferredAlignment="left"
                        preferredPosition="below"
                    >
                        {datePopoverActive ? (
                            <div className="visitor-log-date-popover">
                                <div className="visitor-log-date-popover-body">
                                    <div className="visitor-log-date-presets" aria-label="Date presets">
                                        {datePresetOptions.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                className={`visitor-log-date-preset${draftDatePreset === preset.value ? " is-selected" : ""}`}
                                                onClick={() => handleDatePresetSelect(preset.value)}
                                            >
                                                <span>{preset.label}</span>
                                                {draftDatePreset === preset.value && (
                                                    <span className="visitor-log-date-preset-check" aria-hidden="true">
                                                        {"\u2713"}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="visitor-log-date-picker-panel">
                                        <div className="visitor-log-date-range-fields">
                                            <div className="visitor-log-date-input">
                                                <TextField
                                                    label="Start date"
                                                    labelHidden
                                                    autoComplete="off"
                                                    size="slim"
                                                    prefix={dateFieldIcon}
                                                    type="date"
                                                    value={formatDateParam(draftDateRange.start)}
                                                    onChange={(value) => handleDraftDateInputChange("start", value)}
                                                />
                                            </div>
                                            <span className="visitor-log-date-range-arrow" aria-hidden="true">
                                                {"\u2192"}
                                            </span>
                                            <div className="visitor-log-date-input">
                                                <TextField
                                                    label="End date"
                                                    labelHidden
                                                    autoComplete="off"
                                                    size="slim"
                                                    prefix={dateFieldIcon}
                                                    type="date"
                                                    value={formatDateParam(draftDateRange.end)}
                                                    onChange={(value) => handleDraftDateInputChange("end", value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="visitor-log-date-calendar">
                                            <Suspense
                                                fallback={
                                                    <div className="visitor-log-date-calendar-skeleton" aria-label="Loading calendar">
                                                        <span className="visitor-log-date-calendar-skeleton-head" />
                                                        <div className="visitor-log-date-calendar-skeleton-grid">
                                                            {Array.from({ length: 35 }).map((_, index) => (
                                                                <span
                                                                    key={index}
                                                                    className="visitor-log-date-calendar-skeleton-cell"
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                }
                                            >
                                                <LazyDatePicker
                                                    allowRange
                                                    multiMonth={smUp}
                                                    month={datePickerMonth}
                                                    year={datePickerYear}
                                                    selected={draftDatePreset === "all" ? undefined : draftDateRange}
                                                    onChange={handleDateRangeChange}
                                                    onMonthChange={(month, year) => {
                                                        setDatePickerMonth(month);
                                                        setDatePickerYear(year);
                                                    }}
                                                />
                                            </Suspense>
                                        </div>
                                    </div>
                                </div>
                                <div className="visitor-log-date-footer">
                                    <Button onClick={handleDatePopoverClose} size="slim">Cancel</Button>
                                    <Button variant="primary" onClick={applyDateFilter} size="slim">Apply</Button>
                                </div>
                            </div>
                        ) : null}
                    </Popover>
                    </div>
                    </div>
                    <div className="visitor-log-filter-select">
                        <Select
                            label="Country"
                            options={countryOptions}
                            value={filters.country || "all"}
                            onChange={(value) => updateSearchParam("country", value)}
                        />
                    </div>
                    <div className="visitor-log-filter-select">
                        <Select
                            label="Action"
                            options={actionOptions}
                            value={selectedActionValue}
                            onChange={(value) => updateSearchParam("action", value)}
                        />
                    </div>
                    <div className="visitor-log-filter-select">
                        <Select
                            label="IP risk"
                            options={riskOptions}
                            value={filters.risk || "all"}
                            onChange={(value) => updateSearchParam("risk", value)}
                        />
                    </div>
                    </div>
                    <div className="visitor-log-filter-popover-footer">
                        {hasFilters && (
                            <Button onClick={clearFilters} size="slim" variant="tertiary">Clear filters</Button>
                        )}
                        <Button
                            onClick={() => setFilterPopoverActive(false)}
                            size="slim"
                            variant="primary"
                        >
                            Done
                        </Button>
                    </div>
                    </div>
                    </Popover>
                    </div>
                </div>
            </div>
        );
    };

    const renderLogRows = (logs: VisitorLogsData["logs"]) => logs.map((log: any, index: number) => {
            const userAgentDetails = parseVisitorUserAgent(log.userAgent);
            const userAgentTitle = log.userAgent || "";
            const clientIp = String(log.ipAddress || "").trim();
            const hasIpAddress =
                Boolean(clientIp) &&
                !["unknown", "0.0.0.0"].includes(clientIp.toLowerCase());
            const isIpBlocked = blockedIps.includes(clientIp);

            return (
                <IndexTable.Row id={log.id} key={log.id} position={index}>
                    <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                            {timestampFormatter.format(new Date(log.timestamp))}
                        </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{log.ipAddress}</IndexTable.Cell>
                    <IndexTable.Cell>{getRiskBadge(log)}</IndexTable.Cell>
                    <IndexTable.Cell>
                        {log.countryCode ? (
                            <div className="visitor-log-country">
                                <img
                                    src={`https://flagcdn.com/20x15/${log.countryCode.toLowerCase()}.png`}
                                    alt={log.countryCode}
                                    className="visitor-log-flag"
                                />
                                {log.countryCode}
                            </div>
                        ) : (
                            "Unknown"
                        )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <span title={log.regionCode || ""}>
                            {log.regionName || "-"}
                        </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <span title={log.city || ""}>
                            {log.city || "-"}
                        </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{getActionBadge(log.action)}</IndexTable.Cell>
                    <IndexTable.Cell>
                        {log.path ? (
                            <div className="visitor-log-path" title={log.path}>
                                {log.path}
                            </div>
                        ) : (
                            <Text as="span" variant="bodyMd" tone="subdued">-</Text>
                        )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        {log.ruleName ? (
                            <div className="visitor-log-rule-name" title={log.ruleName}>
                                {log.ruleName}
                            </div>
                        ) : (
                            <Text as="span" variant="bodyMd" tone="subdued">-</Text>
                        )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <span title={userAgentTitle}>
                            {getVisitorTypeBadge(userAgentDetails.visitorType)}
                        </span>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <VisitorDetailIcon label={userAgentDetails.device} type="device" />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <VisitorDetailIcon label={userAgentDetails.os} type="os" />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <VisitorDetailIcon label={userAgentDetails.browser} type="browser" />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <Tooltip
                            content={
                                isIpBlocked
                                    ? "IP already blocked"
                                    : !hasPaidPlan
                                        ? "Upgrade to a paid plan to block IPs"
                                        : hasIpAddress
                                            ? "Block IP address"
                                            : "IP address unavailable"
                            }
                        >
                            <Button
                                size="slim"
                                variant="tertiary"
                                icon={LockIcon}
                                accessibilityLabel={
                                    isIpBlocked
                                        ? "IP already blocked"
                                        : !hasPaidPlan
                                            ? "Upgrade to block IP address"
                                            : "Block IP address"
                                }
                                disabled={!hasIpAddress || isIpBlocked}
                                onClick={() => {
                                    if (!hasPaidPlan) {
                                        shopify.toast.show(
                                            "Upgrade to a paid plan to use IP blocking.",
                                        );
                                        navigate("/app/pricing");
                                        return;
                                    }
                                    setBlockTarget({ id: log.id, ip: clientIp });
                                }}
                            />
                        </Tooltip>
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        });

    const renderLogsTable = ({ logs, page, totalPages }: VisitorLogsData) => {
        if (shouldShowLogsSkeleton) {
            return <VisitorLogsTableSkeleton />;
        }

        if (logs.length === 0) {
            return (
                <div className="visitor-log-empty-state">
                    <EmptyState
                        heading="No logs found"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>Visitor activity will appear here.</p>
                    </EmptyState>
                </div>
            );
        }

        return (
            <>
                <div className="visitor-log-table-wrap">
                    <IndexTable
                        resourceName={resourceName}
                        itemCount={logs.length}
                        headings={logTableHeadings}
                        selectable={false}
                    >
                        {renderLogRows(logs)}
                    </IndexTable>
                </div>
                <div className="visitor-log-pagination">
                    <Pagination
                        hasPrevious={page > 1}
                        onPrevious={() => handlePreviousPage(page)}
                        hasNext={page < totalPages}
                        onNext={() => handleNextPage(page, totalPages)}
                    />
                </div>
            </>
        );
    };

    return (
        <Page fullWidth>
            <TitleBar title="Visitor Logs" />
            <style>
                {`
                    .visitor-log-page-content {
                        padding-bottom: 72px;
                    }
                    .visitor-log-header {
                        display: flex;
                        align-items: flex-end;
                        justify-content: space-between;
                        gap: 20px;
                    }
                    .visitor-log-header-copy {
                        flex: 1 1 260px;
                        min-width: 220px;
                        max-width: 520px;
                    }
                    .visitor-log-filter-area {
                        --p-color-input-border: transparent;
                    }
                    .visitor-log-country {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                    }
                    .visitor-log-flag {
                        border-radius: 2px;
                        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
                    }
                    .visitor-log-path,
                    .visitor-log-user-agent-detail {
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: var(--p-color-text-secondary, #6d7175);
                    }
                    .visitor-log-path {
                        max-width: 220px;
                        font-size: 12px;
                    }
                    .visitor-log-user-agent-detail {
                        max-width: 120px;
                        font-size: 12px;
                        line-height: 1.4;
                    }
                    .visitor-log-rule-name {
                        max-width: 220px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: var(--p-color-text-secondary, #6d7175);
                        font-size: 12px;
                        line-height: 1.4;
                        font-weight: 400;
                    }
                    .visitor-log-pagination {
                        display: flex;
                        align-items: center;
                        justify-content: flex-start;
                        flex-wrap: wrap;
                        gap: 8px;
                        padding: 6px 12px;
                        border-top: 1px solid var(--p-color-border-secondary, #dfe3e8);
                    }
                    .visitor-log-skeleton {
                        overflow: hidden;
                    }
                    .visitor-log-skeleton-table-wrap {
                        width: 100%;
                        overflow-x: auto;
                    }
                    .visitor-log-table-wrap {
                        width: 100%;
                        overflow-x: auto;
                        overflow-y: hidden;
                        -webkit-overflow-scrolling: touch;
                    }
                    .visitor-log-table-wrap,
                    .visitor-log-skeleton-table-wrap,
                    .visitor-log-table-wrap .Polaris-IndexTable-ScrollContainer {
                        scrollbar-color: auto;
                        scrollbar-width: thin;
                    }
                    .visitor-log-table-wrap .Polaris-IndexTable-ScrollContainer {
                        overflow: visible !important;
                        max-height: none;
                    }
                    .visitor-log-table-wrap .Polaris-IndexTable__ScrollBarContainer {
                        display: none !important;
                    }
                    .visitor-log-table-wrap .Polaris-IndexTable,
                    .visitor-log-table-wrap .Polaris-IndexTable__Table {
                        width: 100%;
                        min-width: 1000px;
                    }
                    .visitor-log-skeleton-table {
                        width: 100%;
                        min-width: 1000px;
                        border-collapse: collapse;
                    }
                    .visitor-log-skeleton-table th {
                        padding: 12px 14px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 12px;
                        font-weight: 650;
                        line-height: 16px;
                        text-align: left;
                        white-space: nowrap;
                    }
                    .visitor-log-skeleton-table td {
                        padding: 14px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #dfe3e8);
                    }
                    .visitor-log-skeleton-line,
                    .visitor-log-skeleton-pager,
                    .visitor-log-date-calendar-skeleton-cell,
                    .visitor-log-date-calendar-skeleton-head {
                        display: block;
                        border-radius: 999px;
                        background: linear-gradient(
                            90deg,
                            var(--p-color-bg-surface-secondary, #f1f1f1) 0%,
                            var(--p-color-bg-surface-tertiary, #e7e7e7) 45%,
                            var(--p-color-bg-surface-secondary, #f1f1f1) 90%
                        );
                        background-size: 220% 100%;
                        animation: visitor-log-skeleton-pulse 1.2s ease-in-out infinite;
                    }
                    .visitor-log-skeleton-line {
                        width: 96px;
                        height: 12px;
                    }
                    .visitor-log-skeleton-line-1 {
                        width: 112px;
                    }
                    .visitor-log-skeleton-line-2 {
                        width: 80px;
                    }
                    .visitor-log-skeleton-line-3 {
                        width: 128px;
                    }
                    .visitor-log-skeleton-line-4 {
                        width: 64px;
                    }
                    .visitor-log-skeleton-line-meta {
                        width: 170px;
                    }
                    .visitor-log-skeleton-pager {
                        width: 72px;
                        height: 28px;
                        border-radius: 8px;
                    }
                    .visitor-log-date-calendar-skeleton {
                        display: grid;
                        gap: 12px;
                        padding: 8px 0 6px;
                    }
                    .visitor-log-date-calendar-skeleton-head {
                        width: 160px;
                        height: 16px;
                        margin: 0 auto;
                    }
                    .visitor-log-date-calendar-skeleton-grid {
                        display: grid;
                        grid-template-columns: repeat(7, 28px);
                        justify-content: center;
                        gap: 8px;
                    }
                    .visitor-log-date-calendar-skeleton-cell {
                        width: 28px;
                        height: 28px;
                    }
                    @keyframes visitor-log-skeleton-pulse {
                        0% {
                            background-position: 120% 0;
                        }
                        100% {
                            background-position: -120% 0;
                        }
                    }
                    .visitor-log-filter-area {
                        border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
                    }
                    .visitor-log-filter-bar {
                        display: flex;
                        align-items: center;
                        flex-wrap: nowrap;
                        gap: 8px;
                        min-height: 44px;
                        padding: 6px 12px;
                    }
                    .visitor-log-filter-search {
                        align-items: center;
                        border-radius: var(--p-border-radius-200, 8px);
                        display: flex;
                        flex: 1 1 280px;
                        gap: 6px;
                        min-width: 0;
                        padding: 4px 8px;
                        transition: background-color 120ms ease, box-shadow 120ms ease;
                    }
                    .visitor-log-filter-search:focus-within {
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                        box-shadow: inset 0 0 0 2px var(--p-color-border-focus, #005bd3);
                    }
                    .visitor-log-filter-search-input {
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
                    .visitor-log-filter-search-input::placeholder {
                        color: var(--p-color-text-secondary, #616161);
                    }
                    .visitor-log-filter-search-input::-webkit-search-cancel-button {
                        display: none;
                    }
                    .visitor-log-filter-search-icon,
                    .visitor-log-filter-search-clear {
                        align-items: center;
                        display: inline-flex;
                        flex: 0 0 20px;
                        height: 20px;
                        justify-content: center;
                        width: 20px;
                    }
                    .visitor-log-filter-search-clear {
                        background: transparent;
                        border: 0;
                        border-radius: 6px;
                        cursor: pointer;
                        padding: 0;
                    }
                    .visitor-log-filter-search-clear:hover {
                        background: var(--p-color-bg-surface-hover, #f1f1f1);
                    }
                    .visitor-log-filter-select {
                        min-width: 0;
                    }
                    .visitor-log-filter-area .Polaris-Select__Backdrop {
                        border: none;
                        background: transparent;
                        box-shadow: none;
                    }
                    .visitor-log-filter-area .Polaris-Select:hover .Polaris-Select__Backdrop {
                        background: var(--p-color-bg-surface-hover, #f1f1f1);
                        box-shadow: none;
                    }
                    .visitor-log-date-filter {
                        display: inline-flex;
                    }
                    .visitor-log-filter-date-wrap {
                        border-left: 0;
                        margin-left: 0;
                        min-width: 0;
                        padding-left: 0;
                    }
                    .visitor-log-filter-menu {
                        border-left: 1px solid var(--p-color-border-secondary, #ebebeb);
                        flex: 0 0 auto;
                        margin-left: auto;
                        padding-left: 8px;
                    }
                    .visitor-log-filter-popover {
                        width: min(300px, calc(100vw - 32px));
                    }
                    .visitor-log-filter-popover-controls {
                        display: grid;
                        gap: 12px;
                        padding: 14px;
                    }
                    .visitor-log-filter-field {
                        display: grid;
                        gap: 6px;
                    }
                    .visitor-log-filter-popover .visitor-log-date-filter,
                    .visitor-log-filter-popover .visitor-log-date-filter .Polaris-Button {
                        width: 100%;
                    }
                    .visitor-log-filter-popover .visitor-log-date-filter .Polaris-Button.Polaris-Button--disclosure {
                        justify-content: flex-start;
                    }
                    .visitor-log-filter-popover .visitor-log-date-filter .Polaris-Button > .Polaris-Button__Icon:last-child {
                        margin-left: auto;
                    }
                    .visitor-log-filter-popover-footer {
                        align-items: center;
                        border-top: 1px solid var(--p-color-border-secondary, #ebebeb);
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 10px 14px;
                    }
                    .visitor-log-date-filter .Polaris-Button {
                        background: transparent;
                        border: none;
                        box-shadow: none;
                        min-height: 32px;
                    }
                    .visitor-log-date-filter .Polaris-Button:hover {
                        background: var(--p-color-bg-surface-hover, #f1f1f1);
                        box-shadow: none;
                    }
                    .visitor-log-date-popover {
                        width: min(716px, calc(100vw - 48px));
                        max-width: calc(100vw - 48px);
                    }
                    .visitor-log-date-popover-body {
                        display: grid;
                        grid-template-columns: 128px 1fr;
                        gap: 18px;
                        padding: 12px;
                    }
                    .visitor-log-date-presets {
                        display: grid;
                        align-content: start;
                        gap: 4px;
                    }
                    .visitor-log-date-preset {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        min-height: 32px;
                        padding: 0 10px;
                        border: 0;
                        border-radius: 8px;
                        background: transparent;
                        color: var(--p-color-text, #202223);
                        font-size: 13px;
                        line-height: 20px;
                        text-align: left;
                        cursor: pointer;
                    }
                    .visitor-log-date-preset:hover {
                        background: var(--p-color-bg-surface-hover, #f7f7f7);
                    }
                    .visitor-log-date-preset.is-selected {
                        background: var(--p-color-bg-surface-secondary, #f1f1f1);
                        font-weight: 600;
                    }
                    .visitor-log-date-preset:focus {
                        outline: 2px solid var(--p-color-border-focus, #005bd3);
                        outline-offset: 1px;
                    }
                    .visitor-log-date-preset-check {
                        color: var(--p-color-text, #202223);
                        font-weight: 700;
                    }
                    .visitor-log-date-picker-panel {
                        min-width: 0;
                    }
                    .visitor-log-date-range-fields {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
                        gap: 10px;
                        align-items: center;
                        margin-bottom: 12px;
                    }
                    .visitor-log-date-range-arrow {
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 18px;
                        line-height: 1;
                        text-align: center;
                    }
                    .visitor-log-date-input {
                        min-width: 0;
                    }
                    .visitor-log-date-input input[type="date"]::-webkit-calendar-picker-indicator {
                        display: none;
                    }
                    .visitor-log-date-input input[type="date"] {
                        padding-left: 0;
                    }
                    .visitor-log-date-input .Polaris-TextField__Prefix {
                        align-self: center;
                        display: inline-flex;
                        align-items: center;
                        line-height: 0;
                    }
                    .visitor-log-date-field-icon {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 20px;
                        height: 20px;
                        pointer-events: none;
                    }
                    .visitor-log-date-field-icon .Polaris-Icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                        transform: translateY(1px);
                    }
                    .visitor-log-date-calendar {
                        min-width: 0;
                        overflow: visible;
                    }
                    .visitor-log-date-footer {
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 10px 12px;
                        border-top: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .visitor-log-empty-state {
                        min-height: 320px;
                    }
                    .visitor-log-detail-icon {
                        display: inline-flex;
                        width: 24px;
                        height: 24px;
                        align-items: center;
                        justify-content: center;
                        border-radius: var(--p-border-radius-200, 6px);
                        cursor: help;
                    }
                    .visitor-log-detail-icon:focus-visible {
                        outline: 2px solid var(--p-color-border-focus, #005bd3);
                        outline-offset: 1px;
                    }
                    .visitor-log-detail-icon svg {
                        width: 16px;
                        height: 16px;
                        color: var(--p-color-icon-secondary, #616161);
                    }
                    .visitor-log-table-wrap th:nth-child(10),
                    .visitor-log-table-wrap td:nth-child(10),
                    .visitor-log-table-wrap th:nth-child(11),
                    .visitor-log-table-wrap td:nth-child(11),
                    .visitor-log-table-wrap th:nth-child(12),
                    .visitor-log-table-wrap td:nth-child(12),
                    .visitor-log-table-wrap th:nth-child(13),
                    .visitor-log-table-wrap td:nth-child(13) {
                        width: 64px;
                        min-width: 64px;
                        text-align: center;
                    }
                    .visitor-log-table-wrap th:nth-child(14),
                    .visitor-log-table-wrap td:nth-child(14) {
                        width: 80px;
                        min-width: 80px;
                        text-align: center;
                    }
                    @media (max-width: 47.9975em) {
                        .visitor-log-page-content {
                            padding-bottom: 88px;
                        }
                        .visitor-log-header {
                            align-items: stretch;
                            flex-direction: column;
                            gap: 12px;
                        }
                        .visitor-log-header-copy {
                            flex: none;
                            min-width: 0;
                            max-width: none;
                        }
                        .visitor-log-pagination {
                            align-items: flex-start;
                            flex-direction: column;
                        }
                        .visitor-log-date-popover-body {
                            grid-template-columns: 1fr;
                            gap: 12px;
                        }
                        .visitor-log-date-presets {
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                        }
                        .visitor-log-date-calendar {
                            overflow: visible;
                        }
                        .visitor-log-empty-state {
                            min-height: 220px;
                        }
                        .visitor-log-empty-state .Polaris-EmptyState {
                            padding: 24px 16px;
                        }
                        .visitor-log-empty-state .Polaris-EmptyState__ImageContainer,
                        .visitor-log-empty-state .Polaris-EmptyState__Image {
                            max-width: 112px;
                        }
                        .visitor-log-table-wrap {
                            max-width: 100%;
                            overscroll-behavior-x: contain;
                        }
                        .visitor-log-table-wrap .Polaris-IndexTable-ScrollContainer {
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                        }
                    }
                `}
            </style>
            <Layout>
                <Layout.Section>
                    <div className="visitor-log-page-content">
                        <BlockStack gap="400">
                            <div className="visitor-log-header">
                                <div className="visitor-log-header-copy">
                                    <BlockStack gap="100">
                                        <Text as="h1" variant="headingLg">Visitor Logs</Text>
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Recent visitor activity, redirects, blocks, and popup events.
                                            {` Times shown in ${shopTimeZone}.`}
                                        </Text>
                                    </BlockStack>
                                </div>
                            </div>

                            <Card padding="0">
                                <Suspense fallback={renderFilterControls(emptyFilterOptions)}>
                                    <Await resolve={visitorLogsData}>
                                        {(data) => renderFilterControls(data.filterOptions)}
                                    </Await>
                                </Suspense>
                                <Suspense fallback={<VisitorLogsTableSkeleton />}>
                                    <Await resolve={visitorLogsData}>
                                        {(data) => renderLogsTable(data)}
                                    </Await>
                                </Suspense>
                            </Card>
                        </BlockStack>
                    </div>
                </Layout.Section>
            </Layout>
            <Modal
                open={Boolean(blockTarget)}
                onClose={() => {
                    if (!isBlockingIp) setBlockTarget(null);
                }}
                title="Block this IP address?"
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Text as="p">
                            This creates an active IP blocking rule for{" "}
                            <strong>{blockTarget?.ip}</strong>. Future storefront
                            requests from this IP will be blocked.
                        </Text>
                        <InlineStack align="end" gap="200">
                            <Button
                                onClick={() => setBlockTarget(null)}
                                disabled={isBlockingIp}
                            >
                                Cancel
                            </Button>
                            <Form method="post">
                                <input type="hidden" name="intent" value="block_ip" />
                                <input
                                    type="hidden"
                                    name="id"
                                    value={blockTarget?.id || ""}
                                />
                                <Button
                                    submit
                                    variant="primary"
                                    loading={isBlockingIp}
                                >
                                    Block IP
                                </Button>
                            </Form>
                        </InlineStack>
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
