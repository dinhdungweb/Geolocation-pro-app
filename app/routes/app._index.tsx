import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Icon,
  Badge,
  CalloutCard,
  IndexTable,
  Button,
  Banner,
  useIndexResourceState,
  useBreakpoints,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS } from "../billing.config";
import prisma from "../db.server";

const EmptyAuthState = ({ title }: { title: string }) => (
  <div style={{ padding: '32px', textAlign: 'center' }}>
    <Text as="p" tone="subdued">{title}</Text>
  </div>
);

// Helper to get country name (simplified version of the one in app.rules.tsx)
//Ideally this should be shared, but for now we put it here or rely on code.
const COUNTRY_MAP: Record<string, string> = {
  "VN": "Vietnam", "US": "United States", "CN": "China", "IN": "India", "GB": "United Kingdom",
  "SG": "Singapore", "AE": "United Arab Emirates", "KR": "South Korea", "MY": "Malaysia",
  "JP": "Japan", "DE": "Germany", "AU": "Australia", "FR": "France", "CA": "Canada",
  "TH": "Thailand", "ID": "Indonesia", "PH": "Philippines", "RU": "Russia",
  // Add more as needed or import full list
};


// Interface for the data items to fix implicit any
interface VisitsDataItem {
  id: string;
  country: string;
  code: string;
  visitors: string;
  popup: number;
  redirected: string;
  blocked: number;
}

interface BannersDataItem {
  id: string;
  rule: string;
  seen: number;
  clickedYes: number;
  clickedNo: number;
  dismissed: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Basic stats that are always available
  const [rulesCount, activeRulesCount, settings] = await Promise.all([
    prisma.redirectRule.count({ where: { shop } }),
    prisma.redirectRule.count({ where: { shop, isActive: true } }),
    prisma.settings.findUnique({ where: { shop } }),
  ]);

  // Check for active subscription
  const { billing } = await authenticate.admin(request);
  const billingConfig = await billing.check({
    plans: ALL_PAID_PLANS as any,
    isTest: true,
  });
  const hasProPlan = billingConfig.hasActivePayment;

  // If not Pro, we don't fetch or return detailed analytics to save resources
  if (!hasProPlan) {
    return json({
      shop,
      hasProPlan,
      stats: {
        totalRules: rulesCount,
        activeRules: activeRulesCount,
        mode: settings?.mode || "disabled",
        totalRedirected: "0", // Hidden
      },
      visitsData: [],
      popupsData: [],
      autoRedirectsData: [],
      blocksData: [],
    });
  }

  // Date range: Last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get statistics
  // Using (prisma as any) to bypass potential stale type definitions for new models
  const [
    countryStats,
    ruleStats
  ] = await Promise.all([
    (prisma as any).analyticsCountry.groupBy({
      by: ['countryCode'],
      where: {
        shop,
        date: { gte: thirtyDaysAgo }
      },
      _sum: {
        visitors: true,
        popupShown: true,
        redirected: true,
        blocked: true,
      }
    }),
    (prisma as any).analyticsRule.groupBy({
      by: ['ruleName', 'ruleId'],
      where: {
        shop,
        date: { gte: thirtyDaysAgo }
      },
      _sum: {
        seen: true,
        clickedYes: true,
        clickedNo: true,
        dismissed: true,
        autoRedirected: true,
      }
    })
  ]);

  // Aggregate total redirected for banner
  const totalRedirected = Array.isArray(countryStats) ? (countryStats as any[]).reduce((sum: number, item: any) => sum + (item._sum.redirected || 0), 0) : 0;

  // Process visits data
  const visitsData: VisitsDataItem[] = Array.isArray(countryStats) ? (countryStats as any[]).map((stat: any, index: number) => ({
    id: stat.countryCode,
    country: COUNTRY_MAP[stat.countryCode] || stat.countryCode,
    code: stat.countryCode,
    visitors: (stat._sum.visitors || 0).toLocaleString(),
    popup: stat._sum.popupShown || 0,
    redirected: (stat._sum.redirected || 0).toLocaleString(),
    blocked: stat._sum.blocked || 0,
  })).sort((a: VisitsDataItem, b: VisitsDataItem) => {
    const valA = parseInt(a.visitors.replace(/,/g, ''));
    const valB = parseInt(b.visitors.replace(/,/g, ''));
    return valB - valA;
  }) : [];

  // Process Popups Data (for Banners and Popups table)
  const popupsData = Array.isArray(ruleStats) ? ruleStats.map((stat: any) => ({
    id: stat.ruleId,
    rule: stat.ruleName || 'Unknown Rule',
    seen: stat._sum.seen || 0,
    clickedYes: stat._sum.clickedYes || 0,
    clickedNo: stat._sum.clickedNo || 0,
    dismissed: stat._sum.dismissed || 0,
  })) : [];

  // Process Auto Redirects Data (for Instant Redirects table)
  const autoRedirectsData = Array.isArray(ruleStats) ? ruleStats.map((stat: any) => ({
    id: stat.ruleId,
    rule: stat.ruleName || 'Unknown Rule',
    autoRedirected: stat._sum.autoRedirected || 0,
  })).filter((item: any) => item.autoRedirected > 0) : [];

  // Process Blocks Data
  const blocksData = Array.isArray(countryStats) ? countryStats.map((stat: any) => ({
    id: stat.countryCode,
    block: COUNTRY_MAP[stat.countryCode] || stat.countryCode,
    blocked: stat._sum.blocked || 0
  })).filter((item: any) => item.blocked > 0) : [];

  return json({
    shop,
    hasProPlan,
    stats: {
      totalRules: rulesCount,
      activeRules: activeRulesCount,
      mode: settings?.mode || "disabled",
      totalRedirected: totalRedirected.toLocaleString(),
    },
    visitsData,
    popupsData,
    autoRedirectsData,
    blocksData,
  });
};



export default function Index() {
  const { shop, hasProPlan, stats, visitsData, popupsData, autoRedirectsData, blocksData } = useLoaderData<typeof loader>();
  const { smUp } = useBreakpoints();

  const handleOpenThemeEditor = () => {
    const shopName = shop.replace('.myshopify.com', '');
    window.open(`https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`, '_blank');
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case "popup":
        return { label: "Popup Mode", tone: "info" as const, description: "App is configured to display a popup." };
      case "auto_redirect":
        return { label: "Auto Redirect Mode", tone: "info" as const, description: "App is configured to automatically redirect visitors." };
      default:
        return { label: "Disabled", tone: "critical" as const, description: "App configuration is disabled." };
    }
  };

  const modeInfo = getModeLabel(stats.mode);
  const resourceNameVisits = { singular: 'visit', plural: 'visits' };
  const { selectedResources: selectedVisits, allResourcesSelected: allVisitsSelected, handleSelectionChange: handleVisitsSelectionChange } =
    useIndexResourceState(visitsData as any);

  const popupsRowMarkup = popupsData.map(
    ({ id, rule, seen, clickedYes, clickedNo, dismissed }: any, index: number) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>{rule}</IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{seen}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{clickedYes}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{clickedNo}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{dismissed}</div></IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  const autoRedirectsRowMarkup = autoRedirectsData.map(
    ({ id, rule, autoRedirected }: any, index: number) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>{rule}</IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{autoRedirected}</div></IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  const visitsRowMarkup = visitsData.map(
    ({ id, country, code, visitors, popup, redirected, blocked }: any, index: number) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <InlineStack gap="200" align="start" blockAlign="center">
            <span style={{ fontSize: '20px' }}>{
              code === 'VN' ? '🇻🇳' :
                code === 'CN' ? '🇨🇳' :
                  code === 'US' ? '🇺🇸' :
                    code === 'IN' ? '🇮🇳' :
                      code === 'GB' ? '🇬🇧' :
                        code === 'SG' ? '🇸🇬' :
                          code === 'AE' ? '🇦🇪' :
                            code === 'KR' ? '🇰🇷' :
                              code === 'MY' ? '🇲🇾' :
                                code === 'JP' ? '🇯🇵' :
                                  code === 'DE' ? '🇩🇪' :
                                    code === 'AU' ? '🇦🇺' : '🏳️'
            }</span>
            <Text variant="bodyMd" fontWeight="bold" as="span">{country}</Text>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{visitors}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{popup}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{redirected}</div></IndexTable.Cell>
        <IndexTable.Cell><div style={{ textAlign: 'right' }}>{blocked}</div></IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page>
      <TitleBar title="Geolocation Redirect Pro" />
      <BlockStack gap="500">

        {/* Banner */}
        <CalloutCard
          title={`Visitors redirected: ${stats.totalRedirected}`}
          illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/tag.png?v=1705642267"
          primaryAction={{ content: 'Rate Us', url: '#' }}
        >
          <p>Congratulations! Geolocation Redirect Pro has automatically redirected <strong>{stats.totalRedirected}</strong> visitors in the last 30 days.</p>
        </CalloutCard>

        {!hasProPlan && (
          <CalloutCard
            title="Unlock Advanced Analytics"
            illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/tag.png?v=1705280535"
            primaryAction={{
              content: 'Upgrade to Pro',
              url: '/app/pricing',
            }}
          >
            <p>
              You are on the Free plan. Upgrade to view detailed traffic logs, blocked attempts, and rule performance.
            </p>
          </CalloutCard>
        )}

        {/* Main Section */}
        <Layout>
          {/* Left: Visits Table */}
          <Layout.Section>
            <Card padding="0">
              <BlockStack gap="0">
                <div style={{ padding: '16px' }}>
                  <Text as="h3" variant="headingMd">Traffic Overview</Text>
                  <Text as="p" tone="subdued">Unique visitors by country in the last 30 days.</Text>
                </div>
                {hasProPlan ? (
                  <IndexTable
                    condensed={!smUp}
                    resourceName={resourceNameVisits}
                    itemCount={visitsData.length}
                    selectedItemsCount={allVisitsSelected ? 'All' : selectedVisits.length}
                    onSelectionChange={handleVisitsSelectionChange}
                    headings={[
                      { title: 'Country' },
                      { title: 'Visitors', alignment: 'end' },
                      { title: 'Popup/banners', alignment: 'end' },
                      { title: 'Redirected', alignment: 'end' },
                      { title: 'Blocked', alignment: 'end' },
                    ]}
                    selectable={false}
                  >
                    {visitsRowMarkup}
                  </IndexTable>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', background: '#f9fafb' }}>
                    <Text as="p" tone="subdued">Detailed traffic data is hidden on the Free plan.</Text>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Right: Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              {/* Theme Integration */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">Theme Integration</Text>
                    <Text as="p" tone="subdued">Control visibility via Theme Editor.</Text>
                  </BlockStack>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="400">
                      <Text as="p">To enable/disable, verify App Embed status.</Text>
                      <BlockStack gap="300">
                        <div>
                          <Badge tone={modeInfo.tone}>{modeInfo.label === "Disabled" ? "Configuration: Disabled" : `Configuration: ${modeInfo.label}`}</Badge>
                        </div>
                        <Button variant="primary" onClick={handleOpenThemeEditor} fullWidth>Open Theme Editor</Button>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Card>

              {/* Blocks */}
              <Card padding="0">
                <BlockStack gap="0">
                  <div style={{ padding: '16px' }}>
                    <Text as="h3" variant="headingMd">Blocked Traffic</Text>
                    <Text as="p" tone="subdued">Visitors blocked by rule/country.</Text>
                  </div>
                  {hasProPlan ? (
                    <IndexTable
                      condensed={!smUp}
                      resourceName={{ singular: 'block', plural: 'blocks' }}
                      itemCount={blocksData.length}
                      headings={[{ title: 'Block' }, { title: 'Count' }]}
                      selectable={false}
                    >
                      {blocksData.length > 0 ? (
                        blocksData.map((item: any, index: number) => (
                          <IndexTable.Row id={item.id} key={item.id} position={index}>
                            <IndexTable.Cell>{item.block}</IndexTable.Cell>
                            <IndexTable.Cell>{item.blocked}</IndexTable.Cell>
                          </IndexTable.Row>
                        ))
                      ) : (
                        <EmptyAuthState title="No blocked traffic recorded" />
                      )}
                    </IndexTable>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                      <Text as="p" tone="subdued">Upgrade to see blocked traffic.</Text>
                    </div>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Banners/Popups and Instant Redirects - Side by Side */}
        {hasProPlan ? (
          <>
            <Layout>
              <Layout.Section variant="oneHalf">
                <Card padding="0">
                  <BlockStack gap="0">
                    <div style={{ padding: '16px' }}>
                      <Text as="h3" variant="headingMd">Banners and Popups</Text>
                      <Text as="p" tone="subdued">Popup interactions in the last 30 days.</Text>
                    </div>
                    <IndexTable
                      condensed={!smUp}
                      resourceName={{ singular: 'rule', plural: 'rules' }}
                      itemCount={popupsData.length}
                      headings={[
                        { title: 'Rule' },
                        { title: 'Seen', alignment: 'end' },
                        { title: 'Clicked Yes', alignment: 'end' },
                        { title: 'Clicked No', alignment: 'end' },
                        { title: 'Dismissed', alignment: 'end' }
                      ]}
                      selectable={false}
                    >
                      {popupsData.length > 0 ? (
                        popupsRowMarkup
                      ) : (
                        <EmptyAuthState title="No popup data" />
                      )}
                    </IndexTable>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                <Card padding="0">
                  <BlockStack gap="0">
                    <div style={{ padding: '16px' }}>
                      <Text as="h3" variant="headingMd">Instant Redirects</Text>
                      <Text as="p" tone="subdued">Auto-redirects in the last 30 days.</Text>
                    </div>
                    <IndexTable
                      condensed={!smUp}
                      resourceName={{ singular: 'rule', plural: 'rules' }}
                      itemCount={autoRedirectsData.length}
                      headings={[
                        { title: 'Rule' },
                        { title: 'Redirected', alignment: 'end' }
                      ]}
                      selectable={false}
                    >
                      {autoRedirectsData.length > 0 ? (
                        autoRedirectsRowMarkup
                      ) : (
                        <EmptyAuthState title="No auto-redirect data" />
                      )}
                    </IndexTable>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </>
        ) : null}
      </BlockStack>
    </Page>
  );
}
