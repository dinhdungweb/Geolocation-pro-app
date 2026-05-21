import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "crypto";
import { isIP } from "node:net";

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "__missing_admin_session_secret__";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

// Rate limiting store (in-memory — resets on server restart)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function assertAdminEnvConfigured() {
    const missing = [
        ["ADMIN_SESSION_SECRET", process.env.ADMIN_SESSION_SECRET],
        ["ADMIN_USERNAME", process.env.ADMIN_USERNAME],
        ["ADMIN_PASSWORD_HASH", process.env.ADMIN_PASSWORD_HASH],
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
        throw new Error(`Missing required admin environment variables: ${missing.map(([key]) => key).join(", ")}`);
    }
}

function timingSafeStringEqual(a: string, b: string) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

async function verifyPasswordHash(password: string, storedHash: string) {
    const [scheme, iterationsRaw, saltRaw, hashRaw] = storedHash.split("$");
    if (scheme !== "pbkdf2_sha256" || !iterationsRaw || !saltRaw || !hashRaw) {
        throw new Error("ADMIN_PASSWORD_HASH must use format pbkdf2_sha256$iterations$saltBase64$hashBase64");
    }

    const iterations = Number.parseInt(iterationsRaw, 10);
    if (!Number.isFinite(iterations) || iterations < 100000) {
        throw new Error("ADMIN_PASSWORD_HASH must use at least 100000 PBKDF2 iterations");
    }

    const salt = Buffer.from(saltRaw, "base64");
    const expected = Buffer.from(hashRaw, "base64");
    const actual = await new Promise<Buffer>((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, expected.length, "sha256", (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
        });
    });

    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

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
    assertAdminEnvConfigured();
    return adminSessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAdminAuth(request: Request) {
    assertAdminEnvConfigured();
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

export async function validateCredentials(username: string, password: string): Promise<boolean> {
    assertAdminEnvConfigured();
    const usernameMatches = timingSafeStringEqual(username, ADMIN_USERNAME);
    const passwordMatches = await verifyPasswordHash(password, ADMIN_PASSWORD_HASH);
    return usernameMatches && passwordMatches;
}

function normalizeIP(value: string | null | undefined) {
    const raw = value?.trim();
    if (!raw) return null;

    const bracketedIPv6 = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
    const ipv4WithPort = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    const candidate = bracketedIPv6?.[1] || ipv4WithPort?.[1] || raw.replace(/^\[|\]$/g, "");

    return isIP(candidate) ? candidate : null;
}

function isPrivateOrLocalIP(ip: string) {
    if (
        ip === "0.0.0.0" ||
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.toLowerCase().startsWith("fc") ||
        ip.toLowerCase().startsWith("fd") ||
        ip.toLowerCase().startsWith("fe80:")
    ) {
        return true;
    }

    const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
        return false;
    }

    const [a, b] = parts;
    return (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
    );
}

function firstPublicForwardedIP(value: string | null) {
    return value
        ?.split(",")
        .map(normalizeIP)
        .find((ip): ip is string => Boolean(ip && !isPrivateOrLocalIP(ip)));
}

export function getClientIP(request: Request): string {
    const singleHopIP = [
        request.headers.get("cf-connecting-ip"),
        request.headers.get("true-client-ip"),
        request.headers.get("x-real-ip"),
    ]
        .map(normalizeIP)
        .find((ip): ip is string => Boolean(ip && !isPrivateOrLocalIP(ip)));

    return (
        singleHopIP ||
        firstPublicForwardedIP(request.headers.get("x-forwarded-for")) ||
        "unknown"
    );
}
