import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
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
