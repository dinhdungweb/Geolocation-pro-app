import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    try {
        await (prisma as any).emailTemplate.create({
            data: {
                shop: 'GLOBAL',
                name: "Untitled Template",
                subject: "New Campaign",
                config: "[]"
            }
        });
    } catch (e) {
        console.error("Prisma error in Template New loader:", e);
    }

    return redirect(`/admin/emails/templates`);
};
