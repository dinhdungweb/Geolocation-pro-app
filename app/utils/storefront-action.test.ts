import { describe, expect, it } from "vitest";
import { getActionForRule } from "./storefront-action";

describe("getActionForRule", () => {
  it("takes no storefront action for allow rules", () => {
    expect(getActionForRule({ ruleType: "allow", redirectMode: "auto_redirect" })).toBe("none");
    expect(getActionForRule({ ruleType: "allow", redirectMode: "popup" })).toBe("none");
  });

  it("blocks for block rules", () => {
    expect(getActionForRule({ ruleType: "block", redirectMode: "popup" })).toBe("block");
  });

  it("maps redirect rules to their redirect mode", () => {
    expect(getActionForRule({ ruleType: "redirect", redirectMode: "auto_redirect" })).toBe("auto_redirect");
    expect(getActionForRule({ ruleType: "redirect", redirectMode: "popup" })).toBe("popup");
    expect(getActionForRule({ ruleType: "redirect", redirectMode: null })).toBe("popup");
  });
});
