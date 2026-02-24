import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { adminSessionStorage } from "../utils/admin.session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const session = await adminSessionStorage.getSession(request.headers.get("Cookie"));
    return redirect("/admin/login", {
        headers: {
            "Set-Cookie": await adminSessionStorage.destroySession(session),
        },
    });
};

export const loader = async () => redirect("/admin/login");
