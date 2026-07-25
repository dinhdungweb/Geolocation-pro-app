import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    try {
        const template = await prisma.emailTemplate.create({
            data: {
                shop: 'GLOBAL',
                name: "Untitled Template",
                subject: "New Campaign",
                config: "[]",
                html: ""
            }
        });
        return redirect(`/admin/emails/templates/${template.id}`);
    } catch (e) {
        console.error("Prisma error in Template New loader:", e);
        return redirect(`/admin/emails/templates`);
    }
};
