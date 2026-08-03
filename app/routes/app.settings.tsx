import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data as responseData } from "react-router";
import { useBlocker, useFetcher, useLoaderData, useNavigate } from "react-router";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";
import {
    Page,
    Text,
    BlockStack,
    TextField,
    Select,
    Banner,
    InlineStack,
    Badge,
    Button,
    Icon,
} from "@shopify/polaris";
import {
    CheckCircleIcon,
    GlobeIcon,
    LockIcon,
    PaintBrushRoundIcon,
    PersonIcon,
    SettingsIcon,
    ShieldCheckMarkIcon,
    ShieldNoneIcon,
    StoreIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { getStableShopifyPlanFromBillingCheck, resolveEffectivePlan } from "../utils/effective-plan.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";

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
    blockedLogoUrl: string;
    blockedBgColor: string;
    blockedTextColor: string;
    blockedAccentColor: string;
    blockedSupportText: string;
    blockedSupportUrl: string;
    template: string;
    blockVpn: boolean;
}

type SettingsFormSnapshot = {
    isEnabled: boolean;
    mode: string;
    template: string;
    popupTitle: string;
    popupMessage: string;
    confirmBtnText: string;
    cancelBtnText: string;
    popupBgColor: string;
    popupTextColor: string;
    popupBtnColor: string;
    excludeBots: boolean;
    excludedIPs: string;
    cookieDuration: string;
    blockedTitle: string;
    blockedMessage: string;
    blockedLogoUrl: string;
    blockedBgColor: string;
    blockedTextColor: string;
    blockedAccentColor: string;
    blockedSupportText: string;
    blockedSupportUrl: string;
    blockVpn: boolean;
};

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
    blockedLogoUrl: "",
    blockedBgColor: "#f8fafc",
    blockedTextColor: "#0f172a",
    blockedAccentColor: "#2563eb",
    blockedSupportText: "Contact support",
    blockedSupportUrl: "",
    blockVpn: false,
};

function normalizeOption(value: string | null, allowed: string[], fallback: string) {
    return value && allowed.includes(value) ? value : fallback;
}

function normalizeHexColor(value: string, fallback: string) {
    const trimmed = value.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function isDangerousUrl(value: string) {
    return /^(javascript|data|vbscript):/i.test(value.trim());
}

function getSettingsSnapshot(settings: Settings): SettingsFormSnapshot {
    return {
        isEnabled: settings.isEnabled,
        mode: settings.mode,
        template: settings.template || "modal",
        popupTitle: settings.popupTitle,
        popupMessage: settings.popupMessage,
        confirmBtnText: settings.confirmBtnText,
        cancelBtnText: settings.cancelBtnText,
        popupBgColor: settings.popupBgColor,
        popupTextColor: settings.popupTextColor,
        popupBtnColor: settings.popupBtnColor,
        excludeBots: settings.excludeBots,
        excludedIPs: settings.excludedIPs,
        cookieDuration: settings.cookieDuration.toString(),
        blockedTitle: settings.blockedTitle || "Access Denied",
        blockedMessage: settings.blockedMessage || "We do not offer services in your country/region.",
        blockedLogoUrl: settings.blockedLogoUrl || "",
        blockedBgColor: settings.blockedBgColor || "#f8fafc",
        blockedTextColor: settings.blockedTextColor || "#0f172a",
        blockedAccentColor: settings.blockedAccentColor || "#2563eb",
        blockedSupportText: settings.blockedSupportText || "Contact support",
        blockedSupportUrl: settings.blockedSupportUrl || "",
        blockVpn: settings.blockVpn,
    };
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
    const normalizedValue = normalizeHexColor(value, fallback);

    return (
        <BlockStack gap="100">
            <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
            <label className="settings-color-trigger">
                <input
                    type="color"
                    className="settings-native-color-input"
                    value={normalizedValue}
                    onChange={(event) => onChange(event.currentTarget.value.toUpperCase())}
                    aria-label={label}
                />
                <span>{normalizedValue.toUpperCase()}</span>
            </label>
        </BlockStack>
    );
}

function SettingsPanel({
    title,
    description,
    children,
}: {
    title?: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="settings-flat-section">
            {(title || description) && (
                <header className="settings-flat-section-header">
                    <BlockStack gap="100">
                        {title ? (
                            <Text as="h3" variant="headingSm">
                                {title}
                            </Text>
                        ) : null}
                        {description ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                                {description}
                            </Text>
                        ) : null}
                    </BlockStack>
                </header>
            )}
            <div className="settings-flat-section-body">{children}</div>
        </section>
    );
}

function SettingsRow({
    label,
    description,
    children,
    stacked = false,
}: {
    label: string;
    description: string;
    children: ReactNode;
    stacked?: boolean;
}) {
    return (
        <div className={`settings-form-row${stacked ? " is-stacked" : ""}`}>
            <span className="settings-status-copy">
                <strong>{label}</strong>
                <span>{description}</span>
            </span>
            <div className="settings-form-control">{children}</div>
        </div>
    );
}

function SettingsToggle({
    checked,
    onChange,
    disabled = false,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            className={`settings-toggle${checked ? " is-checked" : ""}`}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        >
            <span className="settings-toggle-track" aria-hidden="true">
                <span className="settings-toggle-thumb" />
            </span>
            <span>{checked ? "Enabled" : "Disabled"}</span>
        </button>
    );
}

// Loader: Fetch settings for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;

    let settings = await prisma.settings.findUnique({
        where: { shop },
    });

    const billingCheck = await checkBillingWithFallback(billing, isBillingTestMode(), {
        fallbackPlan: settings?.currentPlan,
        logContext: `${shop} settings loader`,
    });

    const shopifyPlan = getStableShopifyPlanFromBillingCheck(
        billingCheck,
        settings?.currentPlan,
    );

    // Create default settings if not exists
    if (!settings) {
        settings = await prisma.settings.create({
            data: {
                shop,
                currentPlan: shopifyPlan,
                ...defaultSettings,
            },
        });
    } else if (settings.currentPlan !== shopifyPlan) {
        settings = await prisma.settings.update({
            where: { shop },
            data: { currentPlan: shopifyPlan },
        });
    }

    const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
    const isFreePlan = effectivePlan === FREE_PLAN;

    return responseData({
        settings,
        shop,
        isFreePlan,
        currentPlan: effectivePlan,
    });
};

// Action: Update settings
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, billing } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();

    try {
        const settings = await prisma.settings.findUnique({ where: { shop } });
        const billingCheck = await checkBillingWithFallback(billing, isBillingTestMode(), {
            fallbackPlan: settings?.currentPlan,
            logContext: `${shop} settings action`,
        });
        const shopifyPlan = getStableShopifyPlanFromBillingCheck(
            billingCheck,
            settings?.currentPlan,
        );
        const { effectivePlan } = resolveEffectivePlan({ settings, shopifyPlan });
        const isFreePlan = effectivePlan === FREE_PLAN;

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
        const blockedLogoUrl = formData.get("blockedLogoUrl") as string;
        const blockedBgColor = formData.get("blockedBgColor") as string;
        const blockedTextColor = formData.get("blockedTextColor") as string;
        const blockedAccentColor = formData.get("blockedAccentColor") as string;
        const blockedSupportText = formData.get("blockedSupportText") as string;
        const blockedSupportUrl = formData.get("blockedSupportUrl") as string;
        const template = normalizeOption(formData.get("template") as string | null, ["modal", "top_bar", "bottom_bar"], "modal");
        const blockVpn = !isFreePlan && formData.get("blockVpn") === "true";

        if ((blockedLogoUrl && isDangerousUrl(blockedLogoUrl)) || (blockedSupportUrl && isDangerousUrl(blockedSupportUrl))) {
            return responseData({ success: false, message: "Blocked page URLs cannot use unsafe protocols" }, { status: 400 });
        }

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
                blockedLogoUrl,
                blockedBgColor: normalizeHexColor(blockedBgColor, "#f8fafc"),
                blockedTextColor: normalizeHexColor(blockedTextColor, "#0f172a"),
                blockedAccentColor: normalizeHexColor(blockedAccentColor, "#2563eb"),
                blockedSupportText,
                blockedSupportUrl,
                blockVpn,
                currentPlan: shopifyPlan,
            },
            create: {
                shop,
                currentPlan: shopifyPlan,
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
                blockedLogoUrl,
                blockedBgColor: normalizeHexColor(blockedBgColor, "#f8fafc"),
                blockedTextColor: normalizeHexColor(blockedTextColor, "#0f172a"),
                blockedAccentColor: normalizeHexColor(blockedAccentColor, "#2563eb"),
                blockedSupportText,
                blockedSupportUrl,
                blockVpn,
            },
        });

        invalidateStorefrontConfigCache(shop);
        return responseData({ success: true, message: "Settings saved successfully" });
    } catch (error) {
        console.error("Settings save error:", error);
        return responseData({ success: false, message: "Failed to save settings" }, { status: 500 });
    }
};

export default function SettingsPage() {
    const { settings, shop, isFreePlan, currentPlan } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const navigate = useNavigate();
    const shopify = useAppBridge();
    const [savedSnapshot, setSavedSnapshot] = useState<SettingsFormSnapshot>(() => getSettingsSnapshot(settings));
    const submittedSnapshotRef = useRef<SettingsFormSnapshot | null>(null);
    const saveButtonRef = useRef<HTMLButtonElement>(null);

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
    const [blockedLogoUrl, setBlockedLogoUrl] = useState(settings.blockedLogoUrl || "");
    const [blockedBgColor, setBlockedBgColor] = useState(settings.blockedBgColor || "#f8fafc");
    const [blockedTextColor, setBlockedTextColor] = useState(settings.blockedTextColor || "#0f172a");
    const [blockedAccentColor, setBlockedAccentColor] = useState(settings.blockedAccentColor || "#2563eb");
    const [blockedSupportText, setBlockedSupportText] = useState(settings.blockedSupportText || "Contact support");
    const [blockedSupportUrl, setBlockedSupportUrl] = useState(settings.blockedSupportUrl || "");
    const [blockVpn, setBlockVpn] = useState(settings.blockVpn);
    const [activeTab, setActiveTab] = useState<
        "general" | "popup" | "blocked" | "visitor" | "security"
    >("general");

    const isLoading = fetcher.state !== "idle";
    const currentSnapshot = useMemo<SettingsFormSnapshot>(() => ({
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
        blockedLogoUrl,
        blockedBgColor,
        blockedTextColor,
        blockedAccentColor,
        blockedSupportText,
        blockedSupportUrl,
        blockVpn,
    }), [
        isEnabled, mode, template, popupTitle, popupMessage, confirmBtnText,
        cancelBtnText, popupBgColor, popupTextColor, popupBtnColor, excludeBots,
        excludedIPs, cookieDuration, blockedTitle, blockedMessage, blockedLogoUrl,
        blockedBgColor, blockedTextColor, blockedAccentColor, blockedSupportText,
        blockedSupportUrl, blockVpn,
    ]);
    const hasUnsavedChanges = JSON.stringify(currentSnapshot) !== JSON.stringify(savedSnapshot);
    const navigationBlocker = useBlocker(hasUnsavedChanges);
    const leaveConfirmationPendingRef = useRef(false);

    useEffect(() => {
        const saveButton = saveButtonRef.current;

        if (isLoading) {
            saveButton?.setAttribute("loading", "");
            saveButton?.setAttribute("aria-busy", "true");
        } else {
            saveButton?.removeAttribute("loading");
            saveButton?.removeAttribute("aria-busy");
        }

        shopify.loading(isLoading);

        return () => {
            if (isLoading) {
                shopify.loading(false);
            }
        };
    }, [isLoading, shopify]);

    useEffect(() => {
        if (fetcher.data?.success) {
            if (submittedSnapshotRef.current) {
                setSavedSnapshot(submittedSnapshotRef.current);
                submittedSnapshotRef.current = null;
            }
            shopify.toast.show("Settings saved!");
        } else if (fetcher.data?.message) {
            submittedSnapshotRef.current = null;
            shopify.toast.show(fetcher.data.message, { isError: true });
        }
    }, [fetcher.data, shopify]);

    useEffect(() => {
        const saveBar = (shopify as any).saveBar;
        if (!saveBar) return;

        if (hasUnsavedChanges) {
            saveBar.show("settings-save-bar");
        } else {
            saveBar.hide("settings-save-bar");
        }

        return () => {
            saveBar.hide("settings-save-bar");
        };
    }, [hasUnsavedChanges, shopify]);

    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        if (navigationBlocker.state !== "blocked" || leaveConfirmationPendingRef.current) return;

        leaveConfirmationPendingRef.current = true;

        shopify.saveBar.leaveConfirmation()
            .then(() => navigationBlocker.proceed())
            .catch(() => navigationBlocker.reset())
            .finally(() => {
                leaveConfirmationPendingRef.current = false;
            });
    }, [navigationBlocker, shopify]);

    const applySnapshot = useCallback((snapshot: SettingsFormSnapshot) => {
        setIsEnabled(snapshot.isEnabled);
        setTemplate(snapshot.template);
        setPopupTitle(snapshot.popupTitle);
        setPopupMessage(snapshot.popupMessage);
        setConfirmBtnText(snapshot.confirmBtnText);
        setCancelBtnText(snapshot.cancelBtnText);
        setPopupBgColor(snapshot.popupBgColor);
        setPopupTextColor(snapshot.popupTextColor);
        setPopupBtnColor(snapshot.popupBtnColor);
        setExcludeBots(snapshot.excludeBots);
        setExcludedIPs(snapshot.excludedIPs);
        setCookieDuration(snapshot.cookieDuration);
        setBlockedTitle(snapshot.blockedTitle);
        setBlockedMessage(snapshot.blockedMessage);
        setBlockedLogoUrl(snapshot.blockedLogoUrl);
        setBlockedBgColor(snapshot.blockedBgColor);
        setBlockedTextColor(snapshot.blockedTextColor);
        setBlockedAccentColor(snapshot.blockedAccentColor);
        setBlockedSupportText(snapshot.blockedSupportText);
        setBlockedSupportUrl(snapshot.blockedSupportUrl);
        setBlockVpn(snapshot.blockVpn);
    }, []);

    const handleDiscard = useCallback(() => {
        applySnapshot(savedSnapshot);
    }, [applySnapshot, savedSnapshot]);

    const handleSave = useCallback(() => {
        const formData = new FormData();
        submittedSnapshotRef.current = currentSnapshot;
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
        formData.append("blockedLogoUrl", blockedLogoUrl);
        formData.append("blockedBgColor", blockedBgColor);
        formData.append("blockedTextColor", blockedTextColor);
        formData.append("blockedAccentColor", blockedAccentColor);
        formData.append("blockedSupportText", blockedSupportText);
        formData.append("blockedSupportUrl", blockedSupportUrl);
        formData.append("blockVpn", blockVpn.toString());

        fetcher.submit(formData, { method: "POST" });
    }, [
        mode, template, popupTitle, popupMessage, confirmBtnText, cancelBtnText,
        popupBgColor, popupTextColor, popupBtnColor, excludeBots, excludedIPs,
        cookieDuration, fetcher, isEnabled, blockVpn, blockedTitle, blockedMessage,
        blockedLogoUrl, blockedBgColor, blockedTextColor, blockedAccentColor,
        blockedSupportText, blockedSupportUrl, currentSnapshot
    ]);

    const templateOptions = [
        { label: "Modal (Centered)", value: "modal" },
        { label: "Top Bar", value: "top_bar" },
        { label: "Bottom Bar", value: "bottom_bar" },
    ];
    const settingsTabs = [
        {
            id: "general" as const,
            label: "General",
            description: "App status and overview",
            icon: SettingsIcon,
        },
        {
            id: "popup" as const,
            label: "Popup appearance",
            description: "Template, content and colors",
            icon: PaintBrushRoundIcon,
        },
        {
            id: "blocked" as const,
            label: "Blocked page",
            description: "Block message and branding",
            icon: ShieldNoneIcon,
        },
        {
            id: "visitor" as const,
            label: "Visitor controls",
            description: "Bots, IPs and preferences",
            icon: PersonIcon,
        },
        {
            id: "security" as const,
            label: "Security",
            description: "High-risk IP protection",
            icon: LockIcon,
        },
    ];
    const planLabel =
        currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
    const activeTabDetails =
        settingsTabs.find((tab) => tab.id === activeTab) || settingsTabs[0];
    const previewMessage = popupMessage
        .replace("{country}", "US")
        .replace("{target}", "US Store");
    const previewCanvasClass = `settings-preview-canvas settings-preview-canvas-${template}`;
    const isBarTemplate = template !== "modal";
    const saveButtonText = isLoading ? "Saving..." : "Save settings";
    const previewBgColor = normalizeHexColor(popupBgColor, "#ffffff");
    const previewTextColor = normalizeHexColor(popupTextColor, "#333333");
    const previewButtonColor = normalizeHexColor(popupBtnColor, "#007bff");
    const blockedPreviewBgColor = normalizeHexColor(blockedBgColor, "#111827");
    const blockedPreviewTextColor = normalizeHexColor(blockedTextColor, "#ffffff");
    const blockedPreviewAccentColor = normalizeHexColor(blockedAccentColor, "#2563eb");
    const blockedPreviewSupportText = blockedSupportText.trim() || "Contact support";
    const blockedPreviewSupportUrl = blockedSupportUrl.trim() || "mailto:support@example.com";
    const previewButtons = (
        <div className="settings-storefront-buttons">
            <button
                className="settings-storefront-button settings-storefront-confirm"
                style={{ backgroundColor: previewButtonColor }}
                type="button"
            >
                {confirmBtnText}
            </button>
            <button
                className="settings-storefront-button settings-storefront-cancel"
                style={{
                    color: previewTextColor,
                    borderColor: previewTextColor,
                }}
                type="button"
            >
                {cancelBtnText}
            </button>
        </div>
    );
    const previewPopupMarkup = template === "modal" ? (
        <div className="settings-storefront-overlay settings-storefront-overlay-modal">
            <div
                className="settings-storefront-modal"
                style={{
                    backgroundColor: previewBgColor,
                    color: previewTextColor,
                }}
            >
                <h3>{popupTitle}</h3>
                <p>{previewMessage}</p>
                {previewButtons}
            </div>
        </div>
    ) : (
        <div
            className={`settings-storefront-overlay settings-storefront-overlay-${template}`}
            style={{
                backgroundColor: previewBgColor,
                color: previewTextColor,
            }}
        >
            <div className="settings-storefront-bar-content">
                <span className="settings-storefront-bar-title">{popupTitle}</span>
                <span className="settings-storefront-bar-message">{previewMessage}</span>
                {previewButtons}
            </div>
        </div>
    );
    const previewMarkup = (
        <SettingsPanel
            title="Popup preview"
            description="Desktop preview using US and US Store as sample values."
        >
            <BlockStack gap="400">
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
                        {previewPopupMarkup}
                    </div>
                </div>
                {isBarTemplate && (
                    <Banner tone="info">
                        <p>Bar templates appear at the top or bottom of the storefront and use less vertical space than the modal.</p>
                    </Banner>
                )}
            </BlockStack>
        </SettingsPanel>
    );
    const blockedPreviewMarkup = (
        <SettingsPanel
            title="Blocked page preview"
            description="Preview for visitors matched by a block rule."
        >
            <BlockStack gap="400">
                <div className="settings-browser-shell">
                    <div className="settings-browser-toolbar" aria-hidden="true">
                        <span className="settings-browser-dot" />
                        <span className="settings-browser-dot" />
                        <span className="settings-browser-dot" />
                        <div className="settings-browser-url">https://your-store.com</div>
                    </div>
                    <div
                        className="settings-blocked-preview-canvas"
                        style={{
                            background: blockedPreviewBgColor,
                        }}
                    >
                        <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
                            {blockedLogoUrl ? (
                                <img src={blockedLogoUrl} alt="" className="settings-blocked-preview-logo" style={{ marginBottom: '16px' }} />
                            ) : (
                                <img src="/access-denied.webp" alt="" className="settings-blocked-preview-default-image" />
                            )}
                            <h3 style={{ color: blockedPreviewTextColor, fontSize: '36px', fontWeight: '600', marginBottom: '12px', letterSpacing: 0, lineHeight: 1.1 }}>{blockedTitle}</h3>
                            <p style={{ color: blockedPreviewTextColor, opacity: 0.8, fontSize: '18px', lineHeight: '1.45' }}>{blockedMessage}</p>
                            {blockedPreviewSupportText && blockedPreviewSupportUrl ? (
                                <button
                                    type="button"
                                    className="settings-blocked-preview-button"
                                    style={{ background: blockedPreviewAccentColor, marginTop: '20px' }}
                                    title={blockedPreviewSupportUrl}
                                >
                                    {blockedPreviewSupportText}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </BlockStack>
        </SettingsPanel>
    );

    return (
        <Page
            title="Settings"
            subtitle="Control storefront behavior, popup appearance, and visitor protection."
            fullWidth
        >
            <TitleBar title="Settings" />
            <ui-save-bar id="settings-save-bar">
                <button
                    ref={saveButtonRef}
                    variant="primary"
                    onClick={handleSave}
                    disabled={isLoading}
                >
                    {saveButtonText}
                </button>
                <button onClick={handleDiscard} disabled={isLoading}>
                    Discard
                </button>
            </ui-save-bar>
            <style>
                {`
                    .settings-page-content {
                        width: 100%;
                        margin: 0;
                        padding-bottom: 72px;
                    }
                    .settings-content-stack {
                        display: grid;
                        gap: 20px;
                    }
                    .settings-workspace {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr) 280px;
                        align-items: start;
                        gap: 16px;
                    }
                    .settings-main-shell {
                        display: grid;
                        grid-template-columns: 210px minmax(0, 1fr);
                        min-width: 0;
                        overflow: hidden;
                        border: 1px solid var(--p-color-border-secondary, #e3e3e3);
                        border-radius: 12px;
                        background: var(--p-color-bg-surface, #ffffff);
                        box-shadow: 0 1px 0 rgb(0 0 0 / 4%);
                    }
                    .settings-tab-list {
                        display: grid;
                        align-content: start;
                        gap: 4px;
                        padding: 12px;
                        border-right: 1px solid var(--p-color-border-secondary, #e3e3e3);
                        background: var(--p-color-bg-surface-secondary, #fafafa);
                    }
                    .settings-tab {
                        display: grid;
                        grid-template-columns: 20px minmax(0, 1fr);
                        align-items: start;
                        gap: 9px;
                        width: 100%;
                        padding: 9px 10px;
                        border: 0;
                        border-radius: 8px;
                        background: transparent;
                        color: var(--p-color-text-secondary, #616161);
                        font: inherit;
                        text-align: left;
                        cursor: pointer;
                    }
                    .settings-tab:hover {
                        background: var(--p-color-bg-surface-hover, #f1f1f1);
                        color: var(--p-color-text, #303030);
                    }
                    .settings-tab:focus-visible {
                        outline: 2px solid var(--p-color-border-focus, #005bd3);
                        outline-offset: 1px;
                    }
                    .settings-tab.is-active {
                        background: var(--p-color-bg-surface-info, #eaf3ff);
                        color: var(--p-color-text-info, #005bd3);
                    }
                    .settings-tab-icon {
                        display: inline-flex;
                        width: 20px;
                        height: 20px;
                    }
                    .settings-tab-copy {
                        display: grid;
                        gap: 1px;
                        min-width: 0;
                    }
                    .settings-tab-copy strong {
                        color: inherit;
                        font-size: 13px;
                        line-height: 18px;
                    }
                    .settings-tab-copy span {
                        color: var(--p-color-text-secondary, #707070);
                        font-size: 11px;
                        line-height: 15px;
                    }
                    .settings-tab-panel {
                        min-width: 0;
                        padding: 0;
                        container-type: inline-size;
                    }
                    .settings-tab-body {
                        display: grid;
                        gap: 16px;
                        padding: 0;
                    }
                    .settings-tab-notice {
                        padding: 20px 20px 0;
                    }
                    .settings-flat-section {
                        overflow: visible;
                        border: 0;
                        border-radius: 0;
                        background: transparent;
                    }
                    .settings-flat-section-header {
                        padding: 16px 20px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
                    }
                    .settings-flat-section-body {
                        display: grid;
                        gap: 0;
                        padding: 0 20px 20px;
                    }
                    .settings-flat-section-body > .Polaris-BlockStack {
                        padding: 16px 0;
                    }
                    .settings-form-row {
                        display: grid;
                        grid-template-columns: minmax(180px, 1fr) minmax(0, 360px);
                        align-items: center;
                        gap: 24px;
                        min-height: 68px;
                        padding: 12px 0;
                    }
                    .settings-form-row + .settings-form-row {
                        border-top: 1px solid var(--p-color-border-secondary, #eeeeee);
                    }
                    .settings-form-row.is-stacked {
                        grid-template-columns: 1fr;
                        align-items: start;
                        gap: 12px;
                    }
                    .settings-form-control {
                        width: 100%;
                        max-width: 360px;
                        min-width: 0;
                        justify-self: end;
                    }
                    .settings-form-row.is-stacked .settings-form-control {
                        max-width: none;
                    }
                    .settings-form-control textarea {
                        field-sizing: content;
                        min-height: 88px;
                        overflow-y: hidden;
                        resize: vertical;
                    }
                    .settings-duration-control {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .settings-duration-input {
                        width: 80px;
                        flex: 0 0 80px;
                    }
                    .settings-duration-unit {
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 13px;
                    }
                    .settings-toggle {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 4px 0;
                        border: 0;
                        background: transparent;
                        color: var(--p-color-text-secondary, #616161);
                        font: inherit;
                        font-size: 12px;
                        cursor: pointer;
                    }
                    .settings-toggle:focus-visible {
                        outline: 2px solid var(--p-color-border-focus, #005bd3);
                        outline-offset: 2px;
                        border-radius: 4px;
                    }
                    .settings-toggle:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    .settings-toggle-track {
                        position: relative;
                        display: inline-flex;
                        width: 32px;
                        height: 18px;
                        flex: 0 0 32px;
                        border-radius: 999px;
                        background: var(--p-color-bg-fill-disabled, #b5b5b5);
                        transition: background 120ms ease;
                    }
                    .settings-toggle.is-checked .settings-toggle-track {
                        background: var(--p-color-bg-fill-success, #29845a);
                    }
                    .settings-toggle-thumb {
                        position: absolute;
                        top: 2px;
                        left: 2px;
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        background: #ffffff;
                        box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
                        transition: transform 120ms ease;
                    }
                    .settings-toggle.is-checked .settings-toggle-thumb {
                        transform: translateX(14px);
                    }
                    .settings-status-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                        padding: 12px 0;
                    }
                    .settings-status-row + .settings-status-row {
                        border-top: 1px solid var(--p-color-border-secondary, #eeeeee);
                    }
                    .settings-status-copy {
                        display: grid;
                        gap: 2px;
                        min-width: 0;
                    }
                    .settings-status-copy strong {
                        font-size: 13px;
                        line-height: 18px;
                    }
                    .settings-status-copy span {
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 12px;
                        line-height: 17px;
                    }
                    .settings-side-column {
                        display: grid;
                        gap: 16px;
                    }
                    .settings-side-card {
                        overflow: hidden;
                        border: 1px solid var(--p-color-border-secondary, #e3e3e3);
                        border-radius: 12px;
                        background: var(--p-color-bg-surface, #ffffff);
                    }
                    .settings-side-card-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 10px;
                        padding: 14px 16px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
                    }
                    .settings-connected {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        color: var(--p-color-text-success, #29845a);
                        font-size: 12px;
                    }
                    .settings-connected::before {
                        width: 7px;
                        height: 7px;
                        border-radius: 50%;
                        background: var(--p-color-bg-fill-success, #29845a);
                        content: "";
                    }
                    .settings-side-card-body {
                        display: grid;
                        gap: 14px;
                        padding: 16px;
                    }
                    .settings-store-identity {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        min-width: 0;
                    }
                    .settings-store-icon {
                        display: grid;
                        place-items: center;
                        width: 36px;
                        height: 36px;
                        flex: 0 0 36px;
                        border-radius: 9px;
                        background: var(--p-color-bg-surface-success, #eaf8f1);
                        color: var(--p-color-icon-success, #29845a);
                    }
                    .settings-store-copy {
                        display: grid;
                        min-width: 0;
                    }
                    .settings-store-copy strong,
                    .settings-store-copy span {
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .settings-store-copy span {
                        color: var(--p-color-text-link, #005bd3);
                        font-size: 12px;
                    }
                    .settings-detail-list {
                        display: grid;
                        gap: 10px;
                    }
                    .settings-detail-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 12px;
                    }
                    .settings-detail-row strong {
                        color: var(--p-color-text, #303030);
                        font-weight: 600;
                    }
                    .settings-check-list {
                        display: grid;
                        gap: 14px;
                    }
                    .settings-check-item {
                        display: grid;
                        grid-template-columns: 20px minmax(0, 1fr);
                        gap: 9px;
                        align-items: start;
                    }
                    .settings-check-icon {
                        display: inline-flex;
                        width: 20px;
                        height: 20px;
                        color: var(--p-color-icon-success, #29845a);
                    }
                    .settings-check-icon.is-warning {
                        color: var(--p-color-icon-caution, #b98900);
                    }
                    .settings-check-copy {
                        display: grid;
                        gap: 1px;
                    }
                    .settings-check-copy strong {
                        font-size: 12px;
                        line-height: 17px;
                    }
                    .settings-check-copy span {
                        color: var(--p-color-text-secondary, #616161);
                        font-size: 11px;
                        line-height: 16px;
                    }
                    .settings-section-grid {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 20px;
                        align-items: stretch;
                    }
                    .settings-content-preview-grid {
                        gap: 0;
                        align-items: stretch;
                    }
                    .settings-content-preview-grid > .settings-flat-section {
                        height: 100%;
                    }
                    .settings-content-preview-grid > .settings-flat-section:first-child {
                        padding-right: 0;
                    }
                    .settings-content-preview-grid > .settings-flat-section:last-child {
                        padding-left: 0;
                        border-left: 1px solid var(--p-color-border-secondary, #e3e3e3);
                    }
                    .settings-secondary-grid {
                        display: grid;
                        grid-template-columns: minmax(0, 1fr);
                        gap: 20px;
                        align-items: stretch;
                    }
                    .settings-section-grid > .Polaris-ShadowBevel,
                    .settings-secondary-grid > .Polaris-ShadowBevel {
                        min-width: 0;
                        height: 100%;
                    }
                    .settings-section-grid > .Polaris-ShadowBevel > .Polaris-Box,
                    .settings-secondary-grid > .Polaris-ShadowBevel > .Polaris-Box {
                        height: 100%;
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
                        gap: 12px;
                    }
                    .settings-color-trigger {
                        width: 100%;
                        min-height: 36px;
                        padding: 5px 8px;
                        border: 1px solid var(--p-color-border, #c9cccf);
                        border-radius: 7px;
                        background: var(--p-color-bg-surface, #ffffff);
                        color: var(--p-color-text, #202223);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font: inherit;
                        font-size: 12px;
                        font-weight: 600;
                    }
                    .settings-color-trigger > span {
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .settings-color-trigger:hover {
                        border-color: var(--p-color-border-hover, #8c9196);
                    }
                    .settings-native-color-input {
                        width: 24px;
                        height: 24px;
                        flex: 0 0 24px;
                        border: 0;
                        padding: 0;
                        background: transparent;
                        cursor: pointer;
                    }
                    .settings-native-color-input::-webkit-color-swatch-wrapper {
                        padding: 0;
                    }
                    .settings-native-color-input::-webkit-color-swatch {
                        border: 1px solid rgba(0, 0, 0, 0.16);
                        border-radius: 6px;
                    }
                    .settings-native-color-input::-moz-color-swatch {
                        border: 1px solid rgba(0, 0, 0, 0.16);
                        border-radius: 6px;
                    }
                    .settings-browser-shell {
                        border: 1px solid var(--p-color-border-secondary, #dfe3e8);
                        border-radius: 10px;
                        overflow: hidden;
                        background: var(--p-color-bg-surface, #ffffff);
                        container-type: inline-size;
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
                        height: 340px;
                        background: var(--p-color-bg-surface-secondary, #f7f7f7);
                        overflow: hidden;
                        --settings-preview-scale: 1;
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
                    .settings-storefront-overlay,
                    .settings-storefront-overlay *,
                    .settings-storefront-modal,
                    .settings-storefront-modal * {
                        box-sizing: border-box;
                    }
                    .settings-storefront-overlay {
                        position: absolute;
                        z-index: 2;
                    }
                    .settings-storefront-overlay-modal {
                        inset: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .settings-storefront-modal {
                        padding: 24px;
                        border-radius: 12px;
                        max-width: 400px;
                        width: 90%;
                        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                        text-align: center;
                        position: relative;
                        transform: scale(var(--settings-preview-scale));
                        transform-origin: center;
                    }
                    .settings-storefront-modal h3 {
                        margin: 0 0 12px;
                        font-size: 18px;
                        font-weight: 600;
                    }
                    .settings-storefront-modal p {
                        margin: 0 0 20px;
                        font-size: 14px;
                        line-height: 1.5;
                        opacity: 0.9;
                    }
                    .settings-storefront-overlay-top_bar,
                    .settings-storefront-overlay-bottom_bar {
                        left: 0;
                        width: calc(100% / var(--settings-preview-scale));
                        padding: 12px 16px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 15px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        transform: scale(var(--settings-preview-scale));
                    }
                    .settings-storefront-overlay-top_bar {
                        top: 0;
                        transform-origin: top left;
                    }
                    .settings-storefront-overlay-bottom_bar {
                        bottom: 0;
                        transform-origin: bottom left;
                    }
                    .settings-storefront-bar-content {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        flex: 1;
                        flex-wrap: wrap;
                        min-width: 0;
                    }
                    .settings-storefront-bar-title {
                        font-weight: 600;
                        font-size: 14px;
                    }
                    .settings-storefront-bar-message {
                        font-size: 14px;
                        opacity: 0.9;
                        margin-right: auto;
                        min-width: min(260px, 100%);
                        flex: 1 1 260px;
                    }
                    .settings-storefront-buttons {
                        display: flex;
                        gap: 12px;
                        justify-content: center;
                        flex-wrap: wrap;
                        flex: 0 0 auto;
                    }
                    .settings-storefront-button {
                        border: 0;
                        border-radius: 6px;
                        padding: 12px 24px;
                        font-size: 14px;
                        font-weight: 500;
                        white-space: nowrap;
                        max-width: 100%;
                        cursor: default;
                    }
                    .settings-storefront-confirm {
                        color: #fff;
                    }
                    .settings-storefront-cancel {
                        background: transparent;
                        border: 1px solid currentColor;
                    }
                    .settings-blocked-preview-canvas {
                        --settings-preview-scale: 0.62;
                        width: 100%;
                        height: 360px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        position: relative;
                        overflow: hidden;
                        border-radius: 8px;
                        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
                    }
                    .settings-blocked-preview-canvas > div {
                        transform: scale(var(--settings-preview-scale));
                        transform-origin: center;
                        width: 1000px; /* Virtual width */
                        height: 600px; /* Virtual height */
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .settings-blocked-preview-card {
                        display: none;
                    }
                    .settings-blocked-preview-logo {
                        max-width: 120px;
                        max-height: 56px;
                        object-fit: contain;
                        margin-bottom: 18px;
                    }
                    .settings-blocked-preview-default-image {
                        width: 180px;
                        max-width: 60%;
                        height: auto;
                        object-fit: contain;
                        display: block;
                        margin: 0 auto 20px;
                    }
                    .settings-blocked-preview-card h3 {
                        margin: 0 0 12px;
                        font-size: 22px;
                        line-height: 1.2;
                    }
                    .settings-blocked-preview-card p {
                        margin: 0;
                        font-size: 14px;
                        line-height: 1.55;
                        opacity: 0.86;
                    }
                    .settings-blocked-preview-button {
                        margin-top: 20px;
                        border: 0;
                        border-radius: 8px;
                        padding: 11px 18px;
                        color: #ffffff;
                        font-weight: 700;
                    }
                    @container (max-width: 720px) {
                        .settings-preview-canvas,
                        .settings-blocked-preview-canvas {
                            --settings-preview-scale: 0.6;
                        }
                    }
                    @container (max-width: 560px) {
                        .settings-preview-canvas,
                        .settings-blocked-preview-canvas {
                            --settings-preview-scale: 0.5;
                        }
                        .settings-storefront-overlay-top_bar,
                        .settings-storefront-overlay-bottom_bar {
                            gap: 10px;
                        }
                        .settings-storefront-bar-content {
                            gap: 10px;
                        }
                        .settings-storefront-bar-title,
                        .settings-storefront-bar-message {
                            font-size: 12px;
                        }
                        .settings-storefront-bar-message {
                            flex-basis: 220px;
                        }
                        .settings-storefront-buttons {
                            gap: 8px;
                        }
                    }
                    @container (max-width: 460px) {
                        .settings-preview-canvas,
                        .settings-blocked-preview-canvas {
                            --settings-preview-scale: 0.65;
                        }
                        .settings-storefront-bar-message {
                            flex-basis: 180px;
                        }
                    }
                    @container (max-width: 52.5rem) {
                        .settings-section-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-content-preview-grid > .settings-flat-section:first-child {
                            padding-right: 0;
                            padding-bottom: 0;
                        }
                        .settings-content-preview-grid > .settings-flat-section:last-child {
                            padding-top: 0;
                            padding-left: 0;
                            border-top: 1px solid var(--p-color-border-secondary, #e3e3e3);
                            border-left: 0;
                        }
                    }
                    @media (max-width: 64em) {
                        .settings-workspace {
                            grid-template-columns: 1fr;
                        }
                        .settings-main-shell {
                            grid-template-columns: 1fr;
                        }
                        .settings-tab-list {
                            display: flex;
                            overflow-x: auto;
                            padding: 8px;
                            border-right: 0;
                            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
                            scrollbar-width: none;
                        }
                        .settings-tab-list::-webkit-scrollbar {
                            display: none;
                        }
                        .settings-tab {
                            width: auto;
                            min-width: max-content;
                            grid-template-columns: 18px auto;
                            padding: 7px 9px;
                        }
                        .settings-tab-copy span {
                            display: none;
                        }
                        .settings-side-column {
                            grid-template-columns: repeat(2, minmax(0, 1fr));
                        }
                    }
                    @media (max-width: 47.9975em) {
                        .Polaris-Page:has(.settings-page-content) > .Polaris-Box {
                            padding-inline: 0;
                        }
                        .settings-page-content {
                            padding-bottom: 88px;
                        }
                        .settings-tab-body {
                            padding: 0;
                        }
                        .settings-tab-notice {
                            padding: 14px 14px 0;
                        }
                        .settings-flat-section-header {
                            padding: 14px;
                        }
                        .settings-flat-section-body {
                            padding: 0 14px 14px;
                        }
                        .settings-form-row {
                            grid-template-columns: 1fr;
                            align-items: start;
                            gap: 10px;
                        }
                        .settings-form-control {
                            max-width: none;
                            justify-self: stretch;
                        }
                        .settings-side-column {
                            grid-template-columns: 1fr;
                        }
                        .settings-section-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-secondary-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-summary-grid,
                        .settings-two-field-grid,
                        .settings-color-grid {
                            grid-template-columns: 1fr;
                        }
                        .settings-preview-canvas {
                            height: 320px;
                        }
                        .settings-browser-url {
                            font-size: 11px;
                        }
                        .settings-storefront-overlay-top_bar,
                        .settings-storefront-overlay-bottom_bar {
                            align-items: flex-start;
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
                                onAction: () => navigate("/app/pricing"),
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
                    <div className="settings-workspace">
                        <div className="settings-main-shell">
                            <nav
                                className="settings-tab-list"
                                aria-label="Settings sections"
                            >
                                {settingsTabs.map((tab) => (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        className={`settings-tab${
                                            activeTab === tab.id ? " is-active" : ""
                                        }`}
                                        aria-current={
                                            activeTab === tab.id ? "page" : undefined
                                        }
                                        onClick={() => setActiveTab(tab.id)}
                                    >
                                        <span
                                            className="settings-tab-icon"
                                            aria-hidden="true"
                                        >
                                            <Icon source={tab.icon} />
                                        </span>
                                        <span className="settings-tab-copy">
                                            <strong>{tab.label}</strong>
                                            <span>{tab.description}</span>
                                        </span>
                                    </button>
                                ))}
                            </nav>

                            <section
                                className="settings-tab-panel"
                                aria-label={activeTabDetails.label}
                            >
                                <div className="settings-tab-body">
                                    {activeTab !== "general" && !isEnabled && (
                                        <div className="settings-tab-notice">
                                            <Banner tone="warning">
                                                Enable Geolocation in General before configuring this section.
                                            </Banner>
                                        </div>
                                    )}
                                    {activeTab === "general" && (
                                        <SettingsPanel
                                            title="General"
                                            description="Global storefront status and current configuration."
                                        >
                                            <SettingsRow
                                                label="Enable app"
                                                description="Turn redirects, blocks and popup rules on or off globally."
                                            >
                                                <SettingsToggle
                                                    label="Enable Geolocation"
                                                    checked={isEnabled}
                                                    onChange={setIsEnabled}
                                                />
                                            </SettingsRow>
                                            <SettingsRow
                                                label="Popup template"
                                                description="The storefront layout used by rules in popup mode."
                                            >
                                                <Button
                                                    variant="plain"
                                                    onClick={() => setActiveTab("popup")}
                                                >
                                                    {templateOptions.find(
                                                        (option) =>
                                                            option.value === template,
                                                    )?.label || "Modal"}
                                                </Button>
                                            </SettingsRow>
                                            <SettingsRow
                                                label="Bot handling"
                                                description="Control whether search engine crawlers run through rules."
                                            >
                                                <Badge
                                                    tone={
                                                        excludeBots
                                                            ? "success"
                                                            : "warning"
                                                    }
                                                >
                                                    {excludeBots
                                                        ? "Bots excluded"
                                                        : "Bots included"}
                                                </Badge>
                                            </SettingsRow>
                                            <SettingsRow
                                                label="Visitor preference"
                                                description="How long popup choices are remembered."
                                            >
                                                <Text
                                                    as="p"
                                                    variant="bodySm"
                                                    fontWeight="semibold"
                                                >
                                                    {cookieDuration || "7"} days
                                                </Text>
                                            </SettingsRow>
                                        </SettingsPanel>
                                    )}

                                        {activeTab === "popup" && isEnabled && (
                                            <div className="settings-section-grid settings-content-preview-grid">
                                            <SettingsPanel
                                                title="Popup content"
                                                description="Customize the prompt shown by popup rules."
                                            >
                                                <SettingsRow
                                                    label="Template design"
                                                    description="Choose how the prompt appears on the storefront."
                                                >
                                                    <Select
                                                        label="Template Design"
                                                        labelHidden
                                                        options={templateOptions}
                                                        value={template}
                                                        onChange={setTemplate}
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Popup title"
                                                    description="The heading visitors see first."
                                                >
                                                    <TextField
                                                        label="Popup Title"
                                                        labelHidden
                                                        value={popupTitle}
                                                        onChange={setPopupTitle}
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Popup message"
                                                    description="Use {country} and {target} to insert dynamic values."
                                                >
                                                    <TextField
                                                        label="Popup Message"
                                                        labelHidden
                                                        value={popupMessage}
                                                        onChange={setPopupMessage}
                                                        multiline={4}
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Button labels"
                                                    description="Text for confirm and cancel actions."
                                                >
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
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Colors"
                                                    description="Background, text and primary button colors."
                                                    stacked
                                                >
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
                                                </SettingsRow>
                                            </SettingsPanel>
                                            {previewMarkup}
                                            </div>

                                        )}

                                        {activeTab === "blocked" && isEnabled && (
                                            <div className="settings-section-grid settings-content-preview-grid">
                                            <SettingsPanel
                                                title="Blocked page content"
                                                description="Set the message visitors see when a block rule applies."
                                            >
                                                <SettingsRow
                                                    label="Blocked title"
                                                    description="Primary heading on the access denied page."
                                                >
                                                    <TextField
                                                        label="Blocked Title"
                                                        labelHidden
                                                        value={blockedTitle}
                                                        onChange={setBlockedTitle}
                                                        placeholder="Access Denied"
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Blocked message"
                                                    description="Explain why the visitor cannot access the storefront."
                                                >
                                                    <TextField
                                                        label="Blocked Message"
                                                        labelHidden
                                                        value={blockedMessage}
                                                        onChange={setBlockedMessage}
                                                        placeholder="We do not offer services in your country/region."
                                                        multiline={4}
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Logo URL"
                                                    description="Optional. Leave empty to use the default illustration."
                                                >
                                                    <TextField
                                                        label="Logo URL"
                                                        labelHidden
                                                        value={blockedLogoUrl}
                                                        onChange={setBlockedLogoUrl}
                                                        placeholder="https://your-store.com/logo.png"
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Colors"
                                                    description="Background, text and accent colors."
                                                    stacked
                                                >
                                                    <div className="settings-color-grid">
                                                        <ColorPickerField
                                                            label="Background"
                                                            value={blockedBgColor}
                                                            onChange={setBlockedBgColor}
                                                            fallback="#f8fafc"
                                                        />
                                                        <ColorPickerField
                                                            label="Text"
                                                            value={blockedTextColor}
                                                            onChange={setBlockedTextColor}
                                                            fallback="#0f172a"
                                                        />
                                                        <ColorPickerField
                                                            label="Button / Icon"
                                                            value={blockedAccentColor}
                                                            onChange={setBlockedAccentColor}
                                                            fallback="#2563eb"
                                                        />
                                                    </div>
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Support action"
                                                    description="Optional button text and destination."
                                                >
                                                    <div className="settings-two-field-grid">
                                                        <TextField
                                                            label="Support Button Text"
                                                            value={blockedSupportText}
                                                            onChange={setBlockedSupportText}
                                                            placeholder="Contact support"
                                                            autoComplete="off"
                                                        />
                                                        <TextField
                                                            label="Support Button URL"
                                                            value={blockedSupportUrl}
                                                            onChange={setBlockedSupportUrl}
                                                            placeholder="mailto:support@example.com or /pages/contact"
                                                            autoComplete="off"
                                                        />
                                                    </div>
                                                </SettingsRow>
                                            </SettingsPanel>
                                            {blockedPreviewMarkup}
                                            </div>
                                        )}

                                        {activeTab === "visitor" && isEnabled && (
                                            <div className="settings-secondary-grid">
                                            <SettingsPanel
                                                title="Visitor controls"
                                                description="Fine-tune bot handling, test exclusions and visitor memory."
                                            >
                                                <SettingsRow
                                                    label="Exclude search engine bots"
                                                    description="Prevent Googlebot and other crawlers from running through rules."
                                                >
                                                    <SettingsToggle
                                                        label="Exclude search engine bots"
                                                        checked={excludeBots}
                                                        onChange={setExcludeBots}
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Excluded IP addresses"
                                                    description="Comma-separated IPs that should bypass redirects and blocks."
                                                >
                                                    <TextField
                                                        label="Excluded IP Addresses"
                                                        labelHidden
                                                        value={excludedIPs}
                                                        onChange={setExcludedIPs}
                                                        placeholder="192.168.1.1, 10.0.0.1"
                                                        autoComplete="off"
                                                    />
                                                </SettingsRow>
                                                <SettingsRow
                                                    label="Cookie duration"
                                                    description="Days to remember a visitor's popup preference."
                                                >
                                                    <div className="settings-duration-control">
                                                        <div className="settings-duration-input">
                                                            <TextField
                                                                label="Cookie Duration (days)"
                                                                labelHidden
                                                                type="number"
                                                                value={cookieDuration}
                                                                onChange={setCookieDuration}
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <span className="settings-duration-unit">
                                                            days
                                                        </span>
                                                    </div>
                                                </SettingsRow>
                                            </SettingsPanel>
                                            </div>
                                        )}

                                        {activeTab === "security" && isEnabled && (
                                            <div className="settings-secondary-grid">
                                            <SettingsPanel
                                                title="Anti-fraud protection"
                                                description="Score IP reputation and block high-risk traffic."
                                            >
                                                    {isFreePlan ? (
                                                        <div style={{ padding: "16px 0" }}>
                                                        <Banner tone="warning">
                                                            <p>Upgrade to a paid plan to enable advanced security checks.</p>
                                                        </Banner>
                                                        </div>
                                                    ) : null}
                                                <SettingsRow
                                                    label="Block high-risk IPs"
                                                    description="Blocks confirmed high-risk traffic. VPNs and proxies without abuse signals are logged for review."
                                                >
                                                    <SettingsToggle
                                                        label="Block high-risk IP addresses"
                                                        checked={blockVpn}
                                                        onChange={setBlockVpn}
                                                        disabled={isFreePlan}
                                                    />
                                                </SettingsRow>
                                            </SettingsPanel>
                                            </div>
                                        )}

                                </div>
                            </section>
                        </div>

                        <aside className="settings-side-column">
                            <section className="settings-side-card">
                                <header className="settings-side-card-header">
                                    <Text as="h2" variant="headingSm">
                                        Integration status
                                    </Text>
                                    <span className="settings-connected">
                                        Connected
                                    </span>
                                </header>
                                <div className="settings-side-card-body">
                                    <div className="settings-store-identity">
                                        <span
                                            className="settings-store-icon"
                                            aria-hidden="true"
                                        >
                                            <Icon source={StoreIcon} />
                                        </span>
                                        <span className="settings-store-copy">
                                            <strong>Shopify store</strong>
                                            <span title={shop}>{shop}</span>
                                        </span>
                                    </div>
                                    <div className="settings-detail-list">
                                        <div className="settings-detail-row">
                                            <span>Plan</span>
                                            <strong>{planLabel}</strong>
                                        </div>
                                        <div className="settings-detail-row">
                                            <span>App status</span>
                                            <Badge
                                                tone={
                                                    isEnabled
                                                        ? "success"
                                                        : "warning"
                                                }
                                            >
                                                {isEnabled
                                                    ? "Enabled"
                                                    : "Disabled"}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button
                                        fullWidth
                                        onClick={() => navigate("/app/pricing")}
                                    >
                                        Manage plan
                                    </Button>
                                </div>
                            </section>

                            <section className="settings-side-card">
                                <header className="settings-side-card-header">
                                    <InlineStack gap="200" blockAlign="center">
                                        <span
                                            className="settings-tab-icon"
                                            aria-hidden="true"
                                        >
                                            <Icon source={ShieldCheckMarkIcon} />
                                        </span>
                                        <Text as="h2" variant="headingSm">
                                            Current setup
                                        </Text>
                                    </InlineStack>
                                </header>
                                <div className="settings-side-card-body">
                                    <div className="settings-check-list">
                                        <div className="settings-check-item">
                                            <span
                                                className={`settings-check-icon${
                                                    isEnabled
                                                        ? ""
                                                        : " is-warning"
                                                }`}
                                                aria-hidden="true"
                                            >
                                                <Icon
                                                    source={
                                                        isEnabled
                                                            ? CheckCircleIcon
                                                            : GlobeIcon
                                                    }
                                                />
                                            </span>
                                            <span className="settings-check-copy">
                                                <strong>
                                                    Storefront rules{" "}
                                                    {isEnabled
                                                        ? "enabled"
                                                        : "paused"}
                                                </strong>
                                                <span>
                                                    Redirects, blocks and
                                                    popups follow the global
                                                    app status.
                                                </span>
                                            </span>
                                        </div>
                                        <div className="settings-check-item">
                                            <span
                                                className="settings-check-icon"
                                                aria-hidden="true"
                                            >
                                                <Icon source={CheckCircleIcon} />
                                            </span>
                                            <span className="settings-check-copy">
                                                <strong>
                                                    Search bots{" "}
                                                    {excludeBots
                                                        ? "excluded"
                                                        : "included"}
                                                </strong>
                                                <span>
                                                    Bot handling is configured
                                                    under Visitor controls.
                                                </span>
                                            </span>
                                        </div>
                                        <div className="settings-check-item">
                                            <span
                                                className={`settings-check-icon${
                                                    blockVpn
                                                        ? ""
                                                        : " is-warning"
                                                }`}
                                                aria-hidden="true"
                                            >
                                                <Icon
                                                    source={
                                                        blockVpn
                                                            ? ShieldCheckMarkIcon
                                                            : LockIcon
                                                    }
                                                />
                                            </span>
                                            <span className="settings-check-copy">
                                                <strong>
                                                    High-risk IP protection{" "}
                                                    {blockVpn
                                                        ? "enabled"
                                                        : "disabled"}
                                                </strong>
                                                <span>
                                                    Available on paid plans
                                                    from the Security tab.
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </div>
                </BlockStack>
            </div>
        </Page>
    );
}
