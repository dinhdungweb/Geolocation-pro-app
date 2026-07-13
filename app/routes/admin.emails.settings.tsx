import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { Bell, CheckCircle, Mail, Shield } from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { encryptSecret } from "../utils/secret-crypto.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  let settings = null;
  try {
    const dbSettings = await prisma.settings.findUnique({
      where: { shop: "GLOBAL" },
    });
    settings = dbSettings
      ? { ...dbSettings, smtpPass: undefined, hasSmtpPass: Boolean(dbSettings.smtpPass) }
      : null;
  } catch (error) {
    console.error("Prisma error in Settings loader:", error);
  }

  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminAuth(request);
  const formData = await request.formData();
  const name = formData.get("senderName") as string;
  const email = formData.get("senderEmail") as string;
  const smtpHost = formData.get("smtpHost") as string;
  const smtpPort = parseInt(formData.get("smtpPort") as string) || 587;
  const smtpUser = formData.get("smtpUser") as string;
  const smtpPass = ((formData.get("smtpPass") as string) || "").trim();
  const smtpSecure = formData.get("smtpSecure") === "true";

  try {
    const existing = await prisma.settings.findUnique({
      where: { shop: "GLOBAL" },
      select: { smtpPass: true },
    });
    const encryptedSmtpPass = smtpPass ? encryptSecret(smtpPass) : existing?.smtpPass ?? null;

    await prisma.settings.upsert({
      where: { shop: "GLOBAL" },
      update: {
        emailSenderName: name,
        emailSenderEmail: email,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPass: encryptedSmtpPass,
        smtpSecure,
      },
      create: {
        shop: "GLOBAL",
        emailSenderName: name,
        emailSenderEmail: email,
        smtpHost,
        smtpPort,
        smtpUser,
        smtpPass: encryptedSmtpPass,
        smtpSecure,
      },
    });

    return json({ success: true });
  } catch (error: any) {
    console.error("Failed to save email settings:", error);
    return json(
      { success: false, error: error.message || "Failed to save settings" },
      { status: 500 },
    );
  }
};

export default function EmailSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const actionError = actionData && "error" in actionData ? String(actionData.error ?? "") : "";

  return (
    <section className="ed-settings">
      <aside className="ed-settings-nav" aria-label="Email settings sections">
        <button className="is-active" type="button">
          <Mail size={18} />
          General
        </button>
        <button type="button">
          <Shield size={18} />
          Domain verification
        </button>
        <button type="button">
          <Bell size={18} />
          Notifications
        </button>
      </aside>

      <Form method="post" className="ed-settings-card">
        <div className="ed-settings-head">
          <span className="ed-eyebrow">Messaging settings</span>
          <h2>Sender profile</h2>
          <p>Configure the global sender identity and SMTP transport used by admin emails.</p>
        </div>

        {actionData?.success && (
          <div className="ed-alert success" role="status">
            <CheckCircle size={18} /> Settings saved successfully.
          </div>
        )}
        {actionError && (
          <div className="ed-alert danger" role="alert">
            {actionError}
          </div>
        )}

        <div className="ed-form-grid">
          <label className="ed-field">
            <span>Display name</span>
            <input
              name="senderName"
              defaultValue={(settings as any)?.emailSenderName || "Geo Admin"}
              placeholder="Enter sender name"
            />
          </label>
          <label className="ed-field">
            <span>Sender email</span>
            <input
              name="senderEmail"
              defaultValue={(settings as any)?.emailSenderEmail || "noreply@geopro.bluepeaks.top"}
              placeholder="Enter sender email"
            />
          </label>
        </div>

        <div className="ed-section-divider" />

        <div className="ed-settings-head compact">
          <h3>SMTP credentials</h3>
          <p>Use a trusted SMTP server for deliverability and custom-domain sending.</p>
        </div>

        <div className="ed-form-grid smtp">
          <label className="ed-field">
            <span>SMTP host</span>
            <input
              type="text"
              name="smtpHost"
              defaultValue={(settings as any)?.smtpHost || ""}
              placeholder="e.g. smtp.gmail.com"
            />
          </label>
          <label className="ed-field">
            <span>Port</span>
            <input type="number" name="smtpPort" defaultValue={(settings as any)?.smtpPort || 587} />
          </label>
        </div>

        <label className="ed-field">
          <span>SMTP username</span>
          <input type="text" name="smtpUser" defaultValue={(settings as any)?.smtpUser || ""} />
        </label>

        <label className="ed-field">
          <span>SMTP password</span>
          <input
            type="password"
            name="smtpPass"
            defaultValue=""
            placeholder={(settings as any)?.hasSmtpPass ? "Leave blank to keep current password" : ""}
          />
        </label>

        <label className="ed-checkbox-row">
          <input
            type="checkbox"
            name="smtpSecure"
            value="true"
            defaultChecked={(settings as any)?.smtpSecure}
          />
          <span>Use secure connection (SSL/TLS)</span>
        </label>

        <div className="ed-settings-actions">
          <button className="ed-button-primary" type="submit">
            Save changes
          </button>
        </div>
      </Form>

      <style>{`
        .ed-settings {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          gap: var(--ed-space-2);
          align-items: start;
        }

        .ed-settings-nav,
        .ed-settings-card {
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-settings-nav {
          display: grid;
          gap: 6px;
          padding: 10px;
          position: sticky;
          top: 96px;
        }

        .ed-settings-nav button {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          border: 1px solid transparent;
          border-radius: var(--ed-radius-xl);
          background: transparent;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          text-align: left;
          cursor: pointer;
        }

        .ed-settings-nav button:hover,
        .ed-settings-nav button.is-active {
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-settings-nav button:focus-visible,
        .ed-button-primary:focus-visible,
        .ed-field input:focus-visible,
        .ed-checkbox-row input:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-settings-card {
          display: grid;
          gap: 18px;
          padding: var(--ed-space-2);
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

        .ed-settings-head h2,
        .ed-settings-head h3 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-weight: 500;
          letter-spacing: 0;
        }

        .ed-settings-head h2 {
          font-size: var(--ed-font-size-3xl);
          line-height: 28px;
        }

        .ed-settings-head h3 {
          font-size: var(--ed-font-size-xl);
          line-height: 24px;
        }

        .ed-settings-head p {
          max-width: 680px;
          margin: 7px 0 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 1.5;
        }

        .ed-settings-head.compact {
          margin-top: 2px;
        }

        .ed-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border-radius: var(--ed-radius-xl);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
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

        .ed-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .ed-form-grid.smtp {
          grid-template-columns: minmax(0, 1fr) 120px;
        }

        .ed-field {
          display: grid;
          gap: 7px;
        }

        .ed-field span,
        .ed-checkbox-row span {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          line-height: 20px;
        }

        .ed-field input {
          width: 100%;
          min-height: 42px;
          padding: 9px 11px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-md);
          line-height: var(--ed-line-height-base);
        }

        .ed-field input:focus-visible {
          border-color: var(--ed-color-border-muted);
        }

        .ed-section-divider {
          height: 1px;
          background: var(--ed-color-surface-muted);
        }

        .ed-checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-muted);
        }

        .ed-checkbox-row input {
          width: 18px;
          height: 18px;
          accent-color: var(--ed-color-border-muted);
        }

        .ed-settings-actions {
          display: flex;
          justify-content: flex-end;
        }

        .ed-button-primary {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 16px;
          border: 1px solid var(--ed-color-border-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-border-muted);
          color: var(--ed-text-inverse);
          box-shadow: var(--ed-shadow-2);
          cursor: pointer;
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
          line-height: 1;
        }

        .ed-button-primary:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        @media (max-width: 900px) {
          .ed-settings {
            grid-template-columns: 1fr;
          }

          .ed-settings-nav {
            position: static;
          }
        }

        @media (max-width: 640px) {
          .ed-settings-card {
            padding: 14px;
          }

          .ed-form-grid,
          .ed-form-grid.smtp {
            grid-template-columns: 1fr;
          }

          .ed-settings-actions,
          .ed-button-primary {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
