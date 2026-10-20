export type ClientErrorPayload = {
  boundary: "root" | "layout" | "route" | "await";
  message: string;
  name?: string;
  path: string;
  stack?: string;
  status?: number;
};

type ClientErrorTransport = {
  fetchImpl?: typeof fetch;
  getIdToken?: () => Promise<string | undefined>;
};

const reportedErrors = new Set<string>();

export function describeClientError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    const statusText =
      "statusText" in error && typeof error.statusText === "string"
        ? error.statusText
        : "";
    return { message: `Route error response ${error.status} ${statusText}`.trim(), status: error.status };
  }

  return { message: String(error) };
}

export async function sendClientError(
  payload: ClientErrorPayload,
  {
    fetchImpl = fetch,
    getIdToken = async () => window.shopify?.idToken?.(),
  }: ClientErrorTransport = {},
) {
  try {
    const token = await getIdToken();
    if (!token) return false;

    const response = await fetchImpl("/app/client-error", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        message: payload.message.slice(0, 500),
        path: payload.path.slice(0, 200),
        stack: payload.stack?.slice(0, 2000),
      }),
      keepalive: true,
    });

    return response.ok;
  } catch {
    // Error reporting must never cause another error screen.
    return false;
  }
}

export function reportClientError(
  error: unknown,
  boundary: ClientErrorPayload["boundary"],
) {
  if (typeof window === "undefined") return;

  const details = describeClientError(error);
  const path = window.location.pathname;
  console.error(`[ClientError:${boundary}] ${path}`, error);

  const key = `${boundary}:${path}:${details.message}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);

  void sendClientError({ ...details, boundary, path });
}
