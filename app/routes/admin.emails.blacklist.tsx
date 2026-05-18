import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useMemo, useState } from "react";
import { CheckCircle, Info, Plus, ShieldAlert, Store, Trash2, XCircle } from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const blacklist = await prisma.emailBlacklist.findMany({
    orderBy: { createdAt: "desc" },
  });

  const knownShops = await prisma.settings.findMany({
    where: {
      NOT: { shop: "GLOBAL" },
    },
    select: { shop: true },
  });

  return json({ blacklist, knownShops });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminAuth(request);
  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "add") {
    const shop = formData.get("shop") as string;
    if (!shop) return json({ error: "Shop domain is required" }, { status: 400 });

    try {
      await prisma.emailBlacklist.create({
        data: { shop: shop.trim() },
      });
      return json({ success: true, message: "Shop added to blacklist" });
    } catch {
      return json({ error: "Shop is already in the blacklist or an error occurred" }, { status: 400 });
    }
  }

  if (action === "delete") {
    const id = formData.get("id") as string;
    await prisma.emailBlacklist.delete({
      where: { id },
    });
    return json({ success: true, message: "Shop removed from blacklist" });
  }

  return json({});
};

export default function EmailBlacklist() {
  const { blacklist, knownShops } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ success?: boolean; error?: string; message?: string }>();
  const navigation = useNavigation();
  const [searchTerm] = useState("");
  const [selectedShop, setSelectedShop] = useState("");
  const [manualShop, setManualShop] = useState("");

  const isSubmitting = navigation.state === "submitting";

  const availableShops = useMemo(() => {
    const blacklistedDomains = new Set(blacklist.map((item: any) => item.shop));
    return knownShops
      .filter((shop: any) => !blacklistedDomains.has(shop.shop))
      .filter((shop: any) => shop.shop.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [knownShops, blacklist, searchTerm]);

  return (
    <section className="ed-blacklist">
      <section className="ed-blacklist-table">
        <header className="ed-card-head">
          <div>
            <span className="ed-eyebrow">Email controls</span>
            <h2>Blacklisted stores</h2>
          </div>
          <span className="ed-count">{blacklist.length.toLocaleString()} blocked</span>
        </header>

        {blacklist.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Store domain</th>
                <th>Added date</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {blacklist.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <span className="ed-shop-cell">
                      <span className="ed-shop-icon">
                        <Store size={14} />
                      </span>
                      {item.shop}
                    </span>
                  </td>
                  <td>
                    {new Date(item.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <Form method="post">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="_action" value="delete" />
                      <button className="ed-delete-button" type="submit" aria-label={`Remove ${item.shop}`}>
                        <Trash2 size={17} />
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ed-empty-state">
            <ShieldAlert size={28} />
            <h3>No shops blacklisted</h3>
            <p>All eligible shops can receive automated emails.</p>
          </div>
        )}
      </section>

      <aside className="ed-blacklist-form">
        <header className="ed-card-head">
          <div>
            <span className="ed-eyebrow">Exception</span>
            <h2>Add store</h2>
          </div>
        </header>

        <div className="ed-note">
          <Info size={18} />
          <p>Blacklisted shops will not receive Welcome, 80%, or 100% usage emails.</p>
        </div>

        <Form method="post" className="ed-form">
          <input type="hidden" name="_action" value="add" />

          <label className="ed-field">
            <span>Select from known shops</span>
            <select
              name="shop"
              value={selectedShop}
              onChange={(event) => {
                setSelectedShop(event.target.value);
                if (event.target.value) setManualShop("");
              }}
            >
              <option value="">Choose a store</option>
              {availableShops.map((shop: any) => (
                <option key={shop.shop} value={shop.shop}>
                  {shop.shop}
                </option>
              ))}
            </select>
          </label>

          <div className="ed-divider">
            <span>or</span>
          </div>

          <label className="ed-field">
            <span>Enter domain manually</span>
            <input
              type="text"
              name="shop"
              placeholder="store.myshopify.com"
              value={manualShop}
              onChange={(event) => {
                setManualShop(event.target.value);
                if (event.target.value) setSelectedShop("");
              }}
            />
          </label>

          <button
            className="ed-button-primary"
            type="submit"
            disabled={isSubmitting || (!selectedShop && !manualShop)}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Adding..." : <><Plus size={18} /> Add to blacklist</>}
          </button>

          {actionData?.error && (
            <div className="ed-alert danger" role="alert">
              <XCircle size={16} /> {actionData.error}
            </div>
          )}
          {actionData?.success && (
            <div className="ed-alert success" role="status">
              <CheckCircle size={16} /> {actionData.message}
            </div>
          )}
        </Form>
      </aside>

      <style>{`
        .ed-blacklist {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--ed-space-2);
          align-items: start;
        }

        .ed-blacklist-table,
        .ed-blacklist-form {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-blacklist-form {
          position: sticky;
          top: 96px;
          display: grid;
          gap: 16px;
          padding: var(--ed-space-2);
        }

        .ed-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: var(--ed-space-2);
          border-bottom: 1px solid var(--ed-color-surface-muted);
        }

        .ed-blacklist-form .ed-card-head {
          padding: 0 0 14px;
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

        .ed-card-head h2 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: 20px;
          font-weight: 700;
          line-height: 26px;
        }

        .ed-count {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          white-space: nowrap;
        }

        .ed-blacklist-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .ed-blacklist-table th,
        .ed-blacklist-table td {
          padding: 14px var(--ed-space-2);
          border-bottom: 1px solid var(--ed-color-surface-muted);
          text-align: left;
        }

        .ed-blacklist-table th {
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-blacklist-table td {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-shop-cell {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          font-weight: 700;
        }

        .ed-shop-icon {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-delete-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-tertiary);
          cursor: pointer;
        }

        .ed-delete-button:hover {
          border-color: #ffccc7;
          background: #fff1f0;
          color: #b42318;
        }

        .ed-note {
          display: flex;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
        }

        .ed-note p {
          margin: 0;
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-form,
        .ed-field {
          display: grid;
          gap: 10px;
        }

        .ed-field span {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 20px;
        }

        .ed-field input,
        .ed-field select {
          min-height: 40px;
          padding: 8px 10px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--ed-color-text-tertiary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ed-divider::before,
        .ed-divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: var(--ed-color-surface-muted);
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
          cursor: pointer;
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 1;
        }

        .ed-button-primary:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        .ed-button-primary:disabled {
          cursor: not-allowed;
          opacity: 0.62;
          box-shadow: none;
        }

        .ed-field input:focus-visible,
        .ed-field select:focus-visible,
        .ed-delete-button:focus-visible,
        .ed-button-primary:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border-radius: var(--ed-radius-xl);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 20px;
        }

        .ed-alert.success {
          border: 1px solid #b7df9e;
          background: #eef7e9;
          color: #37630f;
        }

        .ed-alert.danger {
          border: 1px solid #ffccc7;
          background: #fff1f0;
          color: #b42318;
        }

        .ed-empty-state {
          display: grid;
          justify-items: center;
          gap: 8px;
          padding: 54px 16px;
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        .ed-empty-state h3,
        .ed-empty-state p {
          margin: 0;
        }

        @media (max-width: 980px) {
          .ed-blacklist {
            grid-template-columns: 1fr;
          }

          .ed-blacklist-form {
            position: static;
          }
        }

        @media (max-width: 640px) {
          .ed-card-head,
          .ed-blacklist-form {
            padding: 14px;
          }

          .ed-blacklist-table {
            overflow-x: auto;
          }

          .ed-blacklist-table table {
            min-width: 620px;
          }

          .ed-button-primary {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
