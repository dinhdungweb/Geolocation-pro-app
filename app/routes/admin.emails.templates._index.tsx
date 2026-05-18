import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Mail, MoreHorizontal, Palette, Plus } from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  let templates: Awaited<ReturnType<typeof prisma.emailTemplate.findMany>> = [];

  try {
    templates = await prisma.emailTemplate.findMany({
      where: { shop: "GLOBAL" },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    console.error("Prisma error in Templates loader:", error);
  }

  return json({ templates });
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function TemplatesGallery() {
  const { templates } = useLoaderData<typeof loader>();

  return (
    <section className="templates-page">
      <header className="templates-hero">
        <div className="templates-title">
          <span>Messaging assets</span>
          <h2>Email templates</h2>
          <p>
            Keep global campaign templates organized, easy to scan, and ready for
            new email workflows.
          </p>
        </div>

        <div className="templates-actions">
          <button className="templates-secondary-button" type="button">
            <Palette size={16} />
            Manage colors
          </button>
          <Link className="templates-primary-button" to="/admin/emails/templates/new">
            <Plus size={16} />
            Create template
          </Link>
        </div>
      </header>

      {templates.length === 0 ? (
        <div className="templates-empty">
          <div className="templates-empty-icon">
            <Mail size={24} />
          </div>
          <h3>No templates yet</h3>
          <p>Create the first reusable template for product updates, billing notices, or campaigns.</p>
          <Link className="templates-primary-button" to="/admin/emails/templates/new">
            <Plus size={16} />
            Create first template
          </Link>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((template) => (
            <Link
              className="template-item"
              key={template.id}
              to={`/admin/emails/templates/${template.id}`}
            >
              <div className="template-thumbnail">
                {template.thumb ? (
                  <img alt={template.name} src={template.thumb} />
                ) : (
                  <Mail size={30} />
                )}
              </div>

              <div className="template-body">
                <div className="template-meta">
                  <span>Global template</span>
                  <MoreHorizontal size={17} />
                </div>
                <h3>{template.name}</h3>
                <p>Updated {dateFormatter.format(new Date(template.updatedAt))}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .templates-page {
          display: grid;
          gap: 18px;
        }

        .templates-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px;
          border: 1px solid var(--admin-border, #dbe3ef);
          border-radius: 8px;
          background: #ffffff;
          box-shadow: var(--admin-shadow, 0 1px 2px rgba(16, 24, 40, 0.05));
        }

        .templates-title {
          min-width: 0;
        }

        .templates-title span {
          display: block;
          margin-bottom: 6px;
          color: var(--admin-primary, #2563eb);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .templates-title h2 {
          margin: 0;
          color: var(--admin-text, #101828);
          font-size: 22px;
          font-weight: 800;
          line-height: 1.2;
        }

        .templates-title p {
          max-width: 640px;
          margin: 7px 0 0;
          color: var(--admin-muted, #667085);
          font-size: 13px;
          line-height: 1.5;
        }

        .templates-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex: 0 0 auto;
          gap: 10px;
        }

        .templates-primary-button,
        .templates-secondary-button {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 750;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
        }

        .templates-primary-button {
          border: 1px solid #1d4ed8;
          background: var(--admin-primary, #2563eb);
          color: #ffffff;
        }

        .templates-primary-button:hover {
          background: #1d4ed8;
        }

        .templates-secondary-button {
          border: 1px solid var(--admin-border, #dbe3ef);
          background: #ffffff;
          color: #344054;
        }

        .templates-secondary-button:hover {
          border-color: #93c5fd;
          color: #1d4ed8;
        }

        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
        }

        .template-item {
          display: block;
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--admin-border, #dbe3ef);
          border-radius: 8px;
          background: #ffffff;
          color: inherit;
          text-decoration: none;
          box-shadow: var(--admin-shadow, 0 1px 2px rgba(16, 24, 40, 0.05));
        }

        .template-item:hover {
          border-color: #b9c5d6;
        }

        .template-thumbnail {
          height: 174px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid var(--admin-border-soft, #edf2f7);
          background:
            linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px),
            linear-gradient(180deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px),
            #f8fafc;
          background-size: 18px 18px;
          color: #98a2b3;
        }

        .template-thumbnail img {
          width: 72%;
          height: 76%;
          object-fit: cover;
          border: 1px solid rgba(16, 24, 40, 0.08);
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 8px 18px rgba(16, 24, 40, 0.08);
        }

        .template-body {
          display: grid;
          gap: 7px;
          padding: 14px;
        }

        .template-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: var(--admin-faint, #98a2b3);
        }

        .template-meta span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .template-body h3 {
          margin: 0;
          overflow: hidden;
          color: var(--admin-text, #101828);
          font-size: 14px;
          font-weight: 800;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .template-body p {
          margin: 0;
          color: var(--admin-muted, #667085);
          font-size: 12px;
          font-weight: 600;
          line-height: 1.4;
        }

        .templates-empty {
          min-height: 320px;
          display: grid;
          justify-items: center;
          align-content: center;
          gap: 12px;
          padding: 32px 18px;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
          text-align: center;
        }

        .templates-empty-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--admin-border, #dbe3ef);
          border-radius: 8px;
          background: #f8fafc;
          color: var(--admin-primary, #2563eb);
        }

        .templates-empty h3 {
          margin: 0;
          color: var(--admin-text, #101828);
          font-size: 17px;
          font-weight: 800;
        }

        .templates-empty p {
          max-width: 420px;
          margin: 0;
          color: var(--admin-muted, #667085);
          font-size: 13px;
          line-height: 1.5;
        }

        @media (max-width: 768px) {
          .templates-page {
            gap: 12px;
          }

          .templates-hero {
            display: grid;
            padding: 14px;
          }

          .templates-title h2 {
            font-size: 19px;
          }

          .templates-title p {
            font-size: 12px;
          }

          .templates-actions {
            display: grid;
            grid-template-columns: 1fr;
            width: 100%;
          }

          .templates-primary-button,
          .templates-secondary-button {
            width: 100%;
            min-height: 38px;
            padding: 0 12px;
            font-size: 12px;
          }

          .templates-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .template-item {
            display: grid;
            grid-template-columns: 108px minmax(0, 1fr);
            min-height: 108px;
          }

          .template-thumbnail {
            height: auto;
            min-height: 108px;
            border-right: 1px solid var(--admin-border-soft, #edf2f7);
            border-bottom: 0;
            background-size: 14px 14px;
          }

          .template-thumbnail img {
            width: 76%;
            height: 72%;
          }

          .template-body {
            align-content: center;
            padding: 12px;
          }

          .template-body h3 {
            white-space: normal;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }

          .templates-empty {
            min-height: 260px;
            padding: 24px 14px;
          }
        }

        @media (max-width: 420px) {
          .template-item {
            grid-template-columns: 94px minmax(0, 1fr);
            min-height: 100px;
          }

          .template-thumbnail {
            min-height: 100px;
          }

          .template-meta span {
            font-size: 10px;
          }
        }
      `}</style>
    </section>
  );
}
