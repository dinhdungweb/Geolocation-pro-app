import { defer } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Await, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
    Page,
    Layout,
    Card,
    IndexTable,
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
    useBreakpoints,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveVisitorLogRegionName } from "../utils/visitor-log-region.server";

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

function parseDateFilter(value: string | null, endOfDay = false) {
    if (!value) return null;

    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(date.getTime()) ? null : date;
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
    { title: "Country" },
    { title: "Region" },
    { title: "Action" },
    { title: "Page Path" },
    { title: "Details / Rule" },
    { title: "Visitor" },
    { title: "Device" },
    { title: "OS" },
    { title: "Browser" },
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
    fromDate: Date | null,
    toDate: Date | null
): Promise<VisitorLogFilterOptions> {
    const where: any = { shop };

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
        <div className="visitor-log-skeleton" aria-busy="true" aria-label="Loading visitor logs">
            <div className="visitor-log-skeleton-table-wrap">
                <table className="visitor-log-skeleton-table">
                    <thead>
                        <tr>
                            {logTableHeadings.map((heading) => (
                                <th key={heading.title}>{heading.title}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 8 }).map((_, rowIndex) => (
                            <tr key={rowIndex}>
                                {logTableHeadings.map((heading, columnIndex) => (
                                    <td key={heading.title}>
                                        <span
                                            className={`visitor-log-skeleton-line visitor-log-skeleton-line-${(columnIndex % 4) + 1}`}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="visitor-log-pagination visitor-log-skeleton-pagination">
                <span className="visitor-log-skeleton-line visitor-log-skeleton-line-meta" />
                <span className="visitor-log-skeleton-pager" />
            </div>
        </div>
    );
}

async function loadVisitorLogsData(shop: string, filters: VisitorLogFilters, page: number): Promise<VisitorLogsData> {
    const today = startOfDay(new Date());
    const effectiveDateParams = getEffectiveLogDateParams(filters, today);
    const fromDate = effectiveDateParams.isAllDates ? null : parseDateFilter(effectiveDateParams.from);
    const toDate = effectiveDateParams.isAllDates ? null : parseDateFilter(effectiveDateParams.to, true);
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

    if (fromDate || toDate) {
        where.timestamp = {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
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
                countryCode: true,
                regionCode: true,
                regionName: true,
                action: true,
                ruleName: true,
                userAgent: true,
                timestamp: true,
                path: true,
            },
        }),
        getVisitorLogFilterOptions(shop, fromDate, toDate),
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
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const filters: VisitorLogFilters = {
        query: (url.searchParams.get("q") || "").trim(),
        action: url.searchParams.get("action") || "",
        country: (url.searchParams.get("country") || "").trim().toUpperCase(),
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        dateScope: url.searchParams.get(DATE_SCOPE_PARAM) || "",
    };

    return defer({
        filters,
        visitorLogsData: loadVisitorLogsData(session.shop, filters, page),
    });
};

export default function VisitorLogs() {
    const { filters, visitorLogsData } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { smUp } = useBreakpoints();
    const searchParamsString = searchParams.toString();
    const today = startOfDay(new Date());
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
        filters.from ||
        filters.to ||
        filters.dateScope === DATE_SCOPE_ALL
    );
    const dateRangeLabel = effectiveDateParams.isAllDates
        ? "All dates"
        : formatDateRangeLabel(effectiveDateParams.from, effectiveDateParams.to, today);
    const [queryDraft, setQueryDraft] = useState(filters.query);
    const [datePopoverActive, setDatePopoverActive] = useState(false);
    const [draftDatePreset, setDraftDatePreset] = useState<DateRangePreset>(currentDatePreset);
    const [draftDateRange, setDraftDateRange] = useState<DateRangeValue>(currentDateRange);
    const [datePickerMonth, setDatePickerMonth] = useState(currentDateRange.start.getMonth());
    const [datePickerYear, setDatePickerYear] = useState(currentDateRange.start.getFullYear());
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
        ["q", "action", "country", "from", "to", DATE_SCOPE_PARAM, "page"].forEach((key) => nextParams.delete(key));
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

        return (
            <div className="visitor-log-filter-area">
                <div className="visitor-log-filter-bar">
                    <div className="visitor-log-filter-search">
                        <TextField
                            label="Search visitor logs"
                            labelHidden
                            autoComplete="off"
                            clearButton
                            placeholder="Search IP, rule, path..."
                            size="slim"
                            type="search"
                            value={queryDraft}
                            onChange={setQueryDraft}
                            onClearButtonClick={() => setQueryDraft("")}
                        />
                    </div>
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
                    <div className="visitor-log-filter-select">
                        <Select
                            label="Country"
                            labelHidden
                            options={countryOptions}
                            value={filters.country || "all"}
                            onChange={(value) => updateSearchParam("country", value)}
                        />
                    </div>
                    <div className="visitor-log-filter-select">
                        <Select
                            label="Action"
                            labelHidden
                            options={actionOptions}
                            value={selectedActionValue}
                            onChange={(value) => updateSearchParam("action", value)}
                        />
                    </div>
                    {hasFilters && (
                        <div className="visitor-log-filter-clear">
                            <Button onClick={clearFilters} size="slim">Clear</Button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderLogRows = (logs: VisitorLogsData["logs"]) => logs.map((log: any, index: number) => {
            const userAgentDetails = parseVisitorUserAgent(log.userAgent);
            const userAgentTitle = log.userAgent || "";

            return (
                <IndexTable.Row id={log.id} key={log.id} position={index}>
                    <IndexTable.Cell>
                        <Text as="span" variant="bodyMd">
                            {new Date(log.timestamp).toLocaleString()}
                        </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{log.ipAddress}</IndexTable.Cell>
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
                        <div className="visitor-log-user-agent-detail" title={userAgentTitle}>
                            {userAgentDetails.device}
                        </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <div className="visitor-log-user-agent-detail" title={userAgentTitle}>
                            {userAgentDetails.os}
                        </div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <div className="visitor-log-user-agent-detail" title={userAgentTitle}>
                            {userAgentDetails.browser}
                        </div>
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
                    <Text as="p" variant="bodySm" tone="subdued">
                        Latest logs are shown first.
                    </Text>
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
                    .visitor-log-header .visitor-log-filter-area {
                        flex: 0 1 auto;
                        justify-items: end;
                        margin-left: auto;
                    }
                    .visitor-log-header .visitor-log-filter-bar {
                        justify-content: flex-end;
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
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: 16px;
                        padding: 14px 20px;
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
                        min-width: 1040px;
                    }
                    .visitor-log-skeleton-table {
                        width: 100%;
                        min-width: 1040px;
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
                        display: grid;
                        gap: 8px;
                    }
                    .visitor-log-filter-bar {
                        display: flex;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .visitor-log-filter-search {
                        width: 260px;
                    }
                    .visitor-log-filter-search .Polaris-TextField__Input,
                    .visitor-log-filter-search .Polaris-TextField__Backdrop,
                    .visitor-log-filter-clear .Polaris-Button {
                        min-height: 32px;
                    }
                    .visitor-log-filter-select {
                        width: 148px;
                        min-width: 148px;
                    }
                    .visitor-log-filter-area .Polaris-TextField__Backdrop,
                    .visitor-log-filter-area .Polaris-Select__Backdrop {
                        border: none;
                        background: var(--p-color-bg-fill, #ffffff);
                        box-shadow: var(--p-shadow-button);
                    }
                    .visitor-log-filter-area .Polaris-TextField:hover .Polaris-TextField__Backdrop,
                    .visitor-log-filter-area .Polaris-Select:hover .Polaris-Select__Backdrop {
                        background: var(--p-color-bg-fill-hover, #fafafa);
                        box-shadow: var(--p-shadow-button-hover);
                    }
                    .visitor-log-date-filter {
                        display: inline-flex;
                    }
                    .visitor-log-filter-date-wrap {
                        min-width: 0;
                    }
                    .visitor-log-date-filter .Polaris-Button {
                        background: var(--p-color-bg-fill, #ffffff);
                        border: none;
                        box-shadow: var(--p-shadow-button);
                        min-height: 32px;
                    }
                    .visitor-log-date-filter .Polaris-Button:hover {
                        background: var(--p-color-bg-fill-hover, #fafafa);
                        box-shadow: var(--p-shadow-button-hover);
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
                    .visitor-log-filter-clear {
                        display: inline-flex;
                    }
                    .visitor-log-empty-state {
                        min-height: 320px;
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
                        .visitor-log-header .visitor-log-filter-area {
                            width: 100%;
                            justify-items: stretch;
                            margin-left: 0;
                        }
                        .visitor-log-header .visitor-log-filter-bar {
                            justify-content: flex-start;
                        }
                        .visitor-log-pagination {
                            align-items: flex-start;
                            flex-direction: column;
                        }
                        .visitor-log-filter-bar {
                            display: grid;
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                            align-items: stretch;
                        }
                        .visitor-log-filter-search {
                            grid-column: 1 / -1;
                        }
                        .visitor-log-filter-date-wrap {
                            grid-column: 1 / -1;
                            width: 100%;
                        }
                        .visitor-log-date-filter,
                        .visitor-log-date-filter .Polaris-Button {
                            width: 100%;
                        }
                        .visitor-log-filter-select {
                            width: 100%;
                            max-width: none;
                        }
                        .visitor-log-filter-select {
                            min-width: 0;
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
                        .visitor-log-filter-clear {
                            grid-column: 1 / -1;
                            justify-content: flex-end;
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
                    @media (max-width: 24em) {
                        .visitor-log-filter-bar {
                            grid-template-columns: 1fr;
                        }
                        .visitor-log-filter-search,
                        .visitor-log-filter-date-wrap,
                        .visitor-log-filter-clear {
                            grid-column: 1;
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
                                        </Text>
                                    </BlockStack>
                                </div>

                                <Suspense fallback={renderFilterControls(emptyFilterOptions)}>
                                    <Await resolve={visitorLogsData}>
                                        {(data) => renderFilterControls(data.filterOptions)}
                                    </Await>
                                </Suspense>
                            </div>

                            <Card padding="0">
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
        </Page>
    );
}
