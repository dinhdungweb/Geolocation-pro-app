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
} from "@shopify/polaris";
import { SearchIcon, XIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
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
    scheduleEnabled: boolean;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: string | null;
    timezone: string | null;
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
        isTest: process.env.NODE_ENV !== "production",
    });
    const hasProPlan = billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;

    return json({ rules, shop, hasProPlan });
};

// Action: Handle CRUD operations
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    try {
        // Validate targetUrl to prevent XSS
        const validateUrl = (url: string) => {
            if (!url) return true; // Empty is OK (for block rules)
            const dangerous = /^(javascript|data|vbscript):/i;
            if (dangerous.test(url.trim())) return false;
            return true;
        };

        if (intent === "create") {
            const name = formData.get("name") as string;
            const countryCodes = formData.get("countryCodes") as string;
            const targetUrl = formData.get("targetUrl") as string;
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "redirect";
            const scheduleEnabled = formData.get("scheduleEnabled") === "true";
            const startTime = formData.get("startTime") as string;
            const endTime = formData.get("endTime") as string;
            const daysOfWeek = formData.get("daysOfWeek") as string;
            const timezone = formData.get("timezone") as string;

            await prisma.redirectRule.create({
                data: {
                    shop,
                    name,
                    countryCodes,
                    targetUrl,
                    priority,
                    isActive: true,
                    ruleType,
                    matchType: "country", // Mark as country rule
                    scheduleEnabled,
                    startTime,
                    endTime,
                    daysOfWeek,
                    timezone,
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
            const ruleType = formData.get("ruleType") as string || "redirect";
            const scheduleEnabled = formData.get("scheduleEnabled") === "true";
            const startTime = formData.get("startTime") as string;
            const endTime = formData.get("endTime") as string;
            const daysOfWeek = formData.get("daysOfWeek") as string;
            const timezone = formData.get("timezone") as string;

            await prisma.redirectRule.update({
                where: { id, shop },
                data: {
                    name,
                    countryCodes,
                    targetUrl,
                    priority,
                    ruleType,
                    scheduleEnabled,
                    startTime,
                    endTime,
                    daysOfWeek,
                    timezone,
                },
            });
            return json({ success: true, message: "Rule updated successfully" });
        }

        if (intent === "toggle") {
            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";

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

    // Form state
    const [formName, setFormName] = useState("");
    const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("redirect");
    // Scheduling State
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [startTime, setStartTime] = useState("09:00");
    const [endTime, setEndTime] = useState("17:00");
    const [activeDays, setActiveDays] = useState<string[]>(["1", "2", "3", "4", "5"]); // Mon-Fri default
    const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");

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
            setScheduleEnabled(editingRule.scheduleEnabled || false);
            setStartTime(editingRule.startTime || "09:00");
            setEndTime(editingRule.endTime || "17:00");
            setActiveDays(editingRule.daysOfWeek ? editingRule.daysOfWeek.split(",") : ["1", "2", "3", "4", "5"]);
            setTimezone(editingRule.timezone || "Asia/Ho_Chi_Minh");
            setExpandedRegions([]); // Reset expansion
        } else {
            setFormName("");
            setSelectedCountries([]);
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("redirect");
            setScheduleEnabled(false);
            setStartTime("09:00");
            setEndTime("17:00");
            setActiveDays(["1", "2", "3", "4", "5"]);
            setTimezone("Asia/Ho_Chi_Minh");
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
        formData.append("scheduleEnabled", scheduleEnabled.toString());
        formData.append("startTime", startTime);
        formData.append("endTime", endTime);
        formData.append("daysOfWeek", activeDays.join(","));
        formData.append("timezone", timezone);

        fetcher.submit(formData, { method: "POST" });
        handleCloseModal();
    }, [
        editingRule, formName, selectedCountries, formTargetUrl, formPriority,
        formRuleType, scheduleEnabled, startTime, endTime, activeDays, timezone,
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

    const promotedBulkActions = [
        {
            content: "Delete selected",
            onAction: handleBulkDelete,
        },
    ];

    const rowMarkup = rules.map((rule: RedirectRule, index: number) => (
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
                    {rule.countryCodes.split(",").slice(0, 3).map(code => (
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
                <Badge tone={rule.isActive ? "success" : "critical"}>
                    {rule.isActive ? "Active" : "Inactive"}
                </Badge>
            </IndexTable.Cell>
            <IndexTable.Cell>{rule.priority}</IndexTable.Cell>
            <IndexTable.Cell>
                <div onClick={(e) => e.stopPropagation()}>
                    <InlineStack gap="200">
                        <Button size="slim" onClick={() => handleOpenModal(rule)}>
                            Edit
                        </Button>
                        <Button size="slim" onClick={() => handleToggle(rule)}>
                            {rule.isActive ? "Disable" : "Enable"}
                        </Button>
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
                            <TextField
                                label="Target URL"
                                value={formTargetUrl}
                                onChange={setFormTargetUrl}
                                placeholder="https://your-store.com or /us/"
                                helpText="Full URL or relative path to redirect to"
                                autoComplete="off"
                            />
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
                    </FormLayout>
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
