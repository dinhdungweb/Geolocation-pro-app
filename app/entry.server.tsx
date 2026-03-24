import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}

/**
 * Hàm lọc log: Loại bỏ các dòng log rác từ bot quét (cgi-bin, php, admin...)
 */
export function handleError(error: unknown, { request }: { request: Request }) {
  if (error instanceof Error) {
    const junkPaths = [
      "/cgi-bin/",
      ".php",
      ".env",
      "wp-admin",
      "/admin",
      "wlwmanifest.xml",
      "xmlrpc.php",
      "/.well-known/",
      "/javascript",
      "/scripts",
      "/styles",
      "/wk/",
      ".json",
      "tsconfig",
      "webpack",
      "angular"
    ];

    const url = request.url.toLowerCase();
    const isJunk = junkPaths.some((path) => url.includes(path.toLowerCase()));
    
    // Nếu là lỗi 404 do bot quét đường dẫn rác thì không log ra terminal
    if (isJunk && (error.message?.includes("No route matches") || (error as any).status === 404)) {
      return;
    }

    // Lọc bỏ lỗi AbortError (do người dùng hủy request hoặc timeout)
    if (error.name === "AbortError" || error.message.includes("operation was aborted")) {
      return;
    }
  }

  // Vẫn log các lỗi thực tế khác của hệ thống
  console.error(error);
}
