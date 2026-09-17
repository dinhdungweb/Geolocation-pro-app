import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "react-router";

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{isNotFound ? "Page not found" : "Unable to load app"}</title>
        <Meta />
        <Links />
      </head>
      <body>
        <main
          style={{
            alignItems: "center",
            background: "#f6f6f7",
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "center",
            minHeight: "100vh",
            padding: 24,
          }}
        >
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #dedede",
              borderRadius: 12,
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
              maxWidth: 520,
              padding: 32,
              textAlign: "center",
              width: "100%",
            }}
          >
            <h1 style={{ color: "#202223", fontSize: 24, margin: "0 0 12px" }}>
              {isNotFound ? "Page not found" : "We couldn't load this page"}
            </h1>
            <p style={{ color: "#616161", lineHeight: 1.5, margin: "0 0 24px" }}>
              {isNotFound
                ? "The page may have moved or is no longer available."
                : "Please reload the app. If the problem continues, contact support."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: "#303030",
                border: 0,
                borderRadius: 8,
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 16px",
              }}
            >
              Reload app
            </button>
          </section>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
