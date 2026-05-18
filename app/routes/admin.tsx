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
    <div className="admin-shell">
      <div
        className={`admin-overlay ${isSidebarOpen ? "is-visible" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`admin-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand-mark">
            <span className="brand-icon">
              <Globe size={18} />
            </span>
            <div>
              <strong>GeoAdmin</strong>
              <small>Operations</small>
            </div>
          </div>

          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          {menuItems.map((item) => {
            if (item.children) {
              const isOpen = openMenus.includes(item.label);
              const hasActiveChild = item.children.some((child) =>
                child.end
                  ? location.pathname === child.to
                  : location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
              );

              return (
                <div className="nav-group" key={item.label}>
                  <button
                    className={`nav-row nav-parent ${isOpen ? "is-open" : ""} ${
                      hasActiveChild ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => toggleMenu(item.label)}
                  >
                    <span className="nav-main">
                      <span className="nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    <ChevronDown size={15} />
                  </button>

                  {isOpen ? (
                    <div className="subnav">
                      {item.children.map((child) => (
                        <NavLink
                          className={({ isActive }) =>
                            `subnav-link ${isActive ? "is-active" : ""}`
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
                className={({ isActive }) => `nav-row ${isActive ? "is-active" : ""}`}
                end={item.end}
                key={item.to}
                to={item.to}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-account">
          <div className="account-avatar">{(username?.[0] || "A").toUpperCase()}</div>
          <div className="account-copy">
            <span>{username || "Admin"}</span>
            <small>Signed in</small>
          </div>
          <Form action="/admin/logout" method="post">
            <button className="icon-button logout-button" type="submit" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </Form>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>

            <div className="page-title-block">
              <span>Admin console</span>
              <h1>{pageTitle}</h1>
            </div>
            <label className="global-search">
              <Search size={18} color="#94a3b8" />
              <input type="search" placeholder="Search anything..." />
            </label>
          </div>

          <div className="topbar-tools">

            <div className="system-state">
              <Activity size={14} />
              <span>Live</span>
            </div>

            <time className="topbar-date">
              {isMounted
                ? new Date().toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                : "..."}
            </time>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --admin-bg: #f4f7fb;
          --admin-panel: #ffffff;
          --admin-panel-soft: #f8fafc;
          --admin-text: #1e293b;
          --admin-muted: #64748b;
          --admin-faint: #94a3b8;
          --admin-border: #f1f5f9;
          --admin-border-soft: #f8fafc;
          --admin-primary: #0ea5e9;
          --admin-primary-soft: #e0f2fe;
          --admin-success: #10b981;
          --admin-warning: #f59e0b;
          --admin-danger: #ef4444;
          --admin-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
          --sidebar-width: 260px;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-width: 0;
          background: var(--admin-bg);
          color: var(--admin-text);
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        a {
          color: inherit;
        }

        .admin-shell {
          min-height: 100vh;
          background:
            linear-gradient(180deg, rgba(248, 250, 252, 0.9) 0%, rgba(245, 247, 251, 0) 320px),
            var(--admin-bg);
          color: var(--admin-text);
        }

        .admin-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 40;
          width: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          background: #ffffff;
          color: var(--admin-text);
          border-right: 1px solid var(--admin-border);
        }

        .sidebar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 72px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--admin-border);
        }

        .brand-mark {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .brand-icon {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: 8px;
          background: #ffffff;
          color: var(--admin-primary);
        }

        .brand-mark strong,
        .brand-mark small {
          display: block;
          line-height: 1.2;
        }

        .brand-mark strong {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0f172a;
        }

        .brand-mark small {
          margin-top: 1px;
          color: var(--admin-muted);
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .icon-button {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: 8px;
          border: 1px solid var(--admin-border);
          background: #ffffff;
          color: #344054;
          transition: none;
        }

        .icon-button:hover {
          border-color: #b9c5d6;
          background: #f8fafc;
        }

        .sidebar-close {
          display: none;
          border-color: rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }

        .sidebar-nav {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px 12px;
        }

        .nav-row {
          width: 100%;
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          margin-bottom: 4px;
          border: none;
          border-radius: 12px;
          background: transparent;
          color: var(--admin-muted);
          text-decoration: none;
          font-size: 13.5px;
          font-weight: 600;
          text-align: left;
          line-height: 1.25;
          transition: all 0.2s ease;
        }

        .nav-row:hover {
          background: #f8fafc;
          color: #0f172a;
        }

        .nav-row.is-active {
          background: var(--admin-primary-soft);
          color: var(--admin-primary);
        }

        .nav-row.is-active .nav-icon {
          color: var(--admin-primary);
        }

        .nav-icon {
          width: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          color: var(--admin-faint);
        }

        .nav-parent {
          justify-content: space-between;
        }

        .nav-parent > svg {
          transition: transform 120ms ease;
        }

        .nav-parent.is-open > svg {
          transform: rotate(180deg);
        }

        .nav-main {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .subnav {
          display: grid;
          gap: 2px;
          margin: 2px 0 8px 31px;
          padding-left: 10px;
          border-left: 1px solid var(--admin-border);
        }

        .subnav-link {
          display: block;
          padding: 8px 10px;
          border-radius: 8px;
          color: var(--admin-faint);
          text-decoration: none;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.2;
          transition: all 0.2s ease;
        }

        .subnav-link:hover {
          color: var(--admin-text);
          background: #f8fafc;
        }

        .subnav-link.is-active {
          color: var(--admin-primary);
          background: transparent;
          font-weight: 700;
        }

        .sidebar-account {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 38px;
          align-items: center;
          gap: 10px;
          margin: 12px;
          padding: 12px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid var(--admin-border);
        }

        .account-avatar {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: var(--admin-primary-soft);
          color: var(--admin-primary);
          font-size: 14px;
          font-weight: 800;
        }

        .account-copy {
          min-width: 0;
        }

        .account-copy span,
        .account-copy small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .account-copy span {
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
        }

        .account-copy small {
          margin-top: 2px;
          color: var(--admin-faint);
          font-size: 11px;
          font-weight: 500;
        }

        .logout-button {
          border-color: transparent;
          background: transparent;
          color: var(--admin-muted);
        }

        .logout-button:hover {
          background: #fee2e2;
          color: #ef4444;
        }

        .admin-main {
          min-width: 0;
          min-height: 100vh;
          margin-left: var(--sidebar-width);
        }

        .admin-topbar {
          position: sticky;
          top: 0;
          z-index: 30;
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 32px;
          border-bottom: 1px solid var(--admin-border);
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(12px);
        }

        .topbar-left,
        .topbar-tools {
          display: flex;
          align-items: center;
          min-width: 0;
        }

        .topbar-left {
          gap: 16px;
        }

        .topbar-tools {
          justify-content: flex-end;
          gap: 16px;
        }

        .menu-button {
          display: none;
        }

        .page-title-block {
          min-width: 0;
        }

        .page-title-block span {
          display: none;
        }

        .page-title-block h1 {
          margin: 0;
          color: var(--admin-text);
          font-size: 20px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }

        .global-search {
          width: min(34vw, 420px);
          height: 44px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 16px;
          border: none;
          border-radius: 12px;
          background: #f1f5f9;
          color: var(--admin-muted);
        }

        .global-search input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: 0;
          color: var(--admin-text);
          background: transparent;
          font-size: 14px;
          font-weight: 500;
        }

        .system-state {
          height: 34px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0 10px;
          border: 1px solid #abefc6;
          border-radius: 999px;
          background: #ecfdf3;
          color: var(--admin-success);
          font-size: 12px;
          font-weight: 750;
          white-space: nowrap;
        }

        .topbar-date {
          color: var(--admin-muted);
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        .admin-content {
          width: 100%;
          max-width: 1560px;
          margin: 0 auto;
          padding: 24px 28px 44px;
        }

        .admin-overlay {
          display: none;
        }

        /* Shared admin data surface. This intentionally sits after child routes. */
        .admin-content h1,
        .admin-content h2,
        .admin-content h3 {
          color: var(--admin-text);
          letter-spacing: 0;
        }

        .admin-content h1 {
          font-size: clamp(20px, 2.1vw, 28px);
          line-height: 1.2;
        }

        .admin-content h2 {
          font-size: 18px;
          line-height: 1.25;
        }

        .admin-content h3 {
          font-size: 15px;
          line-height: 1.3;
        }

        .admin-content p {
          color: var(--admin-muted);
          line-height: 1.5;
        }

        .admin-content table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
        }

        .admin-content th {
          background: #f8fafc !important;
          color: #475467 !important;
          border-bottom: 1px solid var(--admin-border) !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          letter-spacing: 0.04em !important;
          text-transform: uppercase !important;
        }

        .admin-content td {
          color: #1d2939;
          border-bottom: 1px solid var(--admin-border-soft);
          font-size: 13px;
        }

        .admin-content th,
        .admin-content td {
          padding: 12px 14px !important;
          vertical-align: middle;
        }

        .admin-content tr:hover td {
          background: #fbfdff !important;
        }

        .admin-content input,
        .admin-content select,
        .admin-content textarea {
          border-radius: 8px !important;
          border-color: var(--admin-border) !important;
          background-color: #ffffff !important;
          color: var(--admin-text) !important;
          box-shadow: none !important;
        }

        .admin-content button,
        .admin-content a[role="button"] {
          border-radius: 8px;
        }

        .premium-card,
        .card-v3,
        .card-premium-v2,
        .shops-table-card,
        .billing-table-card,
        .campaign-table,
        .table-premium,
        .log-table,
        .glass-header,
        .banner-premium,
        .template-card-premium,
        .premium-stat-card,
        .hero-section,
        .modal-content,
        .modal-content-v2,
        .stat-card,
        .metric-card,
        .campaign-card,
        .template-card,
        .automation-card,
        .settings-card,
        .blacklist-card,
        .history-card,
        .chart-card,
        .admin-card,
        .data-card {
          background: var(--admin-panel) !important;
          border: none !important;
          border-radius: 16px !important;
          box-shadow: var(--admin-shadow) !important;
        }

        .glass-header,
        .hero-section,
        .banner-premium {
          background: var(--admin-panel) !important;
          color: var(--admin-text) !important;
        }

        .stat-card,
        .premium-stat-card,
        .stat-box-v2,
        .stat-box-premium,
        .metric-card {
          overflow: hidden;
        }

        .stat-card::before,
        .premium-stat-card::before,
        .stat-box-v2::before,
        .stat-box-premium::before,
        .metric-card::before {
          display: none !important;
        }

        .stat-value,
        .stat-box-v2 .value,
        .stat-box-premium .value,
        .billing-table td,
        .merchant-table td,
        .shops-table td {
          font-variant-numeric: tabular-nums;
        }

        .btn-premium-solid,
        .btn-premium,
        .primary-btn,
        .btn-add,
        .adjust-trigger-btn {
          background: var(--admin-primary) !important;
          color: #ffffff !important;
          border: 1px solid #1d4ed8 !important;
          box-shadow: none !important;
        }

        .btn-premium-solid:hover,
        .btn-premium:hover,
        .primary-btn:hover,
        .btn-add:hover,
        .adjust-trigger-btn:hover {
          background: #1d4ed8 !important;
        }

        .btn-premium-outline,
        .btn-view,
        .back-btn,
        .action-btn,
        .inline-toggle-btn {
          background: #ffffff !important;
          border: 1px solid var(--admin-border) !important;
          color: #344054 !important;
          box-shadow: none !important;
        }

        .btn-premium-outline:hover,
        .btn-view:hover,
        .back-btn:hover,
        .action-btn:hover,
        .inline-toggle-btn:hover {
          border-color: #93c5fd !important;
          color: #1d4ed8 !important;
        }

        .search-box,
        .search-pill input,
        .billing-search,
        .filter-select,
        .b-filter,
        .input-premium,
        .select-premium,
        .billing-input,
        .form-input {
          border-radius: 8px !important;
          border-color: var(--admin-border) !important;
          background: #ffffff !important;
          box-shadow: none !important;
        }

        .table-container,
        .billing-table-wrap,
        .table-premium,
        .campaign-table,
        .log-table,
        .shops-table-card {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        @media (max-width: 1180px) {
          .global-search {
            width: 300px;
          }
        }

        @media (max-width: 960px) {
          .admin-sidebar {
            width: min(86vw, 286px);
            transform: translateX(-100%);
            transition: transform 160ms ease;
          }

          .admin-sidebar.is-open {
            transform: translateX(0);
          }

          .sidebar-close,
          .menu-button {
            display: inline-flex;
          }

          .admin-overlay.is-visible {
            position: fixed;
            inset: 0;
            z-index: 35;
            display: block;
            background: rgba(15, 23, 42, 0.42);
          }

          .admin-main {
            margin-left: 0;
          }

          .admin-topbar {
            height: 60px;
            padding: 0 12px;
          }

          .global-search,
          .topbar-date {
            display: none;
          }

          .admin-content {
            padding: 14px 12px 32px;
          }

          .page-title-block span {
            display: none;
          }

          .page-title-block h1 {
            margin: 0;
            font-size: 17px;
            max-width: calc(100vw - 150px);
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        @media (max-width: 768px) {
          body {
            font-size: 13px;
          }

          .admin-content h1 {
            font-size: 20px !important;
          }

          .admin-content h2 {
            font-size: 16px !important;
          }

          .admin-content h3 {
            font-size: 14px !important;
          }

          .admin-content p,
          .admin-content td,
          .admin-content input,
          .admin-content select,
          .admin-content textarea,
          .admin-content button {
            font-size: 12px !important;
          }

          .admin-content th,
          .admin-content td {
            padding: 10px 12px !important;
            white-space: nowrap;
          }

          .premium-card,
          .card-v3,
          .card-premium-v2,
          .shops-table-card,
          .billing-table-card,
          .campaign-table,
          .table-premium,
          .log-table,
          .glass-header,
          .banner-premium,
          .template-card-premium,
          .premium-stat-card,
          .hero-section,
          .stat-card,
          .metric-card {
            border-radius: 8px !important;
          }

          .premium-card,
          .card-v3-body,
          .stat-card,
          .metric-card,
          .glass-header,
          .banner-premium,
          .hero-section {
            padding: 14px !important;
          }

          .grid-stats,
          .stats-grid-v3,
          .stats-grid-v2,
          .stats-grid-premium,
          .billing-cards,
          .section-grid,
          .metrics-grid-v2,
          .settings-layout-premium,
          .grid-layout,
          .templates-grid-premium {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
            margin-bottom: 16px !important;
          }

          .billing-toolbar,
          .shops-header,
          .header-flex,
          .filters-bar,
          .actions-group,
          .glass-header,
          .hero-section {
            gap: 12px !important;
          }

          .header-flex,
          .filters-bar,
          .actions-group {
            flex-wrap: wrap !important;
          }

          .actions-group > *,
          .filters-bar > * {
            min-width: 0;
          }

          .table-container,
          .billing-table-wrap,
          .table-premium,
          .campaign-table,
          .log-table,
          .shops-table-card {
            max-width: calc(100vw - 24px);
          }

          .btn-premium-solid,
          .btn-premium,
          .primary-btn,
          .btn-add,
          .btn-premium-outline,
          .btn-view,
          .back-btn,
          .action-btn,
          .inline-toggle-btn,
          .filter-select,
          .b-filter {
            min-height: 38px;
          }
        }

        @media (max-width: 480px) {
          .admin-topbar {
            padding: 0 10px;
          }

          .admin-content {
            padding: 10px;
          }

          .system-state span {
            display: none;
          }

          .system-state {
            width: 34px;
            justify-content: center;
            padding: 0;
          }

          .page-title-block h1 {
            max-width: calc(100vw - 122px);
            font-size: 16px;
          }

          .admin-content th,
          .admin-content td {
            padding: 9px 10px !important;
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
    <div className="admin-error-shell">
      <div className="admin-error-card">
        <span>Admin error</span>
        <h1>Something went wrong</h1>
        <p>The admin panel could not load this view.</p>
        <pre>{errorMessage}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .admin-error-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: #f5f7fb;
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .admin-error-card {
          width: min(100%, 620px);
          padding: 26px;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
        }

        .admin-error-card span {
          color: #d92d20;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .admin-error-card h1 {
          margin: 8px 0;
          color: #101828;
          font-size: 24px;
          line-height: 1.2;
        }

        .admin-error-card p {
          margin: 0 0 16px;
          color: #667085;
        }

        .admin-error-card pre {
          max-height: 280px;
          overflow: auto;
          padding: 14px;
          border: 1px solid #fee4e2;
          border-radius: 8px;
          background: #fff3f2;
          color: #b42318;
          white-space: pre-wrap;
        }

        .admin-error-card button {
          min-height: 40px;
          padding: 0 16px;
          border: 1px solid #1d4ed8;
          border-radius: 8px;
          background: #2563eb;
          color: #ffffff;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
