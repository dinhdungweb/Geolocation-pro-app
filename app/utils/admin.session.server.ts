import { createCookieSessionStorage, redirect } from "@remix-run/node";

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "admin-fallback-secret-change-me";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

// Rate limiting store (in-memory — resets on server restart)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const adminSessionStorage = createCookieSessionStorage({
    cookie: {
        name: "__geo_admin_session",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/admin",
        maxAge: SESSION_MAX_AGE,
        secrets: [ADMIN_SESSION_SECRET],
    },
});

export async function getAdminSession(request: Request) {
    return adminSessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAdminAuth(request: Request) {
    const session = await getAdminSession(request);
    const isLoggedIn = session.get("admin_logged_in");
    if (!isLoggedIn) {
        const url = new URL(request.url);
        throw redirect(`/admin/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
    }
    return session;
}

export function checkRateLimit(ip: string): { blocked: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry) {
        return { blocked: false, remaining: MAX_ATTEMPTS, resetIn: 0 };
    }

    // Reset after block duration
    if (now - entry.firstAttempt > BLOCK_DURATION_MS) {
        loginAttempts.delete(ip);
        return { blocked: false, remaining: MAX_ATTEMPTS, resetIn: 0 };
    }

    if (entry.count >= MAX_ATTEMPTS) {
        const resetIn = Math.ceil((BLOCK_DURATION_MS - (now - entry.firstAttempt)) / 1000 / 60);
        return { blocked: true, remaining: 0, resetIn };
    }

    return { blocked: false, remaining: MAX_ATTEMPTS - entry.count, resetIn: 0 };
}

export function recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || now - entry.firstAttempt > BLOCK_DURATION_MS) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        loginAttempts.set(ip, { count: entry.count + 1, firstAttempt: entry.firstAttempt });
    }
}

export function clearAttempts(ip: string): void {
    loginAttempts.delete(ip);
}

export function validateCredentials(username: string, password: string): boolean {
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function getClientIP(request: Request): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}
