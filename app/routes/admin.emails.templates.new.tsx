import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    // Automatically create a draft and redirect to editor, or just show a simple form
    // For now, let's just create a quick draft and redirect back or to a mock editor
    const template = await (prisma as any).emailTemplate.create({
        data: {
            shop: 'GLOBAL',
            name: "Untitled Template",
            subject: "New Campaign",
            config: "[]"
        }
    });

    return redirect(`/admin/emails/templates`);
};
