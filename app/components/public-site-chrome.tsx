import { useEffect, useState } from "react";
import { ArrowRight, Clock, Menu, X } from "lucide-react";

export const APP_STORE_URL =
  "https://apps.shopify.com/geo-redirect-country-block";

const NAV_ITEMS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#about" },
  { label: "Use cases", href: "/#use-cases" },
  { label: "Pricing", href: APP_STORE_URL },
];

function RollingText({ children }: { children: string }) {
  return (
    <span className="geo-roll-window" aria-label={children}>
      <span className="geo-roll-track" aria-hidden="true">
        <span>{children}</span>
        <span>{children}</span>
      </span>
    </span>
  );
}

export function ArrowButton({
  children,
  href,
  tone = "orange",
}: {
  children: string;
  href: string;
  tone?: "orange" | "dark";
}) {
  return (
    <a className={`geo-arrow-button geo-arrow-button--${tone}`} href={href}>
      <RollingText>{children}</RollingText>
      <span className="geo-arrow-button__icon" aria-hidden="true">
        <ArrowRight size={15} strokeWidth={1.8} />
      </span>
    </a>
  );
}

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [londonTime, setLondonTime] = useState("--:--");

  useEffect(() => {
    const updateTime = () => {
      setLondonTime(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Europe/London",
        }).format(new Date()),
      );
    };

    updateTime();
    const timer = window.setInterval(updateTime, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className="geo-header">
        <div className="geo-navbar">
          <div className="geo-navbar__left">
            <a className="geo-logo" href="/" aria-label="Geo Redirect home">
              <span className="geo-logo__mark">GR</span>
              <span className="geo-logo__name">Geo: Redirect</span>
            </a>

            <nav className="geo-desktop-nav" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => (
                <a href={item.href} key={item.label}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="geo-navbar__right">
            <span className="geo-availability">Helping stores go global</span>
            <span className="geo-clock">
              <Clock size={14} strokeWidth={1.8} />
              {londonTime} in London
            </span>
            <ArrowButton href={APP_STORE_URL} tone="dark">
              Install on Shopify
            </ArrowButton>
          </div>

          <button
            type="button"
            className="geo-menu-button"
            aria-expanded={menuOpen}
            aria-controls="geo-mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={17} />
            <span>Menu</span>
          </button>
        </div>
      </header>

      <div
        className={`geo-mobile-overlay${menuOpen ? " is-open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <button
          className="geo-mobile-backdrop"
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
        <div
          className="geo-mobile-sheet"
          id="geo-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="geo-mobile-sheet__top">
            <span className="geo-clock">
              <Clock size={14} strokeWidth={1.8} />
              {londonTime} in London
            </span>
            <button
              type="button"
              className="geo-menu-button"
              onClick={() => setMenuOpen(false)}
            >
              <X size={17} />
              <span>Close</span>
            </button>
          </div>

          <nav className="geo-mobile-nav" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <a
                href={item.href}
                key={item.label}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <ArrowButton href={APP_STORE_URL}>
            Start protecting your store
          </ArrowButton>
        </div>
      </div>
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="geo-footer">
      <div className="geo-shell">
        <div className="geo-footer-cta">
          <div>
            <p className="geo-footer-eyebrow">Ready to go global?</p>
            <h2>
              Put every visitor
              <br />
              in the right place.
            </h2>
          </div>
          <ArrowButton href={APP_STORE_URL}>Install Geo: Redirect</ArrowButton>
        </div>

        <div className="geo-footer-main">
          <div className="geo-footer-brand">
            <a className="geo-footer-logo" href="/">
              <span className="geo-logo__mark">GR</span>
              <span>Geo: Redirect</span>
            </a>
            <p>
              Location redirects, storefront protection, and traffic insights
              for Shopify stores.
            </p>
          </div>

          <div className="geo-footer-links">
            <div>
              <p>Product</p>
              <a href="/#features">Features</a>
              <a href="/#about">How it works</a>
              <a href="/#use-cases">Use cases</a>
              <a href={APP_STORE_URL}>Pricing</a>
            </div>
            <div>
              <p>Resources</p>
              <a href="/faq">FAQ</a>
              <a href={`${APP_STORE_URL}#reviews`}>Reviews</a>
              <a href="/privacy">Privacy policy</a>
              <a href="mailto:support@bluepeaks.top">Support</a>
            </div>
            <div>
              <p>Capabilities</p>
              <a href="/#use-cases">Geo redirects</a>
              <a href="/#use-cases">Country blocking</a>
              <a href="/#use-cases">IP protection</a>
              <a href="/#use-cases">Traffic analytics</a>
            </div>
          </div>
        </div>

        <div className="geo-footer-bottom">
          <span>© {new Date().getUTCFullYear()} Bluepeaks Studio</span>
          <span>Built for global Shopify storefronts</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
