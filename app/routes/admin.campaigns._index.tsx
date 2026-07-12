import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const ruleStats = await prisma.analyticsRule.groupBy({
    by: ["ruleName", "ruleId"],
    _sum: {
      seen: true,
      clickedYes: true,
      clickedNo: true,
      dismissed: true,
      autoRedirected: true,
    },
  });

  const countryStats = await prisma.analyticsCountry.groupBy({
    by: ["countryCode"],
    _sum: {
      visitors: true,
      popupShown: true,
      redirected: true,
    },
    orderBy: {
      _sum: {
        visitors: "desc",
      },
    },
    take: 10,
  });

  return json({
    campaigns: ruleStats.map((rule: any) => ({
      ...rule,
      name: rule.ruleName,
      id: rule.ruleId,
      seen: rule._sum.seen || 0,
      conversions: rule._sum.clickedYes || 0,
      auto: rule._sum.autoRedirected || 0,
      cr: rule._sum.seen > 0 ? ((rule._sum.clickedYes / rule._sum.seen) * 100).toFixed(1) : "0",
    })),
    reach: countryStats.map((country: any) => ({
      code: country.countryCode,
      visitors: country._sum.visitors || 0,
      engaged: (country._sum.popupShown || 0) + (country._sum.redirected || 0),
    })),
  });
};

export default function AdminCampaigns() {
  const { campaigns, reach } = useLoaderData<typeof loader>();
  const totalReach = campaigns.reduce((sum: number, item: any) => sum + item.seen, 0);
  const totalAuto = campaigns.reduce((sum: number, item: any) => sum + item.auto, 0);
  const avgConversion =
    campaigns.length > 0
      ? (campaigns.reduce((sum: number, item: any) => sum + parseFloat(item.cr), 0) / campaigns.length).toFixed(1)
      : "0.0";

  return (
    <section className="ed-campaigns">
      <div className="ed-campaign-metrics">
        <article>
          <span>Avg. Conversion</span>
          <strong>{avgConversion}%</strong>
        </article>
        <article>
          <span>Total Reach</span>
          <strong>{totalReach.toLocaleString()}</strong>
        </article>
        <article>
          <span>Auto Redirects</span>
          <strong>{totalAuto.toLocaleString()}</strong>
        </article>
      </div>

      <div className="ed-campaign-grid">
        <article className="ed-campaign-panel">
          <div className="ed-panel-head">
            <h2>Campaign Performance</h2>
            <p>Active rules and popup campaigns ranked by conversion rate.</p>
          </div>

          <div className="ed-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campaign / Rule</th>
                  <th>Reach</th>
                  <th>Conversions</th>
                  <th>CR %</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="ed-empty">No campaign data available.</div>
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign: any) => (
                    <tr key={campaign.id}>
                      <td>
                        <strong>{campaign.name}</strong>
                        <small>{campaign.auto > 0 ? "Auto Redirect" : "Popup Campaign"}</small>
                      </td>
                      <td>{campaign.seen.toLocaleString()}</td>
                      <td>{campaign.conversions.toLocaleString()}</td>
                      <td>
                        <div className="ed-cr-cell">
                          <strong>{campaign.cr}%</strong>
                          <span>
                            <i style={{ width: `${Math.min(parseFloat(campaign.cr), 100)}%` }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="ed-campaign-panel">
          <div className="ed-panel-head">
            <h2>Market Reach</h2>
            <p>Top markets by total visitor engagement.</p>
          </div>

          <div className="ed-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Total Visitors</th>
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {reach.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="ed-empty">No market data available.</div>
                    </td>
                  </tr>
                ) : (
                  reach.map((market: any) => (
                    <tr key={market.code}>
                      <td>
                        <div className="ed-market">
                          <img src={`https://flagcdn.com/w40/${market.code.toLowerCase()}.png`} width="20" alt="" />
                          <strong>{market.code}</strong>
                        </div>
                      </td>
                      <td>{market.visitors.toLocaleString()}</td>
                      <td>
                        <strong>{market.engaged.toLocaleString()}</strong>
                        <small>actions</small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <style>{`
        .ed-campaigns {
          display: grid;
          gap: var(--ed-space-8);
        }

        .ed-campaign-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--ed-space-8);
        }

        .ed-campaign-metrics article,
        .ed-campaign-panel {
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
        }

        .ed-campaign-metrics article {
          position: relative;
          overflow: hidden;
          display: grid;
          gap: var(--ed-space-3);
          padding: var(--ed-space-8);
        }

        .ed-campaign-metrics article::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: var(--ed-campaign-accent, var(--ed-color-text-inverse));
        }

        .ed-campaign-metrics article:nth-child(1) {
          --ed-campaign-accent: var(--ed-color-primary);
        }

        .ed-campaign-metrics article:nth-child(2) {
          --ed-campaign-accent: var(--ed-color-info);
        }

        .ed-campaign-metrics article:nth-child(3) {
          --ed-campaign-accent: var(--ed-color-success);
        }

        .ed-campaign-metrics span {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ed-campaign-metrics strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          line-height: 28px;
          font-variant-numeric: tabular-nums;
        }

        .ed-campaign-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.9fr);
          gap: var(--ed-space-8);
          align-items: start;
        }

        .ed-campaign-panel {
          overflow: hidden;
        }

        .ed-panel-head {
          display: grid;
          gap: var(--ed-space-3);
          padding: var(--ed-space-8);
          border-bottom: 1px solid var(--ed-color-border-soft);
        }

        .ed-panel-head h2,
        .ed-panel-head p {
          margin: 0;
        }

        .ed-panel-head h2 {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-md);
          line-height: var(--ed-line-height-base);
        }

        .ed-panel-head p {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .ed-campaign-panel table {
          min-width: 560px;
        }

        .ed-campaign-panel td strong,
        .ed-campaign-panel td small {
          display: block;
        }

        .ed-campaign-panel td small {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 16px;
        }

        .ed-cr-cell {
          display: grid;
          gap: 6px;
          min-width: 84px;
        }

        .ed-cr-cell span {
          display: block;
          height: 7px;
          overflow: hidden;
          border-radius: var(--ed-radius-xs);
          background: var(--ed-color-surface-strong);
        }

        .ed-cr-cell i {
          display: block;
          height: 100%;
          background: var(--ed-color-success);
        }

        .ed-market {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ed-market img {
          border: 1px solid var(--ed-color-border-soft);
        }

        .ed-empty {
          padding: 50px 20px;
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        @media (max-width: 1100px) {
          .ed-campaign-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .ed-campaign-metrics {
            grid-template-columns: 1fr;
          }

          .ed-campaign-metrics article,
          .ed-panel-head {
            padding: 14px;
          }
        }
      `}</style>
    </section>
  );
}
