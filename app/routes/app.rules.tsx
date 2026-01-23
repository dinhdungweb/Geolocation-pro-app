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
import { SearchIcon, XIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS } from "../billing.config";
import prisma from "../db.server";

// Complete ISO 3166-1 alpha-2 country list
const ALL_COUNTRIES = [
    // Asia
    { label: "Afghanistan", value: "AF" },
    { label: "Bangladesh", value: "BD" },
    { label: "Brunei", value: "BN" },
    { label: "Cambodia", value: "KH" },
    { label: "China", value: "CN" },
    { label: "Hong Kong", value: "HK" },
    { label: "India", value: "IN" },
    { label: "Indonesia", value: "ID" },
    { label: "Japan", value: "JP" },
    { label: "Kazakhstan", value: "KZ" },
    { label: "Laos", value: "LA" },
    { label: "Macau", value: "MO" },
    { label: "Malaysia", value: "MY" },
    { label: "Maldives", value: "MV" },
    { label: "Mongolia", value: "MN" },
    { label: "Myanmar", value: "MM" },
    { label: "Nepal", value: "NP" },
    { label: "North Korea", value: "KP" },
    { label: "Pakistan", value: "PK" },
    { label: "Philippines", value: "PH" },
    { label: "Singapore", value: "SG" },
    { label: "South Korea", value: "KR" },
    { label: "Sri Lanka", value: "LK" },
    { label: "Taiwan", value: "TW" },
    { label: "Thailand", value: "TH" },
    { label: "Uzbekistan", value: "UZ" },
    { label: "Vietnam", value: "VN" },
    // Europe
    { label: "Austria", value: "AT" },
    { label: "Belarus", value: "BY" },
    { label: "Belgium", value: "BE" },
    { label: "Bulgaria", value: "BG" },
    { label: "Croatia", value: "HR" },
    { label: "Czech Republic", value: "CZ" },
    { label: "Denmark", value: "DK" },
    { label: "Estonia", value: "EE" },
    { label: "Finland", value: "FI" },
    { label: "France", value: "FR" },
    { label: "Germany", value: "DE" },
    { label: "Greece", value: "GR" },
    { label: "Hungary", value: "HU" },
    { label: "Iceland", value: "IS" },
    { label: "Ireland", value: "IE" },
    { label: "Italy", value: "IT" },
    { label: "Latvia", value: "LV" },
    { label: "Lithuania", value: "LT" },
    { label: "Luxembourg", value: "LU" },
    { label: "Netherlands", value: "NL" },
    { label: "Norway", value: "NO" },
    { label: "Poland", value: "PL" },
    { label: "Portugal", value: "PT" },
    { label: "Romania", value: "RO" },
    { label: "Russia", value: "RU" },
    { label: "Serbia", value: "RS" },
    { label: "Slovakia", value: "SK" },
    { label: "Slovenia", value: "SI" },
    { label: "Spain", value: "ES" },
    { label: "Sweden", value: "SE" },
    { label: "Switzerland", value: "CH" },
    { label: "Ukraine", value: "UA" },
    { label: "United Kingdom", value: "GB" },
    // Americas
    { label: "Argentina", value: "AR" },
    { label: "Bolivia", value: "BO" },
    { label: "Brazil", value: "BR" },
    { label: "Canada", value: "CA" },
    { label: "Chile", value: "CL" },
    { label: "Colombia", value: "CO" },
    { label: "Costa Rica", value: "CR" },
    { label: "Cuba", value: "CU" },
    { label: "Dominican Republic", value: "DO" },
    { label: "Ecuador", value: "EC" },
    { label: "El Salvador", value: "SV" },
    { label: "Guatemala", value: "GT" },
    { label: "Honduras", value: "HN" },
    { label: "Jamaica", value: "JM" },
    { label: "Mexico", value: "MX" },
    { label: "Nicaragua", value: "NI" },
    { label: "Panama", value: "PA" },
    { label: "Paraguay", value: "PY" },
    { label: "Peru", value: "PE" },
    { label: "Puerto Rico", value: "PR" },
    { label: "United States", value: "US" },
    { label: "Uruguay", value: "UY" },
    { label: "Venezuela", value: "VE" },
    // Middle East
    { label: "Bahrain", value: "BH" },
    { label: "Egypt", value: "EG" },
    { label: "Iran", value: "IR" },
    { label: "Iraq", value: "IQ" },
    { label: "Israel", value: "IL" },
    { label: "Jordan", value: "JO" },
    { label: "Kuwait", value: "KW" },
    { label: "Lebanon", value: "LB" },
    { label: "Oman", value: "OM" },
    { label: "Qatar", value: "QA" },
    { label: "Saudi Arabia", value: "SA" },
    { label: "Syria", value: "SY" },
    { label: "Turkey", value: "TR" },
    { label: "United Arab Emirates", value: "AE" },
    { label: "Yemen", value: "YE" },
    // Africa
    { label: "Algeria", value: "DZ" },
    { label: "Cameroon", value: "CM" },
    { label: "Ethiopia", value: "ET" },
    { label: "Ghana", value: "GH" },
    { label: "Ivory Coast", value: "CI" },
    { label: "Kenya", value: "KE" },
    { label: "Morocco", value: "MA" },
    { label: "Nigeria", value: "NG" },
    { label: "Senegal", value: "SN" },
    { label: "South Africa", value: "ZA" },
    { label: "Tanzania", value: "TZ" },
    { label: "Tunisia", value: "TN" },
    { label: "Uganda", value: "UG" },
    { label: "Zimbabwe", value: "ZW" },
    // Oceania
    { label: "Australia", value: "AU" },
    { label: "Fiji", value: "FJ" },
    { label: "New Zealand", value: "NZ" },
    { label: "Papua New Guinea", value: "PG" },
].sort((a, b) => a.label.localeCompare(b.label));

const REGIONS = {
    Asia: ["AF", "BD", "BN", "KH", "CN", "HK", "IN", "ID", "JP", "KZ", "LA", "MO", "MY", "MV", "MN", "MM", "NP", "KP", "PK", "PH", "SG", "KR", "LK", "TW", "TH", "UZ", "VN"],
    Europe: ["AT", "BY", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LT", "LU", "NL", "NO", "PL", "PT", "RO", "RU", "RS", "SK", "SI", "ES", "SE", "CH", "UA", "GB"],
    Americas: ["AR", "BO", "BR", "CA", "CL", "CO", "CR", "CU", "DO", "EC", "SV", "GT", "HN", "JM", "MX", "NI", "PA", "PY", "PE", "PR", "US", "UY", "VE"],
    MiddleEast: ["BH", "EG", "IR", "IQ", "IL", "JO", "KW", "LB", "OM", "QA", "SA", "SY", "TR", "AE", "YE"],
    Africa: ["DZ", "CM", "ET", "GH", "CI", "KE", "MA", "NG", "SN", "ZA", "TZ", "TN", "UG", "ZW"],
    Oceania: ["AU", "FJ", "NZ", "PG"]
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
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: "country", // Only show country rules, not IP rules
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription
    const { billing } = await authenticate.admin(request);
    const billingConfig = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest: true,
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
        if (intent === "create") {
            const name = formData.get("name") as string;
            const countryCodes = formData.get("countryCodes") as string;
            const targetUrl = formData.get("targetUrl") as string;
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
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "redirect";
            const scheduleEnabled = formData.get("scheduleEnabled") === "true";
            const startTime = formData.get("startTime") as string;
            const endTime = formData.get("endTime") as string;
            const daysOfWeek = formData.get("daysOfWeek") as string;
            const timezone = formData.get("timezone") as string;

            await prisma.redirectRule.update({
                where: { id },
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
                where: { id },
                data: { isActive: !isActive },
            });
            return json({ success: true, message: "Rule toggled successfully" });
        }

        if (intent === "delete") {
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids } },
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
        const country = ALL_COUNTRIES.find(c => c.value === code);
        return country ? country.label : code;
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

                        {/* Country Autocomplete */}
                        <BlockStack gap="200">
                            <Text as="p" variant="bodySm">Quick Select:</Text>
                            <InlineStack gap="200" wrap>
                                <Button size="slim" onClick={() => handleBulkSelect("ALL")}>Select All</Button>
                                <Button size="slim" onClick={() => handleBulkSelect("CLEAR")}>Clear All</Button>
                                {Object.keys(REGIONS).map((region) => (
                                    <Button key={region} size="slim" onClick={() => handleBulkSelect(region as any)}>
                                        {region}
                                    </Button>
                                ))}
                            </InlineStack>
                            <Autocomplete
                                options={filteredOptions.map(c => ({ value: c.value, label: `${c.label} (${c.value})` }))}
                                selected={[]}
                                onSelect={handleCountrySelect}
                                textField={textField}
                            />

                            {/* Selected countries as tags */}
                            {selectedCountries.length > 0 && (
                                <LegacyStack spacing="tight">
                                    {selectedCountries.map((code) => (
                                        <Tag key={code} onRemove={() => removeCountry(code)}>
                                            {getCountryLabel(code)} ({code})
                                        </Tag>
                                    ))}
                                </LegacyStack>
                            )}

                            <Text as="p" variant="bodySm" tone="subdued">
                                Search and select countries. Selected: {selectedCountries.length}
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
