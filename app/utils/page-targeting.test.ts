import { describe, expect, it } from "vitest";
import {
  normalizePagePathPattern,
  normalizePagePathPatterns,
  splitPagePathPatterns,
} from "./page-targeting";

describe("page targeting", () => {
  it.each([
    ["", ""],
    ["products", "/products"],
    ["/products/*", "/products/*"],
    ["https://shop.example/products/item?ref=ad#details", "/products/item"],
    ["shop.example/collections/sale", "/collections/sale"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizePagePathPattern(input)).toBe(expected);
  });

  it("splits comma and newline separated patterns", () => {
    expect(splitPagePathPatterns("products,\n /collections/*,\nhttps://shop.test/pages/about")).toEqual([
      "/products",
      "/collections/*",
      "/pages/about",
    ]);
  });

  it("removes blank entries and emits one normalized path per line", () => {
    expect(normalizePagePathPatterns(" products, ,\ncollections/sale ")).toBe(
      "/products\n/collections/sale",
    );
  });
});
