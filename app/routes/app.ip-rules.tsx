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
    LegacyStack,
    RadioButton,
    Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
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
}

// Loader: Fetch all IP rules for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const rules = await prisma.redirectRule.findMany({
        where: {
            shop,
            matchType: "ip", // Only fetch IP rules
        },
        orderBy: { priority: "desc" },
    });

    // Check for active subscription (IP Rules is a Pro feature)
    const { billing } = await authenticate.admin(request);
    const billingConfig = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest: true,
    });
    // Fallback: Sometimes hasActivePayment is false in test mode even if subscription exists
    const hasProPlan = billingConfig.hasActivePayment || billingConfig.appSubscriptions.length > 0;

    // Free plan: Allow 1 IP rule max
    const canCreateRule = hasProPlan || rules.length < 1;

    return json({ rules, shop, hasProPlan, canCreateRule });
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
            const ipAddresses = formData.get("ipAddresses") as string;
            const targetUrl = formData.get("targetUrl") as string || "";
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "block";

            await prisma.redirectRule.create({
                data: {
                    shop,
                    name,
                    ipAddresses,
                    matchType: "ip", // Mark as IP rule
                    countryCodes: "", // Empty for IP rules
                    targetUrl,
                    priority,
                    isActive: true,
                    ruleType,
                },
            });
            return json({ success: true, message: "IP Rule created successfully" });
        }

        if (intent === "update") {
            const id = formData.get("id") as string;
            const name = formData.get("name") as string;
            const ipAddresses = formData.get("ipAddresses") as string;
            const targetUrl = formData.get("targetUrl") as string || "";
            const priority = parseInt(formData.get("priority") as string) || 0;
            const ruleType = formData.get("ruleType") as string || "block";

            await prisma.redirectRule.update({
                where: { id },
                data: {
                    name,
                    ipAddresses,
                    targetUrl,
                    priority,
                    ruleType,
                },
            });
            return json({ success: true, message: "IP Rule updated successfully" });
        }

        if (intent === "toggle") {
            const id = formData.get("id") as string;
            const isActive = formData.get("isActive") === "true";

            await prisma.redirectRule.update({
                where: { id },
                data: { isActive: !isActive },
            });
            return json({ success: true, message: "IP Rule toggled successfully" });
        }

        if (intent === "delete") {
            const ids = (formData.get("ids") as string).split(",");
            await prisma.redirectRule.deleteMany({
                where: { id: { in: ids } },
            });
            return json({ success: true, message: "IP Rule(s) deleted successfully" });
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

    // Form state
    const [formName, setFormName] = useState("");
    const [formIPAddresses, setFormIPAddresses] = useState("");
    const [formTargetUrl, setFormTargetUrl] = useState("");
    const [formPriority, setFormPriority] = useState("0");
    const [formRuleType, setFormRuleType] = useState("block");

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
        } else {
            setFormName("");
            setFormIPAddresses("");
            setFormTargetUrl("");
            setFormPriority("0");
            setFormRuleType("block");
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

        fetcher.submit(formData, { method: "POST" });
        handleCloseModal();
    }, [
        editingRule, formName, formIPAddresses, formTargetUrl, formPriority,
        formRuleType, fetcher, handleCloseModal
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

    const promotedBulkActions = [
        {
            content: "Delete selected",
            onAction: handleBulkDelete,
        },
    ];

    const rowMarkup = rules.map((rule: IPRule, index: number) => (
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
                    {rule.ipAddresses.split(/[\n,]+/).filter(Boolean).slice(0, 3).map(ip => (
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
                            <span style={{ marginLeft: 8 }}>{rule.targetUrl}</span>
                        </>
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
                            <TextField
                                label="Target URL"
                                value={formTargetUrl}
                                onChange={setFormTargetUrl}
                                placeholder="https://example.com/blocked"
                                helpText="URL to redirect matching IPs to"
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
                        IP Rules is a Pro feature. Upgrade now to block or redirect specific IP addresses and protect your store from unwanted traffic.
                    </Text>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
