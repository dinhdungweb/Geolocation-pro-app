import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { AlertCircle, Globe, Loader2, Lock, User } from "lucide-react";
import {
  adminSessionStorage,
  checkRateLimit,
  clearAttempts,
  getAdminSession,
  getClientIP,
  recordFailedAttempt,
  validateCredentials,
} from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await getAdminSession(request);
  if (session.get("admin_logged_in")) {
    return redirect("/admin");
  }

  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ip = getClientIP(request);
  const rateCheck = checkRateLimit(ip);

  if (rateCheck.blocked) {
    return json(
      {
        error: `Too many failed attempts. Try again in ${rateCheck.resetIn} minute(s).`,
      },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const username = formData.get("username")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!(await validateCredentials(username, password))) {
    recordFailedAttempt(ip);
    const newCheck = checkRateLimit(ip);
    const remaining = newCheck.remaining;

    return json(
      {
        error:
          remaining > 0
            ? `Invalid credentials. ${remaining} attempt(s) remaining.`
            : "Too many failed attempts. Try again in 15 minutes.",
      },
      { status: 401 },
    );
  }

  clearAttempts(ip);
  const url = new URL(request.url);
  const requestedRedirect = url.searchParams.get("redirect") || "/admin";
  const redirectTo =
    requestedRedirect.startsWith("/admin") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/admin";

  const session = await adminSessionStorage.getSession(request.headers.get("Cookie"));
  session.set("admin_logged_in", true);
  session.set("admin_username", username);
  session.set("login_time", new Date().toISOString());

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await adminSessionStorage.commitSession(session),
    },
  });
};

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <div className="ed-login-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

        :root {
          --ed-font-primary: "Outfit", sans-serif;
          --ed-color-text-primary: #3d3d47;
          --ed-color-text-tertiary: #767676;
          --ed-color-surface-base: #000000;
          --ed-color-surface-muted: #f4f5f8;
          --ed-color-surface-strong: #ffffff;
          --ed-color-border-muted: #43b9b2;
          --ed-radius-xl: 10px;
          --ed-shadow: rgba(0, 0, 0, 0.1) 0px 36px 35px 0px;

          --ed-text-inverse: var(--ed-color-surface-strong);
          --ed-page: var(--ed-color-surface-muted);
          --ed-panel: var(--ed-color-surface-strong);
          --ed-danger-soft: #fff1f0;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: var(--ed-page);
          color: var(--ed-color-text-tertiary);
          font-family: var(--ed-font-primary);
          font-size: 16px;
          line-height: 24px;
        }

        button,
        input {
          font: inherit;
        }

        .ed-login-screen {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(280px, 0.85fr) minmax(320px, 1.15fr);
          background: var(--ed-page);
        }

        .ed-login-brand {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 40px;
          padding: 40px;
          background: #0a9f98;
          color: var(--ed-text-inverse);
        }

        .ed-login-brand-mark {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-size: 18px;
          font-weight: 700;
        }

        .ed-login-brand-icon {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: var(--ed-radius-xl);
          color: var(--ed-color-border-muted);
        }

        .ed-login-brand-copy {
          max-width: 380px;
        }

        .ed-login-brand-copy h1 {
          margin: 0 0 14px;
          color: var(--ed-text-inverse);
          font-size: clamp(30px, 4vw, 46px);
          font-weight: 700;
          line-height: 1.08;
          letter-spacing: 0;
        }

        .ed-login-brand-copy p {
          margin: 0;
          color: rgba(255, 255, 255, 0.76);
          font-size: 16px;
          line-height: 24px;
        }

        .ed-login-meta {
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
          line-height: 18px;
        }

        .ed-login-panel {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }

        .ed-login-card {
          width: 100%;
          max-width: 430px;
          padding: 32px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-panel);
        }

        .ed-login-card h2 {
          margin: 0 0 6px;
          color: var(--ed-color-text-primary);
          font-size: 24px;
          font-weight: 700;
          line-height: 30px;
        }

        .ed-login-subtitle {
          margin: 0 0 24px;
          color: var(--ed-color-text-tertiary);
          font-size: 14px;
          line-height: 22px;
        }

        .ed-login-field {
          margin-bottom: 16px;
        }

        .ed-login-label {
          display: block;
          margin-bottom: 7px;
          color: var(--ed-color-text-primary);
          font-size: 14px;
          font-weight: 700;
          line-height: 20px;
        }

        .ed-login-input-wrap {
          position: relative;
        }

        .ed-login-input-wrap span {
          position: absolute;
          left: 13px;
          top: 50%;
          display: inline-flex;
          color: var(--ed-color-text-tertiary);
          transform: translateY(-50%);
        }

        .ed-login-input {
          width: 100%;
          min-height: 44px;
          padding: 10px 12px 10px 42px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          outline: none;
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: 16px;
          line-height: 24px;
        }

        .ed-login-input:focus-visible {
          border-color: var(--ed-color-border-muted);
          box-shadow: 0 0 0 3px var(--ed-color-border-muted);
        }

        .ed-login-input:disabled {
          background: #f2f4f1;
          cursor: not-allowed;
        }

        .ed-login-button {
          width: 100%;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
          padding: 10px 16px;
          border: 1px solid var(--ed-color-border-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-border-muted);
          color: var(--ed-text-inverse);
          box-shadow: var(--ed-shadow);
          cursor: pointer;
          font-size: 16px;
          font-weight: 700;
          line-height: 24px;
        }

        .ed-login-button:hover {
          background: #6f9a37;
          border-color: #6f9a37;
        }

        .ed-login-button:focus-visible {
          outline: 3px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-login-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
          box-shadow: none;
        }

        .ed-login-error {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 24px;
          padding: 12px;
          border: 1px solid #ffccc7;
          border-radius: var(--ed-radius-xl);
          background: var(--ed-danger-soft);
          color: #ef4444;
          font-size: 14px;
          font-weight: 700;
          line-height: 20px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 760px) {
          .ed-login-screen {
            grid-template-columns: 1fr;
          }

          .ed-login-brand {
            min-height: auto;
            gap: 24px;
            padding: 24px;
          }

          .ed-login-brand-copy h1 {
            font-size: 28px;
          }

          .ed-login-panel {
            min-height: auto;
            padding: 18px 12px 28px;
          }

          .ed-login-card {
            max-width: 100%;
            padding: 20px;
          }
        }
      `}</style>

      <section className="ed-login-brand" aria-label="GeoAdmin">
        <div className="ed-login-brand-mark">
          <span className="ed-login-brand-icon">
            <Globe size={20} />
          </span>
          GeoAdmin
        </div>
        <div className="ed-login-brand-copy">
          <h1>Operations console</h1>
          <p>Secure access for merchant operations, billing control, and messaging workflows.</p>
        </div>
        <div className="ed-login-meta">&copy; {new Date().getFullYear()} GeoAdmin</div>
      </section>

      <main className="ed-login-panel">
        <section className="ed-login-card" aria-labelledby="admin-login-title">
          <h2 id="admin-login-title">Sign in</h2>
          <p className="ed-login-subtitle">Use your admin credentials to continue.</p>

          {actionData?.error && (
            <div className="ed-login-error" role="alert">
              <AlertCircle size={18} />
              <span>{actionData.error}</span>
            </div>
          )}

          <Form method="post">
            <div className="ed-login-field">
              <label className="ed-login-label" htmlFor="admin-username">
                Username
              </label>
              <div className="ed-login-input-wrap">
                <span>
                  <User size={18} />
                </span>
                <input
                  id="admin-username"
                  className="ed-login-input"
                  type="text"
                  name="username"
                  required
                  autoFocus
                  autoComplete="username"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="ed-login-field">
              <label className="ed-login-label" htmlFor="admin-password">
                Password
              </label>
              <div className="ed-login-input-wrap">
                <span>
                  <Lock size={18} />
                </span>
                <input
                  id="admin-password"
                  className="ed-login-input"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" className="ed-login-button" disabled={isLoading} aria-busy={isLoading}>
              {isLoading ? <Loader2 className="spin" size={20} /> : "Sign in"}
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
