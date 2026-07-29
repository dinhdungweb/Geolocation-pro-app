import type { LinksFunction, MetaFunction } from "react-router";

import {
  ArrowButton,
  PublicFooter,
  PublicHeader,
} from "../components/public-site-chrome";
import publicStyles from "./_index/landing.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: publicStyles },
];

export const meta: MetaFunction = () => [
  { title: "Frequently Asked Questions — Geo: Redirect" },
  {
    name: "description",
    content:
      "Answers about setting up Geo: Redirect, storefront performance, billing, geolocation rules, and troubleshooting.",
  },
];

const FAQ_GROUPS = [
  {
    number: "01",
    title: "Getting started",
    questions: [
      {
        question: "Is coding knowledge required?",
        answer:
          "No. Geo: Redirect is designed to be no-code. You can create, prioritize, schedule, enable, and disable location rules directly from the app dashboard.",
      },
      {
        question: "What locations can I target?",
        answer:
          "You can target countries, states or regions, cities, Shopify Markets, and individual IP addresses. Available targeting options depend on your plan.",
      },
      {
        question: "Can I redirect visitors automatically?",
        answer:
          "Yes. Rules can redirect immediately, show a customizable popup, block access, or display a location-aware message depending on the rule type you choose.",
      },
    ],
  },
  {
    number: "02",
    title: "Performance & storefront",
    questions: [
      {
        question: "Does the app slow down my store?",
        answer:
          "Geolocation checks run asynchronously and configuration responses are cached. The storefront extension is intentionally lightweight, although any client-side blocking solution may show a very brief page flash on slow connections before the visitor is blocked.",
      },
      {
        question: "How is a visitor’s location detected?",
        answer:
          "The app estimates location from the visitor’s IP address. Country detection is generally reliable, while state and city precision can vary by network, mobile carrier, VPN, proxy, and the geolocation data available for that IP.",
      },
      {
        question: "Does Geo: Redirect work with Shopify Markets?",
        answer:
          "Yes. Rules can use Shopify Markets as a target so merchants can connect their location strategy with the markets already configured in Shopify.",
      },
    ],
  },
  {
    number: "03",
    title: "Billing & plans",
    questions: [
      {
        question: "Is there a free trial?",
        answer:
          "Yes. Paid plans include a 3-day free trial so you can test advanced controls before billing starts.",
      },
      {
        question: "What happens if I exceed my visitor limit?",
        answer:
          "Paid plans can apply usage charges within the spending cap shown during Shopify subscription approval. On the Free plan, geolocation actions pause after the included limit and resume in the next usage period.",
      },
      {
        question: "Can I change plans later?",
        answer:
          "Yes. You can upgrade, downgrade, or return to the Free plan from the Pricing page. Shopify handles subscription approval and billing securely.",
      },
    ],
  },
  {
    number: "04",
    title: "Troubleshooting",
    questions: [
      {
        question: "Why is my redirect not working during testing?",
        answer:
          "Confirm that your current IP matches the rule target, the rule is active, its schedule and page targeting match, and the app embed is enabled. Incognito mode can help when an earlier popup choice is stored in the browser.",
      },
      {
        question: "Why does my city differ from my actual city?",
        answer:
          "City detection is estimated from IP data rather than GPS. Corporate networks, mobile carriers, VPNs, and ISP routing can cause the detected city to be a nearby hub instead of the visitor’s exact location.",
      },
      {
        question: "How do I contact support?",
        answer:
          "Email support@bluepeaks.top with your shop domain, the affected rule, and an example URL. Screenshots and the approximate test time help us investigate faster.",
      },
    ],
  },
];

export default function FAQ() {
  return (
    <main className="geo-public-page" id="top">
      <section className="geo-public-hero geo-public-hero--faq">
        <PublicHeader />
        <div className="geo-shell geo-public-hero__content">
          <div className="geo-section-badge">
            <span className="geo-section-badge__number">02</span>
            <span className="geo-section-badge__label">Help center</span>
          </div>
          <p className="geo-public-kicker">Frequently asked questions</p>
          <h1>
            Answers first.
            <br />
            Friction second.
          </h1>
          <div className="geo-public-hero__meta">
            <span>Setup, billing, and troubleshooting</span>
            <a href="mailto:support@bluepeaks.top">Still need help? ↗</a>
          </div>
        </div>
      </section>

      <section className="geo-faq-content">
        <div className="geo-shell">
          <div className="geo-faq-heading">
            <p>Everything you need to get Geo: Redirect working confidently.</p>
            <ArrowButton href="mailto:support@bluepeaks.top">
              Contact support
            </ArrowButton>
          </div>

          <div className="geo-faq-groups">
            {FAQ_GROUPS.map((group) => (
              <section className="geo-faq-group" key={group.number}>
                <header>
                  <span>{group.number}</span>
                  <h2>{group.title}</h2>
                </header>
                <div>
                  {group.questions.map((item) => (
                    <details className="geo-faq-item" key={item.question}>
                      <summary>
                        <span>{item.question}</span>
                        <i aria-hidden="true" />
                      </summary>
                      <p>{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
