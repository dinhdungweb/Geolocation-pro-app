import type { LinksFunction, MetaFunction } from "react-router";

import {
  PublicFooter,
  PublicHeader,
} from "../components/public-site-chrome";
import publicStyles from "./_index/landing.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: publicStyles },
];

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Geo: Redirect" },
  {
    name: "description",
    content:
      "Learn how Geo: Redirect collects, processes, secures, and retains data for Shopify merchants and storefront visitors.",
  },
];

const SECTIONS = [
  { id: "information", label: "Information we collect" },
  { id: "use", label: "How we use information" },
  { id: "retention", label: "Data retention" },
  { id: "security", label: "Security" },
  { id: "processors", label: "Third-party processors" },
  { id: "requests", label: "Privacy requests" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact us" },
];

export default function PrivacyPolicy() {
  return (
    <main className="geo-public-page" id="top">
      <section className="geo-public-hero">
        <PublicHeader />
        <div className="geo-shell geo-public-hero__content">
          <div className="geo-section-badge">
            <span className="geo-section-badge__number">01</span>
            <span className="geo-section-badge__label">Legal</span>
          </div>
          <p className="geo-public-kicker">Privacy at Geo: Redirect</p>
          <h1>
            Clear about data.
            <br />
            Careful by design.
          </h1>
          <div className="geo-public-hero__meta">
            <span>Privacy policy</span>
            <span>Last updated July 28, 2026</span>
          </div>
        </div>
      </section>

      <section className="geo-public-content">
        <div className="geo-shell geo-legal-layout">
          <aside className="geo-legal-nav">
            <p>On this page</p>
            <nav aria-label="Privacy policy sections">
              {SECTIONS.map((section, index) => (
                <a href={`#${section.id}`} key={section.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="geo-legal-article">
            <p className="geo-legal-intro">
              This Privacy Policy describes how{" "}
              <strong>Geo: Redirect &amp; Country Block</strong> (the “App”)
              collects, uses, and discloses information when you install or use
              the App with your Shopify-supported store.
            </p>

            <section id="information">
              <span className="geo-legal-number">01</span>
              <div>
                <h2>Information we collect</h2>
                <p>
                  When you install the App, we can access limited information
                  required to provide its features:
                </p>
                <ul>
                  <li>Shop domain and configuration settings.</li>
                  <li>
                    Customer IP addresses, strictly for geolocation and
                    protection purposes.
                  </li>
                  <li>
                    Storefront browsing activity used to trigger redirects or
                    blocks.
                  </li>
                  <li>
                    When Order Risk is enabled: order ID, order number,
                    timestamps, amount, currency, fulfillment and financial
                    status, checkout IP address, and Shopify risk assessment.
                  </li>
                </ul>
                <div className="geo-legal-note">
                  We do not request or store customer names, email addresses,
                  phone numbers, street addresses, postal codes, or payment
                  credentials for Order Risk.
                </div>
              </div>
            </section>

            <section id="use">
              <span className="geo-legal-number">02</span>
              <div>
                <h2>How we use your information</h2>
                <p>We process collected information to:</p>
                <ul>
                  <li>Provide geolocation redirection and blocking services.</li>
                  <li>Report analytics on redirection and blocking events.</li>
                  <li>Improve and monitor App performance.</li>
                  <li>
                    Check for VPN, proxy, hosting, or similar anonymizing
                    services when anti-fraud protection is enabled.
                  </li>
                  <li>
                    Associate checkout IP activity with an order and surface
                    advisory risk signals when Order Risk is enabled.
                  </li>
                </ul>
                <p>
                  The App does not automatically cancel, refund, hold, or reject
                  orders. Final order decisions remain with the merchant.
                </p>
              </div>
            </section>

            <section id="retention">
              <span className="geo-legal-number">03</span>
              <div>
                <h2>Data retention</h2>
                <p>
                  Storefront visitor logs, including raw IP addresses, are
                  retained for up to 7 days. Order Risk records are retained for
                  up to 60 days. Operational billing-event records may be
                  retained for up to 35 days. Data is automatically deleted
                  after the applicable period unless a shorter period is
                  required by a verified deletion request.
                </p>
              </div>
            </section>

            <section id="security">
              <span className="geo-legal-number">04</span>
              <div>
                <h2>Security</h2>
                <p>
                  The App uses HTTPS to protect data in transit. Checkout IP
                  addresses, IP-derived location data, order display metadata,
                  and risk-signal details retained in Order Risk are encrypted
                  before database storage. Deterministic keyed hashes support
                  order linkage, deletion requests, and repeated-IP comparisons
                  without querying encrypted values.
                </p>
              </div>
            </section>

            <section id="processors">
              <span className="geo-legal-number">05</span>
              <div>
                <h2>Third-party processors</h2>
                <p>
                  Geolocation lookups are primarily performed with local IP
                  geolocation data. When region-level data is unavailable, IP
                  addresses may be processed by a third-party IP geolocation
                  provider to improve accuracy. When a merchant enables and
                  configures VPN or proxy checking, IP addresses may also be
                  sent to that provider for fraud and security checks.
                </p>
              </div>
            </section>

            <section id="requests">
              <span className="geo-legal-number">06</span>
              <div>
                <h2>Merchant instructions and privacy requests</h2>
                <p>
                  We process data only to provide the functions described above
                  and on the merchant’s instructions. We do not sell protected
                  customer data or use it for advertising. We process Shopify’s
                  mandatory customer data request, customer redaction, and shop
                  redaction webhooks and delete linked Order Risk records when
                  requested.
                </p>
              </div>
            </section>

            <section id="changes">
              <span className="geo-legal-number">07</span>
              <div>
                <h2>Changes</h2>
                <p>
                  We may update this policy to reflect changes to our practices
                  or for operational, legal, or regulatory reasons. The latest
                  revision date will always appear at the top of this page.
                </p>
              </div>
            </section>

            <section id="contact">
              <span className="geo-legal-number">08</span>
              <div>
                <h2>Contact us</h2>
                <p>
                  Questions about our privacy practices, requests, or
                  complaints can be sent to our support team.
                </p>
                <a
                  className="geo-contact-link"
                  href="mailto:support@bluepeaks.top"
                >
                  support@bluepeaks.top
                  <span>↗</span>
                </a>
              </div>
            </section>
          </article>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
