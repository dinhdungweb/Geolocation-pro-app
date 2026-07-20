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
    Select,
    RadioButton,
    Banner,
    Divider,
    ChoiceList,
    Icon,
    Tooltip,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { ImportIcon, ExportIcon, LockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { detectRuleConflicts } from "../utils/rule-conflicts";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { getShopifyPlanFromBillingCheck, hasPaidPlanAccess, resolveEffectivePlan } from "../utils/effective-plan.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { getThemeAppEmbedStatus, getThemeEditorUrl } from "../utils/theme-app-embed.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { normalizePagePathPatterns } from "../utils/page-targeting";

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

function normalizeOption(value: string | null, allowed: string[], fallback: string) {
    return value && allowed.includes(value) ? value : fallback;
}

function validateUrl(url: string) {
    if (!url) return true;
    const dangerous = /^(javascript|data|vbscript):/i;
    return !dangerous.test(url.trim());
}

const IP_REQUIRED_MESSAGE = "Please enter at least one IP address before saving this rule.";

function normalizeIPAddresses(value: unknown) {
    if (typeof value !== "string") return [];
    return value
        .split(/[\n,]+/)
        .map((ip) => ip.trim())
        .filter(Boolean);
}

function isPaidBillingConfig(billingConfig: any, settings: any) {
    const shopifyPlan = getShopifyPlanFromBillingCheck(billingConfig);
    const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
    return hasPaidPlanAccess(effectivePlan) || billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;
}

// Loader: Fetch all IP rules for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const accessToken = session.accessToken || "";

    const rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: "ip",
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription (IP Rules is a Pro feature)
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

    const canCreateRule = hasProPlan;
    const conflictSummary = detectRuleConflicts(rules, "ip");

    return json({
        rules,
        shop,
        hasProPlan,
        canCreateRule,
        conflictSummary,
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
            if (!hasProPlan) {
                return json({ success: false, message: "IP rules are available on paid plans only" }, { status: 403 });
            }

            const name = formData.get("name") as string;
            const ipAddresses = normalizeIPAddresses(formData.get("ipAddresses")).join(",");
            if (!ipAddresses) {
                return json({ success: false, message: IP_REQUIRED_MESSAGE }, { status: 400 });
            }
            const targetUrl = formData.get("targetUrl") as string || "";
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = normalizeOption(formData.get("ruleType") as string | null, ["redirect", "block"], "block");
            const redirectMode = normalizeOption(formData.get("redirectMode") as string | null, ["popup", "auto_redirect"], "auto_redirect");
            const pageTargetingType = normalizeOption(formData.get("pageTargetingType") as string | null, ["all", "include", "exclude"], "all");
            const pagePaths = normalizePagePathPatterns(formData.get("pagePaths") as string | null);

            await prisma.redirectRule.create({
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
                },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "IP Rule created successfully" });
        }

        if (intent === "update") {
            if (!hasProPlan) {
                return json({ success: false, message: "IP rules are available on paid plans only" }, { status: 403 });
            }

            const id = formData.get("id") as string;
            const name = formData.get("name") as string;
            const ipAddresses = normalizeIPAddresses(formData.get("ipAddresses")).join(",");
            if (!ipAddresses) {
                return json({ success: false, message: IP_REQUIRED_MESSAGE }, { status: 400 });
            }
            const targetUrl = formData.get("targetUrl") as string || "";
            if (!validateUrl(targetUrl)) {
                return json({ success: false, message: "Invalid URL format" }, { status: 400 });
            }
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = normalizeOption(formData.get("ruleType") as string | null, ["redirect", "block"], "block");
            const redirectMode = normalizeOption(formData.get("redirectMode") as string | null, ["popup", "auto_redirect"], "popup");
            const pageTargetingType = normalizeOption(formData.get("pageTargetingType") as string | null, ["all", "include", "exclude"], "all");
            const pagePaths = normalizePagePathPatterns(formData.get("pagePaths") as string | null);

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
                },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "IP Rule updated successfully" });
        }

        if (intent === "toggle") {
            if (!hasProPlan) {
                return json({ success: false, message: "IP rules are available on paid plans only" }, { status: 403 });
            }

            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";
            const nextIsActive = !isActive;

            await prisma.redirectRule.update({
                where: { id, shop },
                data: { isActive: nextIsActive },
            });
            invalidateStorefrontConfigCache(shop);
            return json({
                success: true,
                message: `IP Rule ${nextIsActive ? "enabled" : "disabled"} successfully`,
            });
        }

        if (intent === "delete") {
            if (!hasProPlan) {
                return json({ success: false, message: "IP rules are available on paid plans only" }, { status: 403 });
            }
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids }, shop },
            });
            invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: "IP Rule(s) deleted successfully" });
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
            let skipped = 0;
            for (const rule of importedRules) {
                const ipAddresses = normalizeIPAddresses(rule.ipAddresses).join(",");
                if (!rule.name || !ipAddresses) {
                    skipped++;
                    continue;
                }
                if (rule.targetUrl && !validateUrl(rule.targetUrl)) {
                    skipped++;
                    continue;
                }

                await prisma.redirectRule.create({
                    data: {
                        shop,
                        name: rule.name,
                        ipAddresses,
                        countryCodes: "",
                        targetUrl: rule.targetUrl || "",
                        priority: parseInt(rule.priority) || 0,
                        isActive: rule.isActive !== false,
                        ruleType: normalizeOption(rule.ruleType, ["redirect", "block"], "block"),
                        redirectMode: normalizeOption(rule.redirectMode, ["popup", "auto_redirect"], "popup"),
                        matchType: "ip",
                        pageTargetingType: normalizeOption(rule.pageTargetingType, ["all", "include", "exclude"], "all"),
                        pagePaths: rule.pagePaths || null,
                    },
                });
                created++;
            }

            const skippedMessage = skipped > 0 ? ` Skipped ${skipped} invalid IP rule(s).` : "";
            if (created > 0) invalidateStorefrontConfigCache(shop);
            return json({ success: true, message: `Imported ${created} IP rule(s).${skippedMessage}` });
        }

        return json({ success: false, message: "Unknown intent" });
    } catch (error) {
        console.error("Action error:", error);
        return json({ success: false, message: "An error occurred" }, { status: 500 });
    }
};

export default function IPRulesPage() {
    const { rules, hasProPlan, conflictSummary, appEmbedStatus, themeEditorUrl } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const formFetcher = useFetcher<typeof action>();
    const importFetcher = useFetcher<typeof action>();
    const deleteFetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<IPRule | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importData, setImportData] = useState("");
    const [importFileName, setImportFileName] = useState("");
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    // Form state
    const [formName, setFormName] = useState("");
    const [formIPAddresses, setFormIPAddresses] = useState("");
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("block");
    const [formRedirectMode, setFormRedirectMode] = useState("auto_redirect");
    const [pageTargetingType, setPageTargetingType] = useState<string[]>(["all"]);
    const [pagePaths, setPagePaths] = useState("");

    const hasNormalizedIPs = normalizeIPAddresses(formIPAddresses).length > 0;

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

    const resourceName = {
        singular: "IP rule",
        plural: "IP rules",
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

    // Reset form when modal opens/closes
    useEffect(() => {
        if (editingRule) {
            setFormName(editingRule.name);
            setFormIPAddresses(editingRule.ipAddresses);
            setFormTargetUrl(editingRule.targetUrl);
            setFormPriority(editingRule.priority.toString());
            setFormRuleType(editingRule.ruleType || "block");
            setFormRedirectMode(editingRule.redirectMode || "auto_redirect");
            setPageTargetingType([editingRule.pageTargetingType || "all"]);
            setPagePaths(editingRule.pagePaths || "");
        } else {
            setFormName("");
            setFormIPAddresses("");
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("block");
            setFormRedirectMode("auto_redirect");
            setPageTargetingType(["all"]);
            setPagePaths("");
        }
    }, [editingRule, modalOpen]);

    const handleOpenModal = useCallback((rule?: IPRule) => {
        if (!hasProPlan) return;
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
        const normalizedIPs = normalizeIPAddresses(formIPAddresses).join(",");
        formData.append("ipAddresses", normalizedIPs);
        formData.append("targetUrl", formTargetUrl);
        formData.append("priority", formPriority);
        formData.append("ruleType", formRuleType);
        formData.append("redirectMode", formRedirectMode);
        formData.append("pageTargetingType", pageTargetingType[0]);
        formData.append("pagePaths", pagePaths);

        formFetcher.submit(formData, { method: "POST" });
    }, [
        editingRule, formName, formIPAddresses, formTargetUrl, formPriority,
        formRuleType, formRedirectMode, pageTargetingType, pagePaths, formFetcher
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
        if (!hasProPlan || selectedResources.length === 0) return;
        setDeleteModalOpen(true);
    }, [hasProPlan, selectedResources]);

    const handleConfirmBulkDelete = useCallback(() => {
        if (!hasProPlan || selectedResources.length === 0) return;
        const formData = new FormData();
        formData.append("intent", "delete");
        formData.append("ids", selectedResources.join(","));
        deleteFetcher.submit(formData, { method: "POST" });
    }, [hasProPlan, selectedResources, deleteFetcher]);

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

    const rowMarkup = rules.map((rule: any, index: number) => {
        const ruleConflicts = conflictsByRuleId[rule.id] || [];
        const conflictTone = ruleConflicts.some((item: any) => item.severity === "critical") ? "critical" : "warning";
        const conflictTooltip = ruleConflicts
            .slice(0, 3)
            .map((item: any) => `${item.message} (${item.scope})`)
            .join("\n");

        return (
        <IndexTable.Row
            id={rule.id}
            key={rule.id}
            selected={selectedResources.includes(rule.id)}
            position={index}
            onClick={hasProPlan ? () => handleOpenModal(rule) : undefined}
        >
            <IndexTable.Cell>
                <div className="ip-rule-name-cell">
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
                <div className="ip-rule-addresses-cell">
                    <InlineStack gap="100" wrap={false}>
                        {rule.ipAddresses.split(/[\n,]+/).filter(Boolean).slice(0, 3).map((ip: string) => (
                            <Badge key={ip} tone="info">{ip.trim()}</Badge>
                        ))}
                        {rule.ipAddresses.split(/[\n,]+/).filter(Boolean).length > 3 && (
                            <Badge>{`+${rule.ipAddresses.split(/[\n,]+/).filter(Boolean).length - 3}`}</Badge>
                        )}
                    </InlineStack>
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div className="ip-rule-action-cell">
                    <Text as="span" variant="bodyMd" truncate>
                        {rule.ruleType === "block" ? (
                            <Badge tone="attention">Block</Badge>
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
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div className="ip-rule-status-cell">
                    {rule.isActive && !hasProPlan ? (
                        <Badge tone="warning">Disabled (Free Plan)</Badge>
                    ) : (
                        <Badge tone={rule.isActive ? "success" : "warning"}>
                            {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                    )}
                </div>
            </IndexTable.Cell>
            <IndexTable.Cell>{rule.priority}</IndexTable.Cell>
            <IndexTable.Cell>
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="ip-rule-actions-cell"
                >
                    <InlineStack gap="200" wrap={false}>
                        <Button size="slim" onClick={() => handleOpenModal(rule)} disabled={!hasProPlan}>
                            Edit
                        </Button>
                        {rule.isActive ? (
                            <Button size="slim" onClick={() => handleToggle(rule)} disabled={!hasProPlan}>
                                Disable
                            </Button>
                        ) : (
                            <Button
                                size="slim"
                                onClick={() => handleToggle(rule)}
                                disabled={!hasProPlan}
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

    const emptyStateMarkup = (
        <EmptyState
            heading="Create your first IP rule"
            action={{
                content: "Add IP Rule",
                onAction: () => handleOpenModal(),
                disabled: !hasProPlan,
            }}
            secondaryAction={!hasProPlan ? {
                content: "Upgrade to Premium",
                url: "/app/pricing",
            } : undefined}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
            <BlockStack gap="400">
                <p>Block or redirect specific IP addresses to protect your store.</p>
                {!hasProPlan && (
                    <Banner tone="warning">
                        IP Rules is a Premium feature. Upgrade your plan to create IP rules.
                    </Banner>
                )}
            </BlockStack>
        </EmptyState>
    );

    return (
        <Page fullWidth>
            <TitleBar title="IP Rules">
            </TitleBar>
            <style>
                {`
                    .ip-rules-page {
                        padding-bottom: var(--p-space-800, 32px);
                    }
                    .ip-rules-locked {
                        opacity: 0.5;
                        filter: grayscale(0.35);
                        pointer-events: none;
                        user-select: none;
                    }
                    .ip-rules-table-wrap {
                        width: 100%;
                        max-width: 100%;
                        overflow-x: auto;
                        overflow-y: hidden;
                        -webkit-overflow-scrolling: touch;
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable-ScrollContainer {
                        overflow: visible !important;
                        max-height: none;
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable__ScrollBarContainer {
                        display: none !important;
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable,
                    .ip-rules-table-wrap .Polaris-IndexTable__Table {
                        width: 100%;
                        min-width: 1120px;
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable__TableHeading--first,
                    .ip-rules-table-wrap .Polaris-IndexTable__TableHeading--second {
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable__TableCell--first,
                    .ip-rules-table-wrap .Polaris-IndexTable__TableCell--first + .Polaris-IndexTable__TableCell {
                        background: var(--p-color-bg-surface, #ffffff);
                    }
                    .ip-rules-table-wrap .Polaris-IndexTable__TableHeading--first,
                    .ip-rules-table-wrap .Polaris-IndexTable__TableCell--first {
                        box-shadow: 1px 0 0 var(--p-color-border-secondary, #ebebeb);
                    }
                    .ip-rule-name-cell {
                        min-width: 140px;
                    }
                    .ip-rule-addresses-cell {
                        min-width: 300px;
                    }
                    .ip-rule-action-cell {
                        min-width: 260px;
                    }
                    .ip-rule-status-cell {
                        min-width: 80px;
                    }
                    .ip-rule-actions-cell {
                        display: flex;
                        justify-content: flex-end;
                        min-width: 124px;
                    }
                    @media (max-width: 47.9975em) {
                        .ip-rules-page > div:first-of-type {
                            align-items: stretch !important;
                        }
                        .ip-rules-table-wrap .Polaris-IndexTable,
                        .ip-rules-table-wrap .Polaris-IndexTable__Table {
                            min-width: 760px;
                        }
                        .ip-rule-addresses-cell { min-width: 190px; }
                        .ip-rule-action-cell { min-width: 170px; }
                    }
                `}
            </style>
            <div className="ip-rules-page">
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                }}>
                    <BlockStack gap="100">
                        <Text as="h1" variant="headingLg">IP Rules</Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                            Block or redirect specific IP addresses and CIDR ranges before they reach your store.
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
                        <Button variant="primary" onClick={() => handleOpenModal()} disabled={!hasProPlan}>
                            Add IP Rule
                        </Button>
                    </InlineStack>
                </div>
                {!hasProPlan && (
                    <div style={{ marginBottom: "16px" }}>
                        <Banner
                            title="IP Rules requires Premium or higher"
                            tone="warning"
                            action={{ content: "View plans", url: "/app/pricing" }}
                        >
                            <p>All IP Rule controls are disabled on the Free plan.</p>
                        </Banner>
                    </div>
                )}
                <div className={!hasProPlan ? "ip-rules-locked" : undefined} aria-disabled={!hasProPlan}>
                <BlockStack gap="500">
                {hasProPlan && appEmbedStatus.state !== "enabled" && (
                    <Banner
                        tone="warning"
                        title={appEmbedStatus.state === "missing_scope" ? "App embed status needs permission" : "Enable app embed before testing IP rules"}
                    >
                        <BlockStack gap="200">
                            <p>{appEmbedStatus.helpText}</p>
                            <p>IP rules can be saved here, but they only run on your storefront after the Shopify theme app embed is enabled.</p>
                            <InlineStack gap="200">
                                <Button url={themeEditorUrl} target="_blank">
                                    Enable app embed
                                </Button>
                            </InlineStack>
                        </BlockStack>
                    </Banner>
                )}
                {conflictTotal > 0 && (
                    <Banner tone="warning" title={`${conflictTotal} potential IP rule conflict${conflictTotal === 1 ? "" : "s"} found`}>
                        <p>Active IP rules with overlapping addresses and page targeting can shadow each other. Review rules marked with conflict badges and adjust priority or targeting.</p>
                    </Banner>
                )}
                <div>
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            {rules.length === 0 ? (
                                emptyStateMarkup
                            ) : (
                                <div className="ip-rules-table-wrap">
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
                                            { title: "IP Addresses" },
                                            { title: "Action" },
                                            { title: "Status" },
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
                </div>
                </BlockStack>
                </div>
            </div>

            {/* Add/Edit Modal */}
            <Modal
                open={modalOpen}
                onClose={handleCloseModal}
                title={editingRule ? "Edit IP Rule" : "Add New IP Rule"}
                primaryAction={{
                    content: editingRule ? "Save" : "Create",
                    onAction: handleSubmit,
                    loading: formFetcher.state !== "idle",
                    disabled: formFetcher.state !== "idle" || !hasNormalizedIPs || !formName || (formRuleType === "redirect" && !formTargetUrl),
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
                title="Import IP Rules"
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

            <Modal
                open={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title="Delete selected IP rules?"
                primaryAction={{
                    content: `Delete ${selectedResources.length} IP rule${selectedResources.length === 1 ? "" : "s"}`,
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
                            This action cannot be undone. The selected IP rules will stop affecting your storefront immediately.
                        </Text>
                    </BlockStack>
                </Modal.Section>
            </Modal>

        </Page>
    );
}
