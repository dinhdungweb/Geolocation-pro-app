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
    TextField,
    Select,
    Checkbox,
    Banner,
    Divider,
    InlineStack,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface Settings {
    id: string;
    mode: string;
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
}

const defaultSettings: Omit<Settings, "id"> = {
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
};

// Loader: Fetch settings for the current shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

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

    return json({ settings, shop });
};

// Action: Update settings
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();

    try {
        const mode = formData.get("mode") as string;
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
        const template = formData.get("template") as string || "modal";

        await prisma.settings.upsert({
            where: { shop },
            update: {
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
            },
            create: {
                shop,
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
            },
        });

        return json({ success: true, message: "Settings saved successfully" });
    } catch (error) {
        console.error("Settings save error:", error);
        return json({ success: false, message: "Failed to save settings" }, { status: 500 });
    }
};

export default function SettingsPage() {
    const { settings } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();

    // Form state
    const [mode, setMode] = useState(settings.mode);
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

    const isLoading = fetcher.state !== "idle";

    useEffect(() => {
        if (fetcher.data?.success) {
            shopify.toast.show("Settings saved!");
        }
    }, [fetcher.data, shopify]);

    const handleSave = useCallback(() => {
        const formData = new FormData();
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

        fetcher.submit(formData, { method: "POST" });
    }, [
        mode, template, popupTitle, popupMessage, confirmBtnText, cancelBtnText,
        popupBgColor, popupTextColor, popupBtnColor, excludeBots, excludedIPs,
        cookieDuration, fetcher
    ]);

    const modeOptions = [
        { label: "Popup (Recommended)", value: "popup" },
        { label: "Auto Redirect", value: "auto_redirect" },
        { label: "Disabled", value: "disabled" },
    ];

    const templateOptions = [
        { label: "Modal (Centered)", value: "modal" },
        { label: "Top Bar", value: "top_bar" },
        { label: "Bottom Bar", value: "bottom_bar" },
    ];

    return (
        <Page>
            <TitleBar title="Settings">
                <button variant="primary" onClick={handleSave} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save"}
                </button>
            </TitleBar>
            <BlockStack gap="500">
                <Layout>
                    {/* Mode Selection */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">
                                    Redirect Mode
                                </Text>
                                <Select
                                    label="How should visitors be redirected?"
                                    options={modeOptions}
                                    value={mode}
                                    onChange={setMode}
                                />
                                {mode === "auto_redirect" && (
                                    <Banner tone="warning">
                                        <p>
                                            Auto redirect may affect SEO. We recommend using Popup mode and
                                            enabling Bot Exclusion to prevent search engine issues.
                                        </p>
                                    </Banner>
                                )}
                                {mode === "disabled" && (
                                    <Banner>
                                        <p>Geolocation redirect is currently disabled.</p>
                                    </Banner>
                                )}
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Popup Customization Row - Only show if mode is popup */}
                {mode === "popup" && (
                    <Layout>
                        <Layout.Section>
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd">
                                        Popup Appearance
                                    </Text>
                                    <Select
                                        label="Template Design"
                                        options={templateOptions}
                                        value={template}
                                        onChange={setTemplate}
                                        helpText="Choose how the popup appears on the visitor's screen."
                                    />
                                    <Divider />
                                    <Text as="h2" variant="headingMd">
                                        Popup Customization
                                    </Text>
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
                                    <InlineStack gap="400">
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
                                    </InlineStack>
                                    <Divider />
                                    <Text as="h3" variant="headingSm">
                                        Colors
                                    </Text>
                                    <InlineStack gap="400">
                                        <TextField
                                            label="Background Color"
                                            value={popupBgColor}
                                            onChange={setPopupBgColor}
                                            placeholder="#ffffff"
                                            autoComplete="off"
                                        />
                                        <TextField
                                            label="Text Color"
                                            value={popupTextColor}
                                            onChange={setPopupTextColor}
                                            placeholder="#333333"
                                            autoComplete="off"
                                        />
                                        <TextField
                                            label="Button Color"
                                            value={popupBtnColor}
                                            onChange={setPopupBtnColor}
                                            placeholder="#007bff"
                                            autoComplete="off"
                                        />
                                    </InlineStack>
                                </BlockStack>
                            </Card>
                        </Layout.Section>

                        {/* Preview Section - Side by Side with options */}
                        <Layout.Section variant="oneThird">
                            <div style={{ position: 'sticky', top: '20px' }}>
                                <Card>
                                    <BlockStack gap="400">
                                        <Text as="h2" variant="headingMd">
                                            Popup Preview
                                        </Text>
                                        <div
                                            style={{
                                                position: "relative",
                                                height: "300px",
                                                backgroundColor: "#f4f6f8",
                                                border: "1px solid #ddd",
                                                borderRadius: "8px",
                                                overflow: "hidden",
                                                display: "flex",
                                                alignItems: template === "modal" ? "center" : (template === "top_bar" ? "flex-start" : "flex-end"),
                                                justifyContent: "center",
                                            }}
                                        >
                                            {/* Mock Page Content */}
                                            <div style={{ position: "absolute", top: 20, left: 20, right: 20, bottom: 20, opacity: 0.3 }}>
                                                <div style={{ height: "20px", width: "100px", background: "#ccc", marginBottom: "20px" }}></div>
                                                <div style={{ height: "150px", width: "100%", background: "#ccc", marginBottom: "20px" }}></div>
                                                <div style={{ height: "20px", width: "80%", background: "#ccc" }}></div>
                                            </div>

                                            {/* Preview Element */}
                                            <div
                                                style={{
                                                    padding: template === "modal" ? "20px" : "12px 20px",
                                                    borderRadius: template === "modal" ? "8px" : "0",
                                                    backgroundColor: popupBgColor,
                                                    color: popupTextColor,
                                                    width: template === "modal" ? "90%" : "100%",
                                                    maxWidth: template === "modal" ? "300px" : "100%",
                                                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                                    display: "flex",
                                                    flexDirection: template === "modal" ? "column" : "row",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                    justifyContent: template === "modal" ? "center" : "space-between",
                                                    textAlign: template === "modal" ? "center" : "left",
                                                    border: template === "modal" ? "1px solid #ddd" : "none",
                                                    zIndex: 10,
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    {template === "modal" && (
                                                        <Text as="h3" variant="headingMd" fontWeight="bold">
                                                            {popupTitle}
                                                        </Text>
                                                    )}
                                                    <p style={{ margin: template === "modal" ? "10px 0" : "0", fontSize: template === "modal" ? "14px" : "13px" }}>
                                                        {template !== "modal" && <strong style={{ marginRight: 5 }}>{popupTitle}</strong>}
                                                        {popupMessage
                                                            .replace("{country}", "US")
                                                            .replace("{target}", "US Store")}
                                                    </p>
                                                </div>

                                                <InlineStack gap="200">
                                                    <button
                                                        style={{
                                                            backgroundColor: popupBtnColor,
                                                            color: "#fff",
                                                            border: "none",
                                                            padding: template === "modal" ? "8px 16px" : "6px 12px",
                                                            borderRadius: "4px",
                                                            cursor: "pointer",
                                                            fontSize: "13px",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {confirmBtnText}
                                                    </button>
                                                    <button
                                                        style={{
                                                            backgroundColor: "transparent",
                                                            border: `1px solid ${popupTextColor}`,
                                                            color: popupTextColor,
                                                            padding: template === "modal" ? "8px 16px" : "6px 12px",
                                                            borderRadius: "4px",
                                                            cursor: "pointer",
                                                            fontSize: "13px",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {cancelBtnText}
                                                    </button>
                                                </InlineStack>
                                            </div>
                                        </div>
                                        <Text as="p" tone="subdued">
                                            Preview shows how the popup will appear relative to the screen.
                                        </Text>
                                    </BlockStack>
                                </Card>
                            </div>
                        </Layout.Section>
                    </Layout>
                )}

                <Layout>
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">
                                    Blocked Page Appearance
                                </Text>
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
                    </Layout.Section>

                    {/* Advanced Settings */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">
                                    Advanced Settings
                                </Text>
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
                                {mode === "popup" && (
                                    <TextField
                                        label="Cookie Duration (days)"
                                        type="number"
                                        value={cookieDuration}
                                        onChange={setCookieDuration}
                                        helpText="How long to remember visitor's preference (only for Popup mode)"
                                        autoComplete="off"
                                    />
                                )}
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
            </BlockStack>
        </Page>
    );
}
