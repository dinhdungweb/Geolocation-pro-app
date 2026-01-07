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
    cookieDuration: number;
    blockedTitle: string;
    blockedMessage: string;
}

const defaultSettings: Omit<Settings, "id"> = {
    mode: "popup",
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

        await prisma.settings.upsert({
            where: { shop },
            update: {
                mode,
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
        mode, popupTitle, popupMessage, confirmBtnText, cancelBtnText,
        popupBgColor, popupTextColor, popupBtnColor, excludeBots, excludedIPs,
        cookieDuration, fetcher
    ]);

    const modeOptions = [
        { label: "Popup (Recommended)", value: "popup" },
        { label: "Auto Redirect", value: "auto_redirect" },
        { label: "Disabled", value: "disabled" },
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

                    {/* Popup Customization */}
                    {mode === "popup" && (
                        <Layout.Section>
                            <Card>
                                <BlockStack gap="400">
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
                    )}

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

                    {/* Preview */}
                    {mode === "popup" && (
                        <Layout.Section variant="oneThird">
                            <Card>
                                <BlockStack gap="400">
                                    <Text as="h2" variant="headingMd">
                                        Popup Preview
                                    </Text>
                                    <div
                                        style={{
                                            padding: "20px",
                                            borderRadius: "8px",
                                            backgroundColor: popupBgColor,
                                            color: popupTextColor,
                                            border: "1px solid #ddd",
                                        }}
                                    >
                                        <Text as="h3" variant="headingMd" fontWeight="bold">
                                            {popupTitle}
                                        </Text>
                                        <p style={{ margin: "10px 0" }}>
                                            {popupMessage
                                                .replace("{country}", "United States")
                                                .replace("{target}", "US Store")}
                                        </p>
                                        <InlineStack gap="200">
                                            <button
                                                style={{
                                                    backgroundColor: popupBtnColor,
                                                    color: "#fff",
                                                    border: "none",
                                                    padding: "8px 16px",
                                                    borderRadius: "4px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                {confirmBtnText}
                                            </button>
                                            <button
                                                style={{
                                                    backgroundColor: "transparent",
                                                    border: `1px solid ${popupTextColor}`,
                                                    color: popupTextColor,
                                                    padding: "8px 16px",
                                                    borderRadius: "4px",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                {cancelBtnText}
                                            </button>
                                        </InlineStack>
                                    </div>
                                </BlockStack>
                            </Card>
                        </Layout.Section>
                    )}
                </Layout>
            </BlockStack>
        </Page>
    );
}
