import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { MoreHorizontal, Zap } from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { ensureDefaultEmailAssets } from "../utils/email-seeder.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  try {
    await ensureDefaultEmailAssets();

    const automations = await prisma.automation.findMany({
      where: { shop: "GLOBAL" },
      orderBy: { createdAt: "asc" },
    });

    const logs = await prisma.adminEmailLog.groupBy({
      by: ["type"],
      _count: { _all: true },
    });

    const sentMap = logs.reduce<Record<string, number>>((acc, curr) => {
      acc[curr.type] = curr._count._all;
      return acc;
    }, {});

    const totalSentCount = logs.reduce((sum, curr) => sum + curr._count._all, 0);

    return json({
      automations: automations.map((automation) => ({
        id: automation.id,
        name:
          automation.name ||
          automation.subject ||
          (automation.type === "welcome"
            ? "Welcome new subscribers"
            : automation.type === "limit80" || automation.type === "limit_80"
              ? "80% usage limit notification"
              : automation.type === "limit100" || automation.type === "limit_100"
                ? "100% usage limit notification"
                : automation.type === "limit_unlimited"
                  ? "Unlimited usage granted"
                  : automation.type === "limit_free_reminder"
                    ? "Free plan limit reminder (1 day after)"
                    : automation.type === "review_3_days"
                      ? "Request app review (3 days after install)"
                      : "Custom automation"),
        type: automation.type,
        status: automation.isActive ? "Active" : "Inactive",
        sent: sentMap[automation.type] || 0,
      })),
      totalSentCount,
    });
  } catch (error) {
    console.error("Prisma error in Automations List loader:", error);
    return json({ automations: [], totalSentCount: 0 });
  }
};

function getTriggerLabel(type: string) {
  if (type === "welcome") return "App installation";
  if (type === "limit80" || type === "limit_80") return "80% usage";
  if (type === "limit100" || type === "limit_100") return "100% usage";
  if (type === "limit_unlimited") return "Unlimited reward";
  if (type === "limit_free_reminder") return "Free plan reminder";
  if (type === "review_3_days") return "3 days after install";
  if (type === "manual") return "Manual";
  return type;
}

export default function AutomationsList() {
  const { automations, totalSentCount } = useLoaderData<typeof loader>();
  const activeCount = automations.filter((automation) => automation.status === "Active").length;
  const inactiveCount = automations.length - activeCount;

  return (
    <section className="ed-automations">
      <header className="ed-automation-header">
        <div>
          <span className="ed-eyebrow">Messaging flows</span>
          <h2>Automations</h2>
          <p>Build and monitor automated email flows triggered by install and usage events.</p>
        </div>
        <Link className="ed-button-primary" to="/admin/emails/automations/new">
          <Zap size={16} />
          Create automation
        </Link>
      </header>

      <div className="ed-automation-summary">
        <div>
          <strong>{totalSentCount.toLocaleString()}</strong>
          <span>Automated emails sent</span>
        </div>
        <Link to="/admin/emails/settings">Review settings</Link>
      </div>

      <div className="ed-automation-metrics">
        <article>
          <span>Total flows</span>
          <strong>{automations.length.toLocaleString()}</strong>
        </article>
        <article>
          <span>Active</span>
          <strong>{activeCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>Inactive</span>
          <strong>{inactiveCount.toLocaleString()}</strong>
        </article>
        <article>
          <span>Open rate</span>
          <strong>0.0%</strong>
        </article>
        <article>
          <span>Click rate</span>
          <strong>0.0%</strong>
        </article>
        <article>
          <span>Orders</span>
          <strong>0</strong>
        </article>
      </div>

      <section className="ed-automation-table">
        <div className="ed-tabs" role="tablist" aria-label="Automation filter">
          <button aria-selected="true" className="is-active" role="tab" type="button">
            All automations
          </button>
          <button aria-selected="false" role="tab" type="button">
            Active
          </button>
          <button aria-selected="false" role="tab" type="button">
            Inactive
          </button>
        </div>

        <div className="ed-automation-grid ed-automation-grid-head">
          <span>Automation name</span>
          <span>Trigger</span>
          <span>Status</span>
          <span>Sent</span>
          <span>Open</span>
          <span>Click</span>
          <span></span>
        </div>

        {automations.length === 0 ? (
          <div className="ed-empty-state">
            <Zap size={28} />
            <h3>No automation flows yet</h3>
            <p>Create the first flow to send onboarding and usage-limit emails automatically.</p>
            <Link className="ed-button-primary" to="/admin/emails/automations/new">
              Set up first flow
            </Link>
          </div>
        ) : (
          automations.map((automation) => (
            <Link
              className="ed-automation-grid ed-automation-row"
              key={automation.id}
              to={`/admin/emails/automations/${automation.id}`}
            >
              <span className="ed-auto-name">{automation.name}</span>
              <span className="ed-trigger">
                <Zap size={14} />
                {getTriggerLabel(automation.type)}
              </span>
              <span>
                <mark className={`ed-status ${automation.status === "Active" ? "success" : "neutral"}`}>
                  {automation.status}
                </mark>
              </span>
              <span>{automation.sent === 0 ? "-" : automation.sent.toLocaleString()}</span>
              <span>-</span>
              <span>-</span>
              <span className="ed-row-action">
                <MoreHorizontal size={18} />
              </span>
            </Link>
          ))
        )}
      </section>

      <style>{`
        .ed-automations {
          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-automation-header,
        .ed-automation-summary,
        .ed-automation-metrics,
        .ed-tabs {
          display: flex;
          align-items: center;
        }

        .ed-automation-header {
          justify-content: space-between;
          gap: var(--ed-space-2);
          padding: var(--ed-space-2);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-eyebrow {
          display: block;
          margin-bottom: 6px;
          color: var(--ed-color-border-muted);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          letter-spacing: 0.08em;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .ed-automation-header h2 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 500;
          line-height: 28px;
        }

        .ed-automation-header p {
          max-width: 660px;
          margin: 7px 0 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 1.5;
        }

        .ed-button-primary {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          border: 1px solid var(--ed-color-border-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-border-muted);
          color: var(--ed-text-inverse);
          box-shadow: var(--ed-shadow-2);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          line-height: 1;
          text-decoration: none;
        }

        .ed-button-primary:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        .ed-button-primary:focus-visible,
        .ed-tabs button:focus-visible,
        .ed-automation-row:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-automation-summary {
          justify-content: space-between;
          gap: var(--ed-space-2);
          padding: 16px var(--ed-space-2);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: #f2f6ee;
        }

        .ed-automation-summary strong,
        .ed-automation-summary span {
          display: block;
        }

        .ed-automation-summary strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          line-height: 28px;
        }

        .ed-automation-summary span,
        .ed-automation-summary a {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          line-height: 20px;
        }

        .ed-automation-summary a:hover {
          color: var(--ed-color-border-muted);
        }

        .ed-automation-metrics {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 10px;
        }

        .ed-automation-metrics article {
          min-width: 0;
          padding: 16px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-automation-metrics span,
        .ed-automation-grid-head {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-automation-metrics strong {
          display: block;
          margin-top: 8px;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 500;
          line-height: 28px;
        }

        .ed-automation-table {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-tabs {
          gap: 6px;
          padding: 10px var(--ed-space-2);
          border-bottom: 1px solid var(--ed-color-surface-muted);
          overflow-x: auto;
        }

        .ed-tabs button {
          flex: 0 0 auto;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: var(--ed-radius-xl);
          background: transparent;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          cursor: pointer;
        }

        .ed-tabs button.is-active,
        .ed-tabs button:hover {
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
        }

        .ed-automation-grid {
          display: grid;
          grid-template-columns: minmax(260px, 2fr) 150px 110px 80px 80px 80px 42px;
          gap: 12px;
          align-items: center;
        }

        .ed-automation-grid-head {
          padding: 14px var(--ed-space-2);
          background: var(--ed-color-surface-muted);
        }

        .ed-automation-row {
          padding: 14px var(--ed-space-2);
          border-top: 1px solid var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          text-decoration: none;
        }

        .ed-automation-row:hover {
          background: var(--ed-color-surface-strong);
        }

        .ed-auto-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 500;
        }

        .ed-trigger {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--ed-color-border-muted);
          font-weight: 500;
        }

        .ed-status {
          display: inline-flex;
          padding: 4px 8px;
          border-radius: var(--ed-radius-xl);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          line-height: 16px;
          text-transform: uppercase;
        }

        .ed-status.success {
          background: #eef7e9;
          color: #37630f;
        }

        .ed-status.neutral {
          background: #f2f4f1;
          color: var(--ed-color-text-tertiary);
        }

        .ed-row-action {
          justify-self: end;
          color: var(--ed-color-text-tertiary);
        }

        .ed-empty-state {
          display: grid;
          justify-items: center;
          gap: 10px;
          padding: 54px 16px;
          border-top: 1px solid var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        .ed-empty-state h3,
        .ed-empty-state p {
          margin: 0;
        }

        @media (max-width: 1120px) {
          .ed-automation-metrics {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .ed-automation-table {
            overflow-x: auto;
          }

          .ed-automation-grid {
            min-width: 840px;
          }
        }

        @media (max-width: 720px) {
          .ed-automation-header,
          .ed-automation-summary {
            display: grid;
            align-items: start;
          }

          .ed-button-primary {
            width: 100%;
          }

          .ed-automation-metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
