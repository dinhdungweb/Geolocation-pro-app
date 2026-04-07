import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, NavLink, Form, useLocation } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const session = await requireAdminAuth(request);
    return json({ username: session.get("admin_username") });
};

export default function AdminLayout() {
    const { username } = useLoaderData<typeof loader>();
    const location = useLocation();

    // Don't show layout on login page (though login is likely separate if matching v2 routing rules, 
    // but better be safe or handle it via route naming)
    const isLoginPage = location.pathname === "/admin/login";

    if (isLoginPage) {
        return <Outlet />;
    }

    const menuItems = [
        { label: "Dashboard", to: "/admin", icon: "📊" },
        { label: "CRM (Customers)", to: "/admin/crm", icon: "👥" },
        { label: "Marketing", to: "/admin/marketing", icon: "🚀" },
        { label: "Shops", to: "/admin", icon: "🏪", end: true }, // Reuse dashboard for shop list or create separate
    ];

    return (
        <div className="admin-shell">
            <style>{`
                :root {
                    --primary: #6366f1;
                    --primary-hover: #4f46e5;
                    --bg: #f8fafc;
                    --surface: #ffffff;
                    --text: #1e293b;
                    --text-muted: #64748b;
                    --border: #e2e8f0;
                    --sidebar-width: 260px;
                }
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: var(--bg);
                    color: var(--text);
                }
                .admin-shell {
                    display: flex;
                    min-height: 100vh;
                }
                /* SIDEBAR */
                .sidebar {
                    width: var(--sidebar-width);
                    background: var(--surface);
                    border-right: 1px solid var(--border);
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    height: 100vh;
                    z-index: 50;
                }
                .sidebar-header {
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid var(--border);
                }
                .logo-box {
                    width: 36px; height: 36px;
                    background: linear-gradient(135deg, var(--primary), #8b5cf6);
                    border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-size: 20px;
                }
                .brand-name { font-weight: 700; font-size: 18px; color: var(--text); }
                
                .sidebar-nav {
                    padding: 20px 12px;
                    flex: 1;
                }
                .nav-link {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    text-decoration: none;
                    color: var(--text-muted);
                    font-size: 14px;
                    font-weight: 500;
                    border-radius: 10px;
                    transition: all 0.2s;
                    margin-bottom: 4px;
                }
                .nav-link:hover {
                    background: #f1f5f9;
                    color: var(--text);
                }
                .nav-link.active {
                    background: #eef2ff;
                    color: var(--primary);
                }
                .sidebar-footer {
                    padding: 16px;
                    border-top: 1px solid var(--border);
                }
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    margin-bottom: 12px;
                }
                .avatar {
                    width: 32px; height: 32px;
                    background: #e2e8f0;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 14px; font-weight: 600; color: var(--text-muted);
                }
                .username { font-size: 13px; font-weight: 600; color: var(--text); }

                /* MAIN */
                .main-container {
                    flex: 1;
                    margin-left: var(--sidebar-width);
                    display: flex;
                    flex-direction: column;
                }
                .topbar {
                    height: 64px;
                    background: var(--surface);
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 32px;
                    position: sticky; top: 0; z-index: 40;
                }
                .page-content {
                    padding: 32px;
                    max-width: 1400px;
                    width: 100%;
                    margin: 0 auto;
                }
                .btn-logout-alt {
                    background: none; border: 1px solid #fee2e2; color: #ef4444;
                    padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
                    cursor: pointer; transition: all 0.2s;
                }
                .btn-logout-alt:hover { background: #fef2f2; border-color: #fca5a5; }

                /* DASHBOARD GRID & CARDS (Common) */
                .flat-card {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    padding: 24px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01);
                }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .badge-success { background: #ecfdf5; color: #10b981; }
                .badge-primary { background: #eef2ff; color: #6366f1; }
                .badge-warning { background: #fffbeb; color: #f59e0b; }
            `}</style>
            
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo-box">🌍</div>
                    <span className="brand-name">GeoAdmin</span>
                </div>
                <nav className="sidebar-nav">
                    {menuItems.map(item => (
                        <NavLink 
                            key={item.to} 
                            to={item.to} 
                            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                            end={item.end}
                        >
                            <span>{item.icon}</span>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="avatar">{(username?.[0] || 'A').toUpperCase()}</div>
                        <div className="username">{username}</div>
                    </div>
                    <Form method="post" action="/admin/logout">
                        <button type="submit" className="btn-logout-alt">Sign Out</button>
                    </Form>
                </div>
            </aside>

            <div className="main-container">
                <header className="topbar">
                    <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{location.pathname === '/admin' ? 'System Overview' : location.pathname.split('/').pop()?.toUpperCase()}</h2>
                    <div className="topbar-actions">
                        {/* Placeholder for notifications/search */}
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                    </div>
                </header>
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export function ErrorBoundary() {
    return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <h1>Oops! Something went wrong.</h1>
            <p>We couldn't load this page. Please try again.</p>
        </div>
    );
}
