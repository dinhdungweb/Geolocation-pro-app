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
  Inbox,
  LogOut,
  Mail,
  Menu,
  Moon,
  Rocket,
  Search,
  ShoppingBag,
  Star,
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

            <div className="ed-topbar-icon-group" aria-hidden="true">
              <span className="ed-topbar-icon">
                <Moon size={18} />
              </span>
              <span className="ed-topbar-icon has-badge">
                <Bell size={18} />
                <span>3</span>
              </span>
              <span className="ed-topbar-icon">
                <Star size={18} />
              </span>
              <span className="ed-topbar-icon">
                <ShoppingBag size={18} />
              </span>
              <span className="ed-topbar-icon has-badge orange">
                <Inbox size={18} />
                <span>3</span>
              </span>
            </div>

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
                <small>UI Designer</small>
              </span>
            </div>
          </div>
        </header>

        <main className="ed-admin-content">
          <Outlet />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

        :root {
          --ed-font-primary: "Outfit", sans-serif;
          --ed-font-size-base: 14px;
          --ed-font-weight-base: 400;
          --ed-line-height-base: 21px;

          --ed-font-size-xs: 12px;
          --ed-font-size-sm: 13px;
          --ed-font-size-md: 14px;
          --ed-font-size-lg: 15px;
          --ed-font-size-xl: 16px;
          --ed-font-size-2xl: 20px;
          --ed-font-size-3xl: 22px;
          --ed-font-size-4xl: 26px;

          --ed-color-text-primary: #3d3d47;
          --ed-color-border-muted: #43b9b2;
          --ed-color-accent-soft: #e8fbfa;
          --ed-color-accent-active: #0a9f98;
          --ed-color-text-tertiary: #767676;
          --ed-color-surface-base: #000000;
          --ed-color-surface-muted: #f4f5f8;
          --ed-color-surface-strong: #ffffff;
          --ed-content-padding-mobile: 15px;
          --ed-card-padding-mobile: 15px;

          --ed-space-1: 5px;
          --ed-space-2: 20px;
          --ed-space-3: 24px;
          --ed-space-4: 28px;
          --ed-space-5: 32px;
          --ed-space-6: 40px;
          --ed-space-7: 48px;
          --ed-space-8: 64px;

          --ed-radius-xs: 3.5px;
          --ed-radius-sm: 3.75px;
          --ed-radius-md: 5px;
          --ed-radius-lg: 6px;
          --ed-radius-xl: 10px;
          --ed-radius-2xl: 50px;
          --ed-radius-step7: 60px;
          --ed-radius-step8: 100px;

          --ed-shadow-1: rgba(0, 0, 0, 0.1) 0px 36px 35px 0px;
          --ed-shadow-2: rgba(10, 75, 85, 0.05) 0px 4px 34px 0px;

          --ed-motion-instant: 300ms;
          --ed-motion-fast: 500ms;
          --ed-motion-normal: 1000ms;

          --ed-sidebar-width: 252px;
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
          outline: 2px solid var(--ed-color-border-muted);
          outline-offset: 2px;
        }

        .ed-admin-shell {
          min-height: 100vh;
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-tertiary);
        }

        .ed-admin-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 40;
          width: var(--ed-sidebar-width);
          display: flex;
          flex-direction: column;
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-tertiary);
          border-right: 1px solid var(--ed-color-surface-muted);
        }

        .ed-sidebar-head {
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 16px;
          border-bottom: 1px solid var(--ed-color-surface-muted);
        }

        .ed-brand {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 10px;
        }

        .ed-brand-icon {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: 10px;
          background: #e4fbf9;
          color: var(--ed-color-border-muted);
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
          font-size: 22px;
          font-weight: 800;
          line-height: 22px;
          letter-spacing: 0;
        }

        .ed-brand-copy small {
          margin-top: 2px;
          color: var(--ed-color-border-muted);
          font-size: 11px;
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
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        .ed-icon-button:hover {
          border-color: var(--ed-color-border-muted);
          background: var(--ed-color-surface-muted);
        }

        .ed-icon-button:active {
          background: #eef2ed;
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
          padding: 14px 16px;
        }

        .ed-nav-row {
          width: 100%;
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 4px;
          border: 1px solid transparent;
          border-radius: var(--ed-radius-xl);
          background: transparent;
          color: #535768;
          text-decoration: none;
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
          line-height: 18px;
          text-align: left;
          transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        .ed-nav-row:hover {
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
        }

        .ed-nav-row:active {
          background: #eaf7f6;
        }

        .ed-nav-row.is-active {
          border-color: #d7f5f3;
          background: #e5fbf9;
          color: var(--ed-color-accent-active);
          box-shadow: none;
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
          transition: transform 120ms ease;
        }

        .ed-nav-parent.is-open > svg {
          transform: rotate(180deg);
        }

        .ed-nav-main {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: 10px;
        }

        .ed-subnav {
          display: grid;
          gap: var(--ed-space-1);
          margin: 2px 0 10px 26px;
          padding-left: 10px;
          border-left: 1px dashed var(--ed-color-border-muted);
        }

        .ed-subnav-link {
          display: block;
          padding: 8px 10px;
          border-radius: var(--ed-radius-xl);
          color: #6f7282;
          text-decoration: none;
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 16px;
        }

        .ed-subnav-link:hover,
        .ed-subnav-link:focus-visible {
          color: var(--ed-color-accent-active);
          background: #f2fbfa;
        }

        .ed-subnav-link.is-active {
          color: var(--ed-color-accent-active);
          background: #e5fbf9;
        }

        .ed-sidebar-account {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 10px;
          margin: 16px;
          padding: 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-account-avatar {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-border-muted);
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
          font-size: 11px;
          line-height: 15px;
        }

        .ed-logout-button {
          border-color: var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-tertiary);
        }

        .ed-logout-button:hover {
          border-color: #ffc4bd;
          background: #fff1f0;
          color: #c62828;
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
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 0 32px;
          border-bottom: 1px solid var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
        }

        .ed-topbar-left,
        .ed-topbar-tools {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .ed-topbar-left {
          flex: 1;
          gap: 18px;
        }

        .ed-topbar-tools {
          justify-content: flex-end;
          gap: 14px;
        }

        .ed-menu-button {
          display: none;
          border-color: transparent;
          background: transparent;
        }

        .ed-menu-button:hover {
          border-color: transparent;
          background: var(--ed-color-surface-muted);
        }

        .ed-menu-button:active {
          background: #eef2ed;
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
          font-size: 11px;
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
          font-size: 20px;
          font-weight: 700;
          line-height: 24px;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .ed-global-search {
          width: min(48vw, 595px);
          min-height: 48px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 0 18px;
          border: 1px solid transparent;
          border-radius: 0;
          background: var(--ed-color-surface-muted);
          color: #5b5f70;
        }

        .ed-global-search:focus-within {
          border-color: #c7f1ee;
          background: var(--ed-color-surface-strong);
          box-shadow: 0 0 0 4px rgba(32, 191, 184, 0.09);
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
          color: #8b8f9f;
        }

        .ed-topbar-icon-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ed-topbar-icon {
          position: relative;
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 0;
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
        }

        .ed-topbar-icon:hover {
          background: var(--ed-color-accent-soft);
          color: var(--ed-color-accent-active);
        }

        .ed-topbar-icon span {
          position: absolute;
          top: -7px;
          right: -5px;
          min-width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 5px;
          border-radius: 999px;
          background: #b86adf;
          color: var(--ed-color-surface-strong);
          font-size: 10px;
          font-weight: 800;
          line-height: 18px;
        }

        .ed-topbar-icon.orange span {
          background: #ff7d45;
        }

        .ed-system-state {
          height: 36px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0 10px;
          border: 1px solid #c8f4f1;
          border-radius: 4px;
          background: var(--ed-color-accent-soft);
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
          gap: 10px;
          min-width: 160px;
        }

        .ed-user-avatar {
          width: 46px;
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: 10px;
          background: linear-gradient(135deg, #ff9d78, #b86adf);
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
          padding: 32px;
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
          font-size: 24px;
          line-height: 30px;
        }

        .ed-admin-content h2 {
          font-size: 20px;
          line-height: 26px;
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
          background: #f6f8f5 !important;
          color: var(--ed-color-text-tertiary) !important;
          border-bottom: 1px solid var(--ed-color-surface-muted) !important;
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
          border-bottom: 1px solid #edf0f2;
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-admin-content th,
        .ed-admin-content td {
          padding: 12px 14px !important;
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
          border-radius: var(--ed-radius-xl) !important;
          border: 1px solid var(--ed-color-surface-muted) !important;
          background-color: var(--ed-color-surface-strong) !important;
          color: var(--ed-color-text-primary) !important;
          box-shadow: none !important;
        }

        .ed-admin-content input:focus,
        .ed-admin-content select:focus,
        .ed-admin-content textarea:focus {
          outline: 2px solid var(--ed-color-border-muted) !important;
          outline-offset: 2px !important;
          border-color: var(--ed-color-border-muted) !important;
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
          border-radius: var(--ed-radius-xl);
        }

        .ed-admin-content [aria-busy="true"],
        .ed-admin-content .is-loading {
          cursor: progress;
          opacity: 0.7;
        }

        .ed-admin-content .has-error,
        .ed-admin-content [aria-invalid="true"] {
          border-color: #ef4444 !important;
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
          border-color: #edf0f5 !important;
          background: var(--ed-color-surface-strong) !important;
          box-shadow: var(--ed-shadow-2) !important;
        }

        .ed-admin-content .ed-panel:hover,
        .ed-admin-content .ed-metric-card:hover,
        .ed-admin-content .ed-table-card:hover,
        .ed-admin-content .ed-billing-table-card:hover,
        .ed-admin-content .ed-shop-card:hover,
        .ed-admin-content .template-item:hover {
          border-color: #d9f3f1 !important;
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
          border-color: var(--ed-color-border-muted) !important;
          background: var(--ed-color-border-muted) !important;
          color: var(--ed-color-surface-strong) !important;
          box-shadow: 0 8px 18px rgba(32, 191, 184, 0.22) !important;
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
          border-color: #edf0f5 !important;
          background: var(--ed-color-surface-muted) !important;
        }

        .ed-admin-content .ed-day-cell.has-activity {
          border-color: var(--ed-color-border-muted) !important;
          background: #f2fffe !important;
        }

        @media (max-width: 960px) {
          .ed-admin-sidebar {
            width: min(86vw, 286px);
            transform: translateX(-100%);
            transition: transform 160ms ease;
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
            gap: 10px;
            padding: 0 14px;
          }

          .ed-admin-content {
            padding: var(--ed-content-padding-mobile);
          }

          .ed-global-search,
          .ed-topbar-icon-group,
          .ed-user-chip,
          .ed-topbar-date {
            display: none;
          }

          .ed-topbar-left {
            flex: 0 0 auto;
            gap: 10px;
          }

          .ed-topbar-tools {
            flex: 1;
            min-width: 0;
            justify-content: flex-end;
            gap: 10px;
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
            padding: var(--ed-card-padding-mobile) !important;
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
          padding: 20px;
          background: var(--ed-color-surface-muted);
          color: #545454;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        }

        .ed-error-card {
          width: min(100%, 620px);
          padding: 20px;
          border: 1px solid #dfe4e8;
          border-radius: 4px;
          background: var(--ed-color-surface-strong);
        }

        .ed-error-card span {
          color: #c62828;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ed-error-card h1 {
          margin: 5px 0;
          color: #222222;
          font-size: 24px;
          line-height: 30px;
        }

        .ed-error-card p {
          margin: 0 0 20px;
        }

        .ed-error-card pre {
          max-height: 280px;
          overflow: auto;
          padding: 14px;
          border: 1px solid #efc8c8;
          border-radius: 4px;
          background: #fff8f8;
          color: #9b1c1c;
          white-space: pre-wrap;
        }

        .ed-error-card button {
          min-height: 40px;
          padding: 0 16px;
          border: 1px solid #82b440;
          border-radius: 4px;
          background: #82b440;
          color: var(--ed-color-surface-strong);
          font-weight: 700;
          box-shadow: rgb(111, 154, 55) 0px 2px 0px 0px;
        }
      `}</style>
    </div>
  );
}
