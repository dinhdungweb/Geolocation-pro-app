import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

const disabledResponse = {
    error: "This endpoint is disabled. Use the Shopify App Proxy endpoint at /apps/geolocation/config.",
};

export const loader = async (_args: LoaderFunctionArgs) => {
    return json(disabledResponse, {
        status: 410,
        headers: {
            "Cache-Control": "no-store",
        },
    });
};

export const action = async (_args: ActionFunctionArgs) => {
    return json(disabledResponse, {
        status: 410,
        headers: {
            "Cache-Control": "no-store",
        },
    });
};
