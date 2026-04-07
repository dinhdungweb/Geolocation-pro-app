import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.pathname.includes("/admin/marketing/emails")) {
        return redirect("/admin/emails");
    }
    return redirect("/admin/campaigns");
};

export default function AdminMarketingRedirect() {
    return null;
}
