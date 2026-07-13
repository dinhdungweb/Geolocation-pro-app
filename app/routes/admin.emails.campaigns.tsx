import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Plus,
  Search,
} from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    return json({ campaigns });
  } catch (error) {
    console.error("Error loading campaigns:", error);
    return json({ campaigns: [] });
  }
};

export default function CampaignsList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCampaigns = campaigns.filter((campaign: any) => {
    const term = searchTerm.toLowerCase();
    return campaign.name.toLowerCase().includes(term) || campaign.subject.toLowerCase().includes(term);
  });

  const totalSent = campaigns.reduce((sum: number, campaign: any) => sum + campaign.sentCount, 0);

  return (
    <section className="ed-email-campaigns">
      <header className="ed-campaign-head">
        <div>
          <span className="ed-eyebrow">Broadcasts</span>
          <h2>Campaigns</h2>
          <p>Manage one-off broadcast emails and track delivery history.</p>
        </div>
        <Link className="ed-button-primary" to="/admin/emails/composer">
          <Plus size={18} />
          New campaign
        </Link>
      </header>

      <div className="ed-campaign-stats">
        <article>
          <span>Total campaigns</span>
          <strong>{campaigns.length.toLocaleString()}</strong>
        </article>
        <article>
          <span>Total sent</span>
          <strong>{totalSent.toLocaleString()}</strong>
        </article>
        <article>
          <span>Deliverability</span>
          <strong>99.2%</strong>
        </article>
        <article>
          <span>Engagement</span>
          <strong>12.4%</strong>
        </article>
      </div>

      <div className="ed-filter-bar">
        <label className="ed-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search campaigns by name or subject"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <button className="ed-button-secondary" type="button">
          <Filter size={18} />
          Filter
        </button>
      </div>

      <section className="ed-campaign-table">
        <div className="ed-campaign-grid ed-campaign-grid-head">
          <span>Campaign name</span>
          <span>Status</span>
          <span>Recipients</span>
          <span>Created</span>
          <span></span>
        </div>

        {filteredCampaigns.length === 0 ? (
          <div className="ed-empty-state">
            <FileText size={28} />
            <h3>No campaigns found</h3>
            <p>Create a new broadcast or adjust the search query.</p>
          </div>
        ) : (
          filteredCampaigns.map((campaign: any) => (
            <Link
              className="ed-campaign-grid ed-campaign-row"
              key={campaign.id}
              to={`/admin/emails/composer?id=${campaign.id}`}
            >
              <span className="ed-campaign-name">
                <strong>{campaign.name}</strong>
                <small>{campaign.subject}</small>
              </span>
              <span>
                <mark className={`ed-status ${campaign.status}`}>
                  {campaign.status === "sent" ? (
                    <CheckCircle2 size={12} />
                  ) : campaign.status === "draft" ? (
                    <Clock size={12} />
                  ) : (
                    <AlertCircle size={12} />
                  )}
                  {campaign.status.toUpperCase()}
                </mark>
              </span>
              <span>{campaign.sentCount.toLocaleString()} shops</span>
              <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
              <span className="ed-row-action">
                <BarChart3 size={18} />
              </span>
            </Link>
          ))
        )}
      </section>

      <style>{`
        .ed-email-campaigns {
          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-campaign-head,
        .ed-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ed-space-2);
        }

        .ed-campaign-head {
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

        .ed-campaign-head h2 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 500;
          line-height: 28px;
        }

        .ed-campaign-head p {
          margin: 7px 0 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 1.5;
        }

        .ed-button-primary,
        .ed-button-secondary {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          border-radius: var(--ed-radius-xl);
          cursor: pointer;
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          line-height: 1;
          text-decoration: none;
        }

        .ed-button-primary {
          border: 1px solid var(--ed-color-border-muted);
          background: var(--ed-color-border-muted);
          color: var(--ed-text-inverse);
          box-shadow: var(--ed-shadow-2);
        }

        .ed-button-primary:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        .ed-button-secondary {
          border: 1px solid var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
        }

        .ed-button-secondary:hover {
          border-color: var(--ed-color-border-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-button-primary:focus-visible,
        .ed-button-secondary:focus-visible,
        .ed-search-field:focus-within,
        .ed-campaign-row:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-campaign-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .ed-campaign-stats article {
          padding: 16px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-campaign-stats span,
        .ed-campaign-grid-head {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-campaign-stats strong {
          display: block;
          margin-top: 8px;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 500;
          line-height: 28px;
        }

        .ed-filter-bar {
          padding: 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
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
          border-radius: var(--ed-radius-xl);
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

        .ed-campaign-table {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-campaign-grid {
          display: grid;
          grid-template-columns: minmax(280px, 2fr) 130px 120px 140px 42px;
          gap: 12px;
          align-items: center;
        }

        .ed-campaign-grid-head {
          padding: 14px var(--ed-space-2);
          background: var(--ed-color-surface-muted);
        }

        .ed-campaign-row {
          padding: 14px var(--ed-space-2);
          border-top: 1px solid var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          text-decoration: none;
        }

        .ed-campaign-row:hover {
          background: var(--ed-color-surface-strong);
        }

        .ed-campaign-name {
          min-width: 0;
        }

        .ed-campaign-name strong,
        .ed-campaign-name small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-campaign-name strong {
          color: var(--ed-color-text-primary);
          font-weight: 500;
        }

        .ed-campaign-name small {
          margin-top: 2px;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 18px;
        }

        .ed-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: var(--ed-radius-xl);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          line-height: 16px;
        }

        .ed-status.sent {
          background: #eef7e9;
          color: #37630f;
        }

        .ed-status.draft {
          background: #f2f4f1;
          color: var(--ed-color-text-tertiary);
        }

        .ed-status.failed,
        .ed-status.sending {
          background: #fff1f0;
          color: #b42318;
        }

        .ed-row-action {
          justify-self: end;
          color: var(--ed-color-text-tertiary);
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

        @media (max-width: 900px) {
          .ed-campaign-head,
          .ed-filter-bar {
            display: grid;
            align-items: start;
          }

          .ed-campaign-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-campaign-table {
            overflow-x: auto;
          }

          .ed-campaign-grid {
            min-width: 760px;
          }
        }

        @media (max-width: 560px) {
          .ed-campaign-head,
          .ed-filter-bar {
            padding: 14px;
          }

          .ed-campaign-stats {
            grid-template-columns: 1fr;
          }

          .ed-button-primary,
          .ed-button-secondary {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
