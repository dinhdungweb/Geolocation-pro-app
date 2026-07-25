import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@shopify/polaris";
import { describe, expect, it, vi } from "vitest";

import { EmbeddedAppProviders } from "./embedded-app-providers";

vi.mock("@shopify/shopify-app-react-router/react", () => ({
  AppProvider: ({
    apiKey,
    children,
  }: {
    apiKey: string;
    children: ReactNode;
  }) =>
    createElement(
      "div",
      { "data-shopify-api-key": apiKey },
      children,
    ),
}));

describe("EmbeddedAppProviders", () => {
  it("provides Polaris i18n while preserving the embedded Shopify provider", () => {
    const markup = renderToStaticMarkup(
      createElement(
        EmbeddedAppProviders,
        {
          apiKey: "test-api-key",
          children: createElement(Button, null, "Provider smoke test"),
        },
      ),
    );

    expect(markup).toContain("Provider smoke test");
    expect(markup).toContain('data-shopify-api-key="test-api-key"');
  });
});
