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
        { label: "Dashboard", to: "/admin", icon: "🏠", end: true },
        { label: "Shops", to: "/admin/shops", icon: "🏪" },
        { label: "CRM (Customers)", to: "/admin/crm", icon: "👥" },
        { label: "Marketing", to: "/admin/marketing", icon: "🚀" },
    ];

    return (
        <div className="admin-shell">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
                
                :root {
                    --primary: #6366f1;
                    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    --bg: #f1f5f9;
                    --sidebar-bg: #0f172a;
                    --surface: #ffffff;
                    --text: #0f172a;
                    --text-muted: #64748b;
                    --border: #e2e8f0;
                    --sidebar-width: 280px;
                }
                
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                
                body {
                    font-family: 'Outfit', sans-serif;
                    background: var(--bg);
                    color: var(--text);
                    -webkit-font-smoothing: antialiased;
                }
                
                .admin-shell {
                    display: flex;
                    min-height: 100vh;
                }
                
                /* SIDEBAR - PREMIUM GLASS/DARK */
                .sidebar {
                    width: var(--sidebar-width);
                    background: var(--sidebar-bg);
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    height: 100vh;
                    z-index: 100;
                    box-shadow: 10px 0 30px rgba(0,0,0,0.1);
                }
                
                .sidebar-header {
                    padding: 32px 24px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                
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
                
                .sidebar-nav {
                    padding: 10px 16px;
                    flex: 1;
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
                
                .nav-link span { font-size: 18px; }

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
                
                .username { font-size: 14px; font-weight: 600; color: white; }

                .btn-logout-alt {
                    width: 100%;
                    background: rgba(239, 68, 68, 1);
                    border: none;
                    color: white;
                    padding: 10px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-logout-alt:hover { opacity: 0.9; transform: translateY(-1px); }

                /* MAIN */
                .main-container {
                    flex: 1;
                    margin-left: var(--sidebar-width);
                    background: var(--bg);
                }
                
                .topbar {
                    height: 80px;
                    background: rgba(241, 245, 249, 0.8);
                    backdrop-filter: blur(12px);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 40px;
                    position: sticky; top: 0; z-index: 90;
                }
                
                .topbar h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }

                .page-content {
                    padding: 40px;
                    max-width: 1600px;
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '40px', flex: 1 }}>
                        <h2>{location.pathname === '/admin' ? 'System Overview' : location.pathname.split('/').pop()?.toUpperCase()}</h2>
                        <div className="global-search">
                            <span>🔍</span>
                            <input type="text" placeholder="Search systems, shops, or logs..." />
                        </div>
                    </div>
                    
                    <div className="topbar-actions">
                        <div className="status-badge">
                            <div className="dot" style={{ background: '#10b981' }} />
                            System Live
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                    </div>
                </header>
            <style>{`
                .global-search {
                    background: white; border: 1px solid var(--border);
                    border-radius: 12px; padding: 10px 16px; display: flex; align-items: center; gap: 10px;
                    width: 300px;
                }
                .global-search input { border: none; outline: none; width: 100%; font-size: 13px; font-family: inherit; }
                .status-badge {
                    background: #ecfdf5; color: #10b981; padding: 4px 10px; border-radius: 20px;
                    font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px;
                }
            `}</style>
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
