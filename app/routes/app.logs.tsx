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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const skip = (page - 1) * limit;

    const [logs, totalLogs] = await Promise.all([
        (prisma as any).visitorLog.findMany({
            where: { shop: session.shop },
            orderBy: { timestamp: "desc" },
            skip,
            take: limit,
        }),
        (prisma as any).visitorLog.count({
            where: { shop: session.shop },
        }),
    ]);

    return json({
        logs,
        page,
        totalPages: Math.ceil(totalLogs / limit),
        totalLogs,
    });
};

export default function VisitorLogs() {
    const { logs, page, totalPages, totalLogs } = useLoaderData<typeof loader>();
    const [searchParams, setSearchParams] = useSearchParams();

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
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <img
                                src={`https://flagcdn.com/20x15/${log.countryCode.toLowerCase()}.png`}
                                alt={log.countryCode}
                                style={{ borderRadius: "2px" }}
                            />
                            {log.countryCode}
                        </div>
                    ) : (
                        "Unknown"
                    )}
                </IndexTable.Cell>
                <IndexTable.Cell>{getActionBadge(log.action)}</IndexTable.Cell>
                <IndexTable.Cell>
                    <Text as="span" variant="bodyMd">
                        {log.ruleName || "-"}
                    </Text>
                    {log.targetUrl && (
                        <div style={{ fontSize: "12px", color: "#666", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {log.targetUrl}
                        </div>
                    )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ fontSize: "11px", color: "#888", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.userAgent}>
                        {log.userAgent || "-"}
                    </div>
                </IndexTable.Cell>
            </IndexTable.Row>
        )
    );

    return (
        <Page title="Visitor Logs" subtitle="Detailed logs of all visitor interactions" fullWidth>
            <Layout>
                <Layout.Section>
                    <Card padding="0">
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
                                        { title: "Details / Rule" },
                                        { title: "User Agent" },
                                    ]}
                                    selectable={false}
                                >
                                    {rowMarkup}
                                </IndexTable>
                                <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
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
                    <div style={{ height: "60px" }} />
                </Layout.Section>
            </Layout>
        </Page>
    );
}
