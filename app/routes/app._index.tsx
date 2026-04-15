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
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLANS, PLAN_LIMITS, FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN } from "../billing.config";
import { checkAndChargeOverage } from "../utils/billing.server";
import prisma from "../db.server";
import { COUNTRY_MAP, getCountryFlag } from "../utils/countries";
import { sendAdminEmail, hasSentEmail } from "../utils/email.server";
import { getWelcomeEmailHtml, getLimit80EmailHtml, getLimit100EmailHtml } from "../utils/email-templates";

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
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Basic stats that are always available
  const [rulesCount, activeRulesCount, settings] = await Promise.all([
    prisma.redirectRule.count({ where: { shop } }),
    prisma.redirectRule.count({ where: { shop, isActive: true } }),
    prisma.settings.upsert({
      where: { shop },
      update: {},
      create: { shop },
    }),
  ]);

  // Check for active subscription
  const isTest = false;
  const billingConfig = await billing.check({
    plans: ALL_PAID_PLANS as any,
    isTest,
  });
  const hasProPlan = billingConfig.hasActivePayment;
  const currentPlan = billingConfig.appSubscriptions[0]?.name || FREE_PLAN;
  const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

  // Sync currentPlan to Settings (ensure proxy.config can check plan limits)
  try {
    await (prisma as any).settings.upsert({
      where: { shop },
      update: { currentPlan },
      create: { shop, currentPlan },
    });
  } catch (error) {
    console.error("[Settings] Failed to sync currentPlan:", error);
  }

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
  await checkAndChargeOverage(shop, billing, isTest);

  // --------------------------------




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

  // Removed IndexTable state for visits - using plain HTML table now

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

  // visitsRowMarkup removed - using plain HTML table

  return (
    <Page>
      <TitleBar title="Geo: Redirect & Country Block" />
      <style>
        {`
          @media (min-width: 48em) {
            .equal-height-container {
              display: flex;
              gap: var(--p-space-500);
            }
            .equal-height-container > .left-column {
              flex: 1;
              height: 580px;
              overflow: hidden;
            }
            .equal-height-container > .left-column > *,
            .equal-height-container > .left-column > * > * {
              height: 100%;
            }
            .equal-height-container > .right-column {
              width: 33.33%;
            }
            .table-scroll-container-short {
              max-height: 200px;
              overflow-y: auto;
            }
          }
          .traffic-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .traffic-table th {
            padding: 10px 16px;
            text-align: left;
            font-weight: 500;
            color: var(--p-color-text-secondary, #6d7175);
            border-bottom: 1px solid var(--p-color-border-subdued, #e1e3e5);
            position: sticky;
            top: 0;
            background: var(--p-color-bg-surface, #fff);
            z-index: 1;
          }
          .traffic-table th.text-right {
            text-align: right;
          }
          .traffic-table td {
            padding: 10px 16px;
            border-bottom: 1px solid var(--p-color-border-subdued, #e1e3e5);
          }
          .traffic-table td.text-right {
            text-align: right;
          }
          .traffic-table tbody tr:hover {
            background: var(--p-color-bg-surface-hover, #f6f6f7);
          }
          .traffic-table .country-cell {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .traffic-table .country-cell img {
            border-radius: 2px;
            object-fit: cover;
          }
          .traffic-table .country-cell span {
            font-weight: 600;
          }
        `}
      </style>
      <BlockStack gap="500">

        {/* Banner */}
        <CalloutCard
          title={`Visitors: ${stats.totalRedirected} redirected, ${stats.totalBlocked} blocked`}
          illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/tag.png?v=1705642267"
          primaryAction={{ content: 'Rate Us', onAction: () => window.open('https://apps.shopify.com/geo-redirect-country-block?#modal-show=WriteReviewModal', '_blank') }}
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
                  <strong>{currentUsage.toLocaleString()}</strong> / {planLimit.toLocaleString()} visitors (includes redirects, blocks & popups)
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
                {currentPlan === PLUS_PLAN 
                  ? "You have exceeded your Plus plan limit. Overage charges will apply for additional visitors."
                  : "You have exceeded your plan limit. Consider upgrading to avoid overage charges."
                }
              </Banner>
            )}
            {isNearLimit && !isOverLimit && (
              <Banner tone="warning">
                {currentPlan === PLUS_PLAN
                  ? `You're approaching your Plus plan limit (${usagePercent}% used).`
                  : `You're approaching your plan limit (${usagePercent}% used). Consider upgrading.`
                }
              </Banner>
            )}
          </BlockStack>
        </Card>



        {/* Main Section using Flex for Equal Height */}
        <div className="equal-height-container">
          {/* Left: Visits Table */}
          <div className="left-column">
            <Card padding="0">
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '16px' }}>
                  <Text as="h3" variant="headingMd">Traffic Overview</Text>
                  <Text as="p" tone="subdued">Unique visitors by country in the last 30 days.</Text>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <table className="traffic-table">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th className="text-right">Visitors</th>
                        <th className="text-right">Popup/banners</th>
                        <th className="text-right">Redirected</th>
                        <th className="text-right">Blocked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitsData.map((item: any) => (
                        <tr key={item.id}>
                          <td>
                            <div className="country-cell">
                              <img
                                src={`https://flagcdn.com/w40/${item.code.toLowerCase()}.png`}
                                srcSet={`https://flagcdn.com/w80/${item.code.toLowerCase()}.png 2x`}
                                width="30"
                                height="20"
                                alt={item.country}
                                loading="lazy"
                                decoding="async"
                              />
                              <span>{item.country}</span>
                            </div>
                          </td>
                          <td className="text-right">{item.visitors}</td>
                          <td className="text-right">{item.popup}</td>
                          <td className="text-right">{item.redirected}</td>
                          <td className="text-right">{item.blocked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Sidebar */}
          <div className="right-column">
            <BlockStack gap="500">
              {/* Theme Integration */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">Theme Integration</Text>
                    <Text as="p" tone="subdued">Follow these steps to enable the app on your store.</Text>
                  </BlockStack>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingSm">
                            Enable App Embed
                        </Text>
                        <BlockStack gap="200">
                            <List type="bullet">
                                <List.Item><Text as="span" variant="bodySm">Click "App embeds" in the left panel.</Text></List.Item>
                                <List.Item><Text as="span" variant="bodySm">Find "Geo: Redirect & Country Block" and toggle it ON.</Text></List.Item>
                                <List.Item><Text as="span" variant="bodySm">Click Save in the top right corner.</Text></List.Item>
                            </List>
                        </BlockStack>
                      <Button variant="primary" onClick={handleOpenThemeEditor} fullWidth>Open Theme Editor</Button>
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
                  <div className="table-scroll-container-short">
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
          </div>
        </div>

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
