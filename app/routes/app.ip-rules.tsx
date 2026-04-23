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
    Select,
    useBreakpoints,
    Tag,
    LegacyStack,
    RadioButton,
    Banner,
    Divider,
    ChoiceList,
    Icon,
    Tooltip,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { ImportIcon, ExportIcon, LockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS } from "../billing.config";
import prisma from "../db.server";

interface IPRule {
    id: string;
    name: string;
    ipAddresses: string;
    targetUrl: string;
    isActive: boolean;
    priority: number;
    ruleType: string;
    redirectMode: string;
    pageTargetingType: string;
    pagePaths: string | null;
}

// Loader: Fetch all IP rules for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    const rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: "ip",
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription (IP Rules is a Pro feature)
    const billingConfig = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest: false,
    });
    const hasProPlan = billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;

    // Free plan: Allow 1 IP rule max
    const canCreateRule = hasProPlan || rules.length < 1;

    return json({ rules, shop, hasProPlan, canCreateRule });
};

// Action: Handle CRUD operations
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    try {
        // Validate targetUrl to prevent XSS
        const validateUrl = (url: string) => {
            if (!url) return true;
            const dangerous = /^(javascript|data|vbscript):/i;
            if (dangerous.test(url.trim())) return false;
            return true;
        };

        if (intent === "create") {
            const name = formData.get("name") as string;
            const ipAddresses = formData.get("ipAddresses") as string;
            const targetUrl = formData.get("targetUrl") as string || "";
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "block";
            const redirectMode = formData.get("redirectMode") as string || "popup";
            const pageTargetingType = formData.get("pageTargetingType") as string || "all";
            const pagePaths = formData.get("pagePaths") as string || "";

            await (prisma as any).redirectRule.create({
                data: {
                    shop,
                    name,
                    ipAddresses,
                    matchType: "ip",
                    countryCodes: "",
                    targetUrl,
                    priority,
                    isActive: true,
                    ruleType,
                    redirectMode,
                    pageTargetingType,
                    pagePaths,
                } as any,
            });
            return json({ success: true, message: "IP Rule created successfully" });
        }

        if (intent === "update") {
            const id = formData.get("id") as string;
            const name = formData.get("name") as string;
            const ipAddresses = formData.get("ipAddresses") as string;
            const targetUrl = formData.get("targetUrl") as string || "";
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "block";
            const redirectMode = formData.get("redirectMode") as string || "popup";
            const pageTargetingType = formData.get("pageTargetingType") as string || "all";
            const pagePaths = formData.get("pagePaths") as string || "";

            await prisma.redirectRule.update({
                where: { id, shop },
                data: {
                    name,
                    ipAddresses,
                    targetUrl,
                    priority,
                    ruleType,
                    redirectMode,
                    pageTargetingType,
                    pagePaths,
                } as any,
            });
            return json({ success: true, message: "IP Rule updated successfully" });
        }

        if (intent === "toggle") {
            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";

            await prisma.redirectRule.update({
                where: { id, shop },
                data: { isActive: !isActive },
            });
            return json({ success: true, message: "IP Rule toggled successfully" });
        }

        if (intent === "delete") {
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids }, shop },
            });
            return json({ success: true, message: "IP Rule(s) deleted successfully" });
        }

        if (intent === "import") {
            // Server-side plan check: Pro (Premium), Plus and Elite can import
            const billingConfig = await billing.check({
                plans: ALL_PAID_PLANS as any,
                isTest: false,
            });
            const hasProPlan = billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;
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
                if (!rule.name || !rule.ipAddresses) continue;
                if (rule.targetUrl && !validateUrl(rule.targetUrl)) continue;

                await (prisma as any).redirectRule.create({
                    data: {
                        shop,
                        name: rule.name,
                        ipAddresses: rule.ipAddresses || "",
                        countryCodes: "",
                        targetUrl: rule.targetUrl || "",
                        priority: parseInt(rule.priority) || 0,
                        isActive: rule.isActive !== false,
                        ruleType: rule.ruleType || "block",
                        redirectMode: rule.redirectMode || "popup",
                        matchType: "ip",
                        pageTargetingType: rule.pageTargetingType || "all",
                        pagePaths: rule.pagePaths || null,
                    } as any,
                });
                created++;
            }

            return json({ success: true, message: `Successfully imported ${created} IP rule(s)` });
        }

        return json({ success: false, message: "Unknown intent" });
    } catch (error) {
        console.error("Action error:", error);
        return json({ success: false, message: "An error occurred" }, { status: 500 });
    }
};

export default function IPRulesPage() {
    const { rules, hasProPlan } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const [modalOpen, setModalOpen] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [editingRule, setEditingRule] = useState<IPRule | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importData, setImportData] = useState("");
    const [importFileName, setImportFileName] = useState("");

    // Form state
    const [formName, setFormName] = useState("");
    const [formIPAddresses, setFormIPAddresses] = useState("");
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("block");
    const [formRedirectMode, setFormRedirectMode] = useState("popup");
    const [pageTargetingType, setPageTargetingType] = useState<string[]>(["all"]);
    const [pagePaths, setPagePaths] = useState("");

    const { smUp } = useBreakpoints();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resourceName = {
        singular: "IP rule",
        plural: "IP rules",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
        useIndexResourceState(rules);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (editingRule) {
            setFormName(editingRule.name);
            setFormIPAddresses(editingRule.ipAddresses);
            setFormTargetUrl(editingRule.targetUrl);
            setFormPriority(editingRule.priority.toString());
            setFormRuleType(editingRule.ruleType || "block");
            setPageTargetingType([editingRule.pageTargetingType || "all"]);
            setPagePaths(editingRule.pagePaths || "");
        } else {
            setFormName("");
            setFormIPAddresses("");
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("block");
            setFormRedirectMode("popup");
            setPageTargetingType(["all"]);
            setPagePaths("");
        }
    }, [editingRule, modalOpen]);

    const handleOpenModal = useCallback((rule?: IPRule) => {
        // Check Pro plan before allowing create/edit
        if (!hasProPlan && !rule) {
            setShowUpgradeModal(true);
            return;
        }
        setEditingRule(rule || null);
        setModalOpen(true);
    }, [hasProPlan]);

    const handleCloseModal = useCallback(() => {
        setModalOpen(false);
        setEditingRule(null);
    }, []);

    const handleSubmit = useCallback(() => {
        const formData = new FormData();
        formData.append("intent", editingRule ? "update" : "create");
        if (editingRule) formData.append("id", editingRule.id);
        formData.append("name", formName);
        // Normalize IP addresses: replace newlines with commas, remove extra spaces
        const normalizedIPs = formIPAddresses.split(/[\n,]+/).map(ip => ip.trim()).filter(Boolean).join(",");
        formData.append("ipAddresses", normalizedIPs);
        formData.append("targetUrl", formTargetUrl);
        formData.append("priority", formPriority);
        formData.append("ruleType", formRuleType);
        formData.append("redirectMode", formRedirectMode);
        formData.append("pageTargetingType", pageTargetingType[0]);
        formData.append("pagePaths", pagePaths);

        fetcher.submit(formData, { method: "POST" });
        handleCloseModal();
    }, [
        editingRule, formName, formIPAddresses, formTargetUrl, formPriority,
        formRuleType, formRedirectMode, pageTargetingType, pagePaths, fetcher, handleCloseModal
    ]);

    const handleToggle = useCallback(
        (rule: IPRule) => {
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

    // --- Export Rules ---
    const handleExportRules = useCallback((exportAll: boolean) => {
        const rulesToExport = exportAll
            ? rules
            : rules.filter((r: any) => selectedResources.includes(r.id));

        const exportData = rulesToExport.map((rule: any) => ({
            name: rule.name,
            ipAddresses: rule.ipAddresses,
            targetUrl: rule.targetUrl,
            isActive: rule.isActive,
            priority: rule.priority,
            ruleType: rule.ruleType,
            redirectMode: rule.redirectMode,
            pageTargetingType: rule.pageTargetingType,
            pagePaths: rule.pagePaths,
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ip-rules-${new Date().toISOString().slice(0, 10)}.json`;
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
                    {rule.ipAddresses.split(/[\n,]+/).filter(Boolean).slice(0, 3).map((ip: string) => (
                        <Badge key={ip} tone="info">{ip.trim()}</Badge>
                    ))}
                    {rule.ipAddresses.split(/[\n,]+/).filter(Boolean).length > 3 && (
                        <Badge>{`+${rule.ipAddresses.split(/[\n,]+/).filter(Boolean).length - 3}`}</Badge>
                    )}
                </InlineStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Text as="span" variant="bodyMd" truncate>
                    {rule.ruleType === "block" ? (
                        <Badge tone="critical">Block</Badge>
                    ) : (
                        <>
                            <Badge tone="warning">Redirect</Badge>
                            <span style={{ marginLeft: 4 }}>
                                <Badge tone="info" size="small">
                                    {rule.redirectMode === "popup" ? "Popup" : "Auto"}
                                </Badge>
                            </span>
                            <span style={{ marginLeft: 8 }}>{rule.targetUrl}</span>
                        </>
                    )}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                {rule.isActive && !hasProPlan ? (
                    <Badge tone="warning">Disabled (Free Plan)</Badge>
                ) : (
                    <Badge tone={rule.isActive ? "success" : "critical"}>
                        {rule.isActive ? "Active" : "Inactive"}
                    </Badge>
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
                                    if (!hasProPlan) {
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
            heading="Create your first IP rule"
            action={{
                content: "Add IP Rule",
                onAction: () => handleOpenModal(),
                disabled: !hasProPlan,
            }}
            secondaryAction={!hasProPlan ? {
                content: "Upgrade to Pro",
                url: "/app/pricing",
            } : undefined}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <BlockStack gap="400">
                <p>Block or redirect specific IP addresses to protect your store.</p>
                {!hasProPlan && (
                    <Banner tone="warning">
                        IP Rules is a Pro feature. Upgrade your plan to create IP rules.
                    </Banner>
                )}
            </BlockStack>
        </EmptyState>
    );

    return (
        <Page>
            <TitleBar title="IP Rules">
                <button variant="primary" onClick={() => handleOpenModal()} disabled={!hasProPlan}>
                    Add IP Rule
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
                {!hasProPlan && rules.length > 0 && (
                    <Banner
                        title="Pro Feature"
                        tone="warning"
                        action={{ content: "Upgrade", url: "/app/pricing" }}
                    >
                        <p>IP Rules is a Pro feature. Upgrade to create new rules.</p>
                    </Banner>
                )}
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            {rules.length === 0 ? (
                                emptyStateMarkup
                            ) : (
                                <IndexTable
                                    condensed={mounted ? !smUp : false}
                                    resourceName={resourceName}
                                    itemCount={rules.length}
                                    selectedItemsCount={
                                        allResourcesSelected ? "All" : selectedResources.length
                                    }
                                    onSelectionChange={handleSelectionChange}
                                    headings={[
                                        { title: "Name" },
                                        { title: "IP Addresses" },
                                        { title: "Action" },
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
                title={editingRule ? "Edit IP Rule" : "Add New IP Rule"}
                primaryAction={{
                    content: editingRule ? "Save" : "Create",
                    onAction: handleSubmit,
                    disabled: !formIPAddresses || !formName || (formRuleType === "redirect" && !formTargetUrl),
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
                            placeholder="e.g., Block Spam IPs"
                            autoComplete="off"
                        />

                        <TextField
                            label="IP Addresses"
                            value={formIPAddresses}
                            onChange={setFormIPAddresses}
                            placeholder="1.2.3.4, 5.6.7.8, 10.0.0.0/24"
                            helpText="Comma-separated list of IPs or CIDR ranges (e.g., 192.168.1.0/24)"
                            multiline={2}
                            autoComplete="off"
                        />

                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Action</Text>
                            <InlineStack gap="400">
                                <RadioButton
                                    label="Block Access"
                                    checked={formRuleType === "block"}
                                    id="actionBlock"
                                    name="ruleType"
                                    onChange={() => setFormRuleType("block")}
                                />
                                <RadioButton
                                    label="Redirect to URL"
                                    checked={formRuleType === "redirect"}
                                    id="actionRedirect"
                                    name="ruleType"
                                    onChange={() => setFormRuleType("redirect")}
                                />
                            </InlineStack>
                        </BlockStack>

                        {formRuleType === "redirect" && (
                            <BlockStack gap="400">
                                <TextField
                                    label="Target URL"
                                    value={formTargetUrl}
                                    onChange={setFormTargetUrl}
                                    placeholder="https://example.com/blocked"
                                    helpText="URL to redirect matching IPs to"
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

                        <Divider />
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Page Targeting</Text>
                            <ChoiceList
                                title="Apply to"
                                choices={[
                                    { label: "All Pages", value: "all" },
                                    { label: "Specific Pages", value: "include" },
                                    { label: "Exclude Pages", value: "exclude" },
                                ]}
                                selected={pageTargetingType}
                                onChange={setPageTargetingType}
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
                title="Import IP Rules"
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
                            Upload a JSON file containing IP rules to import. The file should be in the same format as the exported file.
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
                            onClick={() => document.getElementById('import-ip-file-input')?.click()}
                        >
                            <input
                                id="import-ip-file-input"
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
                                            return `Found ${Array.isArray(parsed) ? parsed.length : 0} IP rule(s) ready to import.`;
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
                        IP Rules is a Pro feature. Upgrade now to block or redirect specific IP addresses and protect your store from unwanted traffic.
                    </Text>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
