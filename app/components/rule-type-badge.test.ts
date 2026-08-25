import { describe, expect, it } from "vitest";
import { getRuleTypeBadgeTone } from "./rule-type-badge";

describe("getRuleTypeBadgeTone", () => {
  it("uses the attention tone for block rules", () => {
    expect(getRuleTypeBadgeTone("block")).toBe("attention");
    expect(getRuleTypeBadgeTone("Block")).toBe("attention");
  });

  it("uses the info tone for redirect rules", () => {
    expect(getRuleTypeBadgeTone("redirect")).toBe("info");
    expect(getRuleTypeBadgeTone("Redirect")).toBe("info");
  });
});
