import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, NavLink, Form, useLocation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useEffect, useMemo } from "react";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Home, 
    Store, 
    Rocket, 
    Mail,
    Globe, 
    Search, 
    LogOut, 
    Activity,
    Menu,
    X,
    ChevronDown
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.pathname === "/admin/login") {
        return json({ username: null });
    }
    const session = await requireAdminAuth(request);
    return json({ username: session.get("admin_username") });
};

export default function AdminLayout() {
    const { username } = useLoaderData<typeof loader>();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const isLoginPage = location.pathname === "/admin/login";

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    const menuItems = useMemo(() => [
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
            ]
        },
    ], []);

    const [openMenus, setOpenMenus] = useState<string[]>([]);

    useEffect(() => {
        const activeParent = menuItems.find(item => 
            item.children?.some(child => location.pathname === child.to)
        );
        if (activeParent) {
            setOpenMenus(prev => prev.includes(activeParent.label) ? prev : [...prev, activeParent.label]);
        }
    }, [location.pathname, menuItems]);

    if (isLoginPage) {
        return <Outlet />;
    }

    const toggleMenu = (label: string) => {
        setOpenMenus(prev => 
            prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
        );
    };

    return (
        <div className="admin-shell">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
                
                :root {
                    --primary: #6366f1;
                    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    --bg: #ffffff;
                    --sidebar-bg: #0f172a;
                    --surface: #ffffff;
                    --text: #0f172a;
                    --text-muted: #64748b;
                    --border: #e2e8f0;
                    --sidebar-width: 280px;
                }
                
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                
                body {
                    font-family: 'Be Vietnam Pro', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    background: var(--bg);
                    color: var(--text);
                    -webkit-font-smoothing: antialiased;
                }
                
                button, input, select, textarea {
                    font-family: inherit;
                }
                
                .admin-shell {
                    display: flex;
                    min-height: 100vh;
                }
                
                .sidebar {
                    width: var(--sidebar-width);
                    background: var(--sidebar-bg);
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    height: 100vh;
                    z-index: 1000;
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 10px 0 30px rgba(0,0,0,0.1);
                }
                
                .sidebar-header {
                    padding: 32px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .logo-box-wrap { display: flex; align-items: center; gap: 16px; }

                .logo-box {
                    width: 42px; height: 42px;
                    background: var(--primary-gradient);
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-size: 24px;
                    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
                }
                
                .brand-name { 
                    font-weight: 700; font-size: 20px; color: white; 
                    letter-spacing: -0.02em;
                }
                
                .btn-close-sidebar {
                    display: none;
                    background: none; border: none; color: white; cursor: pointer;
                    padding: 8px; border-radius: 8px;
                }

                .sidebar-nav {
                    padding: 10px 16px;
                    flex: 1;
                    overflow-y: auto;
                }
                
                .nav-link {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 20px;
                    text-decoration: none;
                    color: #94a3b8;
                    font-size: 15px;
                    font-weight: 500;
                    border-radius: 14px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    margin-bottom: 8px;
                }
                
                .nav-link:hover {
                    color: white;
                    background: rgba(255,255,255,0.05);
                }
                
                .nav-link.active {
                    background: var(--primary-gradient);
                    color: white;
                    box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4);
                }
                
                .nav-link.active .icon-wrap { opacity: 1; }

                .nav-toggle-btn {
                    width: 100%;
                    background: none; border: none;
                    display: flex; align-items: center; justify-content: space-between;
                    gap: 14px; padding: 14px 20px;
                    color: #94a3b8; font-size: 15px; font-weight: 500;
                    border-radius: 14px; cursor: pointer; transition: all 0.3s;
                    margin-bottom: 4px;
                }
                .nav-toggle-btn:hover { color: white; background: rgba(255,255,255,0.05); }
                .nav-toggle-btn .chevron { transition: transform 0.3s; }
                .nav-toggle-btn.open .chevron { transform: rotate(180deg); color: var(--primary); }

                .sub-nav {
                    margin-left: 32px;
                    padding-left: 16px;
                    border-left: 1px solid rgba(255,255,255,0.05);
                    margin-bottom: 12px;
                    display: flex; flex-direction: column; gap: 4px;
                }
                .sub-nav-link {
                    padding: 10px 16px;
                    text-decoration: none;
                    color: #64748b; font-size: 14px; font-weight: 500;
                    border-radius: 10px; transition: all 0.2s;
                }
                .sub-nav-link:hover { color: white; background: rgba(255,255,255,0.05); }
                .sub-nav-link.active { color: white; font-weight: 600; background: rgba(99, 102, 241, 0.1); }

                .sidebar-footer {
                    padding: 24px;
                    margin: 16px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                
                .avatar {
                    width: 40px; height: 40px;
                    background: linear-gradient(135deg, #f472b6, #fb7185);
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; font-weight: 700; color: white;
                }
                
                .username { font-size: 14px; font-weight: 600; color: white; overflow: hidden; text-overflow: ellipsis; }

                .btn-logout-alt {
                    width: 100%;
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    color: #f87171;
                    padding: 10px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                .btn-logout-alt:hover { background: rgba(239, 68, 68, 1); color: white; transform: translateY(-1px); }

                .main-container {
                    flex: 1;
                    margin-left: var(--sidebar-width);
                    background: var(--bg);
                    transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    min-width: 0;
                }
                
                .topbar {
                    height: 80px;
                    background: rgba(241, 245, 249, 0.8);
                    backdrop-filter: blur(12px);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 40px;
                    position: sticky; top: 0; z-index: 900;
                    border-bottom: 1px solid var(--border);
                }
                
                .topbar-left { display: flex; align-items: center; gap: 16px; flex: 1; }
                .btn-menu-toggle {
                    display: none;
                    background: white; border: 1px solid var(--border); border-radius: 10px;
                    padding: 10px; cursor: pointer; color: var(--text);
                }

                .topbar h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); white-space: nowrap; }

                .page-content {
                    padding: 40px;
                    max-width: 1600px;
                    width: 100%;
                    margin: 0 auto;
                }

                .global-search {
                    background: white; border: 1px solid var(--border);
                    border-radius: 12px; padding: 10px 16px; display: flex; align-items: center; gap: 10px;
                    width: 300px;
                }
                .global-search input { border: none; outline: none; width: 100%; font-size: 13px; font-family: inherit; }
                
                .topbar-right { display: flex; align-items: center; gap: 20px; }
                
                .status-badge {
                    background: #ecfdf5; color: #10b981; padding: 4px 10px; border-radius: 20px;
                    font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px;
                }

                .sidebar-overlay {
                    display: none;
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5); z-index: 950;
                    backdrop-filter: blur(4px);
                }

                /* Responsive Breakpoints */
                @media (max-width: 1024px) {
                    .global-search { width: 40px; padding: 10px; overflow: hidden; border-radius: 50%; }
                    .global-search input { display: none; }
                }

                @media (max-width: 768px) {
                    .sidebar { transform: translateX(-100%); }
                    .sidebar.open { transform: translateX(0); }
                    .sidebar-overlay.visible { display: block; }
                    .btn-close-sidebar { display: block; }

                    .main-container { margin-left: 0; }
                    .topbar { padding: 0 12px; height: 58px; }
                    .btn-menu-toggle { display: flex; padding: 8px; border-radius: 8px; }
                    .global-search { display: none; }
                    .page-content {
                        padding: 15px;
                        max-width: none;
                        margin: 0;
                    }
                    .page-content > div:first-child {
                        margin-bottom: 16px !important;
                    }
                    .page-content h1 {
                        font-size: 22px !important;
                        line-height: 1.15 !important;
                        letter-spacing: 0 !important;
                    }
                    .page-content h2,
                    .page-content h3 {
                        font-size: 15px !important;
                        line-height: 1.25 !important;
                    }
                    .page-content p,
                    .page-content td,
                    .page-content input,
                    .page-content select,
                    .page-content button {
                        font-size: 12px !important;
                    }
                    .page-content th {
                        font-size: 10px !important;
                        letter-spacing: 0.03em !important;
                    }
                    .page-content th,
                    .page-content td {
                        padding: 10px 12px !important;
                    }
                    .page-content .premium-card,
                    .page-content .card-v3,
                    .page-content .shops-table-card,
                    .page-content .billing-table-card {
                        border-radius: 14px !important;
                    }
                    .page-content .premium-card,
                    .page-content .stat-card,
                    .page-content .card-v3-body {
                        padding: 16px !important;
                    }
                    .page-content .grid-stats,
                    .page-content .stats-grid-v3,
                    .page-content .billing-cards,
                    .page-content .section-grid {
                        gap: 12px !important;
                        margin-bottom: 18px !important;
                    }
                    .topbar h2 { font-size: 16px; }
                    .status-badge span { display: none; }
                    .topbar-right { gap: 8px; }
                }

                @media (max-width: 480px) {
                    .topbar-actions .topbar-date { display: none; }
                    .topbar-left { gap: 8px; }
                    .topbar { padding: 0 8px; }
                    .page-content { padding: 15px; }
                    .page-content th,
                    .page-content td {
                        padding: 8px 10px !important;
                    }
                    .page-content .premium-card,
                    .page-content .stat-card,
                    .page-content .card-v3-body {
                        padding: 14px !important;
                    }
                }

                /* Quiet operational admin theme */
                :root {
                    --primary: #2563eb;
                    --primary-weak: #eff6ff;
                    --primary-border: #bfdbfe;
                    --success: #059669;
                    --warning: #d97706;
                    --danger: #dc2626;
                    --bg: #f6f8fb;
                    --sidebar-bg: #ffffff;
                    --surface: #ffffff;
                    --text: #111827;
                    --text-muted: #6b7280;
                    --border: #d9e1ec;
                    --border-soft: #edf1f6;
                    --sidebar-width: 260px;
                    --primary-gradient: #2563eb;
                }

                body {
                    font-family: 'Be Vietnam Pro', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    background: var(--bg);
                    color: var(--text);
                }

                .admin-shell { background: var(--bg); }

                .sidebar {
                    background: var(--sidebar-bg);
                    border-right: 1px solid var(--border);
                    box-shadow: none;
                }

                .sidebar-header {
                    padding: 20px 18px;
                    border-bottom: 1px solid var(--border-soft);
                }

                .logo-box-wrap { gap: 10px; }
                .logo-box {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    background: var(--primary-weak);
                    color: var(--primary);
                    box-shadow: none;
                    border: 1px solid var(--primary-border);
                }
                .logo-box svg { width: 18px; height: 18px; }
                .brand-name {
                    color: var(--text);
                    font-size: 15px;
                    letter-spacing: 0;
                }

                .btn-close-sidebar { color: var(--text); }
                .sidebar-nav { padding: 12px; }
                .nav-link,
                .nav-toggle-btn {
                    color: #4b5563;
                    border-radius: 8px;
                    padding: 10px 12px;
                    margin-bottom: 4px;
                    font-size: 13px;
                    transition: none;
                }
                .nav-link:hover,
                .nav-toggle-btn:hover {
                    color: var(--text);
                    background: #f3f6fb;
                }
                .nav-link.active {
                    background: var(--primary-weak);
                    color: #1d4ed8;
                    box-shadow: none;
                    border: 1px solid var(--primary-border);
                }
                .nav-toggle-btn.open .chevron { color: var(--primary); }
                .sub-nav {
                    margin-left: 18px;
                    padding-left: 10px;
                    border-left: 1px solid var(--border);
                    margin-bottom: 8px;
                }
                .sub-nav-link {
                    color: #6b7280;
                    border-radius: 8px;
                    padding: 8px 10px;
                    font-size: 12px;
                    transition: none;
                }
                .sub-nav-link:hover { color: var(--text); background: #f3f6fb; }
                .sub-nav-link.active {
                    color: #1d4ed8;
                    background: var(--primary-weak);
                }

                .sidebar-footer {
                    margin: 12px;
                    padding: 12px;
                    background: #f8fafc;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                }
                .avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: #e5e7eb;
                    color: #374151;
                    font-size: 13px;
                }
                .username { color: var(--text); font-size: 13px; }
                .btn-logout-alt {
                    background: #ffffff;
                    border: 1px solid var(--border);
                    color: var(--danger);
                    border-radius: 8px;
                    transition: none;
                }
                .btn-logout-alt:hover {
                    background: #fef2f2;
                    color: var(--danger);
                    transform: none;
                }

                .main-container {
                    background: var(--bg);
                    transition: none;
                }
                .topbar {
                    height: 64px;
                    background: #ffffff;
                    backdrop-filter: none;
                    border-bottom: 1px solid var(--border);
                    padding: 0 28px;
                }
                .global-search {
                    width: min(420px, 44vw);
                    border-radius: 8px;
                    background: #f8fafc;
                    padding: 9px 12px;
                }
                .status-badge {
                    border-radius: 999px;
                    background: #ecfdf5;
                    color: var(--success);
                    border: 1px solid #bbf7d0;
                }
                .page-content {
                    padding: 28px;
                    max-width: 1680px;
                }
                .page-content > div:first-child h1 {
                    font-size: 24px !important;
                    font-weight: 700 !important;
                    letter-spacing: 0 !important;
                    color: var(--text) !important;
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
                .stat-box-v2,
                .stat-box-premium,
                .metric-card,
                .campaign-card,
                .template-card,
                .automation-card,
                .settings-card,
                .blacklist-card,
                .history-card {
                    border-radius: 8px !important;
                    border: 1px solid var(--border) !important;
                    box-shadow: none !important;
                    background: #ffffff !important;
                    transition: none !important;
                }

                .glass-header,
                .banner-premium {
                    padding: 18px 20px !important;
                    margin-bottom: 20px !important;
                }
                .glass-header .title-group h1,
                .title-group h1 {
                    background: none !important;
                    -webkit-background-clip: initial !important;
                    -webkit-text-fill-color: var(--text) !important;
                    color: var(--text) !important;
                    font-size: 24px !important;
                    letter-spacing: 0 !important;
                }
                .title-group p,
                .banner-premium .msg {
                    color: var(--text-muted) !important;
                    font-size: 13px !important;
                }
                .banner-premium {
                    background: #f8fafc !important;
                    border-color: var(--border) !important;
                }
                .stats-grid-premium,
                .stats-grid-v2,
                .stats-grid-v3,
                .billing-cards,
                .grid-stats {
                    gap: 16px !important;
                }
                .stat-box-v2,
                .stat-box-premium {
                    padding: 16px !important;
                    border-right: 0 !important;
                }
                .stat-box-v2 .label,
                .stat-box-premium .label,
                .stat-label,
                .metric-label {
                    color: #526176 !important;
                    letter-spacing: 0.04em !important;
                }
                .stat-box-v2 .value,
                .stat-box-premium .value,
                .stat-value {
                    color: var(--text) !important;
                    letter-spacing: 0 !important;
                }
                .table-premium,
                .campaign-table,
                .log-table {
                    overflow: hidden !important;
                }
                .t-head,
                .t-header-row,
                .t-header-v2,
                .tab-header-premium,
                .table-tabs-v2,
                .card-header,
                .card-v3-header,
                .modal-header,
                .modal-header-v2 {
                    background: #f8fafc !important;
                    border-color: var(--border-soft) !important;
                }
                .t-row,
                .t-row-v2 {
                    border-color: var(--border-soft) !important;
                    transition: none !important;
                }
                .t-row:hover,
                .t-row-v2:hover {
                    background: #fbfdff !important;
                }
                .premium-card:hover,
                .card-v3:hover,
                .card-premium-v2:hover,
                .stat-card:hover,
                .stat-box-v2:hover,
                .stat-box-premium:hover,
                .campaign-card:hover,
                .template-card:hover,
                .template-card-premium:hover,
                .automation-card:hover,
                .btn-premium-outline:hover,
                .btn-premium-solid:hover,
                .btn-premium:hover,
                .primary-btn:hover,
                .btn-add:hover,
                .btn-view:hover,
                .back-btn:hover,
                .adjust-trigger-btn:hover,
                .btn-clear:hover,
                .b-clear:hover,
                .action-btn:hover {
                    transform: none !important;
                    box-shadow: none !important;
                }

                table,
                .billing-table {
                    font-variant-numeric: tabular-nums;
                }
                th,
                .billing-table th {
                    background: #f8fafc !important;
                    color: #526176 !important;
                    font-size: 11px !important;
                    letter-spacing: 0.04em !important;
                    border-bottom: 1px solid var(--border) !important;
                }
                td,
                .billing-table td {
                    border-bottom: 1px solid var(--border-soft) !important;
                }
                tr:hover td,
                .billing-table tr:hover td {
                    background: #fbfdff !important;
                }

                input,
                select,
                textarea,
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
                    box-shadow: none !important;
                    transition: none !important;
                }
                .search-box:focus-within,
                .search-pill input:focus,
                .billing-search:focus-within,
                .input-premium:focus,
                .select-premium:focus,
                .billing-input:focus,
                .form-input:focus,
                .filter-select:focus,
                .b-filter:focus {
                    border-color: var(--primary) !important;
                    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12) !important;
                }

                .plan-badge,
                .plan-tag,
                .status-tag,
                .month-badge {
                    border-radius: 999px !important;
                    box-shadow: none !important;
                }
                .plan-free,
                .plan-tag.free {
                    background: #f8fafc !important;
                    color: #475569 !important;
                    border: 1px solid var(--border) !important;
                }
                .plan-premium,
                .plan-tag.premium {
                    background: #eff6ff !important;
                    color: #1d4ed8 !important;
                    border: 1px solid #bfdbfe !important;
                }
                .plan-plus,
                .plan-tag.plus {
                    background: #ecfdf5 !important;
                    color: #047857 !important;
                    border: 1px solid #a7f3d0 !important;
                }
                .plan-elite,
                .plan-tag.elite {
                    background: #f5f3ff !important;
                    color: #6d28d9 !important;
                    border: 1px solid #ddd6fe !important;
                }
                .plan-custom,
                .plan-tag.custom,
                .plan-tag.unlimited {
                    background: #eef2ff !important;
                    color: #3730a3 !important;
                    border: 1px solid #c7d2fe !important;
                }
                .stat-card::before {
                    height: 3px !important;
                    background: #cbd5e1 !important;
                }
                .stat-card.revenue::before { background: var(--success) !important; }
                .stat-card.pending::before { background: var(--warning) !important; }
                .stat-card.overcharged::before,
                .stat-card.issues::before { background: var(--danger) !important; }
                .stat-card.shops::before { background: var(--primary) !important; }
                .progress-bar {
                    border-radius: 999px !important;
                    background: #eef2f7 !important;
                }
                .progress-fill {
                    border-radius: 999px !important;
                    transition: none !important;
                    background: var(--primary) !important;
                }
                .btn-premium-solid,
                .btn-premium,
                .primary-btn,
                .btn-add,
                .adjust-trigger-btn {
                    background: var(--primary) !important;
                    border-radius: 8px !important;
                    box-shadow: none !important;
                    transition: none !important;
                }
                .btn-premium-outline,
                .btn-view,
                .back-btn,
                .action-btn,
                .inline-toggle-btn {
                    border-radius: 8px !important;
                    box-shadow: none !important;
                    transition: none !important;
                }
                .day-card-v2,
                .month-row,
                .info-item,
                .logic-card,
                .block-button,
                .block-button-v3 {
                    border-radius: 8px !important;
                    transition: none !important;
                    box-shadow: none !important;
                }
                .day-card-v2:hover,
                .month-row:hover,
                .logic-card:hover,
                .block-button:hover,
                .block-button-v3:hover {
                    transform: none !important;
                    box-shadow: none !important;
                }

                /* Refined admin polish pass */
                :root {
                    --primary: #2563eb;
                    --primary-weak: #eff6ff;
                    --primary-border: #bfdbfe;
                    --success: #059669;
                    --warning: #d97706;
                    --danger: #dc2626;
                    --bg: #f4f7fb;
                    --sidebar-bg: #111827;
                    --surface: #ffffff;
                    --text: #111827;
                    --text-muted: #64748b;
                    --border: #d8e2ef;
                    --border-soft: #edf2f7;
                    --card-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 30px rgba(15, 23, 42, 0.035);
                    --sidebar-width: 264px;
                    --primary-gradient: #2563eb;
                }

                body {
                    background: var(--bg);
                    color: var(--text);
                }

                .sidebar {
                    background: var(--sidebar-bg);
                    border-right: 1px solid #0b1220;
                    box-shadow: none;
                }
                .sidebar-header {
                    padding: 22px 18px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .logo-box {
                    background: #2563eb;
                    color: white;
                    border: none;
                    box-shadow: none;
                }
                .brand-name,
                .username {
                    color: #f8fafc;
                }
                .btn-close-sidebar {
                    color: #e5e7eb;
                }
                .nav-link,
                .nav-toggle-btn {
                    color: #cbd5e1;
                    border: 1px solid transparent;
                    font-weight: 600;
                }
                .nav-link:hover,
                .nav-toggle-btn:hover {
                    color: #ffffff;
                    background: rgba(255,255,255,0.06);
                }
                .nav-link.active {
                    background: rgba(37, 99, 235, 0.18);
                    color: #ffffff;
                    border: 1px solid rgba(96, 165, 250, 0.24);
                    box-shadow: inset 3px 0 0 #60a5fa;
                }
                .sub-nav {
                    border-left-color: rgba(255,255,255,0.1);
                }
                .sub-nav-link {
                    color: #94a3b8;
                }
                .sub-nav-link:hover {
                    color: #ffffff;
                    background: rgba(255,255,255,0.05);
                }
                .sub-nav-link.active {
                    color: #bfdbfe;
                    background: rgba(37, 99, 235, 0.12);
                }
                .sidebar-footer {
                    background: rgba(255,255,255,0.045);
                    border-color: rgba(255,255,255,0.08);
                }
                .avatar {
                    background: #1f2937;
                    color: #bfdbfe;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .btn-logout-alt {
                    background: rgba(239, 68, 68, 0.08);
                    border-color: rgba(248, 113, 113, 0.18);
                    color: #fca5a5;
                }

                .main-container {
                    background:
                        linear-gradient(180deg, #f8fafc 0, #f4f7fb 260px),
                        var(--bg);
                }
                .topbar {
                    height: 68px;
                    background: rgba(255,255,255,0.96);
                    border-bottom: 1px solid var(--border);
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
                    padding: 0 32px;
                }
                .global-search {
                    background: #f8fafc;
                    border-color: #dbe3ef;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
                }
                .status-badge {
                    background: #ecfdf5;
                    color: #047857;
                    border-color: #a7f3d0;
                }
                .page-content {
                    padding: 32px;
                    max-width: 1720px;
                }
                .page-content > div:first-child {
                    margin-bottom: 24px !important;
                }
                .page-content > div:first-child h1 {
                    font-size: 28px !important;
                    font-weight: 800 !important;
                    letter-spacing: -0.01em !important;
                    color: #0f172a !important;
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
                .history-card {
                    background: #ffffff !important;
                    border: 1px solid var(--border) !important;
                    border-radius: 8px !important;
                    box-shadow: var(--card-shadow) !important;
                }
                .glass-header,
                .hero-section {
                    background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%) !important;
                }
                .banner-premium {
                    background: #eef6ff !important;
                    border-color: #bfdbfe !important;
                    color: #1d4ed8 !important;
                }
                .stat-card,
                .premium-stat-card,
                .stat-box-v2,
                .stat-box-premium,
                .metric-card {
                    position: relative;
                }
                .stat-card::before,
                .premium-stat-card::before,
                .stat-box-v2::before,
                .stat-box-premium::before,
                .metric-card::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: #cbd5e1;
                }
                .stat-card.revenue::before { background: var(--success) !important; }
                .stat-card.pending::before { background: var(--warning) !important; }
                .stat-card.overcharged::before,
                .stat-card.issues::before { background: var(--danger) !important; }
                .stat-card.shops::before { background: var(--primary) !important; }
                .stat-icon,
                .stat-card-icon,
                .icon-circle,
                .hero-icon {
                    border-radius: 8px !important;
                    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
                }
                .stat-value,
                .stat-box-v2 .value,
                .stat-box-premium .value {
                    font-variant-numeric: tabular-nums;
                    color: #0f172a !important;
                }

                th,
                .billing-table th,
                .t-head,
                .t-header-row,
                .t-header-v2 {
                    background: #f8fafc !important;
                    color: #475569 !important;
                    border-color: var(--border) !important;
                }
                td,
                .billing-table td {
                    color: #243041;
                }
                tr:hover td,
                .billing-table tr:hover td {
                    background: #f8fbff !important;
                }
                .month-row,
                .day-card-v2,
                .logic-card {
                    border: 1px solid var(--border-soft) !important;
                    background: #f8fafc !important;
                }

                .btn-premium-solid,
                .btn-premium,
                .primary-btn,
                .btn-add,
                .adjust-trigger-btn {
                    background: #2563eb !important;
                    color: white !important;
                    border: 1px solid #1d4ed8 !important;
                }
                .btn-premium-outline,
                .btn-view,
                .back-btn,
                .action-btn,
                .inline-toggle-btn {
                    background: #ffffff !important;
                    border: 1px solid var(--border) !important;
                    color: #243041 !important;
                }
                .btn-premium-outline:hover,
                .btn-view:hover,
                .back-btn:hover,
                .action-btn:hover,
                .inline-toggle-btn:hover {
                    border-color: #93c5fd !important;
                    color: #1d4ed8 !important;
                }

                input,
                select,
                textarea,
                .search-box,
                .search-pill input,
                .billing-search,
                .filter-select,
                .b-filter,
                .input-premium,
                .select-premium,
                .billing-input,
                .form-input {
                    background-color: #ffffff !important;
                    border-color: #d8e2ef !important;
                }

                @media (max-width: 768px) {
                    body {
                        font-size: 13px;
                        line-height: 1.45;
                    }
                    .sidebar {
                        width: min(86vw, 292px);
                    }
                    .sidebar-header {
                        padding: 18px 16px;
                    }
                    .logo-box {
                        width: 34px;
                        height: 34px;
                    }
                    .brand-name {
                        font-size: 16px;
                    }
                    .sidebar-nav {
                        padding: 10px;
                    }
                    .nav-link,
                    .nav-toggle-btn {
                        min-height: 42px;
                        padding: 10px 12px;
                        font-size: 13px;
                        gap: 10px;
                    }
                    .sub-nav {
                        margin-left: 18px;
                        padding-left: 10px;
                    }
                    .sub-nav-link {
                        padding: 9px 10px;
                        font-size: 12px;
                    }
                    .sidebar-footer {
                        margin: 10px;
                        padding: 12px;
                    }
                    .topbar {
                        height: 56px;
                        padding: 0 12px;
                    }
                    .topbar-left,
                    .topbar-right {
                        gap: 8px;
                    }
                    .topbar-date,
                    .global-search {
                        display: none !important;
                    }
                    .btn-menu-toggle {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 38px;
                        height: 38px;
                        padding: 0;
                        border-radius: 8px;
                    }
                    .status-badge {
                        padding: 5px 9px;
                        font-size: 10px;
                    }
                    .page-content {
                        padding: 12px;
                        max-width: none;
                        overflow-x: hidden;
                    }
                    .page-content > div:first-child {
                        margin-bottom: 14px !important;
                    }
                    .page-content > div:first-child h1 {
                        font-size: 20px !important;
                        line-height: 1.2 !important;
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
                        border-radius: 10px !important;
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
                    .log-table {
                        max-width: calc(100vw - 24px);
                        overflow-x: auto !important;
                        -webkit-overflow-scrolling: touch;
                    }
                    th,
                    .billing-table th,
                    td,
                    .billing-table td {
                        padding: 10px 12px !important;
                        font-size: 12px !important;
                        white-space: nowrap;
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
                    input,
                    select,
                    textarea {
                        font-size: 13px !important;
                    }
                    .sidebar-overlay.visible { backdrop-filter: none; }
                }

                @media (max-width: 480px) {
                    .page-content {
                        padding: 10px;
                    }
                    .status-badge span {
                        display: none;
                    }
                    .page-content > div:first-child h1 {
                        font-size: 18px !important;
                    }
                    th,
                    .billing-table th,
                    td,
                    .billing-table td {
                        padding: 9px 10px !important;
                    }
                }
            `}</style>
            
            <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />

            <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo-box-wrap">
                        <div className="logo-box"><Globe size={24} /></div>
                        <span className="brand-name">GeoAdmin</span>
                    </div>
                    <button className="btn-close-sidebar" onClick={() => setIsSidebarOpen(false)}>
                        <X size={24} />
                    </button>
                </div>
                <nav className="sidebar-nav">
                    {menuItems.map(item => {
                        if (item.children) {
                            const isOpen = openMenus.includes(item.label);
                            const hasActiveChild = item.children.some(child => 
                                child.to === location.pathname || (child.end === false && location.pathname.startsWith(child.to))
                            );
                            
                            return (
                                <div key={item.label} className="nav-group">
                                    <button 
                                        className={`nav-toggle-btn ${isOpen ? 'open' : ''} ${hasActiveChild && !isOpen ? 'has-active' : ''}`}
                                        onClick={() => toggleMenu(item.label)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <span className="icon-wrap">{item.icon}</span>
                                            {item.label}
                                        </div>
                                        <ChevronDown size={14} className="chevron" />
                                    </button>
                                    {isOpen && (
                                        <div className="sub-nav">
                                            {item.children.map(child => (
                                                <NavLink 
                                                    key={child.to} 
                                                    to={child.to} 
                                                    className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
                                                    end={child.end}
                                                >
                                                    {child.label}
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <NavLink 
                                key={item.to} 
                                to={item.to} 
                                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                                end={item.end}
                            >
                                <span className="icon-wrap">{item.icon}</span>
                                {item.label}
                            </NavLink>
                        );
                    })}
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="avatar">{(username?.[0] || 'A').toUpperCase()}</div>
                        <div className="username">{username}</div>
                    </div>
                    <Form method="post" action="/admin/logout">
                        <button type="submit" className="btn-logout-alt">
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </Form>
                </div>
            </aside>

            <div className="main-container">
                <header className="topbar">
                    <div className="topbar-left">
                        <button className="btn-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
                            <Menu size={20} />
                        </button>
                        <div className="global-search">
                            <Search size={16} color="var(--text-muted)" />
                            <input type="text" placeholder="Search systems, shops..." />
                        </div>
                    </div>
                    
                    <div className="topbar-right">
                        <div className="status-badge">
                            <Activity size={12} strokeWidth={3} />
                            <span>System Live</span>
                        </div>
                        <div className="topbar-date" style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {isMounted ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '...'}
                        </div>
                    </div>
                </header>
                <main className="page-content">
                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={{ 
                            fontSize: '32px', 
                            fontWeight: 800, 
                            color: '#1e293b', 
                            letterSpacing: '-0.02em',
                            margin: 0
                        }}>
                            {location.pathname === '/admin' ? 'System Overview' : location.pathname.split('/').pop()?.replace(/-/g, ' ').toUpperCase()}
                        </h1>
                    </div>
                    <Outlet />
                </main>
            </div>
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
    } else if (typeof error === 'string') {
        errorMessage = error;
    }

    return (
        <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: "'Be Vietnam Pro', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', marginBottom: '16px' }}>Oops! Something went wrong</h1>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>We encountered an error while loading the admin panel.</p>
            
            <div style={{ 
                background: '#fef2f2', 
                border: '1px solid #fee2e2', 
                color: '#ef4444', 
                padding: '16px', 
                borderRadius: '12px',
                maxWidth: '600px',
                margin: '0 auto 32px',
                fontSize: '14px',
                fontFamily: 'monospace',
                textAlign: 'left',
                overflowX: 'auto'
            }}>
                <div style={{ fontWeight: 800, marginBottom: '8px' }}>Error Details:</div>
                {errorMessage}
            </div>

            <button 
                onClick={() => window.location.reload()}
                style={{
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                Refresh Page
            </button>
        </div>
    );
}
