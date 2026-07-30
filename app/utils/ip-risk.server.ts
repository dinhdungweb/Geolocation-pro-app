import { isIP } from "node:net";
import prisma from "../db.server";
import { hashIP } from "./analytics-token.server";

export type IpRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type IpRiskStatus = "success" | "failed" | "skipped";

export type IpRiskResult = {
  status: IpRiskStatus;
  provider: string | null;
  score: number | null;
  level: IpRiskLevel;
  signals: string[];
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  residentialProxy: boolean;
  hosting: boolean;
  recentAbuse: boolean;
  bot: boolean;
  requestId: string | null;
  checkedAt: Date | null;
  error: string | null;
};

type AssessIpRiskInput = {
  ip: string;
  ipHash?: string;
  userAgent?: string | null;
  userLanguage?: string | null;
};

type ProviderConfig = {
  name: string;
  url: string;
  apiKey: string;
};

const PROVIDER_VERSION = "v1";
const DEFAULT_TIMEOUT_MS = 1_200;
const DEFAULT_TOTAL_TIMEOUT_MS = 2_500;
const DEFAULT_CLEAN_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RISK_TTL_MS = 60 * 60 * 1000;
const DEFAULT_FAILURE_TTL_MS = 60 * 1000;

function envNumber(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyResult(
  status: IpRiskStatus,
  overrides: Partial<IpRiskResult> = {},
): IpRiskResult {
  return {
    status,
    provider: null,
    score: null,
    level: status === "success" ? "NONE" : "UNKNOWN",
    signals: [],
    proxy: false,
    vpn: false,
    tor: false,
    residentialProxy: false,
    hosting: false,
    recentAbuse: false,
    bot: false,
    requestId: null,
    checkedAt: status === "skipped" ? null : new Date(),
    error: null,
    ...overrides,
  };
}

function normalizeIp(ip: string) {
  const trimmed = ip.trim().replace(/^\[|\]$/g, "");
  return trimmed.startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4
    ? trimmed.slice(7)
    : trimmed;
}

function isPrivateOrUnusableIp(ip: string) {
  if (!isIP(ip)) return true;
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

  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map((part) => Number.parseInt(part, 10));
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function strictTrue(value: unknown) {
  return value === true || value === 1;
}

function numericScore(...values: unknown[]) {
  for (const value of values) {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }
  return null;
}

function providerName(providerUrl: string, configuredProvider = "") {
  const configured = configuredProvider.trim().toLowerCase();
  if (configured) return configured;

  try {
    const hostname = new URL(providerUrl).hostname.toLowerCase();
    if (hostname.includes("ipqualityscore")) return "ipqs";
    if (hostname.includes("proxycheck")) return "proxycheck";
    if (hostname.includes("abuseipdb")) return "abuseipdb";
    if (hostname.includes("iphub")) return "iphub";
    if (hostname.includes("maxmind") || hostname.includes("minfraud")) {
      return "maxmind";
    }
  } catch {
    // The URL validation below returns a safe failed result.
  }
  return "generic";
}

function providerConfigs() {
  const primaryUrl =
    process.env.IP_RISK_API_URL || process.env.VPN_CHECK_API_URL || "";
  const fallbackUrl = process.env.IP_RISK_FALLBACK_API_URL || "";
  const configs: ProviderConfig[] = [];

  if (primaryUrl.trim()) {
    configs.push({
      name: providerName(primaryUrl, process.env.IP_RISK_PROVIDER),
      url: primaryUrl,
      apiKey: process.env.IP_RISK_API_KEY || "",
    });
  }
  if (fallbackUrl.trim()) {
    configs.push({
      name: providerName(
        fallbackUrl,
        process.env.IP_RISK_FALLBACK_PROVIDER,
      ),
      url: fallbackUrl,
      apiKey: process.env.IP_RISK_FALLBACK_API_KEY || "",
    });
  }

  return configs.filter(
    (config, index) =>
      configs.findIndex(
        (candidate) =>
          candidate.name === config.name && candidate.url === config.url,
      ) === index,
  );
}

function buildProviderUrl(
  config: ProviderConfig,
  input: AssessIpRiskInput,
) {
  const rawUrl = config.url.trim();
  if (!rawUrl) return null;
  const normalizedUrl = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;
  const withIp = normalizedUrl.includes("{ip}")
    ? normalizedUrl.replace("{ip}", encodeURIComponent(input.ip))
    : normalizedUrl;
  const url = new URL(withIp);
  if (url.protocol !== "https:") return null;
  if (!normalizedUrl.includes("{ip}")) {
    url.searchParams.set(
      config.name === "abuseipdb" ? "ipAddress" : "ip",
      input.ip,
    );
  }

  if (config.name === "ipqs") {
    if (!url.searchParams.has("strictness")) {
      url.searchParams.set("strictness", process.env.IP_RISK_STRICTNESS || "1");
    }
    if (!url.searchParams.has("allow_public_access_points")) {
      url.searchParams.set("allow_public_access_points", "true");
    }
    if (input.userAgent) {
      url.searchParams.set("user_agent", input.userAgent.slice(0, 500));
    }
    if (input.userLanguage) {
      url.searchParams.set("user_language", input.userLanguage.slice(0, 100));
    }
  }
  if (config.name === "proxycheck") {
    if (!url.searchParams.has("vpn")) url.searchParams.set("vpn", "1");
    if (!url.searchParams.has("risk")) url.searchParams.set("risk", "1");
    if (config.apiKey && !url.searchParams.has("key")) {
      url.searchParams.set("key", config.apiKey);
    }
  }
  if (config.name === "abuseipdb") {
    if (!url.searchParams.has("maxAgeInDays")) {
      url.searchParams.set("maxAgeInDays", "30");
    }
  }

  return url;
}

function providerHeaders(config: ProviderConfig) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.name === "abuseipdb" && config.apiKey) {
    headers.Key = config.apiKey;
  }
  if (config.name === "iphub" && config.apiKey) {
    headers["X-Key"] = config.apiKey;
    headers["Accept-Version"] = "2.2";
  }
  return headers;
}

function normalizeProviderPayload(provider: string, data: any, ip = "") {
  if (provider === "proxycheck") {
    if (data?.status !== "ok") {
      return {
        success: false,
        message:
          typeof data?.message === "string"
            ? data.message
            : "proxycheck returned a non-ok status",
      };
    }
    const payload =
      (ip && data?.[ip]) ||
      Object.entries(data || {}).find(
        ([key, value]) =>
          key !== "status" && value && typeof value === "object",
      )?.[1];
    if (!payload || typeof payload !== "object") {
      return {
        success: false,
        message: "proxycheck response did not contain an IP result",
      };
    }
    const entry = payload as Record<string, unknown>;
    const proxyType = String(entry.type || "").toLowerCase();
    return {
      success: data?.status === "ok",
      risk_score: entry.risk,
      proxy: String(entry.proxy || "").toLowerCase() === "yes",
      vpn: proxyType.includes("vpn"),
      tor: proxyType.includes("tor"),
      hosting:
        proxyType.includes("hosting") || proxyType.includes("business"),
      recent_abuse: numericScore(entry.risk) !== null && numericScore(entry.risk)! >= 75,
      request_id: typeof data?.query_id === "string" ? data.query_id : null,
    };
  }

  if (provider === "abuseipdb") {
    const entry =
      data?.data && typeof data.data === "object" ? data.data : null;
    if (!entry) return data;
    const score = numericScore(entry.abuseConfidenceScore);
    const reports = Number(entry.totalReports || 0);
    return {
      success: true,
      risk_score: score,
      recent_abuse: score !== null && score >= 75 && reports > 0,
      high_risk_attacks: score !== null && score >= 90,
      request_id: null,
    };
  }

  if (provider === "iphub") {
    const block = Number(data?.block);
    const proxyType =
      data?.proxyType && typeof data.proxyType === "object"
        ? data.proxyType
        : {};
    return {
      success: block === 0 || block === 1 || block === 2,
      risk_score: block === 1 ? 90 : block === 2 ? 75 : 0,
      proxy: strictTrue(proxyType.proxy),
      vpn: strictTrue(proxyType.vpn),
      tor: strictTrue(proxyType.tor),
      hosting: strictTrue(proxyType.hosting) || block === 1,
      residential_proxy: strictTrue(proxyType.residentialProxy),
    };
  }

  return data;
}

function parseProviderResult(provider: string, data: any, ip = ""): IpRiskResult {
  const normalizedData = normalizeProviderPayload(provider, data, ip);
  data = normalizedData;
  if (
    !data ||
    typeof data !== "object" ||
    data.success === false ||
    ["fail", "error", "denied"].includes(
      String(data.status || "").toLowerCase(),
    )
  ) {
    return emptyResult("failed", {
      provider,
      error:
        typeof data?.message === "string"
          ? data.message.slice(0, 500)
          : "IP risk provider returned an invalid response",
    });
  }

  const ipData =
    data.ip_address && typeof data.ip_address === "object"
      ? data.ip_address
      : {};
  const security =
    data.security && typeof data.security === "object" ? data.security : {};
  const traits =
    ipData.traits && typeof ipData.traits === "object" ? ipData.traits : {};

  const proxy =
    strictTrue(data.proxy) ||
    strictTrue(data.is_proxy) ||
    strictTrue(security.proxy) ||
    strictTrue(ipData.is_public_proxy) ||
    strictTrue(ipData.is_anonymous_proxy) ||
    strictTrue(traits.is_public_proxy) ||
    strictTrue(traits.is_anonymous_proxy);
  const vpn =
    strictTrue(data.vpn) ||
    strictTrue(data.is_vpn) ||
    strictTrue(security.vpn) ||
    strictTrue(ipData.is_anonymous_vpn) ||
    strictTrue(traits.is_anonymous_vpn);
  const tor =
    strictTrue(data.tor) ||
    strictTrue(data.is_tor) ||
    strictTrue(security.tor) ||
    strictTrue(ipData.is_tor_exit_node) ||
    strictTrue(traits.is_tor_exit_node);
  const residentialProxy =
    strictTrue(data.residential_proxy) ||
    strictTrue(data.is_residential_proxy) ||
    strictTrue(ipData.is_residential_proxy) ||
    strictTrue(traits.is_residential_proxy);
  const hosting =
    strictTrue(data.hosting) ||
    strictTrue(data.is_hosting_provider) ||
    strictTrue(ipData.is_hosting_provider) ||
    strictTrue(traits.is_hosting_provider);
  const recentAbuse =
    strictTrue(data.recent_abuse) ||
    strictTrue(data.frequent_abuser) ||
    strictTrue(ipData.recent_abuse);
  const highRiskAttacks = strictTrue(data.high_risk_attacks);
  const frequentAbuser = strictTrue(data.frequent_abuser);
  const bot =
    strictTrue(data.bot_status) ||
    strictTrue(data.bot) ||
    strictTrue(security.bot);
  const score = numericScore(
    data.fraud_score,
    data.risk_score,
    data.transaction_details?.risk_score,
    ipData.risk,
    data.risk,
  );

  const signals = new Set<string>();
  if (proxy) signals.add("proxy");
  if (vpn) signals.add("vpn");
  if (tor) signals.add("tor");
  if (residentialProxy) signals.add("residential_proxy");
  if (hosting) signals.add("hosting_provider");
  if (recentAbuse) signals.add("recent_abuse");
  if (frequentAbuser) signals.add("frequent_abuser");
  if (highRiskAttacks) signals.add("high_risk_attacks");
  if (bot) signals.add("bot_activity");

  let level: IpRiskLevel = "NONE";
  if (
    (score !== null && score >= 90) ||
    highRiskAttacks ||
    (recentAbuse && bot) ||
    (frequentAbuser && recentAbuse)
  ) {
    level = "HIGH";
  } else if (
    (score !== null && score >= 75) ||
    proxy ||
    vpn ||
    tor ||
    residentialProxy ||
    hosting ||
    recentAbuse ||
    bot
  ) {
    level = "MEDIUM";
  } else if ((score !== null && score > 0) || signals.size > 0) {
    level = "LOW";
  }

  return emptyResult("success", {
    provider,
    score,
    level,
    signals: Array.from(signals),
    proxy,
    vpn,
    tor,
    residentialProxy,
    hosting,
    recentAbuse,
    bot,
    requestId:
      typeof data.request_id === "string"
        ? data.request_id
        : typeof data.id === "string"
          ? data.id
          : null,
  });
}

function cacheResult(record: any): IpRiskResult {
  return {
    status: record.status as IpRiskStatus,
    provider: record.provider,
    score: record.score,
    level: record.level as IpRiskLevel,
    signals: Array.isArray(record.signals)
      ? record.signals.filter((value: unknown): value is string => typeof value === "string")
      : [],
    proxy: record.isProxy,
    vpn: record.isVpn,
    tor: record.isTor,
    residentialProxy: record.isResidential,
    hosting: record.isHosting,
    recentAbuse: record.hasRecentAbuse,
    bot: record.isBot,
    requestId: record.requestId,
    checkedAt: record.checkedAt,
    error: record.lastError,
  };
}

async function readCache(provider: string, ipHash: string) {
  try {
    const record = await prisma.ipRiskCache.findUnique({
      where: {
        provider_providerVersion_ipHash: {
          provider,
          providerVersion: PROVIDER_VERSION,
          ipHash,
        },
      },
    });
    if (record && record.expiresAt > new Date()) return cacheResult(record);
  } catch (error) {
    console.error("[IP Risk] Cache read failed:", error);
  }
  return null;
}

async function writeCache(provider: string, ipHash: string, result: IpRiskResult) {
  const now = result.checkedAt || new Date();
  const ttl =
    result.status === "failed"
      ? envNumber("IP_RISK_FAILURE_TTL_MS", DEFAULT_FAILURE_TTL_MS)
      : result.level === "NONE" || result.level === "LOW"
        ? envNumber("IP_RISK_CLEAN_TTL_MS", DEFAULT_CLEAN_TTL_MS)
        : envNumber("IP_RISK_RISK_TTL_MS", DEFAULT_RISK_TTL_MS);
  const expiresAt = new Date(now.getTime() + ttl);

  try {
    await prisma.ipRiskCache.upsert({
      where: {
        provider_providerVersion_ipHash: {
          provider,
          providerVersion: PROVIDER_VERSION,
          ipHash,
        },
      },
      create: {
        provider,
        providerVersion: PROVIDER_VERSION,
        ipHash,
        score: result.score,
        level: result.level,
        signals: result.signals,
        status: result.status,
        isProxy: result.proxy,
        isVpn: result.vpn,
        isTor: result.tor,
        isResidential: result.residentialProxy,
        isHosting: result.hosting,
        hasRecentAbuse: result.recentAbuse,
        isBot: result.bot,
        requestId: result.requestId,
        lastError: result.error,
        checkedAt: now,
        expiresAt,
      },
      update: {
        score: result.score,
        level: result.level,
        signals: result.signals,
        status: result.status,
        isProxy: result.proxy,
        isVpn: result.vpn,
        isTor: result.tor,
        isResidential: result.residentialProxy,
        isHosting: result.hosting,
        hasRecentAbuse: result.recentAbuse,
        isBot: result.bot,
        requestId: result.requestId,
        lastError: result.error,
        checkedAt: now,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("[IP Risk] Cache write failed:", error);
  }
}

export async function getCachedIpRiskByHash(ipHash: string) {
  if (!ipHash) return null;
  let failedResult: IpRiskResult | null = null;
  for (const config of providerConfigs()) {
    const cached = await readCache(config.name, ipHash);
    if (cached?.status === "success") return cached;
    if (cached) failedResult = cached;
  }
  return failedResult;
}

export function shouldBlockIpRisk(result: IpRiskResult) {
  return (
    result.status === "success" &&
    (result.level === "HIGH" ||
      (result.level === "MEDIUM" &&
        process.env.IP_RISK_BLOCK_MEDIUM === "true"))
  );
}

async function assessWithProvider(
  config: ProviderConfig,
  input: AssessIpRiskInput,
  ipHash: string,
  timeoutMs: number,
) {
  const cached = await readCache(config.name, ipHash);
  if (cached) return cached;

  const url = buildProviderUrl(config, input);
  if (!url) {
    return emptyResult("failed", {
      provider: config.name,
      error: "IP risk provider URL must use HTTPS",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  let result: IpRiskResult;
  try {
    const response = await fetch(url, {
      headers: providerHeaders(config),
      signal: controller.signal,
    });
    if (!response.ok) {
      result = emptyResult("failed", {
        provider: config.name,
        error: `IP risk provider returned HTTP ${response.status}`,
      });
    } else {
      result = parseProviderResult(
        config.name,
        await response.json(),
        input.ip,
      );
    }
  } catch (error: any) {
    result = emptyResult("failed", {
      provider: config.name,
      error:
        error?.name === "AbortError"
          ? "IP risk provider timed out"
          : String(error?.message || error).slice(0, 500),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  await writeCache(config.name, ipHash, result);
  return result;
}

export async function assessIpRisk(input: AssessIpRiskInput): Promise<IpRiskResult> {
  const ip = normalizeIp(input.ip);
  const configs = providerConfigs();
  if (configs.length === 0 || isPrivateOrUnusableIp(ip)) {
    return emptyResult("skipped");
  }

  const ipHash = input.ipHash || hashIP(ip);
  const deadline =
    Date.now() +
    envNumber("IP_RISK_TOTAL_TIMEOUT_MS", DEFAULT_TOTAL_TIMEOUT_MS);
  let lastFailure: IpRiskResult | null = null;
  for (const config of configs) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const result = await assessWithProvider(
      config,
      { ...input, ip },
      ipHash,
      Math.min(
        envNumber("IP_RISK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
        remainingMs,
      ),
    );
    if (result.status === "success") return result;
    lastFailure = result;
  }

  return lastFailure || emptyResult("failed", {
    error: "All IP risk providers failed",
  });
}

export const ipRiskTestUtils = {
  normalizeProviderPayload,
  parseProviderResult,
  providerConfigs,
};
