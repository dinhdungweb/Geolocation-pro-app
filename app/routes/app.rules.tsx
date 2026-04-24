import { useCallback, useEffect, useState, useMemo } from "react";
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
    Tag,
    Autocomplete,
    Icon,
    LegacyStack,
    Checkbox,
    ChoiceList,
    Select,
    RadioButton,
    Divider,
    Banner,
    Tooltip,
} from "@shopify/polaris";
import { SearchIcon, XIcon, ChevronDownIcon, ChevronUpIcon, ImportIcon, ExportIcon, LockIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS } from "../billing.config";
import prisma from "../db.server";

import { COUNTRY_MAP } from "../utils/countries";

// Complete ISO 3166-1 alpha-2 country list
// Complete ISO 3166-1 alpha-2 country list
const ALL_COUNTRIES = Object.entries(COUNTRY_MAP).map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

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

interface RedirectRule {
    id: string;
    name: string;
    countryCodes: string;
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
}

function normalizeOption(value: string | null, allowed: string[], fallback: string) {
    return value && allowed.includes(value) ? value : fallback;
}

function validateUrl(url: string) {
    if (!url) return true; // Empty is OK (for block rules)
    const dangerous = /^(javascript|data|vbscript):/i;
    return !dangerous.test(url.trim());
}

function isPaidBillingConfig(billingConfig: any) {
    return billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;
}

function isFreePlanFeatureRequest(ruleType: string, pageTargetingType: string) {
    return ruleType === "block" || pageTargetingType !== "all";
}

// Loader: Fetch all rules for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    const rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: "country",
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription
    const billingConfig = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest: false,
    });
    const hasProPlan = billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;

    return json({ rules, shop, hasProPlan });
};

// Action: Handle CRUD operations
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    try {
        const billingConfig = await billing.check({
            plans: ALL_PAID_PLANS as any,
            isTest: false,
        });
        const hasProPlan = isPaidBillingConfig(billingConfig);

        if (intent === "create") {
            const name = formData.get("name") as string;
            const countryCodes = formData.get("countryCodes") as string;
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
            const pagePaths = formData.get("pagePaths") as string || "";

            if (!hasProPlan && isFreePlanFeatureRequest(ruleType, pageTargetingType)) {
                return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
            }
 
            await prisma.redirectRule.create({
                data: {
                    shop,
                    name,
                    countryCodes,
                    targetUrl,
                    priority,
                    isActive: true,
                    ruleType,
                    redirectMode,
                    matchType: "country", // Mark as country rule
                    scheduleEnabled,
                    startTime,
                    endTime,
                    daysOfWeek,
                    timezone,
                    pageTargetingType,
                    pagePaths,
                },
            });
            return json({ success: true, message: "Rule created successfully" });
        }

        if (intent === "update") {
            const id = formData.get("id") as string;
            const name = formData.get("name") as string;
            const countryCodes = formData.get("countryCodes") as string;
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
            const pagePaths = formData.get("pagePaths") as string || "";

            if (!hasProPlan && isFreePlanFeatureRequest(ruleType, pageTargetingType)) {
                return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
            }

            await prisma.redirectRule.update({
                where: { id, shop },
                data: {
                    name,
                    countryCodes,
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
            return json({ success: true, message: "Rule updated successfully" });
        }

        if (intent === "toggle") {
            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";

            if (!hasProPlan && !isActive) {
                const rule = await prisma.redirectRule.findFirst({
                    where: { id, shop, matchType: "country" },
                    select: { ruleType: true, pageTargetingType: true },
                });
                if (rule && isFreePlanFeatureRequest(rule.ruleType, rule.pageTargetingType || "all")) {
                    return json({ success: false, message: "This feature is available on paid plans only" }, { status: 403 });
                }
            }

            await prisma.redirectRule.update({
                where: { id, shop },
                data: { isActive: !isActive },
            });
            return json({ success: true, message: "Rule toggled successfully" });
        }

        if (intent === "delete") {
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids }, shop },
            });
            return json({ success: true, message: "Rule(s) deleted successfully" });
        }

        if (intent === "import") {
            // Server-side plan check: Pro (Premium), Plus and Elite can import
            if (!hasProPlan) {
                return json({ success: false, message: "Import is only available on Pro plan and above" }, { status: 403 });
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
                if (!rule.name || !rule.countryCodes) continue;
                if (rule.targetUrl && !validateUrl(rule.targetUrl)) continue;

                await prisma.redirectRule.create({
                    data: {
                        shop,
                        name: rule.name,
                        countryCodes: rule.countryCodes || "",
                        targetUrl: rule.targetUrl || "",
                        priority: parseInt(rule.priority) || 0,
                        isActive: rule.isActive !== false,
                        ruleType: normalizeOption(rule.ruleType, ["redirect", "block"], "redirect"),
                        redirectMode: normalizeOption(rule.redirectMode, ["popup", "auto_redirect"], "popup"),
                        matchType: "country",
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

            return json({ success: true, message: `Successfully imported ${created} rule(s)` });
        }

        return json({ success: false, message: "Unknown intent" });
    } catch (error) {
        console.error("Action error:", error);
        return json({ success: false, message: "An error occurred" }, { status: 500 });
    }
};

export default function RulesPage() {
    const { rules, hasProPlan } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const [modalOpen, setModalOpen] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [editingRule, setEditingRule] = useState<RedirectRule | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importData, setImportData] = useState("");
    const [importFileName, setImportFileName] = useState("");

    // Form state
    const [formName, setFormName] = useState("");
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("redirect");
    const [formRedirectMode, setFormRedirectMode] = useState("popup");
    // Scheduling State
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("17:00");
    const [activeDays, setActiveDays] = useState<string[]>(["1", "2", "3", "4", "5"]); // Mon-Fri default
    const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
    const [pageTargetingType, setPageTargetingType] = useState<string[]>(["all"]);
    const [pagePaths, setPagePaths] = useState("");

    // Autocomplete state
    const [inputValue, setInputValue] = useState("");
    const [expandedRegions, setExpandedRegions] = useState<string[]>([]);

    const { smUp } = useBreakpoints();
    const resourceName = {
        singular: "rule",
        plural: "rules",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
        useIndexResourceState(rules);

    // Filter countries based on search input
    const filteredOptions = useMemo(() => {
        if (!inputValue) return ALL_COUNTRIES.filter(c => !selectedCountries.includes(c.value));
        const searchLower = inputValue.toLowerCase();
        return ALL_COUNTRIES.filter(
            (country) =>
                !selectedCountries.includes(country.value) &&
                (country.label.toLowerCase().includes(searchLower) ||
                    country.value.toLowerCase().includes(searchLower))
        );
    }, [inputValue, selectedCountries]);

    // Get country label from code
    const getCountryLabel = (code: string) => {
        return COUNTRY_MAP[code] || code;
    };

    // Reset form when modal opens/closes
    useEffect(() => {
        if (editingRule) {
            setFormName(editingRule.name);
            setSelectedCountries(editingRule.countryCodes.split(",").map(c => c.trim()).filter(Boolean));
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
        } else {
            setFormName("");
            setSelectedCountries([]);
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("redirect");
            setFormRedirectMode("popup");
            setScheduleEnabled(false);
            setStartTime("09:00");
            setEndTime("17:00");
            setActiveDays(["1", "2", "3", "4", "5"]);
            setTimezone("Asia/Ho_Chi_Minh");
            setPageTargetingType(["all"]);
            setPagePaths("");
            setExpandedRegions([]);
        }
        setInputValue("");
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
        formData.append("countryCodes", selectedCountries.join(","));
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

        fetcher.submit(formData, { method: "POST" });
        handleCloseModal();
    }, [
        editingRule, formName, selectedCountries, formTargetUrl, formPriority,
        formRuleType, formRedirectMode, scheduleEnabled, startTime, endTime, activeDays, timezone,
        pageTargetingType, pagePaths,
        fetcher, handleCloseModal
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
        const formData = new FormData();
        formData.append("intent", "delete");
        formData.append("ids", selectedResources.join(","));
        fetcher.submit(formData, { method: "POST" });
        clearSelection();
    }, [selectedResources, fetcher, clearSelection]);

    const handleCountrySelect = useCallback((selected: string[]) => {
        const newCountry = selected[0];
        if (newCountry && !selectedCountries.includes(newCountry)) {
            setSelectedCountries([...selectedCountries, newCountry]);
        }
        setInputValue("");
    }, [selectedCountries]);

    const removeCountry = useCallback((countryToRemove: string) => {
        setSelectedCountries(selectedCountries.filter(c => c !== countryToRemove));
    }, [selectedCountries]);

    const handleBulkSelect = (region: keyof typeof REGIONS | "ALL" | "CLEAR") => {
        if (region === "CLEAR") {
            setSelectedCountries([]);
            return;
        }
        if (region === "ALL") {
            setSelectedCountries(ALL_COUNTRIES.map(c => c.value));
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

    // --- Export Rules ---
    const handleExportRules = useCallback((exportAll: boolean) => {
        const rulesToExport = exportAll
            ? rules
            : rules.filter((r: any) => selectedResources.includes(r.id));

        const exportData = rulesToExport.map((rule: any) => ({
            name: rule.name,
            countryCodes: rule.countryCodes,
            targetUrl: rule.targetUrl,
            isActive: rule.isActive,
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

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `geolocation-rules-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [rules, selectedResources]);

    // --- Import Rules ---
    const handleImportFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
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
        fetcher.submit(formData, { method: "POST" });
        setImportModalOpen(false);
        setImportData("");
        setImportFileName("");
    }, [importData, fetcher]);

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

    const rowMarkup = rules.map((rule: any, index: number) => (
        <IndexTable.Row
            id={rule.id}
            key={rule.id}
            selected={selectedResources.includes(rule.id)}
            position={index}
            onClick={() => handleOpenModal(rule)}
        >
            <IndexTable.Cell>
                <Text variant="bodyMd" fontWeight="bold" as="span">
                    {rule.name}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <InlineStack gap="100" wrap={false}>
                    {rule.countryCodes.split(",").slice(0, 3).map((code: string) => (
                        <Badge key={code} tone="info">{code.trim()}</Badge>
                    ))}
                    {rule.countryCodes.split(",").length > 3 && (
                        <Badge>{`+${rule.countryCodes.split(",").length - 3}`}</Badge>
                    )}
                </InlineStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Text as="span" variant="bodyMd" truncate>
                    {rule.ruleType === "block" ? (
                        <Badge tone="critical">Access Blocked</Badge>
                    ) : (
                        rule.targetUrl
                    )}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                {rule.isActive && rule.ruleType === "block" && !hasProPlan ? (
                    <Badge tone="warning">Disabled (Free Plan)</Badge>
                ) : (
                    <Badge tone={rule.isActive ? "success" : "critical"}>
                        {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
                )}
            </IndexTable.Cell>
            <IndexTable.Cell>
                {rule.ruleType === 'redirect' ? (
                    <Badge tone={rule.redirectMode === 'auto_redirect' ? 'warning' : 'info'}>
                        {rule.redirectMode === 'auto_redirect' ? 'Auto Redirect' : 'Popup'}
                    </Badge>
                ) : (
                    <Badge tone="critical">Block</Badge>
                )}
            </IndexTable.Cell>
            <IndexTable.Cell>{rule.priority}</IndexTable.Cell>
            <IndexTable.Cell>
                <div onClick={(e) => e.stopPropagation()}>
                    <InlineStack gap="200">
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
                                onClick={() => {
                                    if (rule.ruleType === "block" && !hasProPlan) {
                                        // Show upgrade modal instead of enabling
                                        setShowUpgradeModal(true);
                                    } else {
                                        handleToggle(rule);
                                    }
                                }}
                            >
                                Enable
                            </Button>
                        )}
                    </InlineStack>
                </div>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    const emptyStateMarkup = (
        <EmptyState
            heading="Create your first redirect rule"
            action={{ content: "Add Rule", onAction: () => handleOpenModal() }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <BlockStack gap="400">
                <p>Set up rules to redirect customers based on their location.</p>
            </BlockStack>
        </EmptyState>
    );

    const textField = (
        <Autocomplete.TextField
            onChange={setInputValue}
            label="Countries"
            value={inputValue}
            prefix={<Icon source={SearchIcon} />}
            placeholder="Search countries..."
            autoComplete="off"
        />
    );

    return (
        <Page>
            <TitleBar title="Geolocation Rules">
                <button variant="primary" onClick={() => handleOpenModal()}>
                    Add Rule
                </button>
            </TitleBar>
            {/* Import/Export Action Bar */}
            <div style={{ marginBottom: '16px' }}>
                <InlineStack gap="200" align="end">
                    <Tooltip content={!hasProPlan ? "This feature is available on higher plans. Upgrade to unlock it." : ""}>
                        <div style={{ opacity: !hasProPlan ? 0.6 : 1, cursor: !hasProPlan ? 'pointer' : 'default' }}>
                            <Button
                                icon={!hasProPlan ? LockIcon : ExportIcon}
                                onClick={() => {
                                    if (!hasProPlan) { setShowUpgradeModal(true); return; }
                                    handleExportRules(true);
                                }}
                                disabled={rules.length === 0 && hasProPlan}
                            >
                                Export All
                            </Button>
                        </div>
                    </Tooltip>
                    <Tooltip content={!hasProPlan ? "This feature is available on higher plans. Upgrade to unlock it." : ""}>
                        <div style={{ opacity: !hasProPlan ? 0.6 : 1, cursor: !hasProPlan ? 'pointer' : 'default' }}>
                            <Button
                                icon={!hasProPlan ? LockIcon : ImportIcon}
                                onClick={() => {
                                    if (!hasProPlan) { setShowUpgradeModal(true); return; }
                                    setImportModalOpen(true);
                                }}
                            >
                                Import
                            </Button>
                        </div>
                    </Tooltip>
                </InlineStack>
            </div>
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            {rules.length === 0 ? (
                                emptyStateMarkup
                            ) : (
                                <IndexTable
                                    condensed={!smUp}
                                    resourceName={resourceName}
                                    itemCount={rules.length}
                                    selectedItemsCount={
                                        allResourcesSelected ? "All" : selectedResources.length
                                    }
                                    onSelectionChange={handleSelectionChange}
                                    headings={[
                                        { title: "Name" },
                                        { title: "Countries" },
                                        { title: "Target URL" },
                                        { title: "Status" },
                                        { title: "Method" },
                                        { title: "Priority" },
                                        { title: "Actions" },
                                    ]}
                                    promotedBulkActions={promotedBulkActions}
                                >
                                    {rowMarkup}
                                </IndexTable>
                            )}
                        </Card>
                    </Layout.Section>
                </Layout>
            </BlockStack>

            {/* Add/Edit Modal */}
            <Modal
                open={modalOpen}
                onClose={handleCloseModal}
                title={editingRule ? "Edit Rule" : "Add New Rule"}
                primaryAction={{
                    content: editingRule ? "Save" : "Create",
                    onAction: handleSubmit,
                    disabled: selectedCountries.length === 0 || !formName || (formRuleType === "redirect" && !formTargetUrl),
                }}
                secondaryActions={[
                    {
                        content: "Cancel",
                        onAction: handleCloseModal,
                    },
                ]}
            >
                <Modal.Section>
                    <FormLayout>
                        <TextField
                            label="Rule Name"
                            value={formName}
                            onChange={setFormName}
                            placeholder="e.g., US Redirect"
                            autoComplete="off"
                        />

                        {/* Hierarchical Country Selector */}
                        <BlockStack gap="200">
                            <Text as="p" variant="bodySm">Countries</Text>

                            {/* Search and Bulk Actions */}
                            <TextField
                                label="Search countries/regions"
                                labelHidden
                                placeholder="Search countries..."
                                value={inputValue}
                                onChange={setInputValue}
                                prefix={<Icon source={SearchIcon} />}
                                autoComplete="off"
                            />

                            <InlineStack gap="200">
                                <Button size="slim" onClick={() => handleBulkSelect("ALL")}>Select All</Button>
                                <Button size="slim" onClick={() => handleBulkSelect("CLEAR")}>Clear All</Button>
                            </InlineStack>

                            {/* Tree View */}
                            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #dfe3e8', borderRadius: '4px', padding: '8px' }}>
                                {Object.entries(REGIONS).map(([regionName, codes]) => {
                                    // Filter logic
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
                                    const isExpanded = expandedRegions.includes(regionName) || !!inputValue; // Auto expand on search

                                    return (
                                        <div key={regionName} style={{ marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
                                                <div onClick={() => toggleRegionExpansion(regionName)} style={{ cursor: 'pointer', marginRight: '4px' }}>
                                                    <Icon source={isExpanded ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                                                </div>
                                                <Checkbox
                                                    label={regionName}
                                                    checked={isIndeterminate ? "indeterminate" : isAllSelected}
                                                    onChange={() => toggleRegionSelection(regionName as any)}
                                                />
                                            </div>

                                            {isExpanded && (
                                                <div style={{ paddingLeft: '28px' }}>
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

                            <Text as="p" variant="bodySm" tone="subdued">
                                Selected: {selectedCountries.length} countries
                            </Text>
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
                                <div onClick={() => {
                                    if (!hasProPlan) {
                                        setFormRuleType("redirect");
                                        setShowUpgradeModal(true);
                                    }
                                }}>
                                    <RadioButton
                                        label={
                                            <InlineStack gap="200">
                                                <span>Block Access</span>
                                                {!hasProPlan && <Badge tone="warning">Pro</Badge>}
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
                                        { label: "Popup (Recommended)", value: "popup" },
                                        { label: "Auto Redirect", value: "auto_redirect" },
                                    ]}
                                    value={formRedirectMode}
                                    onChange={setFormRedirectMode}
                                    helpText="Auto Redirect may affect SEO. Popup is safer for search engines."
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

                        {/* Scheduling Section */}
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
                            <ChoiceList
                                title="Apply to"
                                choices={[
                                    { label: "All Pages", value: "all" },
                                    {
                                        label: (
                                            <InlineStack gap="200">
                                                <span>Specific Pages</span>
                                                {!hasProPlan && <Badge tone="warning">Pro</Badge>}
                                            </InlineStack>
                                        ),
                                        value: "include",
                                        disabled: !hasProPlan
                                    },
                                    {
                                        label: (
                                            <InlineStack gap="200">
                                                <span>Exclude Pages</span>
                                                {!hasProPlan && <Badge tone="warning">Pro</Badge>}
                                            </InlineStack>
                                        ),
                                        value: "exclude",
                                        disabled: !hasProPlan
                                    },
                                ]}
                                selected={pageTargetingType}
                                onChange={(val) => {
                                    if (!hasProPlan && val[0] !== "all") {
                                        setShowUpgradeModal(true);
                                    } else {
                                        setPageTargetingType(val);
                                    }
                                }}
                            />

                            {pageTargetingType[0] !== "all" && (
                                <TextField
                                    label="Paths"
                                    value={pagePaths}
                                    onChange={setPagePaths}
                                    multiline={3}
                                    placeholder="/products/*, /collections/summer-sale, /pages/about-us"
                                    helpText="Enter one path per line or separated by commas. Use * for wildcards."
                                    autoComplete="off"
                                />
                            )}
                        </BlockStack>
                    </FormLayout>
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
                    disabled: !importData,
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

            {/* Upgrade Modal */}
            <Modal
                open={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                title="Upgrade to Pro"
                primaryAction={{
                    content: "View Plans",
                    url: "/app/pricing",
                }}
                secondaryActions={[
                    {
                        content: "Cancel",
                        onAction: () => setShowUpgradeModal(false),
                    },
                ]}
            >
                <Modal.Section>
                    <Text as="p">
                        The Country Blocking feature is only available on the Pro plan.
                        Upgrade now to protect your store from unwanted traffic.
                    </Text>
                </Modal.Section>
            </Modal>
        </Page >
    );
}
