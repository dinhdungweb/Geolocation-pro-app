export interface RuleImportValidation {
  isValid: boolean;
  count: number;
  message: string;
}

export interface RuleImportLabels {
  singular: string;
  plural: string;
}

export type RuleImportKind = "geolocation" | "ip";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIpRule(value: unknown) {
  if (!isRecord(value) || !hasText(value.name) || !hasText(value.ipAddresses)) {
    return false;
  }

  return value.matchType === undefined || value.matchType === "ip";
}

function isGeolocationRule(value: unknown) {
  if (!isRecord(value) || !hasText(value.name)) return false;

  const matchType = value.matchType === undefined ? "country" : value.matchType;
  if (matchType === "country") return hasText(value.countryCodes);
  if (matchType === "market") return hasText(value.marketHandles);
  if (matchType === "state") return hasText(value.stateCodes);
  if (matchType === "city") {
    return hasText(value.cityNames) && hasText(value.cityCountryCode);
  }

  return false;
}

function matchesKind(value: unknown, kind: RuleImportKind) {
  return kind === "ip" ? isIpRule(value) : isGeolocationRule(value);
}

function wrongFileTypeMessage(kind: RuleImportKind) {
  return kind === "ip"
    ? "This file contains Geolocation rules, not IP rules. Export a file from the IP Rules page and try again."
    : "This file contains IP rules, not Geolocation rules. Export a file from the Geolocation Rules page and try again.";
}

function invalidRulesMessage(kind: RuleImportKind) {
  return kind === "ip"
    ? "This file doesn't contain any valid IP rules. Each IP rule must include a name and at least one IP address."
    : "This file doesn't contain any valid Geolocation rules. Each rule must include a name, a supported target type, and its target values.";
}

export function validateRuleImportValue(
  parsed: unknown,
  labels: RuleImportLabels,
  expectedKind?: RuleImportKind,
): RuleImportValidation {
  if (!Array.isArray(parsed)) {
    return {
      isValid: false,
      count: 0,
      message: `This file can't be imported because its top-level JSON value isn't an array of ${labels.plural}. Use a file created by Export, or wrap the ${labels.plural} in a JSON array.`,
    };
  }

  if (!expectedKind) {
    return {
      isValid: true,
      count: parsed.length,
      message: `Found ${parsed.length} ${parsed.length === 1 ? labels.singular : labels.plural} ready to import.`,
    };
  }

  if (parsed.length === 0) {
    return {
      isValid: false,
      count: 0,
      message: `This file doesn't contain any ${labels.plural} to import.`,
    };
  }

  const validCount = parsed.filter((rule) => matchesKind(rule, expectedKind)).length;
  const otherKind: RuleImportKind = expectedKind === "ip" ? "geolocation" : "ip";
  const containsOnlyOtherKind = parsed.every((rule) => matchesKind(rule, otherKind));

  if (validCount === 0) {
    return {
      isValid: false,
      count: 0,
      message: containsOnlyOtherKind
        ? wrongFileTypeMessage(expectedKind)
        : invalidRulesMessage(expectedKind),
    };
  }

  const invalidCount = parsed.length - validCount;
  const readyMessage = `Found ${validCount} ${validCount === 1 ? labels.singular : labels.plural} ready to import.`;

  return {
    isValid: true,
    count: validCount,
    message: invalidCount > 0
      ? `${readyMessage} ${invalidCount} invalid ${invalidCount === 1 ? "item" : "items"} will be skipped.`
      : readyMessage,
  };
}

export function validateRuleImportJson(
  value: string,
  labels: RuleImportLabels,
  expectedKind?: RuleImportKind,
): RuleImportValidation {
  try {
    const parsed: unknown = JSON.parse(value);
    return validateRuleImportValue(parsed, labels, expectedKind);
  } catch {
    return {
      isValid: false,
      count: 0,
      message: "This file can't be imported because it isn't valid JSON. Check the file and try again.",
    };
  }
}
