import { describe, expect, it } from "vitest";
import { placeRuleIds } from "./rule-placement";

describe("rule placement", () => {
  it("moves a rule before all peers", () => {
    expect(placeRuleIds(["a", "b", "c"], "c", "first")).toEqual(["c", "a", "b"]);
  });

  it("moves a rule after the selected peer", () => {
    expect(placeRuleIds(["a", "b", "c"], "a", "after:b")).toEqual(["b", "a", "c"]);
  });

  it("moves a rule to the end", () => {
    expect(placeRuleIds(["a", "b", "c"], "a", "last")).toEqual(["b", "c", "a"]);
  });

  it("uses the end when the selected peer no longer exists", () => {
    expect(placeRuleIds(["a", "b", "c"], "a", "after:missing")).toEqual(["b", "c", "a"]);
  });
});
