import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Globe, AlertCircle, Lock, User, Loader2 } from "lucide-react";
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
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setIsLoaded(true);
    }, []);

    return (
        <div className="login-screen">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
                
                :root {
                    --primary: #6366f1;
                    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    --bg: #f8fafc;
                    --surface: #ffffff;
                    --text: #0f172a;
                    --text-muted: #64748b;
                    --border: #e2e8f0;
                }
                
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                
                body {
                    font-family: 'Outfit', sans-serif;
                    background: var(--bg);
                    color: var(--text);
                    overflow: hidden;
                }

                .login-screen {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: radial-gradient(circle at top right, #e0e7ff 0%, #f8fafc 50%);
                    position: relative;
                }

                .login-card {
                    width: 100%;
                    max-width: 420px;
                    background: var(--surface);
                    border-radius: 32px;
                    padding: 48px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.08);
                    border: 1px solid var(--border);
                    z-index: 10;
                    transform: translateY(${isLoaded ? '0' : '20px'});
                    opacity: ${isLoaded ? '1' : '0'};
                    transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .logo-icon {
                    width: 56px; height: 56px;
                    background: var(--primary-gradient);
                    border-radius: 16px;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-size: 28px;
                    margin: 0 auto 24px;
                    box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4);
                }

                h1 { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 8px; letter-spacing: -0.02em; }
                p.subtitle { color: var(--text-muted); font-size: 14px; text-align: center; margin-bottom: 32px; }

                .input-group { margin-bottom: 20px; position: relative; }
                .input-group span { position: absolute; left: 16px; top: 16px; color: #94a3b8; }
                input {
                    width: 100%;
                    padding: 14px 16px 14px 44px;
                    background: #f8fafc;
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    font-size: 14px;
                    font-family: inherit;
                    color: var(--text);
                    transition: all 0.2s;
                    outline: none;
                }
                input:focus { border-color: var(--primary); background: white; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

                .btn-login {
                    width: 100%;
                    padding: 14px;
                    background: var(--primary-gradient);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-top: 8px;
                    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                .btn-login:hover { transform: translateY(-1px); box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.3); }
                .btn-login:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }

                .error {
                    background: #fef2f2;
                    color: #ef4444;
                    padding: 12px 16px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 500;
                    margin-bottom: 24px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border: 1px solid #fee2e2;
                }

                .decorative-circle {
                    position: absolute;
                    width: 600px; height: 600px;
                    background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, transparent 70%);
                    top: -300px; right: -300px;
                    z-index: 1;
                }

                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            <div className="decorative-circle" />

            <div className="login-card">
                <div className="logo-icon"><Globe size={32} /></div>
                <h1>Welcome Back</h1>
                <p className="subtitle">Administrator control panel access</p>

                {actionData?.error && (
                    <div className="error">
                        <AlertCircle size={18} />
                        <span>{actionData.error}</span>
                    </div>
                )}

                <Form method="post">
                    <div className="input-group">
                        <span><User size={18} /></span>
                        <input type="text" name="username" placeholder="Username" required autoFocus autoComplete="username" disabled={isLoading} />
                    </div>
                    <div className="input-group">
                        <span><Lock size={18} /></span>
                        <input type="password" name="password" placeholder="Password" required autoComplete="current-password" disabled={isLoading} />
                    </div>
                    <button type="submit" className="btn-login" disabled={isLoading}>
                        {isLoading ? <Loader2 className="spin" size={20} /> : "Sign In to Dashboard"}
                    </button>
                </Form>
                
                <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                    &copy; 2024 GeoAdmin. All rights reserved.
                </div>
            </div>
        </div>
    );
}
