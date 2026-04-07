import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, NavLink } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    return json({});
};

export default function AdminMarketingLayout() {
    return (
        <div className="admin-marketing-layout">
            <style>{`
                .marketing-header {
                    padding: 24px 32px;
                    background: white;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                }
                .marketing-nav {
                    display: flex;
                    gap: 8px;
                    background: #f1f3f5;
                    padding: 4px;
                    border-radius: 8px;
                    flex-shrink: 0;
                }
                .marketing-nav-item {
                    padding: 8px 16px;
                    border-radius: 6px;
                    text-decoration: none;
                    color: #666;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .marketing-nav-item:hover {
                    color: var(--primary);
                }
                .marketing-nav-item.active {
                    background: white;
                    color: var(--primary);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .marketing-content {
                    padding: 0;
                }

                @media (max-width: 768px) {
                    .marketing-header {
                        padding: 16px 20px;
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    .marketing-nav {
                        width: 100%;
                        overflow-x: auto;
                        padding: 4px;
                        -webkit-overflow-scrolling: touch;
                    }
                    .marketing-nav::-webkit-scrollbar { display: none; }
                }
            `}</style>

            <div className="marketing-header">
                <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Tiếp thị & Email</h1>
                <div className="marketing-nav">
                    <NavLink 
                        to="/admin/marketing" 
                        end 
                        className={({ isActive }) => `marketing-nav-item ${isActive ? 'active' : ''}`}
                    >
                        Hiệu quả Chiến dịch
                    </NavLink>
                    <NavLink 
                        to="/admin/marketing/emails" 
                        className={({ isActive }) => `marketing-nav-item ${isActive ? 'active' : ''}`}
                    >
                        Email Marketing
                    </NavLink>
                </div>
            </div>

            <div className="marketing-content">
                <Outlet />
            </div>
        </div>
    );
}
