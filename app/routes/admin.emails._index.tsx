import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Eye,
  Mail,
  MoreHorizontal,
  Rocket,
  X,
  Zap,
} from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await prisma.adminEmailLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, subject: true, status: true, html: true, createdAt: true },
  });

  const totalSent = logs.filter((log) => log.status === "sent").length;
  const activityDays = logs.map((log) => {
    const date = new Date(log.createdAt);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  return json({
    stats: {
      email: {
        sent: totalSent.toLocaleString(),
        sentChange: 0,
        open: "0%",
        openChange: 0,
        click: "0%",
        clickChange: 0,
        conv: "0%",
        convChange: 0,
      },
      sales: { total: "0", count: 0 },
    },
    activities: logs.map((log) => ({
      id: log.id,
      subject: log.subject || `Campaign: ${log.type}`,
      channel: "Email",
      status: log.status === "sent" ? "Sent" : "Draft",
      date: new Date(log.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      open: "-",
      click: "-",
      conv: "-",
      sales: "-",
      html: log.html,
    })),
    activityDays,
  });
};

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MessagingDashboard() {
  const { stats, activities, activityDays } = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState("All");
  const [viewingHtml, setViewingHtml] = useState<string | null>(null);

  const filteredActivities = useMemo(() => {
    if (activeTab === "All") return activities;
    return activities.filter((activity) => activity.status === activeTab);
  }, [activities, activeTab]);

  const activitySet = new Set(activityDays);
  const calendarDays = activityDays
    .slice(0, 7)
    .concat(["4/13", "4/14", "4/15", "4/16", "4/17", "4/18", "4/19"])
    .slice(0, 14);

  return (
    <section className="ed-mail">
      <header className="ed-mail-header">
        <div>
          <span className="ed-eyebrow">Messaging</span>
          <h2>Email operations</h2>
          <p>Monitor campaign output, automation activity, and recent email payloads.</p>
        </div>
        <div className="ed-mail-actions">
          <Link className="ed-button-secondary" to="/admin/emails/automations">
            <Zap size={16} />
            Automations
          </Link>
          <Link className="ed-button-primary" to="/admin/emails/composer">
            <Rocket size={16} />
            Create campaign
          </Link>
          <button className="ed-icon-button" type="button" aria-label="More messaging actions">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <div className="ed-mail-metrics">
        <article className="ed-panel ed-mail-performance">
          <div className="ed-panel-head">
            <div>
              <span className="ed-eyebrow">Last 30 days</span>
              <h3>Email performance</h3>
            </div>
            <span className="ed-panel-icon">
              <Mail size={18} />
            </span>
          </div>

          <div className="ed-stat-strip">
            <div>
              <span>Sent</span>
              <strong>{stats.email.sent}</strong>
              <small>
                <ArrowUpRight size={13} /> {stats.email.sentChange}%
              </small>
            </div>
            <div>
              <span>Open rate</span>
              <strong>{stats.email.open}</strong>
              <small>{stats.email.openChange}% change</small>
            </div>
            <div>
              <span>Click rate</span>
              <strong>{stats.email.click}</strong>
              <small>{stats.email.clickChange}% change</small>
            </div>
            <div>
              <span>Conversion</span>
              <strong>{stats.email.conv}</strong>
              <small>{stats.email.convChange}% change</small>
            </div>
          </div>
        </article>

        <article className="ed-panel">
          <div className="ed-panel-head">
            <div>
              <span className="ed-eyebrow">Attributed</span>
              <h3>Revenue</h3>
            </div>
            <span className="ed-panel-icon">
              <Zap size={18} />
            </span>
          </div>
          <div className="ed-single-metric">
            <strong>{stats.sales?.total ?? "0"}</strong>
            <span>From {stats.sales?.count ?? 0} attributed orders</span>
          </div>
        </article>
      </div>

      <section className="ed-panel">
        <div className="ed-panel-head">
          <div>
            <span className="ed-eyebrow">Schedule</span>
            <h3>Activity calendar</h3>
          </div>
          <span className="ed-muted-label">Rolling view</span>
        </div>

        <div className="ed-mail-calendar">
          {calendarDays.map((day, index) => {
            const dayNumber = day.split("/")[1];
            const hasActivity = activitySet.has(day);

            return (
              <div className={`ed-day-cell ${hasActivity ? "has-activity" : ""}`} key={`${day}-${index}`}>
                <div className="ed-day-head">
                  <span>{dayNames[index % 7]}</span>
                  <strong>{dayNumber}</strong>
                </div>
                <small>{hasActivity ? "Email sent" : "No activity"}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ed-panel ed-mail-table">
        <div className="ed-tabs" role="tablist" aria-label="Email activity filter">
          {["All", "Sent", "Draft"].map((tab) => (
            <button
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "is-active" : ""}
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              type="button"
            >
              {tab} history
            </button>
          ))}
          <Link to="/admin/emails/campaigns">Campaigns</Link>
          <Link to="/admin/emails/settings">Settings</Link>
        </div>

        <div className="ed-mail-grid ed-mail-grid-head">
          <span>Subject</span>
          <span>Status</span>
          <span>Open</span>
          <span>Click</span>
          <span>Conversion</span>
          <span>Sales</span>
          <span></span>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="ed-empty-state">
            <Mail size={28} />
            <h3>No email activity</h3>
            <p>Activity will appear here after campaigns or automations send emails.</p>
          </div>
        ) : (
          filteredActivities.map((activity) => (
            <button
              className="ed-mail-grid ed-mail-row"
              disabled={!activity.html}
              key={activity.id}
              onClick={() => activity.html && setViewingHtml(activity.html)}
              type="button"
            >
              <span className="ed-subject-cell">
                <span className="ed-row-icon">
                  <Mail size={16} />
                </span>
                <span>
                  <strong>{activity.subject}</strong>
                  <small>{activity.date}</small>
                </span>
              </span>
              <span>
                <mark className={`ed-status ${activity.status === "Sent" ? "success" : "neutral"}`}>
                  {activity.status}
                </mark>
              </span>
              <span>{activity.open}</span>
              <span>{activity.click}</span>
              <span>{activity.conv}</span>
              <span>{activity.sales}</span>
              <span className="ed-view-icon">
                <Eye size={17} />
              </span>
            </button>
          ))
        )}
      </section>

      {viewingHtml && (
        <div className="ed-modal-overlay" onClick={() => setViewingHtml(null)}>
          <section className="ed-modal" onClick={(event) => event.stopPropagation()}>
            <header className="ed-modal-head">
              <div>
                <h3>Email content preview</h3>
                <p>Sent campaign payload audit</p>
              </div>
              <button className="ed-icon-button" onClick={() => setViewingHtml(null)} type="button">
                <X size={20} />
              </button>
            </header>
            <div className="ed-modal-body">
              <iframe title="Email Content" srcDoc={viewingHtml} />
            </div>
          </section>
        </div>
      )}

      <style>{`
        .ed-mail {
          --ed-mail-card-padding: var(--ed-card-padding);
          --ed-mail-day-padding: 12px;

          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-mail-header,
        .ed-panel-head,
        .ed-mail-actions,
        .ed-tabs {
          display: flex;
          align-items: center;
        }

        .ed-mail-header {
          justify-content: space-between;
          gap: var(--ed-space-2);
          padding: var(--ed-mail-card-padding);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-eyebrow {
          display: block;
          margin-bottom: 6px;
          color: var(--ed-color-border-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .ed-mail-header h2,
        .ed-panel h3,
        .ed-modal-head h3 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-weight: 700;
          letter-spacing: 0;
        }

        .ed-mail-header h2 {
          font-size: 22px;
          line-height: 28px;
        }

        .ed-mail-header p,
        .ed-modal-head p {
          margin: 7px 0 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 1.5;
        }

        .ed-mail-actions {
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ed-button-primary,
        .ed-button-secondary,
        .ed-icon-button {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: var(--ed-radius-xl);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 1;
          text-decoration: none;
          cursor: pointer;
        }

        .ed-button-primary {
          padding: 0 14px;
          border: 1px solid var(--ed-color-border-muted);
          background: var(--ed-color-border-muted);
          color: var(--ed-text-inverse);
          box-shadow: var(--ed-shadow-2);
        }

        .ed-button-secondary,
        .ed-icon-button {
          border: 1px solid var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
        }

        .ed-button-secondary {
          padding: 0 14px;
        }

        .ed-icon-button {
          width: 40px;
          padding: 0;
        }

        .ed-button-primary:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        .ed-button-secondary:hover,
        .ed-icon-button:hover {
          border-color: var(--ed-color-border-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-button-primary:focus-visible,
        .ed-button-secondary:focus-visible,
        .ed-icon-button:focus-visible,
        .ed-tabs button:focus-visible,
        .ed-mail-row:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-mail-metrics {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.7fr);
          gap: var(--ed-space-2);
        }

        .ed-panel {
          min-width: 0;
          padding: var(--ed-mail-card-padding);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-panel-head {
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .ed-panel h3 {
          font-size: 18px;
          line-height: 24px;
        }

        .ed-panel-icon,
        .ed-row-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-xl);
          background: #f2f6ee;
          color: var(--ed-color-border-muted);
        }

        .ed-panel-icon {
          width: 38px;
          height: 38px;
        }

        .ed-stat-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .ed-stat-strip div {
          min-width: 0;
          padding: 14px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-muted);
        }

        .ed-stat-strip span,
        .ed-single-metric span,
        .ed-muted-label,
        .ed-day-cell small {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-stat-strip strong,
        .ed-single-metric strong {
          display: block;
          margin-top: 8px;
          color: var(--ed-color-text-primary);
          font-size: 24px;
          font-weight: 700;
          line-height: 30px;
        }

        .ed-stat-strip small {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 7px;
          color: var(--ed-color-border-muted);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-single-metric strong {
          font-size: 34px;
          line-height: 40px;
        }

        .ed-mail-calendar {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
        }

        .ed-day-cell {
          min-height: 94px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: var(--ed-mail-day-padding);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-muted);
        }

        .ed-day-cell.has-activity {
          border-color: var(--ed-color-border-muted);
          box-shadow: var(--ed-shadow-2);
        }

        .ed-day-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .ed-day-head span {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-day-head strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-md);
          line-height: var(--ed-line-height-base);
        }

        .ed-tabs {
          gap: 6px;
          margin: calc(var(--ed-mail-card-padding) * -1) calc(var(--ed-mail-card-padding) * -1) 0;
          padding: 10px var(--ed-mail-card-padding);
          border-bottom: 1px solid var(--ed-color-surface-muted);
          overflow-x: auto;
        }

        .ed-tabs button,
        .ed-tabs a {
          flex: 0 0 auto;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: var(--ed-radius-xl);
          background: transparent;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }

        .ed-tabs button.is-active,
        .ed-tabs a:hover,
        .ed-tabs button:hover {
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
        }

        .ed-mail-grid {
          display: grid;
          grid-template-columns: minmax(260px, 2fr) 110px 90px 90px 110px 80px 44px;
          gap: 12px;
          align-items: center;
        }

        .ed-mail-grid-head {
          padding: 14px 0 10px;
          color: var(--ed-color-text-tertiary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-mail-row {
          width: 100%;
          padding: 12px 0;
          border: 0;
          border-top: 1px solid var(--ed-color-surface-muted);
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          color: var(--ed-color-text-primary);
          text-align: left;
          cursor: pointer;
        }

        .ed-mail-row:disabled {
          cursor: default;
          opacity: 0.72;
        }

        .ed-subject-cell {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .ed-row-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
        }

        .ed-subject-cell strong,
        .ed-subject-cell small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-subject-cell strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-subject-cell small {
          margin-top: 2px;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 18px;
        }

        .ed-status {
          display: inline-flex;
          padding: 4px 8px;
          border-radius: var(--ed-radius-xl);
          font-size: 11px;
          font-weight: 700;
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

        .ed-view-icon {
          justify-self: end;
          color: var(--ed-color-border-muted);
        }

        .ed-empty-state {
          display: grid;
          justify-items: center;
          gap: 8px;
          padding: 44px 14px;
          border-top: 1px solid var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        .ed-empty-state h3,
        .ed-empty-state p {
          margin: 0;
        }

        .ed-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.62);
        }

        .ed-modal {
          width: min(900px, 96vw);
          height: min(760px, 92vh);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-modal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 16px var(--ed-space-2);
          border-bottom: 1px solid var(--ed-color-surface-muted);
        }

        .ed-modal-body {
          flex: 1;
          padding: var(--ed-space-2);
          overflow: auto;
          background: var(--ed-color-surface-muted);
        }

        .ed-modal-body iframe {
          width: 100%;
          min-height: 100%;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        @media (max-width: 1024px) {
          .ed-mail-header {
            align-items: flex-start;
            display: grid;
          }

          .ed-mail-actions {
            justify-content: flex-start;
          }

          .ed-mail-metrics {
            grid-template-columns: 1fr;
          }

          .ed-stat-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-mail-calendar {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .ed-mail-table {
            overflow-x: auto;
          }

          .ed-mail-grid {
            min-width: 820px;
          }
        }

        @media (max-width: 640px) {
          .ed-mail {
            --ed-mail-card-padding: var(--ed-card-padding-mobile);
            --ed-mail-day-padding: 10px;
          }

          .ed-admin-content .ed-mail .ed-mail-header,
          .ed-admin-content .ed-mail .ed-panel:not(.ed-mail-table) {
            padding: var(--ed-mail-card-padding) !important;
          }

          .ed-mail-header,
          .ed-panel {
            padding: var(--ed-mail-card-padding);
          }

          .ed-mail-actions,
          .ed-button-primary,
          .ed-button-secondary {
            width: 100%;
          }

          .ed-stat-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .ed-mail-calendar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .ed-stat-strip div,
          .ed-day-cell {
            padding: var(--ed-mail-day-padding);
          }

          .ed-day-cell {
            min-height: 76px;
          }

          .ed-panel-head {
            gap: 8px;
            margin-bottom: 10px;
          }

          .ed-mail-table {
            padding: 0 !important;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
          }

          .ed-admin-content .ed-mail-table .ed-tabs,
          .ed-mail-table .ed-tabs {
            margin: 0 !important;
            padding: 8px var(--ed-mail-card-padding) !important;
          }

          .ed-tabs button,
          .ed-tabs a {
            padding: 7px 9px;
            font-size: var(--ed-font-size-xs);
          }

          .ed-mail-grid {
            min-width: 820px;
            gap: 8px;
          }

          .ed-mail-grid-head {
            padding: 10px var(--ed-mail-card-padding) 8px;
          }

          .ed-mail-row {
            padding: 10px var(--ed-mail-card-padding);
          }

          .ed-subject-cell {
            gap: 8px;
          }

          .ed-row-icon {
            width: 30px;
            height: 30px;
          }

          .ed-subject-cell > span:last-child {
            min-width: 0;
          }

          .ed-subject-cell strong {
            display: -webkit-box;
            overflow: hidden;
            white-space: normal;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .ed-status {
            padding: 3px 7px;
            font-size: 10px;
            line-height: 14px;
          }

          .ed-modal-overlay {
            padding: 0;
          }

          .ed-modal {
            width: 100vw;
            height: 100vh;
          }
        }

        @media (max-width: 360px) {
          .ed-stat-strip,
          .ed-mail-calendar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
