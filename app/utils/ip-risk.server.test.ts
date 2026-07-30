import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipRiskCacheMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("../db.server", () => ({
  default: {
    ipRiskCache: ipRiskCacheMock,
  },
}));

import { assessIpRisk, ipRiskTestUtils } from "./ip-risk.server";

describe("IP risk provider normalization", () => {
  beforeEach(() => {
    ipRiskCacheMock.findUnique.mockResolvedValue(null);
    ipRiskCacheMock.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("classifies provider scores at the high-risk threshold", () => {
    const result = ipRiskTestUtils.parseProviderResult("ipqs", {
      success: true,
      fraud_score: 93,
      proxy: true,
      recent_abuse: true,
      bot_status: true,
      request_id: "risk-request",
    });

    expect(result).toMatchObject({
      status: "success",
      provider: "ipqs",
      score: 93,
      level: "HIGH",
      proxy: true,
      recentAbuse: true,
      bot: true,
      requestId: "risk-request",
    });
    expect(result.signals).toEqual(
      expect.arrayContaining(["proxy", "recent_abuse", "bot_activity"]),
    );
  });

  it("treats VPN-only traffic as medium risk instead of automatically high risk", () => {
    const result = ipRiskTestUtils.parseProviderResult("generic", {
      success: true,
      fraud_score: 42,
      vpn: true,
    });

    expect(result).toMatchObject({
      status: "success",
      score: 42,
      level: "MEDIUM",
      vpn: true,
    });
  });

  it("does not treat string boolean values as positive risk signals", () => {
    const result = ipRiskTestUtils.parseProviderResult("generic", {
      success: true,
      fraud_score: 0,
      proxy: "false",
      vpn: "false",
      tor: "false",
    });

    expect(result).toMatchObject({
      status: "success",
      level: "NONE",
      proxy: false,
      vpn: false,
      tor: false,
    });
  });

  it("keeps provider failures distinct from clean IPs", () => {
    const result = ipRiskTestUtils.parseProviderResult("ipqs", {
      success: false,
      message: "quota exhausted",
    });

    expect(result).toMatchObject({
      status: "failed",
      level: "UNKNOWN",
      error: "quota exhausted",
    });
  });

  it("normalizes nested proxycheck responses", () => {
    const result = ipRiskTestUtils.parseProviderResult(
      "proxycheck",
      {
        status: "ok",
        "203.0.113.20": {
          proxy: "yes",
          type: "VPN",
          risk: "91",
        },
      },
      "203.0.113.20",
    );

    expect(result).toMatchObject({
      status: "success",
      provider: "proxycheck",
      score: 91,
      level: "HIGH",
      proxy: true,
      vpn: true,
    });
  });

  it("treats proxycheck denied responses as failures so fallback can run", () => {
    const result = ipRiskTestUtils.parseProviderResult("proxycheck", {
      status: "denied",
      message: "Daily query limit exceeded",
    });

    expect(result).toMatchObject({
      status: "failed",
      provider: "proxycheck",
      level: "UNKNOWN",
      error: "Daily query limit exceeded",
    });
  });

  it("normalizes AbuseIPDB confidence as a fallback risk score", () => {
    const result = ipRiskTestUtils.parseProviderResult("abuseipdb", {
      data: {
        abuseConfidenceScore: 82,
        totalReports: 12,
      },
    });

    expect(result).toMatchObject({
      status: "success",
      provider: "abuseipdb",
      score: 82,
      level: "MEDIUM",
      recentAbuse: true,
    });
  });

  it("fails over to AbuseIPDB when proxycheck is unavailable", async () => {
    vi.stubEnv(
      "IP_RISK_API_URL",
      "https://proxycheck.io/v2/{ip}?vpn=1&risk=1",
    );
    vi.stubEnv("IP_RISK_PROVIDER", "proxycheck");
    vi.stubEnv("IP_RISK_API_KEY", "primary-key");
    vi.stubEnv(
      "IP_RISK_FALLBACK_API_URL",
      "https://api.abuseipdb.com/api/v2/check?ipAddress={ip}",
    );
    vi.stubEnv("IP_RISK_FALLBACK_PROVIDER", "abuseipdb");
    vi.stubEnv("IP_RISK_FALLBACK_API_KEY", "fallback-key");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            abuseConfidenceScore: 96,
            totalReports: 25,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await assessIpRisk({
      ip: "8.8.8.8",
      ipHash: "test-ip-hash",
    });

    expect(result).toMatchObject({
      status: "success",
      provider: "abuseipdb",
      score: 96,
      level: "HIGH",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      "key=primary-key",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Key: "fallback-key" }),
      }),
    );
  });
});
