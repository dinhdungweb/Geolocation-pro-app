import { describe, expect, it } from "vitest";
import { adminSessionStorage } from "./admin.session.server";

describe("admin session cookie", () => {
  it("is available to React Router .data requests", async () => {
    const session = await adminSessionStorage.getSession();
    session.set("admin_logged_in", true);

    const setCookie = await adminSessionStorage.commitSession(session);

    expect(setCookie).toContain("__geo_admin_session_v2=");
    expect(setCookie).toMatch(/(?:^|;\s*)Path=\/(?:;|$)/);
    expect(setCookie).not.toContain("Path=/admin");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=28800");
  });

  it("round-trips an authenticated admin session through the signed cookie", async () => {
    const session = await adminSessionStorage.getSession();
    session.set("admin_logged_in", true);
    session.set("admin_username", "integration-admin");

    const setCookie = await adminSessionStorage.commitSession(session);
    const cookieHeader = setCookie.split(";")[0];
    const restored = await adminSessionStorage.getSession(cookieHeader);

    expect(restored.get("admin_logged_in")).toBe(true);
    expect(restored.get("admin_username")).toBe("integration-admin");
  });
});
