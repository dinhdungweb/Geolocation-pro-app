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
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                        background: #f8fafc;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                        color: #1e293b;
                    }
                    .card {
                        background: #ffffff;
                        border: 1px solid #e2e8f0;
                        border-radius: 20px;
                        padding: 40px;
                        width: 100%;
                        max-width: 420px;
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    }
                    .logo {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 16px;
                        margin-bottom: 32px;
                    }
                    .logo-icon {
                        width: 56px; height: 56px;
                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                        border-radius: 14px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 28px;
                        color: white;
                        box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
                    }
                    .logo h1 { font-size: 22px; color: #1e293b; font-weight: 800; letter-spacing: -0.02em; }
                    .logo p { font-size: 14px; color: #64748b; margin-top: 4px; }
                    
                    .form-group { margin-bottom: 20px; }
                    label {
                        display: block;
                        font-size: 14px;
                        font-weight: 600;
                        color: #475569;
                        margin-bottom: 8px;
                    }
                    input {
                        width: 100%;
                        padding: 12px 16px;
                        background: #ffffff;
                        border: 1px solid #e2e8f0;
                        border-radius: 10px;
                        color: #1e293b;
                        font-size: 15px;
                        outline: none;
                        transition: all 0.2s;
                    }
                    input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
                    
                    button[type="submit"] {
                        width: 100%;
                        padding: 14px;
                        background: #6366f1;
                        border: none;
                        border-radius: 12px;
                        color: white;
                        font-size: 15px;
                        font-weight: 700;
                        cursor: pointer;
                        margin-top: 12px;
                        transition: all 0.2s;
                        box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
                    }
                    button[type="submit"]:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); }
                    button[type="submit"]:active { transform: translateY(0); }
                    button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                    
                    .error {
                        background: #fef2f2;
                        border: 1px solid #fee2e2;
                        border-radius: 10px;
                        padding: 12px 16px;
                        color: #ef4444;
                        font-size: 14px;
                        font-weight: 500;
                        margin-bottom: 24px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
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
