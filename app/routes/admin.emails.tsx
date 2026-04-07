import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, NavLink } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    return json({});
};

export default function AdminEmailsLayout() {
    return (
        <div className="admin-emails-layout">
            <style>{`
                .emails-header {
                    padding: 24px 32px;
                    background: white;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                }
                .emails-nav {
                    display: flex;
                    gap: 8px;
                    background: #f1f3f5;
                    padding: 4px;
                    border-radius: 8px;
                    flex-shrink: 0;
                }
                .emails-nav-item {
                    padding: 8px 16px;
                    border-radius: 6px;
                    text-decoration: none;
                    color: #666;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .emails-nav-item:hover {
                    color: var(--primary);
                }
                .emails-nav-item.active {
                    background: white;
                    color: var(--primary);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .emails-content {
                    padding: 0; 
                    height: calc(100vh - 160px); 
                    overflow-y: auto;
                }

                @media (max-width: 768px) {
                    .emails-header {
                        padding: 16px 20px;
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .emails-nav {
                        width: 100%;
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                    }
                    .emails-nav::-webkit-scrollbar { display: none; }
                    .emails-content {
                        height: auto;
                        overflow-y: visible;
                    }
                }
            `}</style>

            <div className="emails-header">
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Email Marketing</h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Draft campaigns, select audiences, and manage outreach.</p>
                </div>
                <div className="emails-nav">
                    <NavLink 
                        to="/admin/emails" 
                        end 
                        className={({ isActive }) => `emails-nav-item ${isActive ? 'active' : ''}`}
                    >
                        Composer
                    </NavLink>
                    <NavLink 
                        to="/admin/emails/history" 
                        className={({ isActive }) => `emails-nav-item ${isActive ? 'active' : ''}`}
                    >
                        Send Logs
                    </NavLink>
                </div>
            </div>

            <div className="emails-content">
                <Outlet />
            </div>
        </div>
    );
}
