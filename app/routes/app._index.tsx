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
  ProgressBar,
  useIndexResourceState,
  useBreakpoints,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS, PLAN_LIMITS, FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN, OVERAGE_RATE } from "../billing.config";
import prisma from "../db.server";
import { COUNTRY_MAP, getCountryFlag } from "../utils/countries";

const EmptyAuthState = ({ title }: { title: string }) => (
  <div style={{ padding: '32px', textAlign: 'center' }}>
    <Text as="p" tone="subdued">{title}</Text>
  </div>
);

// Helper to get country name (simplified version of the one in app.rules.tsx)
//Ideally this should be shared, but for now we put it here or rely on code.
// Used from shared utils now


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
  const currentPlan = billingConfig.appSubscriptions[0]?.name || FREE_PLAN;
  const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

  // Get current month usage
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyUsage = await (prisma as any).monthlyUsage.findUnique({
    where: {
      shop_yearMonth: {
        shop,
        yearMonth,
      },
    },
  });
  const currentUsage = monthlyUsage?.totalVisitors || 0;
  const chargedVisitors = monthlyUsage?.chargedVisitors || 0;

  // Calculate and charge overage if applicable (only for paid plans)
  if (hasProPlan && currentUsage > planLimit) {
    // DOUBLE CHECK: Fetch latest usage from DB to ensure no race condition
    const latestUsageResult = await (prisma as any).monthlyUsage.findUnique({
      where: { shop_yearMonth: { shop, yearMonth } },
    });

    // Use latest data or fallback to current (if findUnique fails which is unlikely)
    const latestTotal = latestUsageResult?.totalVisitors || currentUsage;
    const latestCharged = latestUsageResult?.chargedVisitors || chargedVisitors;
    const overageVisitors = latestTotal - planLimit - latestCharged;

    if (overageVisitors > 0) {
      // Calculate charge amount ($0.002 per visitor)
      const chargeAmount = overageVisitors * OVERAGE_RATE;

      try {
        // Create usage record in Shopify
        await billing.createUsageRecord({
          description: `Overage: ${overageVisitors} visitors beyond ${planLimit} limit`,
          price: {
            amount: chargeAmount,
            currencyCode: "USD",
          },
          isTest: true,
        });

        // Update chargedVisitors to prevent double charging
        await (prisma as any).monthlyUsage.update({
          where: {
            shop_yearMonth: {
              shop,
              yearMonth,
            },
          },
          data: {
            chargedVisitors: { increment: overageVisitors },
          },
        });

        console.log(`[Billing] Charged ${shop} $${chargeAmount.toFixed(2)} for ${overageVisitors} overage visitors`);
      } catch (error) {
        console.error("[Billing] Failed to create usage record:", error);
      }
    }
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

  // Aggregate total redirected and blocked for banner
  const totalRedirected = Array.isArray(countryStats) ? (countryStats as any[]).reduce((sum: number, item: any) => sum + (item._sum.redirected || 0), 0) : 0;
  const totalBlocked = Array.isArray(countryStats) ? (countryStats as any[]).reduce((sum: number, item: any) => sum + (item._sum.blocked || 0), 0) : 0;

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
    currentPlan,
    planLimit,
    currentUsage,
    stats: {
      totalRules: rulesCount,
      activeRules: activeRulesCount,
      mode: settings?.mode || "disabled",
      totalRedirected: totalRedirected.toLocaleString(),
      totalBlocked: totalBlocked.toLocaleString(),
    },
    visitsData,
    popupsData,
    autoRedirectsData,
    blocksData,
  });
};



export default function Index() {
  const { shop, hasProPlan, currentPlan, planLimit, currentUsage, stats, visitsData, popupsData, autoRedirectsData, blocksData } = useLoaderData<typeof loader>();
  const { smUp } = useBreakpoints();

  // Calculate usage percentage
  const usagePercent = Math.min(100, Math.round((currentUsage / planLimit) * 100));
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = currentUsage > planLimit;

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
            <img
              src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
              srcSet={`https://flagcdn.com/w80/${code.toLowerCase()}.png 2x`}
              width="30"
              alt={country}
              loading="lazy" // Optimize performance
              decoding="async"
              style={{ borderRadius: '2px', objectFit: 'cover' }}
            />
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
      <style>
        {`
          .table-scroll-container th {
            position: static !important;
          }
          .table-scroll-container .Polaris-IndexTable__StickyTable {
            display: none !important;
          }
        `}
      </style>
      <BlockStack gap="500">

        {/* Banner */}
        <CalloutCard
          title={`Visitors: ${stats.totalRedirected} redirected, ${stats.totalBlocked} blocked`}
          illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/tag.png?v=1705642267"
          primaryAction={{ content: 'Rate Us', url: '#' }}
        >
          <p>In the last 30 days: <strong>{stats.totalRedirected}</strong> visitors redirected, <strong>{stats.totalBlocked}</strong> visitors blocked.</p>
        </CalloutCard>

        {/* Usage Progress Bar */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingSm">Monthly Usage</Text>
              <Badge tone={isOverLimit ? "critical" : isNearLimit ? "warning" : "success"}>
                {currentPlan}
              </Badge>
            </InlineStack>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text as="p" variant="bodySm">
                  <strong>{currentUsage.toLocaleString()}</strong> / {planLimit.toLocaleString()} visitors
                </Text>
                <Text as="p" variant="bodySm" tone={isOverLimit ? "critical" : isNearLimit ? "caution" : "subdued"}>
                  {usagePercent}%
                </Text>
              </InlineStack>
              <ProgressBar
                progress={usagePercent}
                tone={isOverLimit ? "critical" : undefined}
                size="small"
              />
            </BlockStack>
            {isOverLimit && (
              <Banner tone="critical">
                You have exceeded your plan limit. Consider upgrading to avoid overage charges.
              </Banner>
            )}
            {isNearLimit && !isOverLimit && (
              <Banner tone="warning">
                You're approaching your plan limit ({usagePercent}% used). Consider upgrading.
              </Banner>
            )}
          </BlockStack>
        </Card>



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
                <div className="table-scroll-container" style={{ maxHeight: '440px', overflowY: 'auto' }}>
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
                </div>
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
                  <div className="table-scroll-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
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
                        <EmptyAuthState title="No blocks found" />
                      )}
                    </IndexTable>
                  </div>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Banners/Popups and Instant Redirects - Side by Side */}
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
      </BlockStack>
    </Page>
  );
}
