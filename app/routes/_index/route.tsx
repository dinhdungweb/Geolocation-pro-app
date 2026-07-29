import type {
  ActionFunctionArgs,
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { redirect } from "react-router";
import { ArrowRight } from "lucide-react";
import {
  ChromaFlow,
  FilmGrain,
  FlutedGlass,
  Shader,
  Swirl,
} from "shaders/react";

import landingStyles from "./landing.css?url";
import {
  APP_STORE_URL,
  ArrowButton,
  PublicFooter,
  PublicHeader,
} from "../../components/public-site-chrome";
import { login } from "../../shopify.server";

const ABOUT_SMALL_IMAGE =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260516_090123_74be96d4-9c1b-40cf-932a-96f4f4babed3.png&w=1280&q=85";
const ABOUT_LARGE_IMAGE =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260516_090133_c157d30b-a99a-4477-bec1-a446149ec3f2.png&w=1280&q=85";
const REDIRECT_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260516_122702_390f5305-8719-41d5-ae80-d23ab3796c28.mp4";
const PROTECTION_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260516_123323_f909c2b8-ff6c-4edf-882b-8ebcdbe389b5.mp4";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: landingStyles },
  { rel: "preconnect", href: "https://d8j0ntlcm91z4.cloudfront.net" },
  { rel: "preconnect", href: "https://images.higgs.ai" },
];

export const meta: MetaFunction = () => [
  { title: "Geo: Redirect — Location control for Shopify" },
  {
    name: "description",
    content:
      "Redirect shoppers by country, state, city, IP address, or Shopify Market. Block unwanted traffic and understand every location-based action.",
  },
];

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

function PartnerMark() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  );
}

function HeroShader() {
  return (
    <div className="geo-shader-wrap" aria-hidden="true">
      <Shader
        className="geo-shader"
        colorSpace="srgb"
        toneMapping="aces"
        disableTelemetry
      >
        <Swirl colorA="#ffffff" colorB="#f0f0f0" detail={1.7} />
        <ChromaFlow
          baseColor="#ffffff"
          downColor="#ff5f03"
          leftColor="#ff5f03"
          rightColor="#ff5f03"
          upColor="#ff5f03"
          momentum={13}
          radius={3.5}
        />
        <FlutedGlass
          aberration={0.61}
          angle={31}
          frequency={8}
          highlight={0.12}
          highlightSoftness={0}
          lightAngle={-90}
          refraction={4}
          shape="rounded"
          softness={1}
          speed={0.15}
        />
        <FilmGrain strength={0.05} />
      </Shader>
    </div>
  );
}

function SectionBadge({
  number,
  children,
}: {
  number: string;
  children: string;
}) {
  return (
    <div className="geo-section-badge">
      <span className="geo-section-badge__number">{number}</span>
      <span className="geo-section-badge__label">{children}</span>
    </div>
  );
}

function ProjectHoverLink({
  children,
  dark = false,
}: {
  children: string;
  dark?: boolean;
}) {
  return (
    <span
      className={`geo-project-link${dark ? " geo-project-link--dark" : ""}`}
    >
      <span>{children}</span>
      <ArrowRight size={14} strokeWidth={1.8} />
    </span>
  );
}

export default function LandingPage() {
  return (
    <main className="geo-landing" id="top">
      <section className="geo-hero" id="features">
        <HeroShader />
        <div className="geo-hero__layer">
          <PublicHeader />

          <div className="geo-hero__spacer" />
          <div className="geo-hero-content">
            <p className="geo-eyebrow">Geo: Redirect for Shopify</p>
            <h1>
              Make every visitor feel local.
              <br className="geo-desktop-break" />
              <span className="geo-mobile-space"> </span>
              Redirect with precision.
              <br className="geo-desktop-break" />
              <span className="geo-mobile-space"> </span>
              Block traffic with confidence.
            </h1>

            <div className="geo-hero-actions">
              <ArrowButton href={APP_STORE_URL}>
                Install Geo: Redirect
              </ArrowButton>
              <div className="geo-partner-badge">
                <span className="geo-partner-badge__mark">
                  <PartnerMark />
                </span>
                <span>Built for Shopify</span>
                <span className="geo-partner-badge__tag">Global-ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="geo-about" id="about">
        <div className="geo-shell">
          <SectionBadge number="1">Meet Geo: Redirect</SectionBadge>
          <h2>
            Location-aware controls,
            <br />
            built to make every visit feel local.
          </h2>

          <div className="geo-about-mobile">
            <div className="geo-about-copy">
              <p>
                Route shoppers by country, state, city, IP address, or Shopify
                Market. Create local experiences while keeping unwanted traffic
                away from your storefront.
              </p>
              <ArrowButton href="#use-cases">Explore the features</ArrowButton>
            </div>
            <div className="geo-about-images">
              <img
                src={ABOUT_SMALL_IMAGE}
                alt="Abstract orange digital form"
                loading="lazy"
              />
              <img
                src={ABOUT_LARGE_IMAGE}
                alt="Abstract white digital surface"
                loading="lazy"
              />
            </div>
          </div>

          <div className="geo-about-desktop">
            <img
              className="geo-about-image geo-about-image--small"
              src={ABOUT_SMALL_IMAGE}
              alt="Abstract orange digital form"
              loading="lazy"
            />
            <div className="geo-about-copy">
              <p>
                Route shoppers by country, state, city,
                <br />
                IP address, or Shopify Market. Create
                <br />
                local experiences while keeping
                <br />
                unwanted traffic away.
              </p>
              <ArrowButton href="#use-cases">Explore the features</ArrowButton>
            </div>
            <img
              className="geo-about-image geo-about-image--large"
              src={ABOUT_LARGE_IMAGE}
              alt="Abstract white digital surface"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="geo-projects" id="use-cases">
        <div className="geo-shell">
          <SectionBadge number="2">Storefront control, simplified</SectionBadge>
          <h2>Built for global growth</h2>

          <div className="geo-project-grid">
            <article className="geo-project-card">
              <a
                className="geo-project-media geo-project-media--wide"
                href={APP_STORE_URL}
                aria-label="Learn more about location redirects"
              >
                <video
                  src={REDIRECT_VIDEO}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
                <ProjectHoverLink>Learn more</ProjectHoverLink>
              </a>
              <p>
                Send shoppers to the right regional store, market, or custom URL
                without adding friction.
              </p>
              <h3>Precision redirects</h3>
            </article>

            <article className="geo-project-card">
              <a
                className="geo-project-media geo-project-media--square"
                href={APP_STORE_URL}
                aria-label="Learn more about traffic protection"
              >
                <video
                  src={PROTECTION_VIDEO}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
                <ProjectHoverLink dark>View protection tools</ProjectHoverLink>
              </a>
              <p>
                Block countries, states, cities, bots, VPNs, proxies, Tor
                traffic, and individual IP addresses.
              </p>
              <h3>Smarter traffic protection</h3>
            </article>
          </div>
        </div>
      </section>

      <PublicFooter />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                if (window !== window.top) {
                  var shopMatch = document.referrer.match(/([^.]+\\.myshopify\\.com)/);
                  if (shopMatch) {
                    window.location.replace("/app?shop=" + encodeURIComponent(shopMatch[1]));
                    return;
                  }
                  window.location.replace("/app");
                }
              } catch (error) {
                window.location.replace("/app");
              }
            })();
          `,
        }}
      />
    </main>
  );
}
