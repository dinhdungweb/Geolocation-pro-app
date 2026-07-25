import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const disabledResponse = {
    error: "This endpoint is disabled. Use the Shopify App Proxy endpoint at /apps/geolocation/config.",
};

function responseData<T>(payload: T, init?: ResponseInit) {
    return Response.json(payload, init);
}

export const loader = async (_args: LoaderFunctionArgs) => {
    return responseData(disabledResponse, {
        status: 410,
        headers: {
            "Cache-Control": "no-store",
        },
    });
};

export const action = async (_args: ActionFunctionArgs) => {
    return responseData(disabledResponse, {
        status: 410,
        headers: {
            "Cache-Control": "no-store",
        },
    });
};
