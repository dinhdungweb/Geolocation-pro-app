import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const [shop, setShop] = useState("");

  const handleShopChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = event.target.value;
    // Auto-remove protocol and trailing slash
    value = value.replace(/^https?:\/\//, "").replace(/\/$/, "");
    setShop(value);
  };

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        {/* Placeholder Logo */}
        <div style={{ marginBottom: "1.5rem" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="6" fill="#008060" />
            <path d="M12 6L12 18M6 12L18 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 8L8 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className={styles.heading}>Welcome to GeoPro</h1>
        <p className={styles.text}>
          Advanced Geolocation Redirects & Blocking to protect and optimize your store traffic.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop Domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                value={shop}
                onChange={handleShopChange}
                placeholder="example.myshopify.com"
                required
              />
            </label>
            <button className={styles.button} type="submit">
              Log in / Install
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <span>🌍</span>
            <div>
              <strong>Smart Redirects</strong>
              <br />Auto-route visitors to their local store.
            </div>
          </li>
          <li>
            <span>🛡️</span>
            <div>
              <strong>IP Protection</strong>
              <br />Block unwanted traffic and bots instantly.
            </div>
          </li>
          <li>
            <span>📊</span>
            <div>
              <strong>Analytics</strong>
              <br />Real-time insights on visitor locations.
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
