import { useCallback, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    Button,
    Badge,
    IndexTable,
    useIndexResourceState,
    TextField,
    Modal,
    FormLayout,
    InlineStack,
    EmptyState,
    useBreakpoints,
    Icon,
    Checkbox,
    ChoiceList,
    Select,
    RadioButton,
    Divider,
    Banner,
    Tooltip,
} from "@shopify/polaris";
import { SearchIcon, ChevronDownIcon, ChevronUpIcon, ImportIcon, ExportIcon, LockIcon } from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { detectRuleConflicts, detectCrossRuleConflicts } from "../utils/rule-conflicts";
import { getShopifyMarkets } from "../utils/shopify-markets.server";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { getShopifyPlanFromBillingCheck, hasPaidPlanAccess, resolveEffectivePlan } from "../utils/effective-plan.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { getThemeAppEmbedStatus, getThemeEditorUrl } from "../utils/theme-app-embed.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { normalizePagePathPatterns } from "../utils/page-targeting";

import { COUNTRY_MAP } from "../utils/countries";
import { STATE_MAP, STATE_COUNTRY_LABELS, COUNTRIES_WITH_STATES, getStateName, getStatesForCountry } from "../utils/states";

const REGIONS: Record<string, string[]> = {
    "North America": ["CA", "US", "MX", "BM", "GL", "PM"],
    "Central America & Caribbean": [
        "AG", "AI", "AW", "BB", "BL", "BQ", "BS", "BZ", "CR", "CU", "CW", "DM", "DO",
        "GD", "GP", "GT", "HN", "HT", "JM", "KN", "KY", "LC", "MF", "MQ", "MS", "NI",
        "PA", "PR", "SV", "SX", "TC", "TT", "VC", "VG", "VI"
    ],
    "South America": ["AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PE", "PY", "SR", "UY", "VE", "GS"],
    "Europe": [
        "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO",
        "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LI", "LT", "LU", "LV", "MC",
        "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SJ", "SK", "SM", "UA",
        "VA"
    ],
    "Asia": [
        "AF", "AM", "AZ", "BD", "BN", "BT", "CN", "GE", "HK", "ID", "IN", "JP", "KG", "KH", "KP", "KR", "KZ",
        "LA", "LK", "MM", "MN", "MO", "MV", "MY", "NP", "PH", "PK", "SG", "TH", "TJ", "TM", "TW", "UZ", "VN"
    ],
    "Middle East": ["AE", "BH", "IL", "IQ", "IR", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "YE"],
    "Africa": [
        "AO", "BF", "BI", "BJ", "BW", "CD", "CF", "CG", "CI", "CM", "CV", "DJ", "DZ", "EG", "ER", "ET", "GA",
        "GH", "GM", "GN", "GQ", "GW", "KE", "KM", "LR", "LS", "LY", "MA", "MG", "ML", "MR", "MU", "MW", "MZ",
        "NA", "NE", "NG", "RE", "RW", "SC", "SD", "SH", "SL", "SN", "SO", "SS", "ST", "SZ", "TD", "TG", "TN",
        "TZ", "UG", "YT", "ZA", "ZM", "ZW"
    ],
    "Oceania": [
        "AS", "AU", "CK", "FJ", "FM", "GU", "KI", "MH", "MP", "NC", "NF", "NR", "NU", "NZ", "PF", "PG", "PN",
        "PW", "SB", "TK", "TL", "TO", "TV", "VU", "WF", "WS"
    ],
    "Other": ["AQ", "BV", "CC", "CX", "HM", "IO", "TF", "UM"]
};
const ALL_REGION_COUNTRY_CODES = Array.from(new Set(Object.values(REGIONS).flat()));

interface RedirectRule {
    id: string;
    name: string;
    countryCodes: string;
    marketHandles: string;
    marketCountryCodes: string;
    matchType: string;
    targetUrl: string;
    isActive: boolean;
    priority: number;
    ruleType: string;
    redirectMode: string;
    scheduleEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: string | null;
    timezone: string | null;
    pageTargetingType: string;
    pagePaths: string | null;
    stateCodes: string;
}

function normalizeOption(value: string | null, allowed: string[], fallback: string) {
    return value && allowed.includes(value) ? value : fallback;
}

function validateUrl(url: string) {
    if (!url) return true; // Empty is OK (for block rules)
    const dangerous = /^(javascript|data|vbscript):/i;
    return !dangerous.test(url.trim());
}

function isPaidBillingConfig(billingConfig: any, settings: any) {
    const shopifyPlan = getShopifyPlanFromBillingCheck(billingConfig);
    const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
    return hasPaidPlanAccess(effectivePlan) || billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;
}

function isFreePlanFeatureRequest(ruleType: string, pageTargetingType: string, matchType = "country") {
    return ruleType === "block" || pageTargetingType !== "all" || matchType === "market" || matchType === "state";
}

function mergeConflictSummaries(...summaries: ReturnType<typeof detectRuleConflicts>[]) {
    return summaries.reduce(
        (merged, summary) => {
            merged.total += summary.total;
            Object.entries(summary.byRuleId).forEach(([ruleId, conflicts]) => {
                merged.byRuleId[ruleId] = [...(merged.byRuleId[ruleId] || []), ...conflicts];
            });
            return merged;
        },
        { total: 0, byRuleId: {} as Record<string, any[]> },
    );
}

// Loader: Fetch all rules for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const accessToken = session.accessToken || "";

    let rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: { in: ["country", "market", "state"] },
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription
    const [billingConfig, settings, appEmbedStatus] = await Promise.all([
        checkBillingWithFallback(billing, isBillingTestMode()),
        prisma.settings.findUnique({ where: { shop } }),
        getThemeAppEmbedStatus({
            shop,
            accessToken,
            scopeString: session.scope,
        }),
    ]);
    const hasProPlan = isPaidBillingConfig(billingConfig, settings);
    const marketsResult = await getShopifyMarkets(admin);
    const marketCountriesByHandle = new Map(
        marketsResult.markets.map((market) => [market.handle, market.countryCodes] as const),
    );
    const marketRuleBackfills = rules
        .filter((rule) => rule.matchType === "market" && !rule.marketCountryCodes)
        .map((rule) => {
            const countryCodes = Array.from(new Set(
                (rule.marketHandles || "")
                    .split(",")
                    .map((handle) => handle.trim())
                    .filter(Boolean)
                    .flatMap((handle) => marketCountriesByHandle.get(handle) || []),
            ));
            return { rule, countryCodes };
        })
        .filter((item) => item.countryCodes.length > 0);

    if (marketRuleBackfills.length > 0) {
        await Promise.all(
            marketRuleBackfills.map(({ rule, countryCodes }) =>
                prisma.redirectRule.update({
                    where: { id: rule.id },
                    data: { marketCountryCodes: countryCodes.join(",") },
                }),
            ),
        );
        rules = rules.map((rule) => {
            const backfill = marketRuleBackfills.find((item) => item.rule.id === rule.id);
            return backfill ? { ...rule, marketCountryCodes: backfill.countryCodes.join(",") } : rule;
        });
    }

    const conflictSummary = mergeConflictSummaries(
        detectRuleConflicts(rules, "country"),
        detectRuleConflicts(rules, "market"),
        detectRuleConflicts(rules, "state"),
        detectCrossRuleConflicts(rules),
    );

    return json({
        rules,
        shop,
        hasProPlan,
        conflictSummary,
        markets: marketsResult.markets,
        marketsError: marketsResult.error,
        appEmbedStatus,
        themeEditorUrl: getThemeEditorUrl(shop),
    });
};

// Action: Handle CRUD operations
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    try {
        const [billingConfig, settings] = await Promise.all([
            checkBillingWithFallback(billing, isBillingTestMode()),
            prisma.settings.findUnique({ where: { shop } }),
        ]);
        const hasProPlan = isPaidBillingConfig(billingConfig, settings);

        if (intent === "create") {
            const name = formData.get("name") as string;
            const matchType = normalizeOption(formData.get("matchType") as string | null, ["country", "market", "state"], "country");
            const countryCodes = formData.get("countryCodes") as string;
            const marketHandles = formData.get("marketHandles") as string;
            const marketCountryCodes = formData.get("marketCountryCodes") as string;
            const stateCodes = formData.get("stateCodes") as string || "";
            const targetUrl = formData.get("targetUrl") as string;
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = normalizeOption(formData.get("ruleType") as string | null, ["redirect", "block"], "redirect");
            const redirectMode = normalizeOption(formData.get("redirectMode") as string | null, ["popup", "auto_redirect"], "auto_redirect");
            const daysOfWeek = formData.get("daysOfWeek") as string;
            const timezone = formData.get("timezone") as string;
            const scheduleEnabled = formData.get("scheduleEnabled") === "true";
            const startTime = formData.get("startTime") as string;
            const endTime = formData.get("endTime") as string;
            const pageTargetingType = normalizeOption(formData.get("pageTargetingType") as string | null, ["all", "include", "exclude"], "all");
            const pagePaths = normalizePagePathPatterns(formData.get("pagePaths") as string | null);

            if (!hasProPlan && isFreePlanFeatureRequest(ruleType, pageTargetingType, matchType)) {
                return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
            }
            if (matchType === "country" && !countryCodes) {
                return json({ success: false, message: "Select at least one country" }, { status: 400 });
            }
            if (matchType === "market" && !marketHandles) {
                return json({ success: false, message: "Select at least one Shopify Market" }, { status: 400 });
            }
            if (matchType === "state" && !stateCodes) {
                return json({ success: false, message: "Select at least one state/region" }, { status: 400 });
            }
 
            await prisma.redirectRule.create({
                data: {
                    shop,
                    name,
                    countryCodes: matchType === "country" ? countryCodes : "",
                    marketHandles: matchType === "market" ? marketHandles : "",
                    marketCountryCodes: matchType === "market" ? marketCountryCodes : "",
                    targetUrl,
                    priority,
                    isActive: true,
                    ruleType,
                    redirectMode,
                    matchType,
                    stateCodes: matchType === "state" ? stateCodes : "",
                    scheduleEnabled,
                    startTime,
                    endTime,
                    daysOfWeek,
                    timezone,
                    pageTargetingType,
                    pagePaths,
                },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "Rule created successfully" });
        }

        if (intent === "update") {
            const id = formData.get("id") as string;
            const name = formData.get("name") as string;
            const matchType = normalizeOption(formData.get("matchType") as string | null, ["country", "market", "state"], "country");
            const countryCodes = formData.get("countryCodes") as string;
            const marketHandles = formData.get("marketHandles") as string;
            const marketCountryCodes = formData.get("marketCountryCodes") as string;
            const stateCodes = formData.get("stateCodes") as string || "";
            const targetUrl = formData.get("targetUrl") as string;
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = normalizeOption(formData.get("ruleType") as string | null, ["redirect", "block"], "redirect");
            const redirectMode = normalizeOption(formData.get("redirectMode") as string | null, ["popup", "auto_redirect"], "popup");
            const daysOfWeek = formData.get("daysOfWeek") as string;
            const timezone = formData.get("timezone") as string;
            const scheduleEnabled = formData.get("scheduleEnabled") === "true";
            const startTime = formData.get("startTime") as string;
            const endTime = formData.get("endTime") as string;
            const pageTargetingType = normalizeOption(formData.get("pageTargetingType") as string | null, ["all", "include", "exclude"], "all");
            const pagePaths = normalizePagePathPatterns(formData.get("pagePaths") as string | null);

            if (!hasProPlan && isFreePlanFeatureRequest(ruleType, pageTargetingType, matchType)) {
                return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
            }
            if (matchType === "country" && !countryCodes) {
                return json({ success: false, message: "Select at least one country" }, { status: 400 });
            }
            if (matchType === "market" && !marketHandles) {
                return json({ success: false, message: "Select at least one Shopify Market" }, { status: 400 });
            }
            if (matchType === "state" && !stateCodes) {
                return json({ success: false, message: "Select at least one state/region" }, { status: 400 });
            }

            await prisma.redirectRule.update({
                where: { id, shop },
                data: {
                    name,
                    countryCodes: matchType === "country" ? countryCodes : "",
                    marketHandles: matchType === "market" ? marketHandles : "",
                    marketCountryCodes: matchType === "market" ? marketCountryCodes : "",
                    matchType,
                    stateCodes: matchType === "state" ? stateCodes : "",
                    targetUrl,
                    priority,
                    ruleType,
                    redirectMode,
                    scheduleEnabled,
                    startTime,
                    endTime,
                    daysOfWeek,
                    timezone,
                    pageTargetingType,
                    pagePaths,
                },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "Rule updated successfully" });
        }

        if (intent === "toggle") {
            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";
            const nextIsActive = !isActive;

            if (!hasProPlan && !isActive) {
                const rule = await prisma.redirectRule.findFirst({
                    where: { id, shop, matchType: { in: ["country", "market", "state"] } },
                    select: { ruleType: true, pageTargetingType: true, matchType: true },
                });
                if (rule && isFreePlanFeatureRequest(rule.ruleType, rule.pageTargetingType || "all", rule.matchType)) {
                    return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
                }
            }

            await prisma.redirectRule.update({
                where: { id, shop },
                data: { isActive: nextIsActive },
            });
            invalidateStorefrontConfigCache(shop);
            return json({
                success: true,
                message: `Rule ${nextIsActive ? "enabled" : "disabled"} successfully`,
            });
        }

        if (intent === "delete") {
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids }, shop },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "Rule(s) deleted successfully" });
        }

        if (intent === "import") {
            // Server-side plan check: paid plans can import
            if (!hasProPlan) {
                return json({ success: false, message: "Import is only available on Premium plan and above" }, { status: 403 });
            }

            const rulesJson = formData.get("rulesJson") as string;
            if (!rulesJson) {
                return json({ success: false, message: "No rules data provided" }, { status: 400 });
            }

            let importedRules: any[];
            try {
                importedRules = JSON.parse(rulesJson);
                if (!Array.isArray(importedRules)) {
                    return json({ success: false, message: "Invalid format: expected an array of rules" }, { status: 400 });
                }
            } catch {
                return json({ success: false, message: "Invalid JSON format" }, { status: 400 });
            }

            let created = 0;
            for (const rule of importedRules) {
                const matchType = normalizeOption(rule.matchType, ["country", "market", "state"], "country");
                const countryCodes = rule.countryCodes || "";
                const marketHandles = rule.marketHandles || "";
                const marketCountryCodes = rule.marketCountryCodes || "";
                const stateCodes = rule.stateCodes || "";
                if (!rule.name) continue;
                if (matchType === "country" && !countryCodes) continue;
                if (matchType === "market" && !marketHandles) continue;
                if (matchType === "state" && !stateCodes) continue;
                if (rule.targetUrl && !validateUrl(rule.targetUrl)) continue;

                await prisma.redirectRule.create({
                    data: {
                        shop,
                        name: rule.name,
                        countryCodes: matchType === "country" ? countryCodes : "",
                        marketHandles: matchType === "market" ? marketHandles : "",
                        marketCountryCodes: matchType === "market" ? marketCountryCodes : "",
                        targetUrl: rule.targetUrl || "",
                        priority: parseInt(rule.priority) || 0,
                        isActive: rule.isActive !== false,
                        ruleType: normalizeOption(rule.ruleType, ["redirect", "block"], "redirect"),
                        redirectMode: normalizeOption(rule.redirectMode, ["popup", "auto_redirect"], "popup"),
                        matchType,
                        stateCodes: matchType === "state" ? stateCodes : "",
                        scheduleEnabled: rule.scheduleEnabled || false,
                        startTime: rule.startTime || null,
                        endTime: rule.endTime || null,
                        daysOfWeek: rule.daysOfWeek || null,
                        timezone: rule.timezone || null,
                        pageTargetingType: normalizeOption(rule.pageTargetingType, ["all", "include", "exclude"], "all"),
                        pagePaths: rule.pagePaths || null,
                    },
                });
                created++;
            }

            if (created > 0) invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: `Successfully imported ${created} rule(s)` });
        }

        return json({ success: false, message: "Unknown intent" });
    } catch (error) {
        console.error("Action error:", error);
        return json({ success: false, message: "An error occurred" }, { status: 500 });
    }
};

export default function RulesPage() {
    const { rules, hasProPlan, conflictSummary, markets, marketsError, appEmbedStatus, themeEditorUrl } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const formFetcher = useFetcher<typeof action>();
    const importFetcher = useFetcher<typeof action>();
    const deleteFetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RedirectRule | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importData, setImportData] = useState("");
    const [importFileName, setImportFileName] = useState("");
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    // Form state
    const [formName, setFormName] = useState("");
    const [formMatchType, setFormMatchType] = useState("country");
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
    const [selectedStates, setSelectedStates] = useState<string[]>([]);
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("redirect");
    const [formRedirectMode, setFormRedirectMode] = useState("auto_redirect");
    // Scheduling State
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("17:00");
    const [activeDays, setActiveDays] = useState<string[]>(["1", "2", "3", "4", "5"]); // Mon-Fri default
    const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
    const [pageTargetingType, setPageTargetingType] = useState<string[]>(["all"]);
    const [pagePaths, setPagePaths] = useState("");

    useEffect(() => {
        if (fetcher.state !== "idle" || !fetcher.data?.message) return;
        shopify.toast.show(fetcher.data.message, {
            isError: fetcher.data.success === false,
        });
    }, [fetcher.data, fetcher.state, shopify]);

    useEffect(() => {
        if (formFetcher.state !== "idle" || !formFetcher.data?.message) return;
        shopify.toast.show(formFetcher.data.message, { isError: formFetcher.data.success === false });
        if (formFetcher.data.success) {
            setModalOpen(false);
            setEditingRule(null);
        }
    }, [formFetcher.data, formFetcher.state, shopify]);

    useEffect(() => {
        if (importFetcher.state !== "idle" || !importFetcher.data?.message) return;
        shopify.toast.show(importFetcher.data.message, { isError: importFetcher.data.success === false });
        if (importFetcher.data.success) {
            setImportModalOpen(false);
            setImportData("");
            setImportFileName("");
        }
    }, [importFetcher.data, importFetcher.state, shopify]);

    // Autocomplete state
    const [inputValue, setInputValue] = useState("");
    const [expandedRegions, setExpandedRegions] = useState<string[]>([]);
    const [stateInputValue, setStateInputValue] = useState("");
    const [expandedStateCountries, setExpandedStateCountries] = useState<string[]>([]);

    const { smUp } = useBreakpoints();
    const resourceName = {
        singular: "rule",
        plural: "rules",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
        useIndexResourceState(rules);
    const conflictsByRuleId = conflictSummary?.byRuleId || {};
    const conflictTotal = conflictSummary?.total || 0;

    useEffect(() => {
        if (deleteFetcher.state !== "idle" || !deleteFetcher.data?.message) return;
        shopify.toast.show(deleteFetcher.data.message, { isError: deleteFetcher.data.success === false });
        if (deleteFetcher.data.success) {
            setDeleteModalOpen(false);
            clearSelection();
        }
    }, [clearSelection, deleteFetcher.data, deleteFetcher.state, shopify]);

    // Get country label from code
    const getCountryLabel = (code: string) => {
        return COUNTRY_MAP[code] || code;
    };
    const marketLabelByHandle = markets.reduce((labels: Record<string, string>, market: any) => {
        labels[market.handle] = market.name || market.handle;
        return labels;
    }, {});
    const marketCountryCodesByHandle = markets.reduce((items: Record<string, string[]>, market: any) => {
        items[market.handle] = Array.isArray(market.countryCodes) ? market.countryCodes : [];
        return items;
    }, {});
    const getMarketCountryCount = (handle: string, rule?: any) => {
        const liveCount = marketCountryCodesByHandle[handle]?.length || 0;
        if (liveCount > 0) return liveCount;

        const ruleMarketHandles = (rule?.marketHandles || "")
            .split(",")
            .map((value: string) => value.trim())
            .filter(Boolean);
        if (ruleMarketHandles.length === 1 && ruleMarketHandles[0] === handle) {
            return (rule?.marketCountryCodes || "")
                .split(",")
                .map((value: string) => value.trim())
                .filter(Boolean).length;
        }

        return 0;
    };
    const formatMarketLabel = (handle: string, rule?: any) => {
        const label = marketLabelByHandle[handle] || handle;
        const countryCount = getMarketCountryCount(handle, rule);
        return countryCount > 1 ? `${label} (${countryCount} countries)` : label;
    };
    const formatMarketOptionLabel = (market: any) => {
        const countryCount = Array.isArray(market.countryCodes) ? market.countryCodes.length : 0;
        return countryCount > 1 ? `${market.label} (${countryCount} countries)` : market.label;
    };

    // Reset form when modal opens/closes
    useEffect(() => {
        if (editingRule) {
            setFormName(editingRule.name);
            setFormMatchType(editingRule.matchType || "country");
            setSelectedCountries(editingRule.countryCodes.split(",").map(c => c.trim()).filter(Boolean));
            setSelectedMarkets((editingRule.marketHandles || "").split(",").map(c => c.trim()).filter(Boolean));
            setSelectedStates((editingRule.stateCodes || "").split(",").map(c => c.trim()).filter(Boolean));
            setFormTargetUrl(editingRule.targetUrl);
            setFormPriority(editingRule.priority.toString());
            setFormRuleType(editingRule.ruleType || "redirect");
            setFormRedirectMode(editingRule.redirectMode || "popup");
            setScheduleEnabled(editingRule.scheduleEnabled || false);
            setStartTime(editingRule.startTime || "09:00");
            setEndTime(editingRule.endTime || "17:00");
            setActiveDays(editingRule.daysOfWeek ? editingRule.daysOfWeek.split(",") : ["1", "2", "3", "4", "5"]);
            setTimezone(editingRule.timezone || "Asia/Ho_Chi_Minh");
            setPageTargetingType([editingRule.pageTargetingType || "all"]);
            setPagePaths(editingRule.pagePaths || "");
            setExpandedRegions([]); // Reset expansion
            setExpandedStateCountries([]);
        } else {
            setFormName("");
            setFormMatchType("country");
            setSelectedCountries([]);
            setSelectedMarkets([]);
            setSelectedStates([]);
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("redirect");
            setFormRedirectMode("auto_redirect");
            setScheduleEnabled(false);
            setStartTime("09:00");
            setEndTime("17:00");
            setActiveDays(["1", "2", "3", "4", "5"]);
            setTimezone("Asia/Ho_Chi_Minh");
            setPageTargetingType(["all"]);
            setPagePaths("");
            setExpandedRegions([]);
            setExpandedStateCountries([]);
        }
        setInputValue("");
        setStateInputValue("");
    }, [editingRule, modalOpen]);

    const handleOpenModal = useCallback((rule?: RedirectRule) => {
        setEditingRule(rule || null);
        setModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setModalOpen(false);
        setEditingRule(null);
    }, []);

    const handleSubmit = useCallback(() => {
        const formData = new FormData();
        formData.append("intent", editingRule ? "update" : "create");
        if (editingRule) formData.append("id", editingRule.id);
        formData.append("name", formName);
        formData.append("matchType", formMatchType);
        formData.append("countryCodes", selectedCountries.join(","));
        formData.append("marketHandles", selectedMarkets.join(","));
        formData.append("stateCodes", selectedStates.join(","));
        const selectedMarketCountryCodes = Array.from(new Set(
            selectedMarkets.flatMap((handle) => marketCountryCodesByHandle[handle] || []),
        ));
        formData.append(
            "marketCountryCodes",
            selectedMarketCountryCodes.length > 0
                ? selectedMarketCountryCodes.join(",")
                : editingRule?.marketCountryCodes || "",
        );
        formData.append("targetUrl", formTargetUrl);
        formData.append("priority", formPriority);
        formData.append("ruleType", formRuleType);
        formData.append("redirectMode", formRedirectMode);
        formData.append("scheduleEnabled", scheduleEnabled.toString());
        formData.append("startTime", startTime);
        formData.append("endTime", endTime);
        formData.append("daysOfWeek", activeDays.join(","));
        formData.append("timezone", timezone);
        formData.append("pageTargetingType", pageTargetingType[0]);
        formData.append("pagePaths", pagePaths);

        formFetcher.submit(formData, { method: "POST" });
    }, [
        editingRule, formName, formMatchType, selectedCountries, selectedMarkets, selectedStates, marketCountryCodesByHandle, formTargetUrl, formPriority,
        formRuleType, formRedirectMode, scheduleEnabled, startTime, endTime, activeDays, timezone,
        pageTargetingType, pagePaths,
        formFetcher
    ]);

    const handleToggle = useCallback(
        (rule: RedirectRule) => {
            const formData = new FormData();
            formData.append("intent", "toggle");
            formData.append("id", rule.id);
            formData.append("isActive", rule.isActive.toString());
            fetcher.submit(formData, { method: "POST" });
        },
        [fetcher]
    );

    const handleBulkDelete = useCallback(() => {
        if (selectedResources.length === 0) return;
        setDeleteModalOpen(true);
    }, [selectedResources]);

    const handleConfirmBulkDelete = useCallback(() => {
        if (selectedResources.length === 0) return;
        const formData = new FormData();
        formData.append("intent", "delete");
        formData.append("ids", selectedResources.join(","));
        deleteFetcher.submit(formData, { method: "POST" });
    }, [selectedResources, deleteFetcher]);

    const handleBulkSelect = (region: keyof typeof REGIONS | "ALL" | "CLEAR") => {
        if (region === "CLEAR") {
            setSelectedCountries([]);
            return;
        }
        if (region === "ALL") {
            setSelectedCountries(ALL_REGION_COUNTRY_CODES);
            return;
        }
        // Add countries from region that aren't already selected
        const countriesToAdd = REGIONS[region].filter(c => !selectedCountries.includes(c));
        setSelectedCountries([...selectedCountries, ...countriesToAdd]);
    };

    const toggleRegionExpansion = (region: string) => {
        setExpandedRegions(prev =>
            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
        );
    };

    const toggleRegionSelection = (region: keyof typeof REGIONS) => {
        const regionCountries = REGIONS[region];
        const allSelected = regionCountries.every(c => selectedCountries.includes(c));

        if (allSelected) {
            // Deselect all
            setSelectedCountries(selectedCountries.filter(c => !regionCountries.includes(c)));
        } else {
            // Select all
            const toAdd = regionCountries.filter(c => !selectedCountries.includes(c));
            setSelectedCountries([...selectedCountries, ...toAdd]);
        }
    };

    const toggleCountrySelection = (countryCode: string) => {
        if (selectedCountries.includes(countryCode)) {
            setSelectedCountries(selectedCountries.filter(c => c !== countryCode));
        } else {
            setSelectedCountries([...selectedCountries, countryCode]);
        }
    };

    const toggleStateCountryExpansion = (countryCode: string) => {
        setExpandedStateCountries(prev =>
            prev.includes(countryCode) ? prev.filter(c => c !== countryCode) : [...prev, countryCode]
        );
    };

    const toggleStateCountrySelection = (countryCode: string) => {
        const countryStates = getStatesForCountry(countryCode);
        const allSelected = countryStates.every(s => selectedStates.includes(s));

        if (allSelected) {
            // Deselect all states in this country
            setSelectedStates(selectedStates.filter(s => !countryStates.includes(s)));
        } else {
            // Select all states in this country
            const toAdd = countryStates.filter(s => !selectedStates.includes(s));
            setSelectedStates([...selectedStates, ...toAdd]);
        }
    };

    const handleStateBulkSelect = (action: "ALL" | "CLEAR") => {
        if (action === "CLEAR") {
            setSelectedStates([]);
            return;
        }
        if (action === "ALL") {
            const allStates = COUNTRIES_WITH_STATES.flatMap(code => getStatesForCountry(code));
            setSelectedStates(allStates);
            return;
        }
    };

    const toggleMarketSelection = (marketHandle: string) => {
        if (selectedMarkets.includes(marketHandle)) {
            setSelectedMarkets(selectedMarkets.filter(handle => handle !== marketHandle));
        } else {
            setSelectedMarkets([...selectedMarkets, marketHandle]);
        }
    };

    // --- Export Rules ---
    const handleExportRules = useCallback((exportAll: boolean) => {
        const rulesToExport = exportAll
            ? rules
            : rules.filter((r: any) => selectedResources.includes(r.id));

        const exportData = rulesToExport.map((rule: any) => ({
            name: rule.name,
            matchType: rule.matchType,
            countryCodes: rule.countryCodes,
            marketHandles: rule.marketHandles,
            marketCountryCodes: rule.marketCountryCodes,
            stateCodes: rule.stateCodes,
            targetUrl: rule.targetUrl,
            priority: rule.priority,
            ruleType: rule.ruleType,
            redirectMode: rule.redirectMode,
            scheduleEnabled: rule.scheduleEnabled,
            startTime: rule.startTime,
            endTime: rule.endTime,
            daysOfWeek: rule.daysOfWeek,
            timezone: rule.timezone,
            pageTargetingType: rule.pageTargetingType,
            pagePaths: rule.pagePaths,
        }));

        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(exportData, null, 2)
        )}`;
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", jsonString);
        downloadAnchor.setAttribute("download", `geolocation_rules_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }, [rules, selectedResources]);

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setImportData(text);
        };
        reader.readAsText(file);
    }, []);

    const handleImportSubmit = useCallback(() => {
        if (!importData) return;
        const formData = new FormData();
        formData.append("intent", "import");
        formData.append("rulesJson", importData);
        importFetcher.submit(formData, { method: "POST" });
    }, [importData, importFetcher]);

    const promotedBulkActions = [
        {
            content: "Delete selected",
            onAction: handleBulkDelete,
        },
        ...(hasProPlan ? [{
            content: "Export selected",
            onAction: () => handleExportRules(false),
        }] : []),
    ];
    const selectedTargetCount = formMatchType === "market" ? selectedMarkets.length : (formMatchType === "state" ? selectedStates.length : selectedCountries.length);
    const isPaidOnlyRule = (rule: any) =>
        rule.ruleType === "block" || rule.matchType === "market" || rule.matchType === "state" || (rule.pageTargetingType || "all") !== "all";

    const rowMarkup = rules.map((rule: any, index: number) => {
        const ruleConflicts = conflictsByRuleId[rule.id] || [];
        const conflictTone = ruleConflicts.some((item: any) => item.severity === "critical") ? "critical" : "warning";
        const conflictTooltip = ruleConflicts
            .slice(0, 3)
            .map((item: any) => `${item.message} (${item.scope})`)
            .join("\n");
        const targetValues = (rule.matchType === "market" ? rule.marketHandles : (rule.matchType === "state" ? rule.stateCodes : rule.countryCodes))
            .split(",")
            .map((value: string) => value.trim())
            .filter(Boolean);

        return (
        <IndexTable.Row
            id={rule.id}
            key={rule.id}
            selected={selectedResources.includes(rule.id)}
            position={index}
            onClick={() => handleOpenModal(rule)}
        >
            <IndexTable.Cell>
                <div style={{ minWidth: "120px" }}>
                    <InlineStack gap="100" blockAlign="center" wrap={false}>
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                            {rule.name}
                        </Text>
                        {ruleConflicts.length > 0 && (
                            <Tooltip content={conflictTooltip}>
                                <Badge tone={conflictTone}>
                                    {`${ruleConflicts.length} conflict${ruleConflicts.length === 1 ? "" : "s"}`}
                                </Badge>
                            </Tooltip>
                        )}
                    </InlineStack>
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ minWidth: "64px" }}>
                    <Badge tone={rule.matchType === "market" ? "attention" : (rule.matchType === "state" ? "warning" : "info")}>
                        {rule.matchType === "market" ? "Market" : (rule.matchType === "state" ? "State" : "Country")}
                    </Badge>
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ minWidth: "300px" }}>
                    <InlineStack gap="100" wrap={false}>
                        {targetValues.slice(0, 3).map((value: string) => (
                            <Badge key={value} tone={rule.matchType === "market" ? "attention" : (rule.matchType === "state" ? "warning" : "info")}>
                                {rule.matchType === "market" ? formatMarketLabel(value, rule) : (rule.matchType === "state" ? `${getStateName(value)} (${value})` : value)}
                            </Badge>
                        ))}
                        {targetValues.length > 3 && (
                            <Badge>{`+${targetValues.length - 3}`}</Badge>
                        )}
                    </InlineStack>
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ minWidth: "180px" }}>
                    <Text as="span" variant="bodyMd" truncate>
                        {rule.ruleType === "block" ? (
                            <Badge tone="attention">Access Blocked</Badge>
                        ) : (
                            rule.targetUrl
                        )}
                    </Text>
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ minWidth: "64px" }}>
                    {rule.isActive && isPaidOnlyRule(rule) && !hasProPlan ? (
                        <Badge tone="warning">Disabled (Free Plan)</Badge>
                    ) : (
                        <Badge tone={rule.isActive ? "success" : "warning"}>
                            {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                    )}
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ minWidth: "110px" }}>
                    {rule.ruleType === 'redirect' ? (
                        <Badge tone={rule.redirectMode === 'auto_redirect' ? 'warning' : 'info'}>
                            {rule.redirectMode === 'auto_redirect' ? 'Auto Redirect' : 'Popup'}
                        </Badge>
                    ) : (
                        <Badge tone="attention">Block</Badge>
                    )}
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>{rule.priority}</IndexTable.Cell>
            <IndexTable.Cell>
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", justifyContent: "flex-end", minWidth: "124px" }}
                >
                    <InlineStack gap="200" wrap={false}>
                        <Button size="slim" onClick={() => handleOpenModal(rule)}>
                            Edit
                        </Button>
                        {rule.isActive ? (
                            <Button size="slim" onClick={() => handleToggle(rule)}>
                                Disable
                            </Button>
                        ) : (
                            <Button
                                size="slim"
                                onClick={() => handleToggle(rule)}
                                disabled={isPaidOnlyRule(rule) && !hasProPlan}
                            >
                                Enable
                            </Button>
                        )}
                    </InlineStack>
                </div>
            </IndexTable.Cell>
        </IndexTable.Row>
        );
    });

    const getUniqueConflicts = () => {
        if (!conflictsByRuleId) return [];
        const seen = new Set<string>();
        const uniqueList: Array<{
            ruleName: string;
            otherRuleName: string;
            scope: string;
            priority: number;
        }> = [];

        Object.entries(conflictsByRuleId).forEach(([ruleId, conflicts]) => {
            const rule = rules.find((r: any) => r.id === ruleId);
            if (!rule) return;
            conflicts.forEach((conflict: any) => {
                const pairKey = [ruleId, conflict.otherRuleId].sort().join("-");
                if (!seen.has(pairKey)) {
                    seen.add(pairKey);
                    uniqueList.push({
                        ruleName: rule.name,
                        otherRuleName: conflict.otherRuleName,
                        scope: conflict.scope,
                        priority: rule.priority,
                    });
                }
            });
        });
        return uniqueList;
    };

    const emptyStateMarkup = (
        <EmptyState
            heading="Create your first redirect rule"
            action={{ content: "Add Rule", onAction: () => handleOpenModal() }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <BlockStack gap="400">
                <p>Set up rules to redirect or block customers by country or Shopify Market.</p>
            </BlockStack>
        </EmptyState>
    );

    return (
        <Page fullWidth>
            <TitleBar title="Geolocation Rules">
            </TitleBar>
            <style>
                {`
                    .country-selector-scroll {
                        scrollbar-color: #8a8f93 transparent;
                        scrollbar-width: thin;
                    }
                    .country-selector-scroll::-webkit-scrollbar {
                        width: 8px;
                    }
                    .country-selector-scroll::-webkit-scrollbar-track {
                        background: transparent;
                        border-radius: 999px;
                    }
                    .country-selector-scroll::-webkit-scrollbar-thumb {
                        background: #8a8f93;
                        border: 2px solid #ffffff;
                        border-radius: 999px;
                    }
                    .country-selector-scroll::-webkit-scrollbar-thumb:hover {
                        background: #6d7175;
                    }
                    .rules-table-wrap {
                        width: 100%;
                        max-width: 100%;
                        overflow-x: auto;
                        overflow-y: hidden;
                        -webkit-overflow-scrolling: touch;
                        border-radius: var(--p-border-radius-200, 8px);
                    }
                    .rules-page .Polaris-ShadowBevel {
                        --pc-shadow-bevel-border-radius-xs: var(--p-border-radius-200, 8px) !important;
                        border-radius: var(--p-border-radius-200, 8px);
                    }
                    .rules-page .Polaris-ShadowBevel > .Polaris-Box {
                        border-radius: inherit;
                    }
                    .rules-table-wrap .Polaris-IndexTable-ScrollContainer {
                        overflow: visible !important;
                        max-height: none;
                    }
                    .rules-table-wrap .Polaris-IndexTable__ScrollBarContainer {
                        display: none !important;
                    }
                    .rules-table-wrap .Polaris-IndexTable,
                    .rules-table-wrap .Polaris-IndexTable__Table {
                        width: 100%;
                        min-width: 1280px;
                    }
                    .rules-table-wrap .Polaris-IndexTable__TableHeading--first,
                    .rules-table-wrap .Polaris-IndexTable__TableHeading--second {
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .rules-table-wrap .Polaris-IndexTable__TableCell--first,
                    .rules-table-wrap .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell {
                        background: var(--p-color-bg-surface, #ffffff);
                    }
                    .rules-table-wrap .Polaris-IndexTable__TableHeading--first,
                    .rules-table-wrap .Polaris-IndexTable__TableCell--first {
                        box-shadow: 1px 0 0 var(--p-color-border-secondary, #ebebeb);
                    }
                    @media (max-width: 47.9975em) {
                        .rules-table-wrap .Polaris-IndexTable,
                        .rules-table-wrap .Polaris-IndexTable__Table {
                            min-width: 880px;
                        }
                    }
                `}
            </style>
            <div className="rules-page">
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                }}>
                    <BlockStack gap="100">
                        <Text as="h1" variant="headingLg">Geolocation Rules</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                            Create country-based rules to redirect, block, or target visitors by location.
                        </Text>
                    </BlockStack>
                    <InlineStack gap="200" align="end">
                        <Tooltip content={!hasProPlan ? "This feature is available on higher plans. Upgrade to unlock it." : ""}>
                            <div style={{ opacity: !hasProPlan ? 0.6 : 1 }}>
                                <Button
                                    icon={!hasProPlan ? LockIcon : ExportIcon}
                                    onClick={() => handleExportRules(true)}
                                    disabled={!hasProPlan || rules.length === 0}
                                >
                                    Export All
                                </Button>
                            </div>
                        </Tooltip>
                        <Tooltip content={!hasProPlan ? "This feature is available on higher plans. Upgrade to unlock it." : ""}>
                            <div style={{ opacity: !hasProPlan ? 0.6 : 1 }}>
                                <Button
                                    icon={!hasProPlan ? LockIcon : ImportIcon}
                                    onClick={() => setImportModalOpen(true)}
                                    disabled={!hasProPlan}
                                >
                                    Import
                                </Button>
                            </div>
                        </Tooltip>
                        <Button variant="primary" onClick={() => handleOpenModal()}>
                            Add Rule
                        </Button>
                    </InlineStack>
                </div>
                <BlockStack gap="500">
                {appEmbedStatus.state !== "enabled" && (
                    <Banner
                        tone="warning"
                        title={appEmbedStatus.state === "missing_scope" ? "App embed status needs permission" : "Enable app embed before testing rules"}
                    >
                        <BlockStack gap="200">
                            <p>{appEmbedStatus.helpText}</p>
                            <p>Rules can be saved here, but they only run on your storefront after the Shopify theme app embed is enabled.</p>
                            <InlineStack gap="200">
                                <Button url={themeEditorUrl} target="_blank">
                                    Enable app embed
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Banner>
                )}
                {conflictTotal > 0 && (
                    <Banner tone="warning" title={`${conflictTotal} potential rule conflict${conflictTotal === 1 ? "" : "s"} found`}>
                        <BlockStack gap="200">
                            <p>Active rules with overlapping countries or markets, pages, schedules, and the same priority can conflict. Open the marked rules and adjust priority or targeting.</p>
                            <Divider />
                            <Text as="p" variant="bodyMd" fontWeight="semibold">Detailed conflicts:</Text>
                            <ul style={{ paddingLeft: '20px', margin: 0, listStyleType: 'disc' }}>
                                {getUniqueConflicts().map((c, idx) => {
                                    const parts = c.scope.split(";").map(s => s.trim());
                                    const targetScope = parts[0] || "";
                                    const pageScope = parts[1] || "";
                                    const scheduleScope = parts[2] || "";
                                    return (
                                        <li key={idx} style={{ marginBottom: '12px' }}>
                                            <div style={{ marginBottom: '4px' }}>
                                                <Text as="span" fontWeight="bold">Rule "{c.ruleName}"</Text> conflicts with <Text as="span" fontWeight="bold">Rule "{c.otherRuleName}"</Text>:
                                            </div>
                                            <ul style={{ paddingLeft: '16px', listStyleType: 'circle' }}>
                                                <li><Text as="span" fontWeight="medium">Overlapping Location:</Text> {targetScope}</li>
                                                <li><Text as="span" fontWeight="medium">Overlapping Pages:</Text> {pageScope}</li>
                                                <li><Text as="span" fontWeight="medium">Overlapping Schedule:</Text> {scheduleScope}</li>
                                                <li><Text as="span" fontWeight="medium">Same Priority:</Text> {c.priority}</li>
                                            </ul>
                                            <div style={{ marginTop: '6px' }}>
                                                <Text as="span" tone="subdued" variant="bodySm">
                                                    💡 <strong>How to fix:</strong> Edit one of these rules and change its <strong>Priority</strong> (e.g. raise one to 1 or lower to -1) so the winning rule is deterministic.
                                                </Text>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </BlockStack>
                    </Banner>
                )}
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            {rules.length === 0 ? (
                                emptyStateMarkup
                            ) : (
                                <div className="rules-table-wrap">
                                    <IndexTable
                                        condensed={false}
                                        resourceName={resourceName}
                                        itemCount={rules.length}
                                        selectedItemsCount={
                                            allResourcesSelected ? "All" : selectedResources.length
                                        }
                                        onSelectionChange={handleSelectionChange}
                                        headings={[
                                            { title: "Name" },
                                            { title: "Type" },
                                            { title: "Target" },
                                            { title: "Target URL" },
                                            { title: "Status" },
                                            { title: "Method" },
                                            { title: "Priority" },
                                            { title: "Actions", alignment: "end" },
                                        ]}
                                        promotedBulkActions={promotedBulkActions}
                                    >
                                        {rowMarkup}
                                    </IndexTable>
                                </div>
                            )}
                        </Card>
                    </Layout.Section>
                </Layout>
            </BlockStack>
            </div>

            {/* Add/Edit Modal */}
            <Modal
                open={modalOpen}
                onClose={handleCloseModal}
                title={editingRule ? "Edit Rule" : "Add New Rule"}
                primaryAction={{
                    content: editingRule ? "Save" : "Create",
                    onAction: handleSubmit,
                    loading: formFetcher.state !== "idle",
                    disabled: formFetcher.state !== "idle" || selectedTargetCount === 0 || !formName || (formRuleType === "redirect" && !formTargetUrl),
                }}
                secondaryActions={[
                    {
                        content: "Cancel",
                        onAction: handleCloseModal,
                    },
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                    {formFetcher.state === "idle" && formFetcher.data?.success === false && (
                        <Banner tone="critical">{formFetcher.data.message}</Banner>
                    )}
                    <FormLayout>
                        <TextField
                            label="Rule Name"
                            value={formName}
                            onChange={setFormName}
                            placeholder="e.g., US Redirect"
                            autoComplete="off"
                        />

                        <BlockStack gap="300">
                            <BlockStack gap="200">
                                <Text as="p" variant="bodyMd">Target visitors by</Text>
                                <RadioButton
                                    label="Country"
                                    checked={formMatchType === "country"}
                                    id="matchTypeCountry"
                                    name="matchType"
                                    onChange={() => setFormMatchType("country")}
                                />
                                {hasProPlan ? (
                                    <RadioButton
                                        label="State/Region"
                                        checked={formMatchType === "state"}
                                        id="matchTypeState"
                                        name="matchType"
                                        onChange={() => setFormMatchType("state")}
                                    />
                                ) : (
                                    <div style={{ opacity: 0.65, width: "fit-content" }}>
                                        <RadioButton
                                            label={(
                                                <InlineStack gap="200">
                                                    <span>State/Region</span>
                                                    <Badge tone="warning">Premium</Badge>
                                                </InlineStack>
                                            )}
                                            checked={false}
                                            id="matchTypeState"
                                            name="matchType"
                                            disabled
                                        />
                                    </div>
                                )}
                                {hasProPlan ? (
                                    <RadioButton
                                        label="Shopify Market"
                                        checked={formMatchType === "market"}
                                        id="matchTypeMarket"
                                        name="matchType"
                                        onChange={() => setFormMatchType("market")}
                                    />
                                ) : (
                                    <div style={{ opacity: 0.65, width: "fit-content" }}>
                                        <RadioButton
                                            label={(
                                                <InlineStack gap="200">
                                                    <span>Shopify Market</span>
                                                    <Badge tone="warning">Premium</Badge>
                                                </InlineStack>
                                            )}
                                            checked={false}
                                            id="matchTypeMarket"
                                            name="matchType"
                                            disabled
                                        />
                                    </div>
                                )}
                            </BlockStack>

                            {formMatchType === "country" && (
                                <BlockStack gap="300">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="p" variant="bodySm" fontWeight="semibold">Countries</Text>
                                        <Badge tone={selectedCountries.length > 0 ? "success" : "attention"}>
                                            {`${selectedCountries.length} selected`}
                                        </Badge>
                                    </InlineStack>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: smUp ? "minmax(0, 1fr) auto" : "1fr",
                                            gap: "8px",
                                            alignItems: "stretch",
                                        }}
                                    >
                                        <TextField
                                            label="Search countries/regions"
                                            labelHidden
                                            placeholder="Search countries..."
                                            value={inputValue}
                                            onChange={setInputValue}
                                            prefix={<Icon source={SearchIcon} />}
                                            autoComplete="off"
                                        />

                                        <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                                            <Button onClick={() => handleBulkSelect("ALL")}>Select All</Button>
                                            <Button onClick={() => handleBulkSelect("CLEAR")}>Clear All</Button>
                                        </div>
                                    </div>

                                    <div className="country-selector-scroll" style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #dfe3e8', borderRadius: '8px', padding: '6px', background: '#ffffff' }}>
                                        {Object.entries(REGIONS).map(([regionName, codes]) => {
                                            const matchingCountryCodes = codes.filter(code => {
                                                if (!inputValue) return true;
                                                const label = getCountryLabel(code).toLowerCase();
                                                const region = regionName.toLowerCase();
                                                const search = inputValue.toLowerCase();
                                                return label.includes(search) || code.toLowerCase().includes(search) || region.includes(search);
                                            });

                                            if (matchingCountryCodes.length === 0) return null;

                                            const isAllSelected = matchingCountryCodes.every(c => selectedCountries.includes(c));
                                            const isSomeSelected = matchingCountryCodes.some(c => selectedCountries.includes(c));
                                            const isIndeterminate = isSomeSelected && !isAllSelected;
                                            const isExpanded = expandedRegions.includes(regionName) || !!inputValue;
                                            const selectedInRegion = matchingCountryCodes.filter(c => selectedCountries.includes(c)).length;

                                            return (
                                                <div key={regionName} style={{ marginBottom: '4px' }}>
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '24px minmax(0, 1fr) auto',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            background: isExpanded ? '#f6f6f7' : 'transparent',
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${regionName}`}
                                                            onClick={() => toggleRegionExpansion(regionName)}
                                                            style={{
                                                                alignItems: 'center',
                                                                background: 'transparent',
                                                                border: 0,
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                height: '24px',
                                                                justifyContent: 'center',
                                                                padding: 0,
                                                                width: '24px',
                                                            }}
                                                        >
                                                            <Icon source={isExpanded ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                                                        </button>
                                                        <Checkbox
                                                            label={regionName}
                                                            checked={isIndeterminate ? "indeterminate" : isAllSelected}
                                                            onChange={() => toggleRegionSelection(regionName as any)}
                                                        />
                                                        <Text as="span" variant="bodySm" tone="subdued">
                                                            {`${selectedInRegion}/${matchingCountryCodes.length}`}
                                                        </Text>
                                                    </div>

                                                    {isExpanded && (
                                                        <div
                                                            style={{
                                                                display: 'grid',
                                                                gap: '2px 12px',
                                                                gridTemplateColumns: smUp ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                                                                padding: '6px 8px 8px 40px',
                                                            }}
                                                        >
                                                            {matchingCountryCodes.map(code => (
                                                                <div key={code} style={{ padding: '2px 0' }}>
                                                                    <Checkbox
                                                                        label={`${getCountryLabel(code)} (${code})`}
                                                                        checked={selectedCountries.includes(code)}
                                                                        onChange={() => toggleCountrySelection(code)}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </BlockStack>
                            )}

                            {formMatchType === "state" && (
                                <BlockStack gap="300">

                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="p" variant="bodySm" fontWeight="semibold">States/Regions</Text>
                                        <Badge tone={selectedStates.length > 0 ? "success" : "attention"}>
                                            {`${selectedStates.length} selected`}
                                        </Badge>
                                    </InlineStack>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: smUp ? "minmax(0, 1fr) auto" : "1fr",
                                            gap: "8px",
                                            alignItems: "stretch",
                                        }}
                                    >
                                        <TextField
                                            label="Search states/regions"
                                            labelHidden
                                            placeholder="Search states..."
                                            value={stateInputValue}
                                            onChange={setStateInputValue}
                                            prefix={<Icon source={SearchIcon} />}
                                            autoComplete="off"
                                        />

                                        <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                                            <Button onClick={() => handleStateBulkSelect("ALL")}>Select All</Button>
                                            <Button onClick={() => handleStateBulkSelect("CLEAR")}>Clear All</Button>
                                        </div>
                                    </div>

                                    <div className="country-selector-scroll" style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #dfe3e8', borderRadius: '8px', padding: '6px', background: '#ffffff' }}>
                                        {COUNTRIES_WITH_STATES.map(countryCode => {
                                            const countryStates = getStatesForCountry(countryCode);
                                            const matchingStateCodes = countryStates.filter(stateCode => {
                                                if (!stateInputValue) return true;
                                                const label = (STATE_MAP[countryCode]?.[stateCode] || "").toLowerCase();
                                                const search = stateInputValue.toLowerCase();
                                                return label.includes(search) || stateCode.toLowerCase().includes(search);
                                            });

                                            if (matchingStateCodes.length === 0) return null;

                                            const isAllSelected = matchingStateCodes.every(s => selectedStates.includes(s));
                                            const isSomeSelected = matchingStateCodes.some(s => selectedStates.includes(s));
                                            const isIndeterminate = isSomeSelected && !isAllSelected;
                                            const isExpanded = expandedStateCountries.includes(countryCode) || !!stateInputValue;
                                            const selectedInCountry = matchingStateCodes.filter(s => selectedStates.includes(s)).length;

                                            return (
                                                <div key={countryCode} style={{ marginBottom: '4px' }}>
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: '24px minmax(0, 1fr) auto',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            background: isExpanded ? '#f6f6f7' : 'transparent',
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${STATE_COUNTRY_LABELS[countryCode] || countryCode}`}
                                                            onClick={() => toggleStateCountryExpansion(countryCode)}
                                                            style={{
                                                                alignItems: 'center',
                                                                background: 'transparent',
                                                                border: 0,
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                height: '24px',
                                                                justifyContent: 'center',
                                                                padding: 0,
                                                                width: '24px',
                                                            }}
                                                        >
                                                            <Icon source={isExpanded ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                                                        </button>
                                                        <Checkbox
                                                            label={STATE_COUNTRY_LABELS[countryCode] || countryCode}
                                                            checked={isIndeterminate ? "indeterminate" : isAllSelected}
                                                            onChange={() => toggleStateCountrySelection(countryCode)}
                                                        />
                                                        <Text as="span" variant="bodySm" tone="subdued">
                                                            {`${selectedInCountry}/${matchingStateCodes.length}`}
                                                        </Text>
                                                    </div>

                                                    {isExpanded && (
                                                        <div
                                                            style={{
                                                                display: 'grid',
                                                                gap: '2px 12px',
                                                                gridTemplateColumns: smUp ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                                                                padding: '6px 8px 8px 40px',
                                                            }}
                                                        >
                                                            {matchingStateCodes.map(stateCode => {
                                                                const isChecked = selectedStates.includes(stateCode);
                                                                return (
                                                                    <div key={stateCode} style={{ padding: '2px 0' }}>
                                                                        <Checkbox
                                                                            label={`${STATE_MAP[countryCode]?.[stateCode] || stateCode} (${stateCode})`}
                                                                            checked={isChecked}
                                                                            onChange={() => {
                                                                                if (isChecked) {
                                                                                    setSelectedStates(selectedStates.filter(s => s !== stateCode));
                                                                                } else {
                                                                                    setSelectedStates([...selectedStates, stateCode]);
                                                                                }
                                                                            }}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </BlockStack>
                            )}

                            {formMatchType === "market" && (
                                <BlockStack gap="300">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="p" variant="bodySm" fontWeight="semibold">Shopify Markets</Text>
                                        <Badge tone={selectedMarkets.length > 0 ? "success" : "attention"}>
                                            {`${selectedMarkets.length} selected`}
                                        </Badge>
                                    </InlineStack>
                                    {markets.length > 0 ? (
                                        <>
                                            <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                                                <Button onClick={() => setSelectedMarkets(markets.map((market: any) => market.handle))}>Select All</Button>
                                                <Button onClick={() => setSelectedMarkets([])}>Clear All</Button>
                                            </div>
                                            <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #dfe3e8', borderRadius: '8px', padding: '6px', background: '#ffffff' }}>
                                                {markets.map((market: any) => (
                                                    <div key={market.id} style={{ padding: '6px 8px', borderRadius: '6px' }}>
                                                        <Checkbox
                                                            label={formatMarketOptionLabel(market)}
                                                            checked={selectedMarkets.includes(market.handle)}
                                                            onChange={() => toggleMarketSelection(market.handle)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <Banner tone="info">
                                            <p>Shopify Markets could not be loaded. The app may need the read_markets scope, or this shop may not have markets configured.</p>
                                        </Banner>
                                    )}
                                    {marketsError && (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            {marketsError}
                                        </Text>
                                    )}
                                </BlockStack>
                            )}
                        </BlockStack>

                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Action</Text>
                            <InlineStack gap="400">
                                <RadioButton
                                    label="Redirect to URL"
                                    checked={formRuleType === "redirect"}
                                    id="actionRedirect"
                                    name="ruleType"
                                    onChange={() => setFormRuleType("redirect")}
                                />
                                <div style={{ opacity: !hasProPlan ? 0.65 : 1 }}>
                                    <RadioButton
                                        label={
                                            <InlineStack gap="200">
                                                <span>Block Access</span>
                                                {!hasProPlan && <Badge tone="warning">Premium</Badge>}
                                            </InlineStack>
                                        }
                                        checked={formRuleType === "block"}
                                        id="actionBlock"
                                        name="ruleType"
                                        disabled={!hasProPlan}
                                        onChange={() => {
                                            if (hasProPlan) setFormRuleType("block");
                                        }}
                                    />
                                </div>
                            </InlineStack>
                        </BlockStack>

                        {formRuleType === "redirect" && (
                            <BlockStack gap="400">
                                <TextField
                                    label="Target URL"
                                    value={formTargetUrl}
                                    onChange={setFormTargetUrl}
                                    placeholder="https://your-store.com or /us/"
                                    helpText="Full URL or relative path to redirect to"
                                    autoComplete="off"
                                />

                                <Select
                                    label="Redirect Method"
                                    options={[
                                        { label: "Auto Redirect", value: "auto_redirect" },
                                        { label: "Popup", value: "popup" },
                                    ]}
                                    value={formRedirectMode}
                                    onChange={setFormRedirectMode}
                                    helpText="Choose how matching visitors are redirected."
                                />
                            </BlockStack>
                        )}
                        <TextField
                            label="Priority"
                            type="number"
                            value={formPriority}
                            onChange={setFormPriority}
                            helpText="Higher priority rules are checked first"
                            autoComplete="off"
                        />

                        <Text as="h3" variant="headingSm">Scheduling (Optional)</Text>
                        <Checkbox
                            label="Enable Scheduling"
                            checked={scheduleEnabled}
                            onChange={setScheduleEnabled}
                            helpText="Limit this rule to specific days and times"
                        />

                        {scheduleEnabled && (
                            <BlockStack gap="400">
                                <FormLayout.Group>
                                    <TextField
                                        label="Start Time (HH:mm)"
                                        value={startTime}
                                        onChange={setStartTime}
                                        type="time"
                                        autoComplete="off"
                                    />
                                    <TextField
                                        label="End Time (HH:mm)"
                                        value={endTime}
                                        onChange={setEndTime}
                                        type="time"
                                        autoComplete="off"
                                    />
                                </FormLayout.Group>

                                <Select
                                    label="Timezone"
                                    options={[
                                        { label: "Vietnam (GMT+7)", value: "Asia/Ho_Chi_Minh" },
                                        { label: "Thailand (GMT+7)", value: "Asia/Bangkok" },
                                        { label: "Singapore (GMT+8)", value: "Asia/Singapore" },
                                        { label: "US Eastern (GMT-5)", value: "America/New_York" },
                                        { label: "US Pacific (GMT-8)", value: "America/Los_Angeles" },
                                        { label: "London (GMT+0)", value: "Europe/London" },
                                        { label: "UTC (GMT+0)", value: "UTC" },
                                    ]}
                                    value={timezone}
                                    onChange={setTimezone}
                                />

                                <ChoiceList
                                    allowMultiple
                                    title="Active Days"
                                    choices={[
                                        { label: "Monday", value: "1" },
                                        { label: "Tuesday", value: "2" },
                                        { label: "Wednesday", value: "3" },
                                        { label: "Thursday", value: "4" },
                                        { label: "Friday", value: "5" },
                                        { label: "Saturday", value: "6" },
                                        { label: "Sunday", value: "0" },
                                    ]}
                                    selected={activeDays}
                                    onChange={setActiveDays}
                                />
                            </BlockStack>
                        )}

                        <Divider />
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Page Targeting</Text>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodyMd">Apply to</Text>
                                <RadioButton
                                    label="All Pages"
                                    checked={pageTargetingType[0] === "all"}
                                    id="pageTargetingAll"
                                    name="pageTargetingType"
                                    onChange={() => setPageTargetingType(["all"])}
                                />
                                {hasProPlan ? (
                                    <RadioButton
                                        label="Specific Pages"
                                        checked={pageTargetingType[0] === "include"}
                                        id="pageTargetingInclude"
                                        name="pageTargetingType"
                                        onChange={() => setPageTargetingType(["include"])}
                                    />
                                ) : (
                                    <div style={{ opacity: 0.65, width: "fit-content" }}>
                                        <RadioButton
                                            label={(
                                                <InlineStack gap="200">
                                                    <span>Specific Pages</span>
                                                    <Badge tone="warning">Premium</Badge>
                                                </InlineStack>
                                            )}
                                            checked={false}
                                            id="pageTargetingInclude"
                                            name="pageTargetingType"
                                            disabled
                                        />
                                    </div>
                                )}
                                {hasProPlan ? (
                                    <RadioButton
                                        label="Exclude Pages"
                                        checked={pageTargetingType[0] === "exclude"}
                                        id="pageTargetingExclude"
                                        name="pageTargetingType"
                                        onChange={() => setPageTargetingType(["exclude"])}
                                    />
                                ) : (
                                    <div style={{ opacity: 0.65, width: "fit-content" }}>
                                        <RadioButton
                                            label={(
                                                <InlineStack gap="200">
                                                    <span>Exclude Pages</span>
                                                    <Badge tone="warning">Premium</Badge>
                                                </InlineStack>
                                            )}
                                            checked={false}
                                            id="pageTargetingExclude"
                                            name="pageTargetingType"
                                            disabled
                                        />
                                    </div>
                                )}
                            </BlockStack>

                            {pageTargetingType[0] !== "all" && (
                                <TextField
                                    label="Paths"
                                    value={pagePaths}
                                    onChange={setPagePaths}
                                    multiline={3}
                                    placeholder="/products/*, /collections/summer-sale, /pages/about-us"
                                    helpText="Enter one path or full URL per line, or separate with commas. Full URLs are saved as paths. Use * for wildcards."
                                    autoComplete="off"
                                />
                            )}
                        </BlockStack>
                    </FormLayout>
                    </BlockStack>
                </Modal.Section>
            </Modal>

            {/* Import Modal */}
            <Modal
                open={importModalOpen}
                onClose={() => { setImportModalOpen(false); setImportData(""); setImportFileName(""); }}
                title="Import Rules"
                primaryAction={{
                    content: "Import",
                    onAction: handleImportSubmit,
                    loading: importFetcher.state !== "idle",
                    disabled: importFetcher.state !== "idle" || !importData,
                }}
                secondaryActions={[
                    {
                        content: "Cancel",
                        onAction: () => { setImportModalOpen(false); setImportData(""); setImportFileName(""); },
                    },
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        {importFetcher.state === "idle" && importFetcher.data?.success === false && (
                            <Banner tone="critical">{importFetcher.data.message}</Banner>
                        )}
                        <Text as="p">
                            Upload a JSON file containing rules to import. The file should be in the same format as the exported file.
                        </Text>
                        <div
                            style={{
                                border: '2px dashed #c4cdd5',
                                borderRadius: '8px',
                                padding: '24px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: importFileName ? '#f1f8f5' : '#fafbfc',
                                transition: 'all 0.2s ease',
                            }}
                            onClick={() => document.getElementById('import-file-input')?.click()}
                        >
                            <input
                                id="import-file-input"
                                type="file"
                                accept=".json"
                                style={{ display: 'none' }}
                                onChange={handleImportFile}
                            />
                            <BlockStack gap="200" inlineAlign="center">
                                <Icon source={ImportIcon} tone="subdued" />
                                {importFileName ? (
                                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">
                                        ✓ {importFileName}
                                    </Text>
                                ) : (
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Click to select a JSON file
                                    </Text>
                                )}
                            </BlockStack>
                        </div>
                        {importData && (
                            <Banner tone="info">
                                <p>
                                    {(() => {
                                        try {
                                            const parsed = JSON.parse(importData);
                                            return `Found ${Array.isArray(parsed) ? parsed.length : 0} rule(s) ready to import.`;
                                        } catch {
                                            return "Invalid JSON format. Please check the file.";
                                        }
                                    })()}
                                </p>
                            </Banner>
                        )}
                    </BlockStack>
                </Modal.Section>
            </Modal>

            <Modal
                open={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete selected rules?"
                primaryAction={{
                    content: `Delete ${selectedResources.length} rule${selectedResources.length === 1 ? "" : "s"}`,
                    destructive: true,
                    loading: deleteFetcher.state !== "idle",
                    onAction: handleConfirmBulkDelete,
                }}
                secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}
            >
                <Modal.Section>
                    <BlockStack gap="300">
                        {deleteFetcher.state === "idle" && deleteFetcher.data?.success === false && (
                            <Banner tone="critical">{deleteFetcher.data.message}</Banner>
                        )}
                        <Text as="p">
                            This action cannot be undone. The selected rules will stop affecting your storefront immediately.
                        </Text>
                    </BlockStack>
                </Modal.Section>
            </Modal>

        </Page >
    );
}
