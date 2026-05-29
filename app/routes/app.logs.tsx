import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
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
    DatePicker,
    Icon,
    Popover,
    Select,
    TextField,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveVisitorLogRegionName } from "../utils/visitor-log-region.server";

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

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
    const nextDate = startOfDay(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
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

const filterOptionsCache = new Map<string, { expiresAt: number; value: VisitorLogFilterOptions }>();
const FILTER_OPTIONS_CACHE_TTL_MS = 60_000;

async function getVisitorLogFilterOptions(shop: string): Promise<VisitorLogFilterOptions> {
    const now = Date.now();
    const cached = filterOptionsCache.get(shop);

    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    const [actionRows, countryRows] = await Promise.all([
        prisma.visitorLog.findMany({
            where: { shop },
            distinct: ["action"],
            select: { action: true },
            orderBy: { action: "asc" },
        }),
        prisma.visitorLog.findMany({
            where: {
                shop,
                countryCode: { not: null },
            },
            distinct: ["countryCode"],
            select: { countryCode: true },
            orderBy: { countryCode: "asc" },
        }),
    ]);

    const value = {
        actions: actionRows.map((row) => row.action).filter(Boolean),
        countries: countryRows
            .map((row) => row.countryCode)
            .filter((countryCode): countryCode is string => Boolean(countryCode)),
    };

    filterOptionsCache.set(shop, {
        expiresAt: now + FILTER_OPTIONS_CACHE_TTL_MS,
        value,
    });

    return value;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const query = (url.searchParams.get("q") || "").trim();
    const action = url.searchParams.get("action") || "";
    const country = (url.searchParams.get("country") || "").trim().toUpperCase();
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const fromDate = parseDateFilter(from);
    const toDate = parseDateFilter(to, true);
    const limit = 20;
    const skip = (page - 1) * limit;

    const maxLogs = 250;
    const where: any = { shop: session.shop };

    if (query) {
        where.OR = [
            { ipAddress: { contains: query, mode: "insensitive" } },
            { countryCode: { contains: query, mode: "insensitive" } },
            { regionCode: { contains: query, mode: "insensitive" } },
            { regionName: { contains: query, mode: "insensitive" } },
            { city: { contains: query, mode: "insensitive" } },
            { action: { contains: query, mode: "insensitive" } },
            { ruleName: { contains: query, mode: "insensitive" } },
            { targetUrl: { contains: query, mode: "insensitive" } },
            { path: { contains: query, mode: "insensitive" } },
            { userAgent: { contains: query, mode: "insensitive" } },
        ];
    }

    if (action) {
        where.action = action;
    }

    if (country) {
        where.countryCode = country;
    }

    if (fromDate || toDate) {
        where.timestamp = {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
        };
    }

    const remainingLogSlots = Math.max(0, maxLogs - skip);
    const logTake = remainingLogSlots > 0 ? Math.min(limit + 1, remainingLogSlots + 1) : 0;
    const logsPromise = logTake > 0
        ? prisma.visitorLog.findMany({
            where,
            orderBy: { timestamp: "desc" },
            skip,
            take: logTake,
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
        })
        : Promise.resolve([]);

    const [logRows, filterOptions] = await Promise.all([
        logsPromise,
        getVisitorLogFilterOptions(session.shop),
    ]);

    const hasNextPage = logRows.length > limit && skip + limit < maxLogs;
    const logs = logRows.slice(0, limit);
    const totalLogs = Math.min(skip + logs.length + (hasNextPage ? 1 : 0), maxLogs);
    const totalPages = Math.max(1, page + (hasNextPage ? 1 : 0));

    const logsWithRegionNames = await Promise.all(logs.map(async (log) => ({
        ...log,
        regionName: await resolveVisitorLogRegionName(log, { useGeoLookupFallback: false }),
    })));

    return json({
        logs: logsWithRegionNames,
        page,
        totalPages,
        totalLogs,
        filters: { query, action, country, from, to },
        filterOptions,
    });
};

export default function VisitorLogs() {
    const { logs, page, totalPages, filters, filterOptions } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchParamsString = searchParams.toString();
    const today = startOfDay(new Date());
    const currentDateRange = getDefaultDateRange(filters.from, filters.to, today);
    const currentDatePreset = getMatchingDatePreset(filters.from, filters.to, today);
    const hasFilters = Boolean(filters.query || filters.action || filters.country || filters.from || filters.to);
    const dateRangeLabel = formatDateRangeLabel(filters.from, filters.to, today);
    const [queryDraft, setQueryDraft] = useState(filters.query);
    const [datePopoverActive, setDatePopoverActive] = useState(false);
    const [draftDatePreset, setDraftDatePreset] = useState<DateRangePreset>(currentDatePreset);
    const [draftDateRange, setDraftDateRange] = useState<DateRangeValue>(currentDateRange);
    const [datePickerMonth, setDatePickerMonth] = useState(currentDateRange.start.getMonth());
    const [datePickerYear, setDatePickerYear] = useState(currentDateRange.start.getFullYear());
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
        const nextDateRange = getDefaultDateRange(filters.from, filters.to, today);

        setDraftDatePreset(getMatchingDatePreset(filters.from, filters.to, today));
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
        } else {
            const nextRange = normalizeDateRange(draftDateRange);
            nextParams.set("from", formatDateParam(nextRange.start));
            nextParams.set("to", formatDateParam(nextRange.end));
        }

        setSearchParams(nextParams);
        setDatePopoverActive(false);
    };

    const clearFilters = () => {
        const nextParams = new URLSearchParams(searchParams);
        ["q", "action", "country", "from", "to", "page"].forEach((key) => nextParams.delete(key));
        setSearchParams(nextParams);
    };

    const getPageSearchParams = (nextPage: number) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("page", nextPage.toString());
        return nextParams;
    };

    const handleNextPage = () => {
        if (page < totalPages) {
            setSearchParams(getPageSearchParams(page + 1));
        }
    };

    const handlePreviousPage = () => {
        if (page > 1) {
            setSearchParams(getPageSearchParams(page - 1));
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
                return <Badge tone="critical">{label}</Badge>;
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

    const actionOptions = [
        { label: "All actions", value: "all" },
        ...filterOptions.actions.map((action) => ({
            label: formatActionLabel(action),
            value: action,
        })),
    ];

    const countryOptions = [
        { label: "All countries", value: "all" },
        ...filterOptions.countries.map((countryCode) => ({
            label: countryCode,
            value: countryCode,
        })),
    ];

    const resourceName = {
        singular: "log",
        plural: "logs",
    };

    const rowMarkup = logs.map(
        (
            log: any,
            index: number
        ) => {
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
        }
    );

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
                        align-items: flex-start;
                        justify-content: space-between;
                        gap: 20px;
                    }
                    .visitor-log-header-copy {
                        flex: 1 1 260px;
                        min-width: 220px;
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
                    @media (max-width: 47.9975em) {
                        .visitor-log-page-content {
                            padding-bottom: 88px;
                        }
                        .visitor-log-header {
                            flex-direction: column;
                            gap: 12px;
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
                            align-items: stretch;
                        }
                        .visitor-log-filter-search,
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
                                            Detailed logs of all visitor interactions
                                        </Text>
                                    </BlockStack>
                                </div>

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
                                                            <DatePicker
                                                                allowRange
                                                                multiMonth
                                                                month={datePickerMonth}
                                                                year={datePickerYear}
                                                                selected={draftDatePreset === "all" ? undefined : draftDateRange}
                                                                onChange={handleDateRangeChange}
                                                                onMonthChange={(month, year) => {
                                                                    setDatePickerMonth(month);
                                                                    setDatePickerYear(year);
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="visitor-log-date-footer">
                                                    <Button onClick={handleDatePopoverClose} size="slim">Cancel</Button>
                                                    <Button variant="primary" onClick={applyDateFilter} size="slim">Apply</Button>
                                                </div>
                                            </div>
                                        </Popover>
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
                                                value={filters.action || "all"}
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
                            </div>

                            <Card padding="0">
                                {logs.length > 0 ? (
                                    <>
                                        <IndexTable
                                            resourceName={resourceName}
                                            itemCount={logs.length}
                                            headings={[
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
                                            ]}
                                            selectable={false}
                                        >
                                            {rowMarkup}
                                        </IndexTable>
                                        <div className="visitor-log-pagination">
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                Latest logs are shown first.
                                            </Text>
                                            <Pagination
                                                hasPrevious={page > 1}
                                                onPrevious={handlePreviousPage}
                                                hasNext={page < totalPages}
                                                onNext={handleNextPage}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <EmptyState
                                        heading="No logs found"
                                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                    >
                                        <p>Visitor activity will appear here.</p>
                                    </EmptyState>
                                )}
                            </Card>
                        </BlockStack>
                    </div>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
