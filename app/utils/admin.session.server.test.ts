import { describe, expect, it } from "vitest";
import { adminSessionStorage } from "./admin.session.server";

describe("admin session cookie", () => {
  it("is available to React Router .data requests", async () => {
    const session = await adminSessionStorage.getSession();
    session.set("admin_logged_in", true);

    const setCookie = await adminSessionStorage.commitSession(session);

    expect(setCookie).toMatch(/(?:^|;\s*)Path=\/(?:;|$)/);
    expect(setCookie).not.toContain("Path=/admin");
  });
});
