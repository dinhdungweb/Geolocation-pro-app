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
});
