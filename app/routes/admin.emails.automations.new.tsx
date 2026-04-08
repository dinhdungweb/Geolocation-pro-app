import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    // Create a new automation draft
    const automation = await (prisma as any).automation.create({
        data: {
            shop: 'GLOBAL',
            type: 'manual_' + Date.now(),
            subject: "New automated email",
            isActive: false,
            config: "[]",
            html: ""
        }
    });

    return redirect(`/admin/emails/automations/${automation.id}`);
};
