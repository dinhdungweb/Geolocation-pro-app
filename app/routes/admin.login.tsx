import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
    adminSessionStorage,
    checkRateLimit,
    clearAttempts,
    getClientIP,
    recordFailedAttempt,
    validateCredentials,
} from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const session = await adminSessionStorage.getSession(request.headers.get("Cookie"));
    if (session.get("admin_logged_in")) {
        return redirect("/admin");
    }
    return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const ip = getClientIP(request);
    const rateCheck = checkRateLimit(ip);

    if (rateCheck.blocked) {
        return json({
            error: `Too many failed attempts. Try again in ${rateCheck.resetIn} minute(s).`,
        }, { status: 429 });
    }

    const formData = await request.formData();
    const username = formData.get("username")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    if (!validateCredentials(username, password)) {
        recordFailedAttempt(ip);
        const newCheck = checkRateLimit(ip);
        const remaining = newCheck.remaining;
        return json({
            error: remaining > 0
                ? `Invalid credentials. ${remaining} attempt(s) remaining.`
                : `Too many failed attempts. Try again in 15 minutes.`,
        }, { status: 401 });
    }

    clearAttempts(ip);
    const url = new URL(request.url);
    const redirectTo = url.searchParams.get("redirect") || "/admin";

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
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Admin Login — Geo App</title>
                <style>{`
                    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                        background: #0a0a0f;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .card {
                        background: #13131a;
                        border: 1px solid #1e1e2e;
                        border-radius: 16px;
                        padding: 40px;
                        width: 100%;
                        max-width: 400px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    }
                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 32px;
                    }
                    .logo-icon {
                        width: 44px; height: 44px;
                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                        border-radius: 10px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 22px;
                    }
                    .logo h1 { font-size: 18px; color: #e2e8f0; font-weight: 600; }
                    .logo p { font-size: 12px; color: #64748b; margin-top: 2px; }
                    label {
                        display: block;
                        font-size: 13px;
                        font-weight: 500;
                        color: #94a3b8;
                        margin-bottom: 6px;
                    }
                    input {
                        width: 100%;
                        padding: 10px 14px;
                        background: #0a0a0f;
                        border: 1px solid #1e1e2e;
                        border-radius: 8px;
                        color: #e2e8f0;
                        font-size: 14px;
                        outline: none;
                        transition: border-color 0.2s;
                        margin-bottom: 16px;
                    }
                    input:focus { border-color: #6366f1; }
                    button[type="submit"] {
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                        border: none;
                        border-radius: 8px;
                        color: white;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        margin-top: 8px;
                        transition: opacity 0.2s;
                    }
                    button[type="submit"]:hover { opacity: 0.9; }
                    button[type="submit"]:disabled { opacity: 0.5; cursor: not-allowed; }
                    .error {
                        background: rgba(239,68,68,0.1);
                        border: 1px solid rgba(239,68,68,0.3);
                        border-radius: 8px;
                        padding: 10px 14px;
                        color: #f87171;
                        font-size: 13px;
                        margin-bottom: 16px;
                    }
                `}</style>
            </head>
            <body>
                <div className="card">
                    <div className="logo">
                        <div className="logo-icon">🌍</div>
                        <div>
                            <h1>Geo App Admin</h1>
                            <p>bluepeaks.top</p>
                        </div>
                    </div>
                    {actionData?.error && (
                        <div className="error">⚠ {actionData.error}</div>
                    )}
                    <Form method="post">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            autoComplete="username"
                            autoFocus
                        />
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            autoComplete="current-password"
                        />
                        <button type="submit" disabled={isLoading}>
                            {isLoading ? "Signing in..." : "Sign In →"}
                        </button>
                    </Form>
                </div>
            </body>
        </html>
    );
}
