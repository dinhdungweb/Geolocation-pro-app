import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  isRouteErrorResponse,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  ChevronDown,
  Globe,
  Home,
  LogOut,
  Mail,
  Menu,
  Rocket,
  Search,
  Store,
  X,
} from "lucide-react";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.pathname === "/admin/login") {
    return json({ username: null });
  }

  const session = await requireAdminAuth(request);
  return json({ username: session.get("admin_username") });
};

function getPageTitle(pathname: string) {
  if (pathname === "/admin") return "System Overview";
  if (pathname.startsWith("/admin/shops")) return "Merchant Operations";
  if (pathname.startsWith("/admin/billing")) return "Billing Control";
  if (pathname.startsWith("/admin/campaigns")) return "Campaigns";
  if (pathname.startsWith("/admin/emails/templates")) return "Email Templates";
  if (pathname.startsWith("/admin/emails/automations")) return "Automations";
  if (pathname.startsWith("/admin/emails/history")) return "Email History";
  if (pathname.startsWith("/admin/emails/blacklist")) return "Blacklist";
  if (pathname.startsWith("/admin/emails/settings")) return "Messaging Settings";
  if (pathname.startsWith("/admin/emails")) return "Messaging";

  return "Admin Console";
}

export default function AdminLayout() {
  const { username } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [openMenus, setOpenMenus] = useState<string[]>([]);

  const isLoginPage = location.pathname === "/admin/login";
  const pageTitle = getPageTitle(location.pathname);

  const menuItems = useMemo(
    () => [
      { label: "Dashboard", to: "/admin", icon: <Home size={18} />, end: true },
      { label: "Shops", to: "/admin/shops", icon: <Store size={18} /> },
      { label: "Billing", to: "/admin/billing", icon: <Activity size={18} /> },
      { label: "Campaigns", to: "/admin/campaigns", icon: <Rocket size={18} /> },
      {
        label: "Messaging",
        icon: <Mail size={18} />,
        children: [
          { label: "Messaging", to: "/admin/emails", end: true },
          { label: "Automations", to: "/admin/emails/automations", end: true },
          { label: "Templates", to: "/admin/emails/templates" },
          { label: "History", to: "/admin/emails/history" },
          { label: "Blacklist", to: "/admin/emails/blacklist" },
          { label: "Settings", to: "/admin/emails/settings" },
        ],
      },
    ],
    [],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const activeParent = menuItems.find((item) =>
      item.children?.some((child) =>
        child.end
          ? location.pathname === child.to
          : location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
      ),
    );

    if (activeParent) {
      setOpenMenus((prev) =>
        prev.includes(activeParent.label) ? prev : [...prev, activeParent.label],
      );
    }
  }, [location.pathname, menuItems]);

  if (isLoginPage) {
    return <Outlet />;
  }

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
    );
  };

  return (
    <div className="ed-admin-shell">
      <div
        className={`ed-admin-overlay ${isSidebarOpen ? "is-visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`ed-admin-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="ed-sidebar-head">
          <div className="ed-brand">
            <span className="ed-brand-icon">
              <Globe size={18} />
            </span>
            <div className="ed-brand-copy">
              <strong>GeoAdmin</strong>
              <small>Operations</small>
            </div>
          </div>

          <button
            className="ed-icon-button ed-sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="ed-sidebar-nav" aria-label="Admin navigation">
          {menuItems.map((item) => {
            if (item.children) {
              const isOpen = openMenus.includes(item.label);
              const hasActiveChild = item.children.some((child) =>
                child.end
                  ? location.pathname === child.to
                  : location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
              );

              return (
                <div className="ed-nav-group" key={item.label}>
                  <button
                    className={`ed-nav-row ed-nav-parent ${isOpen ? "is-open" : ""} ${
                      hasActiveChild ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => toggleMenu(item.label)}
                    aria-expanded={isOpen}
                  >
                    <span className="ed-nav-main">
                      <span className="ed-nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    <ChevronDown size={15} />
                  </button>

                  {isOpen ? (
                    <div className="ed-subnav">
                      {item.children.map((child) => (
                        <NavLink
                          className={({ isActive }) =>
                            `ed-subnav-link ${isActive ? "is-active" : ""}`
                          }
                          end={child.end}
                          key={child.to}
                          to={child.to}
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <NavLink
                className={({ isActive }) => `ed-nav-row ${isActive ? "is-active" : ""}`}
                end={item.end}
                key={item.to}
                to={item.to}
              >
                <span className="ed-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="ed-sidebar-account">
          <div className="ed-account-avatar">{(username?.[0] || "A").toUpperCase()}</div>
          <div className="ed-account-copy">
            <span>{username || "Admin"}</span>
            <small>Signed in</small>
          </div>
          <Form action="/admin/logout" method="post">
            <button className="ed-icon-button ed-logout-button" type="submit" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </Form>
        </div>
      </aside>

      <div className="ed-admin-main">
        <header className="ed-admin-topbar">
          <div className="ed-topbar-left">
            <button
              className="ed-icon-button ed-menu-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>

            <div className="ed-page-title">
              <span>Admin Console</span>
              <h1>{pageTitle}</h1>
            </div>

            <label className="ed-global-search">
              <Search size={20} />
              <input type="search" placeholder="Search anything..." aria-label="Search admin" />
            </label>
          </div>

          <div className="ed-topbar-tools">
            <div className="ed-mobile-title">
              <span>Admin</span>
              <strong>{pageTitle}</strong>
            </div>

            <button className="ed-topbar-action" type="button" aria-label="Open notifications">
              <Bell size={18} />
              <span>3</span>
            </button>

            <div className="ed-system-state">
              <Activity size={14} />
              <span>Live</span>
            </div>

            <time className="ed-topbar-date">
              {isMounted
                ? new Date().toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                : "..."}
            </time>

            <div className="ed-user-chip">
              <span className="ed-user-avatar">{(username?.[0] || "A").toUpperCase()}</span>
              <span className="ed-user-copy">
                <strong>{username || "Admin"}</strong>
                <small>Administrator</small>
              </span>
            </div>
          </div>
        </header>

        <main className="ed-admin-content">
          <Outlet />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&display=swap');

        :root {
          --ed-font-primary: "Inter Tight", Roboto, Arial, sans-serif;
          --ed-font-size-base: 14px;
          --ed-font-weight-base: 400;
          --ed-line-height-base: 21px;

          --ed-font-size-xs: 10px;
          --ed-font-size-sm: 12px;
          --ed-font-size-md: 14px;
          --ed-font-size-lg: 16px;
          --ed-font-size-xl: 18px;
          --ed-font-size-2xl: 18.2px;
          --ed-font-size-3xl: 21px;

          --ed-color-text-primary: #1d232e;
          --ed-color-text-secondary: #83868c;
          --ed-color-text-tertiary: #393d3e;
          --ed-color-text-inverse: #1a2f36;
          --ed-color-surface-base: #000000;
          --ed-color-surface-muted: #ffffff;
          --ed-color-surface-raised: #f3f4f6;
          --ed-color-surface-strong: #f6f6f6;
          --ed-color-border-muted: #d8dbe1;
          --ed-color-border-soft: #e8eaee;
          --ed-color-accent-soft: #eef1f4;
          --ed-color-accent-active: var(--ed-color-text-inverse);
          --ed-color-warning: #b45309;
          --ed-color-danger: #b42318;
          --ed-text-inverse: #ffffff;
          --ed-content-padding-mobile: var(--ed-space-8);
          --ed-card-padding-mobile: var(--ed-space-8);

          --ed-space-1: 1px;
          --ed-space-2: 3px;
          --ed-space-3: 5px;
          --ed-space-4: 6px;
          --ed-space-5: 8px;
          --ed-space-6: 10px;
          --ed-space-7: 12px;
          --ed-space-8: 16px;
          --ed-card-padding: var(--ed-space-8);

          --ed-radius-xs: 4px;
          --ed-radius-sm: 6px;
          --ed-radius-md: 8px;
          --ed-radius-lg: 14px;
          --ed-radius-xl: 50px;
          --ed-radius-2xl: 50px;
          --ed-radius-step7: 50px;
          --ed-radius-step8: 50px;

          --ed-shadow-1: rgba(29, 35, 46, 0.08) 0 16px 30px 0;
          --ed-shadow-2: rgba(29, 35, 46, 0.05) 0 6px 20px 0;

          --ed-motion-instant: 200ms;
          --ed-motion-fast: 200ms;
          --ed-motion-normal: 200ms;

          --ed-sidebar-width: 248px;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-width: 0;
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          font-family: var(--ed-font-primary);
          font-size: var(--ed-font-size-md);
          font-weight: var(--ed-font-weight-base);
          line-height: var(--ed-line-height-base);
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }

        button,
        input,
        select,
        textarea {
          font-family: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled,
        input:disabled,
        select:disabled,
        textarea:disabled,
        [aria-disabled="true"] {
          cursor: not-allowed;
          opacity: 0.58;
        }

        a {
          color: inherit;
        }

        :focus-visible {
          outline: 2px solid var(--ed-color-text-inverse);
          outline-offset: 2px;
        }

        .ed-admin-shell {
          min-height: 100vh;
          background: var(--ed-color-surface-raised);
          color: var(--ed-color-text-tertiary);
        }

        .ed-admin-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 40;
          width: var(--ed-sidebar-width);
          display: flex;
          flex-direction: column;
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
          border-right: 1px solid var(--ed-color-border-soft);
          box-shadow: var(--ed-shadow-2);
        }

        .ed-sidebar-head {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--ed-space-5) var(--ed-space-4);
          border-bottom: 1px solid var(--ed-color-border-soft);
        }

        .ed-brand {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: var(--ed-space-3);
        }

        .ed-brand-icon {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-inverse);
        }

        .ed-brand-copy {
          min-width: 0;
        }

        .ed-brand-copy strong,
        .ed-brand-copy small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-brand-copy strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 800;
          line-height: 22px;
          letter-spacing: 0;
        }

        .ed-brand-copy small {
          margin-top: 2px;
          color: var(--ed-color-text-secondary);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ed-icon-button {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          transition: background-color var(--ed-motion-instant) ease, border-color var(--ed-motion-instant) ease, color var(--ed-motion-instant) ease;
        }

        .ed-icon-button:hover {
          border-color: var(--ed-color-text-inverse);
          background: var(--ed-color-surface-strong);
        }

        .ed-icon-button:active {
          background: var(--ed-color-accent-soft);
        }

        .ed-sidebar-close {
          display: none;
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
        }

        .ed-sidebar-close:hover {
          border-color: var(--ed-color-border-muted);
          background: var(--ed-color-accent-soft);
        }

        .ed-sidebar-nav {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: var(--ed-space-4);
        }

        .ed-nav-row {
          width: 100%;
          min-height: 40px;
          display: flex;
          align-items: center;
          gap: var(--ed-space-6);
          padding: 9px var(--ed-space-3);
          margin-bottom: var(--ed-space-1);
          border: 1px solid transparent;
          border-radius: var(--ed-radius-lg);
          background: transparent;
          color: var(--ed-color-text-secondary);
          text-decoration: none;
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 18px;
          text-align: left;
          transition: background-color var(--ed-motion-instant) ease, border-color var(--ed-motion-instant) ease, color var(--ed-motion-instant) ease;
        }

        .ed-nav-row:hover {
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
        }

        .ed-nav-row:active {
          background: var(--ed-color-accent-soft);
        }

        .ed-nav-row.is-active {
          border-color: var(--ed-color-text-inverse);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-accent-active);
          box-shadow: inset 3px 0 0 var(--ed-color-text-inverse);
        }

        .ed-nav-icon {
          width: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }

        .ed-nav-parent {
          justify-content: space-between;
        }

        .ed-nav-parent > svg {
          transition: transform var(--ed-motion-instant) ease;
        }

        .ed-nav-parent.is-open > svg {
          transform: rotate(180deg);
        }

        .ed-nav-main {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: var(--ed-space-6);
        }

        .ed-subnav {
          display: grid;
          gap: var(--ed-space-1);
          margin: 2px 0 var(--ed-space-3) 26px;
          padding-left: var(--ed-space-3);
          border-left: 1px dashed var(--ed-color-border-muted);
        }

        .ed-subnav-link {
          display: block;
          padding: 8px 10px;
          border-radius: var(--ed-radius-md);
          color: var(--ed-color-text-secondary);
          text-decoration: none;
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 16px;
        }

        .ed-subnav-link:hover,
        .ed-subnav-link:focus-visible {
          color: var(--ed-color-accent-active);
          background: var(--ed-color-surface-strong);
        }

        .ed-subnav-link.is-active {
          color: var(--ed-color-accent-active);
          background: var(--ed-color-surface-strong);
        }

        .ed-sidebar-account {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 38px;
          align-items: center;
          gap: var(--ed-space-6);
          margin: var(--ed-space-4);
          padding: var(--ed-space-3);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-surface-muted);
        }

        .ed-account-avatar {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-text-inverse);
          color: var(--ed-text-inverse);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
        }

        .ed-account-copy {
          min-width: 0;
        }

        .ed-account-copy span,
        .ed-account-copy small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-account-copy span {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-account-copy small {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 15px;
        }

        .ed-logout-button {
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
        }

        .ed-logout-button:hover {
          border-color: var(--ed-color-danger);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-danger);
        }

        .ed-admin-main {
          min-width: 0;
          min-height: 100vh;
          margin-left: var(--ed-sidebar-width);
        }

        .ed-admin-topbar {
          position: sticky;
          top: 0;
          z-index: 30;
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ed-space-6);
          padding: 0 var(--ed-space-7);
          border-bottom: 1px solid var(--ed-color-border-soft);
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(14px);
        }

        .ed-topbar-left,
        .ed-topbar-tools {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .ed-topbar-left {
          flex: 1;
          gap: var(--ed-space-5);
        }

        .ed-topbar-tools {
          justify-content: flex-end;
          gap: var(--ed-space-4);
        }

        .ed-menu-button {
          display: none;
          border-color: transparent;
          background: transparent;
        }

        .ed-menu-button:hover {
          border-color: transparent;
          background: var(--ed-color-surface-strong);
        }

        .ed-menu-button:active {
          background: var(--ed-color-accent-soft);
        }

        .ed-mobile-title {
          display: none;
          min-width: 0;
        }

        .ed-mobile-title span,
        .ed-mobile-title strong {
          display: block;
        }

        .ed-mobile-title span {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 14px;
          text-transform: uppercase;
        }

        .ed-mobile-title strong {
          overflow: hidden;
          color: var(--ed-color-text-primary);
          font-size: 16px;
          line-height: 20px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-page-title {
          min-width: 0;
        }

        .ed-page-title span {
          display: block;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          line-height: 16px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .ed-page-title h1 {
          margin: 1px 0 0;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-2xl);
          font-weight: 800;
          line-height: 24px;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .ed-global-search {
          width: min(34vw, 420px);
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: var(--ed-space-3);
          padding: 0 var(--ed-space-4);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-secondary);
        }

        .ed-global-search:focus-within {
          border-color: var(--ed-color-text-inverse);
          background: var(--ed-color-surface-muted);
          box-shadow: 0 0 0 3px var(--ed-color-surface-strong);
        }

        .ed-global-search input {
          min-width: 0;
          width: 100%;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          color: var(--ed-color-text-primary) !important;
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 20px;
          box-shadow: none !important;
        }

        .ed-global-search input::placeholder {
          color: var(--ed-color-text-secondary);
        }

        .ed-topbar-action {
          position: relative;
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          transition: background-color var(--ed-motion-instant) ease, border-color var(--ed-motion-instant) ease, color var(--ed-motion-instant) ease;
        }

        .ed-topbar-action:hover {
          border-color: var(--ed-color-text-inverse);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-accent-active);
        }

        .ed-topbar-action span {
          position: absolute;
          top: -6px;
          right: -6px;
          min-width: 17px;
          height: 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          border-radius: 999px;
          background: var(--ed-color-warning);
          color: var(--ed-text-inverse);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          line-height: 17px;
        }

        .ed-system-state {
          height: 36px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0 var(--ed-space-6);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-accent-active);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          white-space: nowrap;
        }

        .ed-topbar-date {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
          white-space: nowrap;
        }

        .ed-user-chip {
          display: flex;
          align-items: center;
          gap: var(--ed-space-6);
          min-width: 150px;
        }

        .ed-user-avatar {
          width: 46px;
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: var(--ed-radius-lg);
          background: var(--ed-color-surface-base);
          color: var(--ed-color-surface-strong);
          font-size: 18px;
          font-weight: 800;
        }

        .ed-user-copy {
          min-width: 0;
          display: grid;
          gap: 1px;
        }

        .ed-user-copy strong,
        .ed-user-copy small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-user-copy strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 800;
          line-height: 18px;
        }

        .ed-user-copy small {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 16px;
        }

        .ed-admin-content {
          width: 100%;
          max-width: 1640px;
          margin: 0 auto;
          padding: var(--ed-space-6) var(--ed-space-7) var(--ed-space-7);
        }

        .ed-admin-overlay {
          display: none;
        }

        .ed-admin-content h1,
        .ed-admin-content h2,
        .ed-admin-content h3 {
          color: var(--ed-color-text-primary);
          letter-spacing: 0;
        }

        .ed-admin-content h1 {
          font-size: var(--ed-font-size-3xl);
          line-height: 28px;
        }

        .ed-admin-content h2 {
          font-size: var(--ed-font-size-xl);
          line-height: 24px;
        }

        .ed-admin-content h3 {
          font-size: var(--ed-font-size-md);
          line-height: var(--ed-line-height-base);
        }

        .ed-admin-content p {
          color: var(--ed-color-text-tertiary);
          line-height: var(--ed-line-height-base);
        }

        .ed-admin-content table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-admin-content th {
          background: var(--ed-color-surface-raised) !important;
          color: var(--ed-color-text-tertiary) !important;
          border-bottom: 1px solid var(--ed-color-border-soft) !important;
          font-size: var(--ed-font-size-xs) !important;
          font-weight: 700 !important;
          letter-spacing: 0.04em !important;
          line-height: 16px !important;
          text-align: left !important;
          text-transform: uppercase !important;
          white-space: nowrap;
        }

        .ed-admin-content td {
          color: var(--ed-color-text-primary);
          border-bottom: 1px solid var(--ed-color-border-soft);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-admin-content th,
        .ed-admin-content td {
          padding: var(--ed-space-7) var(--ed-space-8) !important;
          vertical-align: middle;
        }

        .ed-admin-content tr:hover td {
          background: var(--ed-color-surface-strong) !important;
        }

        .ed-admin-content .ed-billing-table-card th:nth-child(4),
        .ed-admin-content .ed-billing-table-card th:nth-child(5),
        .ed-admin-content .ed-billing-table-card th:nth-child(6),
        .ed-admin-content .ed-billing-table-card th:nth-child(7),
        .ed-admin-content .ed-billing-table-card th:nth-child(8),
        .ed-admin-content .ed-billing-table-card th:nth-child(9),
        .ed-admin-content .ed-billing-table-card td.ed-number {
          text-align: right !important;
        }

        .ed-admin-content input,
        .ed-admin-content select,
        .ed-admin-content textarea {
          border-radius: var(--ed-radius-lg) !important;
          border: 1px solid var(--ed-color-border-soft) !important;
          background-color: var(--ed-color-surface-muted) !important;
          color: var(--ed-color-text-primary) !important;
          box-shadow: none !important;
        }

        .ed-admin-content input:focus,
        .ed-admin-content select:focus,
        .ed-admin-content textarea:focus {
          outline: 2px solid var(--ed-color-text-inverse) !important;
          outline-offset: 2px !important;
          border-color: var(--ed-color-text-inverse) !important;
        }

        .ed-admin-content .ed-search-field input,
        .ed-admin-content .ed-billing-search input,
        .ed-admin-content .search-pill input {
          appearance: none !important;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .ed-admin-content .ed-search-field input:focus,
        .ed-admin-content .ed-billing-search input:focus,
        .ed-admin-content .search-pill input:focus {
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .ed-admin-content button,
        .ed-admin-content a[role="button"] {
          border-radius: var(--ed-radius-lg);
        }

        .ed-admin-content .ed-mail-row {
          border-radius: 0;
          box-shadow: none;
        }

        .ed-admin-content [aria-busy="true"],
        .ed-admin-content .is-loading {
          cursor: progress;
          opacity: 0.7;
        }

        .ed-admin-content .has-error,
        .ed-admin-content [aria-invalid="true"] {
          border-color: var(--ed-color-danger) !important;
        }

        .ed-admin-content .ed-panel,
        .ed-admin-content .ed-metric-card,
        .ed-admin-content .ed-mail-header,
        .ed-admin-content .ed-campaign-head,
        .ed-admin-content .ed-campaign-panel,
        .ed-admin-content .ed-automation-header,
        .ed-admin-content .ed-automation-table,
        .ed-admin-content .ed-history-head,
        .ed-admin-content .ed-history-table,
        .ed-admin-content .ed-filter-bar,
        .ed-admin-content .ed-settings-card,
        .ed-admin-content .ed-settings-nav,
        .ed-admin-content .ed-blacklist-table,
        .ed-admin-content .ed-blacklist-form,
        .ed-admin-content .ed-table-card,
        .ed-admin-content .ed-billing-table-card,
        .ed-admin-content .ed-billing-stat,
        .ed-admin-content .ed-shop-card,
        .ed-admin-content .ed-shop-stat-card,
        .ed-admin-content .templates-hero,
        .ed-admin-content .template-item {
          border-color: var(--ed-color-border-soft) !important;
          background: var(--ed-color-surface-muted) !important;
          box-shadow: var(--ed-shadow-2) !important;
        }

        .ed-admin-content .ed-panel:hover,
        .ed-admin-content .ed-metric-card:hover,
        .ed-admin-content .ed-table-card:hover,
        .ed-admin-content .ed-billing-table-card:hover,
        .ed-admin-content .ed-shop-card:hover,
        .ed-admin-content .template-item:hover {
          border-color: var(--ed-color-text-inverse) !important;
        }

        .ed-admin-content .ed-panel-icon,
        .ed-admin-content .ed-row-icon,
        .ed-admin-content .ed-metric-icon,
        .ed-admin-content .ed-billing-icon,
        .ed-admin-content .ed-shop-icon {
          background: var(--ed-color-accent-soft) !important;
          color: var(--ed-color-accent-active) !important;
        }

        .ed-admin-content .ed-button-primary,
        .ed-admin-content button[type="submit"].ed-button-primary,
        .ed-admin-content a.ed-button-primary {
          border-color: var(--ed-color-text-inverse) !important;
          background: var(--ed-color-text-inverse) !important;
          color: var(--ed-text-inverse) !important;
          box-shadow: var(--ed-shadow-2) !important;
        }

        .ed-admin-content .ed-button-primary:hover,
        .ed-admin-content button[type="submit"].ed-button-primary:hover,
        .ed-admin-content a.ed-button-primary:hover {
          border-color: var(--ed-color-accent-active) !important;
          background: var(--ed-color-accent-active) !important;
        }

        .ed-admin-content .ed-button-secondary:hover,
        .ed-admin-content .ed-icon-button:hover {
          border-color: var(--ed-color-border-muted) !important;
          color: var(--ed-color-accent-active) !important;
          background: var(--ed-color-accent-soft) !important;
        }

        .ed-admin-content .ed-eyebrow,
        .ed-admin-content .ed-view-icon {
          color: var(--ed-color-accent-active) !important;
        }

        .ed-admin-content .ed-stat-strip div,
        .ed-admin-content .ed-day-cell,
        .ed-admin-content .ed-plan-cell {
          border-color: var(--ed-color-border-soft) !important;
          background: var(--ed-color-surface-muted) !important;
        }

        .ed-admin-content .ed-day-cell.has-activity {
          border-color: var(--ed-color-border-muted) !important;
          background: var(--ed-color-accent-soft) !important;
        }

        @media (max-width: 960px) {
          .ed-admin-sidebar {
            width: min(86vw, 286px);
            transform: translateX(-100%);
            transition: transform var(--ed-motion-instant) ease;
          }

          .ed-admin-sidebar.is-open {
            transform: translateX(0);
          }

          .ed-sidebar-close,
          .ed-menu-button {
            display: inline-flex;
          }

          .ed-admin-overlay.is-visible {
            position: fixed;
            inset: 0;
            z-index: 35;
            display: block;
            background: rgba(0, 0, 0, 0.42);
          }

          .ed-admin-main {
            margin-left: 0;
          }

          .ed-admin-topbar {
            height: 60px;
            gap: var(--ed-space-6);
            padding: 0 14px;
          }

          .ed-admin-content {
            padding: var(--ed-content-padding-mobile);
          }

          .ed-global-search,
          .ed-page-title,
          .ed-topbar-action,
          .ed-user-chip,
          .ed-topbar-date {
            display: none;
          }

          .ed-topbar-left {
            flex: 0 0 auto;
            gap: var(--ed-space-6);
          }

          .ed-topbar-tools {
            flex: 1;
            min-width: 0;
            justify-content: flex-end;
            gap: var(--ed-space-6);
          }

          .ed-mobile-title {
            display: grid;
            flex: 1;
            justify-items: end;
          }

          .ed-mobile-title strong {
            max-width: calc(100vw - 176px);
          }
        }

        @media (max-width: 768px) {
          :root {
            --ed-space-2: 8px;
            --ed-space-3: 12px;
            --ed-space-6: 16px;
          }

          .ed-admin-content .ed-panel,
          .ed-admin-content .ed-metric-card,
          .ed-admin-content .ed-mail-header,
          .ed-admin-content .ed-campaign-head,
          .ed-admin-content .ed-campaign-panel,
          .ed-admin-content .ed-automation-header,
          .ed-admin-content .ed-history-head,
          .ed-admin-content .ed-filter-bar,
          .ed-admin-content .ed-settings-card,
          .ed-admin-content .ed-settings-nav,
          .ed-admin-content .ed-blacklist-form,
          .ed-admin-content .ed-billing-stat,
          .ed-admin-content .ed-shop-card,
          .ed-admin-content .ed-shop-stat-card,
          .ed-admin-content .templates-hero,
          .ed-admin-content .template-item {
            padding: var(--ed-card-padding-mobile) !important;
          }

          .ed-admin-content .ed-table-card,
          .ed-admin-content .ed-billing-table-card,
          .ed-admin-content .ed-shop-table-card,
          .ed-admin-content .ed-automation-table,
          .ed-admin-content .ed-history-table,
          .ed-admin-content .ed-blacklist-table,
          .ed-admin-content .ed-mail-table,
          .ed-admin-content .ed-campaign-table,
          .ed-admin-content .ed-campaign-panel:has(.ed-table-scroll),
          .ed-admin-content .table-container {
            padding: 0 !important;
          }

          .ed-admin-content .ed-tabs {
            margin: calc(var(--ed-card-padding-mobile) * -1) calc(var(--ed-card-padding-mobile) * -1) 0 !important;
            padding: 10px var(--ed-card-padding-mobile) !important;
          }

          .ed-admin-content h1 {
            font-size: 22px !important;
            line-height: 28px !important;
          }

          .ed-admin-content h2 {
            font-size: 18px !important;
            line-height: 24px !important;
          }

          .ed-admin-content p,
          .ed-admin-content td,
          .ed-admin-content input,
          .ed-admin-content select,
          .ed-admin-content textarea,
          .ed-admin-content button {
            font-size: var(--ed-font-size-sm) !important;
          }

          .ed-admin-content th,
          .ed-admin-content td {
            padding: 10px 12px !important;
            white-space: nowrap;
          }

        }

        @media (max-width: 480px) {
          .ed-admin-content {
            padding: var(--ed-content-padding-mobile);
          }

          .ed-system-state span {
            display: none;
          }

          .ed-system-state {
            width: 34px;
            justify-content: center;
            padding: 0;
          }

          .ed-mobile-title strong {
            max-width: calc(100vw - 136px);
            font-size: 15px;
          }
        }
      `}</style>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Admin Error:", error);

  let errorMessage = "An unknown error occurred";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  }

  return (
    <div className="ed-error-shell">
      <div className="ed-error-card">
        <span>Admin error</span>
        <h1>Something went wrong</h1>
        <p>The admin panel could not load this view.</p>
        <pre>{errorMessage}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </div>

      <style>{`
        .ed-error-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: var(--ed-space-8, 16px);
          background: var(--ed-color-surface-raised, #f3f4f6);
          color: var(--ed-color-text-tertiary, #393d3e);
          font-family: var(--ed-font-primary, "Inter Tight", Roboto, Arial, sans-serif);
        }

        .ed-error-card {
          width: min(100%, 620px);
          padding: var(--ed-space-8, 16px);
          border: 1px solid var(--ed-color-border-soft, #e8eaee);
          border-radius: var(--ed-radius-md, 8px);
          background: var(--ed-color-surface-muted, #ffffff);
        }

        .ed-error-card span {
          color: var(--ed-color-danger, #b42318);
          font-size: var(--ed-font-size-sm, 12px);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-error-card h1 {
          margin: 5px 0;
          color: var(--ed-color-text-primary, #1d232e);
          font-size: var(--ed-font-size-3xl, 21px);
          line-height: 30px;
        }

        .ed-error-card p {
          margin: 0 0 20px;
        }

        .ed-error-card pre {
          max-height: 280px;
          overflow: auto;
          padding: var(--ed-space-7, 12px);
          border: 1px solid var(--ed-color-danger, #b42318);
          border-radius: var(--ed-radius-sm, 6px);
          background: var(--ed-color-surface-strong, #f6f6f6);
          color: var(--ed-color-danger, #b42318);
          white-space: pre-wrap;
        }

        .ed-error-card button {
          min-height: 40px;
          padding: 0 var(--ed-space-8, 16px);
          border: 1px solid var(--ed-color-text-inverse, #1a2f36);
          border-radius: var(--ed-radius-sm, 6px);
          background: var(--ed-color-text-inverse, #1a2f36);
          color: var(--ed-text-inverse, #ffffff);
          font-weight: 700;
          box-shadow: var(--ed-shadow-2, rgba(29, 35, 46, 0.05) 0 6px 20px 0);
        }
      `}</style>
    </div>
  );
}
