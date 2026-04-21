import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, NavLink, Form, useLocation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Home, 
    Store, 
    Users, 
    Rocket, 
    Mail,
    Globe, 
    Search, 
    LogOut, 
    Activity,
    Menu,
    X,
    History,
    Zap,
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

    const menuItems = [
        { label: "Dashboard", to: "/admin", icon: <Home size={18} />, end: true },
        { label: "Shops", to: "/admin/shops", icon: <Store size={18} /> },
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
    ];

    const [openMenus, setOpenMenus] = useState<string[]>([]);

    useEffect(() => {
        const activeParent = menuItems.find(item => 
            item.children?.some(child => location.pathname === child.to)
        );
        if (activeParent && !openMenus.includes(activeParent.label)) {
            setOpenMenus(prev => [...prev, activeParent.label]);
        }
    }, [location.pathname]);

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
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
                
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
                    font-family: 'Outfit', sans-serif;
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
                    .topbar { padding: 0 20px; height: 70px; }
                    .btn-menu-toggle { display: flex; }
                    .page-content { padding: 20px; }
                    .topbar h2 { font-size: 16px; }
                    .status-badge span { display: none; }
                    .topbar-right { gap: 12px; }
                }

                @media (max-width: 480px) {
                    .topbar-actions .topbar-date { display: none; }
                    .topbar-left { gap: 8px; }
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
        <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: 'Outfit, sans-serif' }}>
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
