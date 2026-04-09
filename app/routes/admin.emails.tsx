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
                    min-height: calc(100vh - 80px);
                    display: flex;
                    flex-direction: column;
                }
                
                .emails-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
            `}</style>
            <div className="emails-content">
                <Outlet />
            </div>
        </div>
    );
}
