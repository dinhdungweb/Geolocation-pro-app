import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    try {
        const automation = await prisma.automation.create({
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
    } catch (error) {
        console.error("Prisma error in Automation New loader:", error);
    }

    return redirect(`/admin/emails/automations`);
};
