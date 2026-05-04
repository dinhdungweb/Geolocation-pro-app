export type ConflictMatchType = "country" | "ip" | "market";

export type ConflictSeverity = "warning" | "critical";

export interface ConflictRule {
  id: string;
  name: string;
  matchType: string;
  countryCodes?: string | null;
  ipAddresses?: string | null;
  marketHandles?: string | null;
  marketCountryCodes?: string | null;
  isActive: boolean;
  priority: number;
  ruleType: string;
  targetUrl?: string | null;
  redirectMode?: string | null;
  scheduleEnabled?: boolean | null;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: string | null;
  pageTargetingType?: string | null;
  pagePaths?: string | null;
}

export interface RuleConflict {
  id: string;
  ruleId: string;
  otherRuleId: string;
  otherRuleName: string;
  severity: ConflictSeverity;
  message: string;
  scope: string;
}

export interface RuleConflictSummary {
  total: number;
  byRuleId: Record<string, RuleConflict[]>;
}

const ALL_DAYS = ["0", "1", "2", "3", "4", "5", "6"];

function splitList(value: string | null | undefined) {
  return (value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function pathPatternsOverlap(left: string, right: string) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b) return false;

  const aWildcard = a.endsWith("*");
  const bWildcard = b.endsWith("*");
  const aPrefix = aWildcard ? a.slice(0, -1) : a;
  const bPrefix = bWildcard ? b.slice(0, -1) : b;

  if (aWildcard && bWildcard) {
    return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
  }
  if (aWildcard) return b.startsWith(aPrefix);
  if (bWildcard) return a.startsWith(bPrefix);
  return a === b;
}

function pageTargetingOverlaps(left: ConflictRule, right: ConflictRule) {
  const leftType = left.pageTargetingType || "all";
  const rightType = right.pageTargetingType || "all";

  if (leftType === "all" || rightType === "all") {
    return { overlaps: true, label: "all pages" };
  }

  const leftPaths = splitList(left.pagePaths);
  const rightPaths = splitList(right.pagePaths);

  if (leftType === "include" && leftPaths.length === 0) {
    return { overlaps: false, label: "no included pages" };
  }
  if (rightType === "include" && rightPaths.length === 0) {
    return { overlaps: false, label: "no included pages" };
  }

  if (leftType === "include" && rightType === "include") {
    const overlap = leftPaths.find((leftPath) =>
      rightPaths.some((rightPath) => pathPatternsOverlap(leftPath, rightPath)),
    );
    return { overlaps: Boolean(overlap), label: overlap ? `page ${overlap}` : "separate pages" };
  }

  if (leftType === "include" && rightType === "exclude") {
    const overlap = leftPaths.find(
      (leftPath) => !rightPaths.some((rightPath) => pathPatternsOverlap(leftPath, rightPath)),
    );
    return { overlaps: Boolean(overlap), label: overlap ? `page ${overlap}` : "excluded pages" };
  }

  if (leftType === "exclude" && rightType === "include") {
    const overlap = rightPaths.find(
      (rightPath) => !leftPaths.some((leftPath) => pathPatternsOverlap(leftPath, rightPath)),
    );
    return { overlaps: Boolean(overlap), label: overlap ? `page ${overlap}` : "excluded pages" };
  }

  return { overlaps: true, label: "shared non-excluded pages" };
}

function parseDays(rule: ConflictRule) {
  if (!rule.scheduleEnabled) return ALL_DAYS;
  const days = splitList(rule.daysOfWeek);
  return days.length > 0 ? days : ALL_DAYS;
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function timeRanges(rule: ConflictRule) {
  if (!rule.scheduleEnabled) return [{ start: 0, end: 1439 }];

  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);
  if (start === null || end === null) return [{ start: 0, end: 1439 }];

  if (start <= end) return [{ start, end }];
  return [
    { start, end: 1439 },
    { start: 0, end },
  ];
}

function rangesOverlap(
  left: Array<{ start: number; end: number }>,
  right: Array<{ start: number; end: number }>,
) {
  return left.some((leftRange) =>
    right.some((rightRange) => leftRange.start <= rightRange.end && rightRange.start <= leftRange.end),
  );
}

function schedulesOverlap(left: ConflictRule, right: ConflictRule) {
  if (!left.scheduleEnabled || !right.scheduleEnabled) {
    return { overlaps: true, label: "active schedule" };
  }

  const leftDays = parseDays(left);
  const rightDays = new Set(parseDays(right));
  const sharedDay = leftDays.find((day) => rightDays.has(day));
  if (!sharedDay) return { overlaps: false, label: "different days" };

  const overlaps = rangesOverlap(timeRanges(left), timeRanges(right));
  return { overlaps, label: overlaps ? "overlapping schedule" : "different times" };
}

function countryOverlap(left: ConflictRule, right: ConflictRule) {
  const leftCountries = splitList(left.countryCodes).map((code) => code.toUpperCase());
  const rightCountries = splitList(right.countryCodes).map((code) => code.toUpperCase());

  if (leftCountries.includes("*") || rightCountries.includes("*")) {
    return { overlaps: true, label: "all countries" };
  }

  const rightSet = new Set(rightCountries);
  const shared = leftCountries.filter((code) => rightSet.has(code));
  return {
    overlaps: shared.length > 0,
    label: shared.length > 0 ? shared.slice(0, 4).join(", ") : "different countries",
  };
}

function ipv4ToInt(value: string) {
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function parseIpv4Range(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(":")) return null;

  const [ip, bitsRaw] = trimmed.split("/");
  const base = ipv4ToInt(ip);
  if (base === null) return null;

  const bits = bitsRaw === undefined ? 32 : Number.parseInt(bitsRaw, 10);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return null;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const start = (base & mask) >>> 0;
  const size = 2 ** (32 - bits);
  return { start, end: start + size - 1 };
}

function ipPatternsOverlap(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const leftRange = parseIpv4Range(normalizedLeft);
  const rightRange = parseIpv4Range(normalizedRight);
  if (leftRange && rightRange) {
    return leftRange.start <= rightRange.end && rightRange.start <= leftRange.end;
  }

  return false;
}

function ipOverlap(left: ConflictRule, right: ConflictRule) {
  const leftIps = splitList(left.ipAddresses);
  const rightIps = splitList(right.ipAddresses);
  const shared = leftIps.find((leftIp) => rightIps.some((rightIp) => ipPatternsOverlap(leftIp, rightIp)));

  return {
    overlaps: Boolean(shared),
    label: shared ? `IP ${shared}` : "different IPs",
  };
}

function marketOverlap(left: ConflictRule, right: ConflictRule) {
  const leftMarkets = splitList(left.marketHandles).map((handle) => handle.toLowerCase());
  const rightMarkets = splitList(right.marketHandles).map((handle) => handle.toLowerCase());

  if (leftMarkets.includes("*") || rightMarkets.includes("*")) {
    return { overlaps: true, label: "all markets" };
  }

  const rightSet = new Set(rightMarkets);
  const shared = leftMarkets.filter((handle) => rightSet.has(handle));
  if (shared.length > 0) {
    return {
      overlaps: true,
      label: shared.slice(0, 4).join(", "),
    };
  }

  const leftCountries = splitList(left.marketCountryCodes).map((code) => code.toUpperCase());
  const rightCountries = splitList(right.marketCountryCodes).map((code) => code.toUpperCase());
  const rightCountrySet = new Set(rightCountries);
  const sharedCountries = leftCountries.filter((code) => rightCountrySet.has(code));

  return {
    overlaps: sharedCountries.length > 0,
    label: sharedCountries.length > 0 ? sharedCountries.slice(0, 4).join(", ") : "different markets",
  };
}

function addConflict(
  summary: RuleConflictSummary,
  conflict: Omit<RuleConflict, "id">,
) {
  const id = `${conflict.ruleId}:${conflict.otherRuleId}:${summary.total}`;
  const item = { id, ...conflict };
  summary.byRuleId[conflict.ruleId] = [...(summary.byRuleId[conflict.ruleId] || []), item];
}

function buildScope(matchLabel: string, pageLabel: string, scheduleLabel: string) {
  return `${matchLabel}; ${pageLabel}; ${scheduleLabel}`;
}

export function detectRuleConflicts(
  rules: ConflictRule[],
  matchType: ConflictMatchType,
): RuleConflictSummary {
  const summary: RuleConflictSummary = { total: 0, byRuleId: {} };
  const activeRules = rules.filter((rule) => rule.isActive && rule.matchType === matchType);

  for (let i = 0; i < activeRules.length; i += 1) {
    for (let j = i + 1; j < activeRules.length; j += 1) {
      const left = activeRules[i];
      const right = activeRules[j];
      const matchOverlap =
        matchType === "country" ? countryOverlap(left, right) :
        matchType === "market" ? marketOverlap(left, right) :
        ipOverlap(left, right);
      if (!matchOverlap.overlaps) continue;

      const pageOverlap = pageTargetingOverlaps(left, right);
      if (!pageOverlap.overlaps) continue;

      const scheduleOverlap = schedulesOverlap(left, right);
      if (!scheduleOverlap.overlaps) continue;

      const scope = buildScope(matchOverlap.label, pageOverlap.label, scheduleOverlap.label);
      const samePriority = left.priority === right.priority;

      if (!samePriority) continue;

      addConflict(summary, {
        ruleId: left.id,
        otherRuleId: right.id,
        otherRuleName: right.name,
        severity: "critical",
        scope,
        message: `"${right.name}" has the same priority and overlapping targeting. Raise or lower one priority so the winning rule is deterministic.`,
      });
      addConflict(summary, {
        ruleId: right.id,
        otherRuleId: left.id,
        otherRuleName: left.name,
        severity: "critical",
        scope,
        message: `"${left.name}" has the same priority and overlapping targeting. Raise or lower one priority so the winning rule is deterministic.`,
      });
      summary.total += 1;
    }
  }

  return summary;
}
