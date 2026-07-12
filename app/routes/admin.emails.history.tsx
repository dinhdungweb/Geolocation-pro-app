import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Eye,
  Filter,
  Mail,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  try {
    const logs = await prisma.adminEmailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return json({ logs });
  } catch (error) {
    console.error("Error loading email logs:", error);
    return json({ logs: [] });
  }
};

export default function EmailHistory() {
  const { logs } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewingHtml, setViewingHtml] = useState<string | null>(null);

  const filteredLogs = logs.filter((log: any) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      log.shop.toLowerCase().includes(term) || (log.subject && log.subject.toLowerCase().includes(term));
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="ed-history">
      <header className="ed-history-head">
        <div>
          <span className="ed-eyebrow">Audit trail</span>
          <h2>Transmission logs</h2>
          <p>Review the latest email communications sent by campaigns and automations.</p>
        </div>
        <div className="ed-range-label">
          <Calendar size={17} />
          Last 100 records
        </div>
      </header>

      <div className="ed-filter-bar">
        <label className="ed-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search by shop URL or subject"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="simulated">Simulated</option>
        </select>
        <button className="ed-icon-button" type="button" aria-label="More filters">
          <Filter size={18} />
        </button>
      </div>

      <section className="ed-history-table">
        <div className="ed-history-grid ed-history-grid-head">
          <span>
            Recipient shop <ArrowUpDown size={12} />
          </span>
          <span>Subject</span>
          <span>Status</span>
          <span>Executed on</span>
          <span></span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="ed-empty-state">
            <Mail size={28} />
            <h3>No logs found</h3>
            <p>Try changing the search query or status filter.</p>
          </div>
        ) : (
          filteredLogs.map((log: any) => (
            <div className="ed-history-grid ed-history-row" key={log.id}>
              <span className="ed-shop-cell">
                <span className="ed-avatar">{log.shop.slice(0, 2).toUpperCase()}</span>
                <strong>{log.shop}</strong>
              </span>
              <span className="ed-subject">{log.subject || "-"}</span>
              <span>
                <mark className={`ed-status ${log.status}`}>
                  {log.status === "sent" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {log.status.toUpperCase()}
                </mark>
              </span>
              <span className="ed-date">
                {new Date(log.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="ed-row-action">
                <button
                  className="ed-icon-button"
                  onClick={() =>
                    setViewingHtml(
                      log.html ||
                        "<p style='text-align:center; padding: 40px; color: #545454;'>No content available for this legacy log.</p>",
                    )
                  }
                  type="button"
                  aria-label={`Preview ${log.subject || log.shop}`}
                >
                  <Eye size={17} />
                </button>
              </span>
            </div>
          ))
        )}
      </section>

      {viewingHtml && (
        <div className="ed-modal-overlay" onClick={() => setViewingHtml(null)}>
          <section className="ed-modal" onClick={(event) => event.stopPropagation()}>
            <header className="ed-modal-head">
              <div>
                <h3>Email content preview</h3>
                <p>Sent payload audit</p>
              </div>
              <button className="ed-icon-button" onClick={() => setViewingHtml(null)} type="button">
                <X size={20} />
              </button>
            </header>
            <div className="ed-modal-body">
              <div className="ed-html-preview" dangerouslySetInnerHTML={{ __html: viewingHtml }} />
            </div>
            <footer className="ed-modal-foot">
              <button className="ed-button-secondary" onClick={() => setViewingHtml(null)} type="button">
                Close audit
              </button>
            </footer>
          </section>
        </div>
      )}

      <style>{`
        .ed-history {
          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-history-head,
        .ed-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ed-space-2);
        }

        .ed-history-head {
          padding: var(--ed-space-2);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
        }

        .ed-eyebrow {
          display: block;
          margin-bottom: 6px;
          color: var(--ed-color-primary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .ed-history-head h2,
        .ed-modal-head h3 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: 22px;
          font-weight: 700;
          line-height: 28px;
        }

        .ed-history-head p,
        .ed-modal-head p {
          margin: 7px 0 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 1.5;
        }

        .ed-range-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          white-space: nowrap;
        }

        .ed-filter-bar {
          padding: 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
        }

        .ed-search-field {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
        }

        .ed-search-field input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-filter-bar select {
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
        }

        .ed-icon-button,
        .ed-button-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          cursor: pointer;
        }

        .ed-icon-button {
          width: 40px;
          min-height: 40px;
        }

        .ed-button-secondary {
          min-height: 40px;
          padding: 0 14px;
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
        }

        .ed-icon-button:hover,
        .ed-button-secondary:hover {
          border-color: var(--ed-color-primary);
          color: var(--ed-color-primary);
        }

        .ed-search-field:focus-within,
        .ed-filter-bar select:focus-visible,
        .ed-icon-button:focus-visible,
        .ed-button-secondary:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-history-table {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
        }

        .ed-history-grid {
          display: grid;
          grid-template-columns: minmax(220px, 1.5fr) minmax(220px, 1.4fr) 130px 150px 52px;
          gap: 12px;
          align-items: center;
        }

        .ed-history-grid-head {
          padding: 14px var(--ed-space-2);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-history-grid-head span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .ed-history-row {
          padding: 14px var(--ed-space-2);
          border-top: 1px solid var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-history-row:hover {
          background: var(--ed-color-surface-strong);
        }

        .ed-shop-cell {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ed-avatar {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-primary);
          font-size: 10px;
          font-weight: 700;
        }

        .ed-shop-cell strong,
        .ed-subject {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: var(--ed-radius-md);
          font-size: 11px;
          font-weight: 700;
          line-height: 16px;
        }

        .ed-status.sent {
          background: var(--ed-color-success-soft);
          color: var(--ed-color-success);
        }

        .ed-status.failed {
          background: var(--ed-color-danger-soft);
          color: var(--ed-color-danger);
        }

        .ed-status.simulated {
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-tertiary);
        }

        .ed-date {
          color: var(--ed-color-text-tertiary);
          font-weight: 500;
        }

        .ed-row-action {
          justify-self: end;
        }

        .ed-empty-state {
          display: grid;
          justify-items: center;
          gap: 8px;
          padding: 54px 16px;
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
          width: min(860px, 96vw);
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
        }

        .ed-modal-head,
        .ed-modal-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 16px var(--ed-space-2);
          border-bottom: 1px solid var(--ed-color-surface-muted);
        }

        .ed-modal-foot {
          justify-content: flex-end;
          border-top: 1px solid var(--ed-color-surface-muted);
          border-bottom: 0;
        }

        .ed-modal-body {
          flex: 1;
          padding: var(--ed-space-2);
          overflow: auto;
          background: var(--ed-color-surface-muted);
        }

        .ed-html-preview {
          overflow: auto;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
        }

        @media (max-width: 900px) {
          .ed-history-head,
          .ed-filter-bar {
            display: grid;
            align-items: start;
          }

          .ed-history-table {
            overflow-x: auto;
          }

          .ed-history-grid {
            min-width: 820px;
          }

          .ed-filter-bar select,
          .ed-search-field,
          .ed-icon-button {
            width: 100%;
          }
        }

        @media (max-width: 640px) {
          .ed-history-head,
          .ed-filter-bar {
            padding: 14px;
          }

          .ed-modal-overlay {
            padding: 0;
          }

          .ed-modal {
            width: 100vw;
            max-height: 100vh;
            min-height: 100vh;
          }
        }
      `}</style>
    </section>
  );
}
