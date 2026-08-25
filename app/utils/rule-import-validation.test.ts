import { describe, expect, it } from "vitest";
import { validateRuleImportJson } from "./rule-import-validation";

describe("validateRuleImportJson", () => {
  it("accepts a top-level array and reports its item count", () => {
    expect(validateRuleImportJson('[{"name":"US"}]', { singular: "rule", plural: "rules" })).toEqual({
      isValid: true,
      count: 1,
      message: "Found 1 rule ready to import.",
    });
  });

  it("explains how to fix a non-array export", () => {
    const result = validateRuleImportJson('{"name":"US"}', { singular: "rule", plural: "rules" });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain("top-level JSON value isn't an array");
    expect(result.message).toContain("Use a file created by Export");
  });

  it("returns a helpful message for malformed JSON", () => {
    expect(validateRuleImportJson("not-json", { singular: "rule", plural: "rules" })).toEqual({
      isValid: false,
      count: 0,
      message:
        "This file can't be imported because it isn't valid JSON. Check the file and try again.",
    });
  });

  it("rejects a Geolocation export on the IP Rules page", () => {
    const result = validateRuleImportJson(
      '[{"name":"United States","matchType":"country","countryCodes":"US"}]',
      { singular: "IP rule", plural: "IP rules" },
      "ip",
    );

    expect(result).toEqual({
      isValid: false,
      count: 0,
      message:
        "This file contains Geolocation rules, not IP rules. Export a file from the IP Rules page and try again.",
    });
  });

  it("rejects an IP export on the Geolocation Rules page", () => {
    const result = validateRuleImportJson(
      '[{"name":"Office","ipAddresses":"203.0.113.10"}]',
      { singular: "rule", plural: "rules" },
      "geolocation",
    );

    expect(result.isValid).toBe(false);
    expect(result.message).toContain("contains IP rules, not Geolocation rules");
  });

  it("counts only valid IP rules and explains that invalid items are skipped", () => {
    const result = validateRuleImportJson(
      '[{"name":"Office","ipAddresses":"203.0.113.10"},{"name":"Missing IP"}]',
      { singular: "IP rule", plural: "IP rules" },
      "ip",
    );

    expect(result).toEqual({
      isValid: true,
      count: 1,
      message: "Found 1 IP rule ready to import. 1 invalid item will be skipped.",
    });
  });

  it("rejects an empty rule array", () => {
    expect(
      validateRuleImportJson("[]", { singular: "IP rule", plural: "IP rules" }, "ip"),
    ).toEqual({
      isValid: false,
      count: 0,
      message: "This file doesn't contain any IP rules to import.",
    });
  });
});
