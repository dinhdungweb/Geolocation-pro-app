import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

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
