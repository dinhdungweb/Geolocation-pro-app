import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    IndexTable,
    Badge,
    Text,
    Pagination,
    EmptyState,
    BlockStack,
    InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const skip = (page - 1) * limit;

    const maxLogs = 250;

    let [logs, dbCount] = await Promise.all([
        prisma.visitorLog.findMany({
            where: { shop: session.shop },
            orderBy: { timestamp: "desc" },
            skip,
            take: limit,
        }),
        prisma.visitorLog.count({
            where: { shop: session.shop },
        }),
    ]);

    const totalLogs = Math.min(dbCount, maxLogs);

    // Enforce the hard limit of 250 items displayed
    if (skip + logs.length > maxLogs) {
        logs = logs.slice(0, Math.max(0, maxLogs - skip));
    }

    return json({
        logs,
        page,
        totalPages: Math.ceil(totalLogs / limit),
        totalLogs,
    });
};

export default function VisitorLogs() {
    const { logs, page, totalPages, totalLogs } = useLoaderData<typeof loader>();
    const [, setSearchParams] = useSearchParams();
    const pageSize = 20;
    const firstLogNumber = logs.length > 0 ? (page - 1) * pageSize + 1 : 0;
    const lastLogNumber = logs.length > 0 ? Math.min((page - 1) * pageSize + logs.length, totalLogs) : 0;
    const recentLogsLabel = `${totalLogs.toLocaleString()} recent log${totalLogs === 1 ? "" : "s"}`;

    const handleNextPage = () => {
        if (page < totalPages) {
            setSearchParams({ page: (page + 1).toString() });
        }
    };

    const handlePreviousPage = () => {
        if (page > 1) {
            setSearchParams({ page: (page - 1).toString() });
        }
    };

    const getActionBadge = (action: string) => {
        switch (action) {
            case "visit":
                return <Badge tone="info">Visit</Badge>;
            case "redirected":
            case "clicked_redirect":
                return <Badge tone="success">Redirected</Badge>;
            case "auto_redirect":
            case "auto_redirected":
                return <Badge tone="success">Auto Redirect</Badge>;
            case "blocked":
            case "ip_block":
                return <Badge tone="critical">Blocked</Badge>;
            case "ip_redirect":
            case "ip_redirected":
                return <Badge tone="warning">IP Redirect</Badge>;
            case "clicked_no":
            case "declined":
                return <Badge>Declined</Badge>;
            case "dismissed":
                return <Badge>Dismissed</Badge>;
            case "popup_shown":
                return <Badge tone="info">Popup Shown</Badge>;
            default:
                return <Badge>{action}</Badge>;
        }
    };

    const resourceName = {
        singular: "log",
        plural: "logs",
    };

    const rowMarkup = logs.map(
        (
            log: any,
            index: number
        ) => (
            <IndexTable.Row id={log.id} key={log.id} position={index}>
                <IndexTable.Cell>
                    <Text as="span" variant="bodyMd">
                        {new Date(log.timestamp).toLocaleString()}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{log.ipAddress}</IndexTable.Cell>
                <IndexTable.Cell>
                    {log.countryCode ? (
                        <div className="visitor-log-country">
                            <img
                                src={`https://flagcdn.com/20x15/${log.countryCode.toLowerCase()}.png`}
                                alt={log.countryCode}
                                className="visitor-log-flag"
                            />
                            {log.countryCode}
                        </div>
                    ) : (
                        "Unknown"
                    )}
                </IndexTable.Cell>
                <IndexTable.Cell>{getActionBadge(log.action)}</IndexTable.Cell>
                <IndexTable.Cell>
                    {log.path ? (
                        <div className="visitor-log-path" title={log.path}>
                            {log.path}
                        </div>
                    ) : (
                        <Text as="span" variant="bodyMd" tone="subdued">-</Text>
                    )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" truncate>
                        {log.ruleName || "-"}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div className="visitor-log-user-agent" title={log.userAgent || ""}>
                        {log.userAgent || "-"}
                    </div>
                </IndexTable.Cell>
            </IndexTable.Row>
        )
    );

    return (
        <Page title="Visitor Logs" subtitle="Detailed logs of all visitor interactions" fullWidth>
            <TitleBar title="Visitor Logs" />
            <style>
                {`
                    .visitor-log-card-header {
                        padding: 16px 20px;
                        border-bottom: 1px solid var(--p-color-border-secondary, #dfe3e8);
                    }
                    .visitor-log-country {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                    }
                    .visitor-log-flag {
                        border-radius: 2px;
                        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
                    }
                    .visitor-log-path,
                    .visitor-log-user-agent {
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: var(--p-color-text-secondary, #6d7175);
                    }
                    .visitor-log-path {
                        max-width: 220px;
                        font-size: 12px;
                    }
                    .visitor-log-user-agent {
                        max-width: 180px;
                        font-size: 11px;
                    }
                    .visitor-log-pagination {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-wrap: wrap;
                        gap: 16px;
                        padding: 14px 20px;
                        border-top: 1px solid var(--p-color-border-secondary, #dfe3e8);
                    }
                    @media (max-width: 47.9975em) {
                        .visitor-log-card-header,
                        .visitor-log-pagination {
                            align-items: flex-start;
                            flex-direction: column;
                        }
                    }
                `}
            </style>
            <Layout>
                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <InlineStack align="space-between" blockAlign="center" gap="400">
                                <BlockStack gap="100">
                                    <Text as="h2" variant="headingMd">Recent visitor activity</Text>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Review recent visits, redirects, blocks, and popup events for troubleshooting.
                                    </Text>
                                </BlockStack>
                                <Badge tone="info">{recentLogsLabel}</Badge>
                            </InlineStack>
                        </Card>

                        <Card padding="0">
                            <div className="visitor-log-card-header">
                                <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <BlockStack gap="100">
                                        <Text as="h2" variant="headingSm">Activity log</Text>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Showing {firstLogNumber.toLocaleString()}-{lastLogNumber.toLocaleString()} of {totalLogs.toLocaleString()} logs.
                                        </Text>
                                    </BlockStack>
                                    {totalPages > 1 && (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            Page {page} of {totalPages}
                                        </Text>
                                    )}
                                </InlineStack>
                            </div>
                        {logs.length > 0 ? (
                            <>
                                <IndexTable
                                    resourceName={resourceName}
                                    itemCount={logs.length}
                                    headings={[
                                        { title: "Timestamp" },
                                        { title: "IP Address" },
                                        { title: "Country" },
                                        { title: "Action" },
                                        { title: "Page Path" },
                                        { title: "Details / Rule" },
                                        { title: "User Agent" },
                                    ]}
                                    selectable={false}
                                >
                                    {rowMarkup}
                                </IndexTable>
                                <div className="visitor-log-pagination">
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        Latest logs are shown first.
                                    </Text>
                                    <Pagination
                                        hasPrevious={page > 1}
                                        onPrevious={handlePreviousPage}
                                        hasNext={page < totalPages}
                                        onNext={handleNextPage}
                                    />
                                </div>
                            </>
                        ) : (
                            <EmptyState
                                heading="No logs found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>Visitor activity will appear here.</p>
                            </EmptyState>
                        )}

                        </Card>
                    </BlockStack>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
