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
                .admin-emails-layout {
                    background: #f8fafc;
                    min-height: calc(100vh - 80px);
                }
                
                .emails-header {
                    padding: 30px 40px;
                    background: rgba(255, 255, 255, 0.7);
                    backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                }
                
                .emails-header-content h1 {
                    font-size: 24px;
                    font-weight: 800;
                    letter-spacing: -0.03em;
                    color: #0f172a;
                    margin: 0;
                }

                .emails-header-content p {
                    font-size: 14px;
                    color: #64748b;
                    margin-top: 4px;
                    font-weight: 500;
                }

                .emails-nav {
                    display: flex;
                    gap: 4px;
                    background: #f1f5f9;
                    padding: 4px;
                    border-radius: 12px;
                    border: 1px solid rgba(0, 0, 0, 0.05);
                }
                
                .emails-nav-item {
                    padding: 10px 24px;
                    border-radius: 10px;
                    text-decoration: none;
                    color: #64748b;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .emails-nav-item:hover {
                    color: var(--primary);
                }

                .emails-nav-item.active {
                    background: white;
                    color: var(--primary);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
                }

                .emails-content {
                    padding: 0;
                    min-height: calc(100vh - 180px);
                }

                @media (max-width: 900px) {
                    .emails-header {
                        padding: 24px;
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .emails-nav {
                        width: 100%;
                    }
                    .emails-nav-item {
                        flex: 1;
                        justify-content: center;
                    }
                }
            `}</style>

            <div className="emails-header">
                <div className="emails-header-content">
                    <h1>Campaigns & Outreach</h1>
                    <p>Design, target, and track your email marketing performance.</p>
                </div>
                <div className="emails-nav">
                    <NavLink 
                        to="/admin/emails" 
                        end 
                        className={({ isActive }) => `emails-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <span>Composer</span>
                    </NavLink>
                    <NavLink 
                        to="/admin/emails/history" 
                        className={({ isActive }) => `emails-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <span>Send History</span>
                    </NavLink>
                </div>
            </div>

            <div className="emails-content">
                <Outlet />
            </div>
        </div>
    );
}
