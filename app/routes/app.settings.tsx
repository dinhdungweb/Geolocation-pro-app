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
    TextField,
    Select,
    Checkbox,
    Banner,
    Divider,
    InlineStack,
    Button,
    Badge,
    Box,
    ColorPicker,
    Popover,
    hexToRgb,
    rgbToHsb,
    hsbToHex,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ALL_PAID_PLANS, FREE_PLAN } from "../billing.config";

interface Settings {
    id: string;
    isEnabled: boolean;
    mode: string; // Keep for legacy/internal purposes
    popupTitle: string;
    popupMessage: string;
    confirmBtnText: string;
    cancelBtnText: string;
    popupBgColor: string;
    popupTextColor: string;
    popupBtnColor: string;
    excludeBots: boolean;
    excludedIPs: string;
    cookieDuration: number;
    blockedTitle: string;
    blockedMessage: string;
    template: string;
    blockVpn: boolean;
}

const defaultSettings: Omit<Settings, "id"> = {
    isEnabled: true,
    mode: "popup",
    template: "modal",
    popupTitle: "Would you like to switch to a local version?",
    popupMessage: "We noticed you are visiting from {country}. Would you like to go to {target}?",
    confirmBtnText: "Go now",
    cancelBtnText: "Stay here",
    popupBgColor: "#ffffff",
    popupTextColor: "#333333",
    popupBtnColor: "#007bff",
    excludeBots: true,
    excludedIPs: "",
    cookieDuration: 7,
    blockedTitle: "Access Denied",
    blockedMessage: "We do not offer services in your country/region.",
    blockVpn: false,
};

function normalizeOption(value: string | null, allowed: string[], fallback: string) {
    return value && allowed.includes(value) ? value : fallback;
}

function normalizeHexColor(value: string, fallback: string) {
    const trimmed = value.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function hexToPickerColor(value: string, fallback: string) {
    return rgbToHsb(hexToRgb(normalizeHexColor(value, fallback)));
}

function ColorPickerField({
    label,
    value,
    fallback,
    onChange,
}: {
    label: string;
    value: string;
    fallback: string;
    onChange: (value: string) => void;
}) {
    const [active, setActive] = useState(false);
    const normalizedValue = normalizeHexColor(value, fallback);

    return (
        <BlockStack gap="150">
            <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
            <Popover
                active={active}
                activator={
                    <button
                        type="button"
                        className="settings-color-trigger"
                        onClick={() => setActive((open) => !open)}
                    >
                        <span
                            className="settings-color-swatch"
                            style={{ backgroundColor: normalizedValue }}
                            aria-hidden="true"
                        />
                        <span>{normalizedValue.toUpperCase()}</span>
                    </button>
                }
                autofocusTarget="none"
                preferredAlignment="left"
                onClose={() => setActive(false)}
            >
                <Popover.Section>
                    <div className="settings-color-picker-panel">
                    <BlockStack gap="300">
                        <ColorPicker
                            color={hexToPickerColor(normalizedValue, fallback)}
                            onChange={(color) => onChange(hsbToHex(color))}
                            fullWidth
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                            {normalizedValue.toUpperCase()}
                        </Text>
                    </BlockStack>
                    </div>
                </Popover.Section>
            </Popover>
        </BlockStack>
    );
}

// Loader: Fetch settings for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    const billingCheck = await billing.check({
        plans: ALL_PAID_PLANS as any,
        isTest: false,
    });

    // Explicitly check for active subscription, default to FREE_PLAN if none
    const activeSubscription = billingCheck.appSubscriptions[0];
    const currentPlan = activeSubscription ? activeSubscription.name : FREE_PLAN;
    const isFreePlan = currentPlan === FREE_PLAN;

    let settings = await prisma.settings.findUnique({
        where: { shop },
    });

    // Create default settings if not exists
    if (!settings) {
        settings = await prisma.settings.create({
            data: {
                shop,
                ...defaultSettings,
            },
        });
    }

    return json({ settings, shop, isFreePlan });
};

// Action: Update settings
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();

    try {
        const billingCheck = await billing.check({
            plans: ALL_PAID_PLANS as any,
            isTest: false,
        });
        const activeSubscription = billingCheck.appSubscriptions[0];
        const currentPlan = activeSubscription ? activeSubscription.name : FREE_PLAN;
        const isFreePlan = currentPlan === FREE_PLAN;

        const isEnabled = formData.get("isEnabled") === "true";
        const mode = normalizeOption(formData.get("mode") as string | null, ["popup", "auto_redirect", "disabled"], "popup");
        const popupTitle = formData.get("popupTitle") as string;
        const popupMessage = formData.get("popupMessage") as string;
        const confirmBtnText = formData.get("confirmBtnText") as string;
        const cancelBtnText = formData.get("cancelBtnText") as string;
        const popupBgColor = formData.get("popupBgColor") as string;
        const popupTextColor = formData.get("popupTextColor") as string;
        const popupBtnColor = formData.get("popupBtnColor") as string;
        const excludeBots = formData.get("excludeBots") === "true";
        const excludedIPs = formData.get("excludedIPs") as string;
        const cookieDuration = parseInt(formData.get("cookieDuration") as string) || 7;
        const blockedTitle = formData.get("blockedTitle") as string;
        const blockedMessage = formData.get("blockedMessage") as string;
        const template = normalizeOption(formData.get("template") as string | null, ["modal", "top_bar", "bottom_bar"], "modal");
        const blockVpn = !isFreePlan && formData.get("blockVpn") === "true";

        await prisma.settings.upsert({
            where: { shop },
            update: {
                isEnabled,
                mode,
                template,
                popupTitle,
                popupMessage,
                confirmBtnText,
                cancelBtnText,
                popupBgColor,
                popupTextColor,
                popupBtnColor,
                excludeBots,
                excludedIPs,
                cookieDuration,
                blockedTitle,
                blockedMessage,
                blockVpn,
            },
            create: {
                shop,
                isEnabled,
                mode,
                template,
                popupTitle,
                popupMessage,
                confirmBtnText,
                cancelBtnText,
                popupBgColor,
                popupTextColor,
                popupBtnColor,
                excludeBots,
                excludedIPs,
                cookieDuration,
                blockedTitle,
                blockedMessage,
                blockVpn,
            },
        });

        return json({ success: true, message: "Settings saved successfully" });
    } catch (error) {
        console.error("Settings save error:", error);
        return json({ success: false, message: "Failed to save settings" }, { status: 500 });
    }
};

export default function SettingsPage() {
    const { settings, isFreePlan } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();

    // Form state
    const [isEnabled, setIsEnabled] = useState(settings.isEnabled);
    const [mode] = useState(settings.mode);
    const [template, setTemplate] = useState(settings.template || "modal");
    const [popupTitle, setPopupTitle] = useState(settings.popupTitle);
    const [popupMessage, setPopupMessage] = useState(settings.popupMessage);
    const [confirmBtnText, setConfirmBtnText] = useState(settings.confirmBtnText);
    const [cancelBtnText, setCancelBtnText] = useState(settings.cancelBtnText);
    const [popupBgColor, setPopupBgColor] = useState(settings.popupBgColor);
    const [popupTextColor, setPopupTextColor] = useState(settings.popupTextColor);
    const [popupBtnColor, setPopupBtnColor] = useState(settings.popupBtnColor);
    const [excludeBots, setExcludeBots] = useState(settings.excludeBots);
    const [excludedIPs, setExcludedIPs] = useState(settings.excludedIPs);
    const [cookieDuration, setCookieDuration] = useState(settings.cookieDuration.toString());
    const [blockedTitle, setBlockedTitle] = useState(settings.blockedTitle || "Access Denied");
    const [blockedMessage, setBlockedMessage] = useState(settings.blockedMessage || "We do not offer services in your country/region.");
    const [blockVpn, setBlockVpn] = useState(settings.blockVpn);

    const isLoading = fetcher.state !== "idle";

    useEffect(() => {
        if (fetcher.data?.success) {
            shopify.toast.show("Settings saved!");
        }
    }, [fetcher.data, shopify]);

    const handleSave = useCallback(() => {
        const formData = new FormData();
        formData.append("isEnabled", isEnabled.toString());
        formData.append("mode", mode);
        formData.append("template", template);
        formData.append("popupTitle", popupTitle);
        formData.append("popupMessage", popupMessage);
        formData.append("confirmBtnText", confirmBtnText);
        formData.append("cancelBtnText", cancelBtnText);
        formData.append("popupBgColor", popupBgColor);
        formData.append("popupTextColor", popupTextColor);
        formData.append("popupBtnColor", popupBtnColor);
        formData.append("excludeBots", excludeBots.toString());
        formData.append("excludedIPs", excludedIPs);
        formData.append("cookieDuration", cookieDuration);
        formData.append("blockedTitle", blockedTitle);
        formData.append("blockedMessage", blockedMessage);
        formData.append("blockVpn", blockVpn.toString());

        fetcher.submit(formData, { method: "POST" });
    }, [
        mode, template, popupTitle, popupMessage, confirmBtnText, cancelBtnText,
        popupBgColor, popupTextColor, popupBtnColor, excludeBots, excludedIPs,
        cookieDuration, fetcher, isEnabled, blockVpn, blockedTitle, blockedMessage
    ]);

    const templateOptions = [
        { label: "Modal (Centered)", value: "modal" },
        { label: "Top Bar", value: "top_bar" },
        { label: "Bottom Bar", value: "bottom_bar" },
    ];
    const previewMessage = popupMessage
        .replace("{country}", "US")
        .replace("{target}", "US Store");
    const previewCanvasClass = `settings-preview-canvas settings-preview-canvas-${template}`;
    const previewPanelClass = `settings-popup-preview settings-popup-preview-${template}`;
    const isBarTemplate = template !== "modal";
    const saveButtonText = isLoading ? "Saving..." : "Save settings";
    const previewMarkup = (
        <Card>
            <BlockStack gap="400">
                <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Popup preview</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                        A desktop-sized preview using US and US Store as sample values.
                    </Text>
                </BlockStack>
                <div className="settings-browser-shell">
                    <div className="settings-browser-toolbar" aria-hidden="true">
                        <span className="settings-browser-dot" />
                        <span className="settings-browser-dot" />
                        <span className="settings-browser-dot" />
                        <div className="settings-browser-url">https://your-store.com</div>
                    </div>
                    <div className={previewCanvasClass}>
                        <div className="settings-preview-skeleton" aria-hidden="true">
                            <div className="settings-skeleton-line" style={{ width: "28%" }} />
                            <div className="settings-skeleton-block" />
                            <div className="settings-skeleton-line" style={{ width: "82%" }} />
                            <div className="settings-skeleton-line" style={{ width: "64%" }} />
                        </div>

                        <div
                            className={previewPanelClass}
                            style={{
                                backgroundColor: normalizeHexColor(popupBgColor, "#ffffff"),
                                color: normalizeHexColor(popupTextColor, "#333333"),
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                {template === "modal" ? (
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingMd" fontWeight="bold">
                                            {popupTitle}
                                        </Text>
                                        <Text as="p" variant="bodyMd">
                                            {previewMessage}
                                        </Text>
                                    </BlockStack>
                                ) : (
                                    <Text as="p" variant="bodySm">
                                        <strong>{popupTitle}</strong>{" "}
                                        {previewMessage}
                                    </Text>
                                )}
                            </div>

                            <div className="settings-popup-actions">
                                <button
                                    className="settings-preview-button"
                                    style={{
                                        backgroundColor: normalizeHexColor(popupBtnColor, "#007bff"),
                                        color: "#fff",
                                    }}
                                    type="button"
                                >
                                    {confirmBtnText}
                                </button>
                                <button
                                    className="settings-preview-button settings-preview-button-secondary"
                                    style={{
                                        color: normalizeHexColor(popupTextColor, "#333333"),
                                    }}
                                    type="button"
                                >
                                    {cancelBtnText}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                {isBarTemplate && (
                    <Banner tone="info">
                        <p>Bar templates appear at the top or bottom of the storefront and use less vertical space than the modal.</p>
                    </Banner>
                )}
            </BlockStack>
        </Card>
    );

    return (
        <Page
            title="Settings"
            subtitle="Control storefront behavior, popup appearance, and visitor protection."
            fullWidth
        >
            <TitleBar title="Settings">
                <button variant="primary" onClick={handleSave} disabled={isLoading}>
                    {saveButtonText}
                </button>
            </TitleBar>
            <style>
                {`
                    .settings-page-content {
                        padding-bottom: 72px;
                    }
                    .settings-content-grid {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) minmax(380px, 440px);
                        gap: 20px;
                        align-items: start;
                    }
                    .settings-form-column {
                        min-width: 0;
                    }
                    .settings-preview-sidebar {
                        position: sticky;
                        top: 20px;
                        min-width: 0;
                    }
                    .settings-summary-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 12px;
                    }
                    .settings-summary-item {
                        padding: 12px;
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 8px;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                    }
                    .settings-two-field-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 16px;
                    }
                    .settings-color-grid {
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 16px;
                    }
                    .settings-color-picker-panel {
                        width: 280px;
                        max-width: calc(100vw - 48px);
                    }
                    .settings-color-trigger {
                        width: 100%;
                        min-height: 42px;
                        padding: 8px 10px;
                        border: 1px solid var(--p-color-border, #c9cccf);
                        border-radius: 8px;
                        background: var(--p-color-bg-surface, #ffffff);
                        color: var(--p-color-text, #202223);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font: inherit;
                        font-size: 13px;
                        font-weight: 600;
                    }
                    .settings-color-trigger:hover {
                        border-color: var(--p-color-border-hover, #8c9196);
                    }
                    .settings-color-swatch {
                        width: 24px;
                        height: 24px;
                        border-radius: 6px;
                        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.16);
                        flex: 0 0 auto;
                    }
                    .settings-browser-shell {
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 10px;
                        overflow: hidden;
                        background: var(--p-color-bg-surface, #ffffff);
                    }
                    .settings-browser-toolbar {
                        min-height: 38px;
                        padding: 8px 12px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .settings-browser-dot {
                        width: 10px;
                        height: 10px;
                        border-radius: 999px;
                        background: var(--p-color-bg-fill-secondary, #d8dadd);
                    }
                    .settings-browser-url {
                        margin-left: 8px;
                        min-width: 0;
                        flex: 1;
                        height: 22px;
                        border-radius: 999px;
                        background: var(--p-color-bg-surface, #ffffff);
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        display: flex;
                        align-items: center;
                        padding: 0 12px;
                        color: var(--p-color-text-secondary, #6d7175);
                        font-size: 12px;
                    }
                    .settings-preview-canvas {
                        position: relative;
                        min-height: 300px;
                        aspect-ratio: 16 / 9;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                        overflow: hidden;
                        display: flex;
                        justify-content: center;
                    }
                    .settings-preview-canvas-modal {
                        align-items: center;
                        padding: 20px;
                    }
                    .settings-preview-canvas-top_bar {
                        align-items: flex-start;
                    }
                    .settings-preview-canvas-bottom_bar {
                        align-items: flex-end;
                    }
                    .settings-preview-skeleton {
                        position: absolute;
                        inset: 24px;
                        opacity: 0.35;
                    }
                    .settings-skeleton-line,
                    .settings-skeleton-block {
                        border-radius: 6px;
                        background: var(--p-color-bg-fill-secondary, #d8dadd);
                    }
                    .settings-skeleton-line {
                        height: 14px;
                        margin-bottom: 12px;
                    }
                    .settings-skeleton-block {
                        height: 120px;
                        margin-bottom: 16px;
                    }
                    .settings-popup-preview {
                        position: relative;
                        z-index: 1;
                        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
                    }
                    .settings-popup-preview-modal {
                        width: min(340px, 88%);
                        padding: 20px;
                        border-radius: 10px;
                        border: 1px solid rgba(0, 0, 0, 0.08);
                        text-align: center;
                    }
                    .settings-popup-preview-top_bar,
                    .settings-popup-preview-bottom_bar {
                        width: 100%;
                        padding: 12px 16px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                    }
                    .settings-popup-actions {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        flex-wrap: wrap;
                    }
                    .settings-preview-button {
                        border: 0;
                        border-radius: 6px;
                        padding: 8px 12px;
                        font-size: 13px;
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    .settings-preview-button-secondary {
                        background: transparent;
                        border: 1px solid currentColor;
                    }
                    .settings-save-row {
                        display: flex;
                        justify-content: flex-end;
                    }
                    @media (max-width: 47.9975em) {
                        .settings-page-content {
                            padding-bottom: 88px;
                        }
                        .settings-content-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-preview-sidebar {
                            position: static;
                        }
                        .settings-summary-grid,
                        .settings-two-field-grid,
                        .settings-color-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-preview-canvas {
                            min-height: 320px;
                            aspect-ratio: auto;
                        }
                        .settings-browser-url {
                            font-size: 11px;
                        }
                        .settings-popup-preview-top_bar,
                        .settings-popup-preview-bottom_bar {
                            align-items: flex-start;
                            flex-direction: column;
                        }
                    }
                `}
            </style>
            <div className="settings-page-content">
                <BlockStack gap="400">
                    {isFreePlan && (
                        <Banner
                            tone="info"
                            action={{
                                content: "View plans",
                                url: "/app/pricing",
                            }}
                        >
                            <p>Upgrade to a paid plan to increase your visitor limit and unlock advanced protection features.</p>
                        </Banner>
                    )}
                    {fetcher.data && !fetcher.data.success && (
                        <Banner tone="critical">
                            <p>{fetcher.data.message || "Failed to save settings"}</p>
                        </Banner>
                    )}
                    <Layout>
                        <Layout.Section>
                            <div className="settings-content-grid">
                            <div className="settings-form-column">
                            <BlockStack gap="400">
                                <Card>
                                    <BlockStack gap="400">
                                        <InlineStack align="space-between" blockAlign="center" gap="300">
                                            <BlockStack gap="100">
                                                <Text as="h2" variant="headingMd">Storefront status</Text>
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    This controls whether redirects, blocks, and popup rules run on your storefront.
                                                </Text>
                                            </BlockStack>
                                            <Badge tone={isEnabled ? "success" : "critical"}>
                                                {isEnabled ? "Enabled" : "Disabled"}
                                            </Badge>
                                        </InlineStack>
                                        <Checkbox
                                            label="Enable Geolocation"
                                            checked={isEnabled}
                                            onChange={setIsEnabled}
                                            helpText="The Shopify theme app embed must also be enabled in your current theme."
                                        />
                                        {!isEnabled && (
                                            <Banner tone="warning">
                                                <p>Geolocation is disabled. Visitor rules will not run until you enable it again.</p>
                                            </Banner>
                                        )}
                                        <div className="settings-summary-grid">
                                            <div className="settings-summary-item">
                                                <BlockStack gap="100">
                                                    <Text as="p" variant="bodySm" tone="subdued">Popup template</Text>
                                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                        {templateOptions.find((option) => option.value === template)?.label || "Modal"}
                                                    </Text>
                                                </BlockStack>
                                            </div>
                                            <div className="settings-summary-item">
                                                <BlockStack gap="100">
                                                    <Text as="p" variant="bodySm" tone="subdued">Bot handling</Text>
                                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                        {excludeBots ? "Search bots excluded" : "Search bots included"}
                                                    </Text>
                                                </BlockStack>
                                            </div>
                                            <div className="settings-summary-item">
                                                <BlockStack gap="100">
                                                    <Text as="p" variant="bodySm" tone="subdued">Visitor preference</Text>
                                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                        {cookieDuration || "7"} day cookie
                                                    </Text>
                                                </BlockStack>
                                            </div>
                                        </div>
                                    </BlockStack>
                                </Card>

                                {isEnabled && (
                                    <Card>
                                        <BlockStack gap="400">
                                            <BlockStack gap="100">
                                                <Text as="h2" variant="headingMd">Popup appearance</Text>
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    Customize the prompt shown when a rule uses popup mode.
                                                </Text>
                                            </BlockStack>
                                            <Select
                                                label="Template Design"
                                                options={templateOptions}
                                                value={template}
                                                onChange={setTemplate}
                                                helpText="Choose how the popup appears on the visitor's screen."
                                            />
                                            <Divider />
                                            <TextField
                                                label="Popup Title"
                                                value={popupTitle}
                                                onChange={setPopupTitle}
                                                autoComplete="off"
                                            />
                                            <TextField
                                                label="Popup Message"
                                                value={popupMessage}
                                                onChange={setPopupMessage}
                                                helpText="Use {country} for visitor's country and {target} for target store name"
                                                multiline={2}
                                                autoComplete="off"
                                            />
                                            <div className="settings-two-field-grid">
                                                <TextField
                                                    label="Confirm Button Text"
                                                    value={confirmBtnText}
                                                    onChange={setConfirmBtnText}
                                                    autoComplete="off"
                                                />
                                                <TextField
                                                    label="Cancel Button Text"
                                                    value={cancelBtnText}
                                                    onChange={setCancelBtnText}
                                                    autoComplete="off"
                                                />
                                            </div>
                                            <Divider />
                                            <Text as="h3" variant="headingSm">
                                                Colors
                                            </Text>
                                            <div className="settings-color-grid">
                                                <ColorPickerField
                                                    label="Background"
                                                    value={popupBgColor}
                                                    onChange={setPopupBgColor}
                                                    fallback="#ffffff"
                                                />
                                                <ColorPickerField
                                                    label="Text"
                                                    value={popupTextColor}
                                                    onChange={setPopupTextColor}
                                                    fallback="#333333"
                                                />
                                                <ColorPickerField
                                                    label="Button"
                                                    value={popupBtnColor}
                                                    onChange={setPopupBtnColor}
                                                    fallback="#007bff"
                                                />
                                            </div>
                                        </BlockStack>
                                    </Card>

                                )}

                                {isEnabled && (
                                    <Card>
                                        <BlockStack gap="400">
                                            <BlockStack gap="100">
                                                <Text as="h2" variant="headingMd">Blocked page</Text>
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    Set the message visitors see when a block rule applies.
                                                </Text>
                                            </BlockStack>
                                            <TextField
                                                label="Blocked Title"
                                                value={blockedTitle}
                                                onChange={setBlockedTitle}
                                                placeholder="Access Denied"
                                                autoComplete="off"
                                            />
                                            <TextField
                                                label="Blocked Message"
                                                value={blockedMessage}
                                                onChange={setBlockedMessage}
                                                placeholder="We do not offer services in your country/region."
                                                multiline={2}
                                                autoComplete="off"
                                            />
                                        </BlockStack>
                                    </Card>
                                )}

                                {isEnabled && (
                                    <Card>
                                        <BlockStack gap="400">
                                            <BlockStack gap="100">
                                                <Text as="h2" variant="headingMd">Advanced settings</Text>
                                                <Text as="p" variant="bodyMd" tone="subdued">
                                                    Fine-tune bot handling, test exclusions, and visitor memory.
                                                </Text>
                                            </BlockStack>
                                            <Checkbox
                                                label="Exclude Search Engine Bots"
                                                checked={excludeBots}
                                                onChange={setExcludeBots}
                                                helpText="Prevents redirecting Googlebot and other crawlers (recommended for SEO)"
                                            />
                                            <TextField
                                                label="Excluded IP Addresses"
                                                value={excludedIPs}
                                                onChange={setExcludedIPs}
                                                placeholder="192.168.1.1, 10.0.0.1"
                                                helpText="Comma-separated list of IP addresses to exclude from redirection"
                                                autoComplete="off"
                                            />
                                            <TextField
                                                label="Cookie Duration (days)"
                                                type="number"
                                                value={cookieDuration}
                                                onChange={setCookieDuration}
                                                helpText="How long to remember visitor's preference (only for rules using Popup mode)"
                                                autoComplete="off"
                                            />
                                        </BlockStack>
                                    </Card>
                                )}

                                {isEnabled && (
                                    <Card>
                                        <BlockStack gap="400">
                                            <InlineStack align="space-between">
                                                <Text as="h2" variant="headingMd">
                                                    Anti-fraud protection
                                                </Text>
                                                {!isFreePlan ? (
                                                    <Badge>Paid plan</Badge>
                                                ) : null}
                                            </InlineStack>
                                            <Text as="p" tone="subdued">Protect your store by instantly blocking connections from known VPNs, proxies, and Tor nodes.</Text>

                                            {isFreePlan ? (
                                                <Banner tone="warning">
                                                    <p>Upgrade to a paid plan to enable advanced security checks.</p>
                                                </Banner>
                                            ) : null}

                                            <Checkbox
                                                label="Block VPNs, Proxies & Tor Exit Nodes"
                                                checked={blockVpn}
                                                onChange={setBlockVpn}
                                                disabled={isFreePlan}
                                                helpText="Overrides all rules to unconditionally block connections that mask their real location."
                                            />
                                        </BlockStack>
                                    </Card>
                                )}

                                <div className="settings-save-row">
                                    <Button
                                        variant="primary"
                                        onClick={handleSave}
                                        loading={isLoading}
                                        disabled={isLoading}
                                    >
                                        {saveButtonText}
                                    </Button>
                                </div>
                            </BlockStack>
                            </div>
                            {isEnabled && (
                                <div className="settings-preview-sidebar">
                                    {previewMarkup}
                                </div>
                            )}
                            </div>
                        </Layout.Section>

                        <Layout.Section>
                            <Box paddingBlockEnd="800" />
                        </Layout.Section>
                    </Layout>
                </BlockStack>
            </div>
        </Page>
    );
}
