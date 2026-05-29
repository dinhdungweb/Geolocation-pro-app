import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useNavigation, useRouteError } from "@remix-run/react";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { loadCrisp, prepareCrisp } from "../utils/crisp";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const CRISP_BOOT_DELAY_MS = 1500;
const CRISP_IDLE_TIMEOUT_MS = 1500;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  };
};

function VisitorLogsPendingShell() {
  const headings = [
    "Timestamp",
    "IP Address",
    "Country",
    "Region",
    "Action",
    "Page Path",
    "Details / Rule",
    "Visitor",
    "Device",
    "OS",
    "Browser",
  ];

  return (
    <div className="app-logs-pending-shell" aria-busy="true" aria-label="Loading visitor logs">
      <style>
        {`
          .app-logs-pending-shell {
            padding: 24px;
          }
          .app-logs-pending-content {
            display: grid;
            gap: 16px;
          }
          .app-logs-pending-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 20px;
          }
          .app-logs-pending-title {
            display: grid;
            gap: 8px;
          }
          .app-logs-pending-filters {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 8px;
          }
          .app-logs-pending-card {
            overflow: hidden;
            border: 1px solid #dfe3e8;
            border-radius: 8px;
            background: #ffffff;
          }
          .app-logs-pending-table-wrap {
            overflow-x: auto;
          }
          .app-logs-pending-table {
            width: 100%;
            min-width: 1040px;
            border-collapse: collapse;
          }
          .app-logs-pending-table th {
            padding: 12px 14px;
            border-bottom: 1px solid #dfe3e8;
            background: #f7f7f7;
            color: #616161;
            font-size: 12px;
            line-height: 16px;
            text-align: left;
            white-space: nowrap;
          }
          .app-logs-pending-table td {
            padding: 14px;
            border-bottom: 1px solid #dfe3e8;
          }
          .app-logs-pending-line {
            display: block;
            height: 12px;
            width: 96px;
            border-radius: 999px;
            background: linear-gradient(90deg, #f1f1f1 0%, #e7e7e7 45%, #f1f1f1 90%);
            background-size: 220% 100%;
            animation: app-logs-pending-pulse 1.2s ease-in-out infinite;
          }
          .app-logs-pending-line-title {
            width: 170px;
            height: 22px;
          }
          .app-logs-pending-line-subtitle {
            width: 300px;
          }
          .app-logs-pending-filter {
            width: 150px;
            height: 32px;
            border-radius: 8px;
          }
          .app-logs-pending-line-1 { width: 112px; }
          .app-logs-pending-line-2 { width: 80px; }
          .app-logs-pending-line-3 { width: 128px; }
          .app-logs-pending-line-4 { width: 64px; }
          @keyframes app-logs-pending-pulse {
            0% { background-position: 120% 0; }
            100% { background-position: -120% 0; }
          }
          @media (max-width: 47.9975em) {
            .app-logs-pending-shell {
              padding: 16px;
            }
            .app-logs-pending-header {
              flex-direction: column;
            }
            .app-logs-pending-filters {
              justify-content: flex-start;
            }
          }
        `}
      </style>
      <div className="app-logs-pending-content">
        <div className="app-logs-pending-header">
          <div className="app-logs-pending-title">
            <span className="app-logs-pending-line app-logs-pending-line-title" />
            <span className="app-logs-pending-line app-logs-pending-line-subtitle" />
          </div>
          <div className="app-logs-pending-filters">
            <span className="app-logs-pending-line app-logs-pending-filter" />
            <span className="app-logs-pending-line app-logs-pending-filter" />
            <span className="app-logs-pending-line app-logs-pending-filter" />
          </div>
        </div>
        <div className="app-logs-pending-card">
          <div className="app-logs-pending-table-wrap">
            <table className="app-logs-pending-table">
              <thead>
                <tr>
                  {headings.map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <tr key={rowIndex}>
                    {headings.map((heading, columnIndex) => (
                      <td key={heading}>
                        <span className={`app-logs-pending-line app-logs-pending-line-${(columnIndex % 4) + 1}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppPendingStyles() {
  return (
    <style>
      {`
        .app-route-pending-shell {
          padding: 24px;
        }
        .app-route-pending-page-default {
          width: min(100%, 998px);
          margin: 0 auto;
        }
        .app-route-pending-page-full {
          width: 100%;
        }
        .app-route-pending-content {
          display: grid;
          gap: 16px;
        }
        .app-route-pending-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
        }
        .app-route-pending-actions {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
        }
        .app-route-pending-stack {
          display: grid;
          gap: 8px;
        }
        .app-route-pending-line,
        .app-route-pending-block,
        .app-route-pending-pill {
          display: block;
          border-radius: 999px;
          background: linear-gradient(90deg, #f1f1f1 0%, #e7e7e7 45%, #f1f1f1 90%);
          background-size: 220% 100%;
          animation: app-route-pending-pulse 1.2s ease-in-out infinite;
        }
        .app-route-pending-line {
          width: 96px;
          height: 12px;
        }
        .app-route-pending-title {
          width: 180px;
          height: 22px;
        }
        .app-route-pending-subtitle {
          width: 320px;
        }
        .app-route-pending-pill {
          width: 132px;
          height: 32px;
          border-radius: 8px;
        }
        .app-route-pending-pill-small {
          width: 92px;
        }
        .app-route-pending-pill-primary {
          width: 78px;
          background: linear-gradient(90deg, #dedede 0%, #d2d2d2 45%, #dedede 90%);
          background-size: 220% 100%;
        }
        .app-route-pending-card {
          overflow: hidden;
          border: 1px solid #dfe3e8;
          border-radius: 8px;
          background: #ffffff;
        }
        .app-route-pending-card-pad {
          padding: 20px;
        }
        .app-route-pending-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .app-route-pending-two-col {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 16px;
        }
        .app-route-pending-three-col {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .app-route-pending-block {
          border-radius: 8px;
          height: 96px;
        }
        .app-route-pending-block-tall {
          height: 240px;
        }
        .app-route-pending-block-medium {
          height: 160px;
        }
        .app-route-pending-page-narrow {
          width: min(100%, 1320px);
          margin: 0 auto;
        }
        .app-route-pending-back-dot {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: linear-gradient(90deg, #f1f1f1 0%, #e7e7e7 45%, #f1f1f1 90%);
          background-size: 220% 100%;
          animation: app-route-pending-pulse 1.2s ease-in-out infinite;
        }
        .app-route-pending-setup-step {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr) 96px;
          gap: 10px;
          align-items: center;
          padding: 10px 12px;
          border-radius: 8px;
        }
        .app-route-pending-setup-step.is-active {
          background: #f3f3f3;
        }
        .app-route-pending-circle {
          width: 20px;
          height: 20px;
          border: 1px dashed #8a8a8a;
          border-radius: 999px;
        }
        .app-route-pending-dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(280px, 0.9fr);
          grid-template-rows: 432px;
          gap: 16px;
        }
        .app-route-pending-side-stack {
          display: grid;
          gap: 16px;
          grid-template-rows: repeat(2, minmax(0, 1fr));
          min-height: 0;
        }
        .app-route-pending-panel {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .app-route-pending-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid #ebebeb;
        }
        .app-route-pending-panel-body {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .app-route-pending-table-dashboard {
          min-width: 640px;
        }
        .app-route-pending-settings-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(560px, 680px);
          gap: 20px;
          align-items: start;
        }
        .app-route-pending-settings-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .app-route-pending-field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .app-route-pending-field {
          display: grid;
          gap: 7px;
        }
        .app-route-pending-input {
          height: 36px;
          border-radius: 8px;
        }
        .app-route-pending-browser {
          border: 1px solid #dfe3e8;
          border-radius: 10px;
          overflow: hidden;
          background: #ffffff;
        }
        .app-route-pending-browser-toolbar {
          min-height: 38px;
          padding: 8px 12px;
          border-bottom: 1px solid #dfe3e8;
          background: #f7f7f7;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .app-route-pending-browser-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #d8dadd;
        }
        .app-route-pending-browser-url {
          flex: 1;
          height: 22px;
          border: 1px solid #dfe3e8;
          border-radius: 999px;
          background: #ffffff;
        }
        .app-route-pending-browser-canvas {
          height: 390px;
          padding: 24px;
          background: #f7f7f7;
        }
        .app-route-pending-pricing-header {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .app-route-pending-pricing-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          align-items: stretch;
        }
        .app-route-pending-plan-card {
          min-height: 440px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .app-route-pending-ribbon {
          height: 32px;
          margin: -20px -20px 0;
          border-radius: 7px 7px 0 0;
          background: linear-gradient(90deg, #d8f6e6 0%, #c2efd9 45%, #d8f6e6 90%);
          background-size: 220% 100%;
          animation: app-route-pending-pulse 1.2s ease-in-out infinite;
        }
        .app-route-pending-plan-spacer {
          flex: 1;
        }
        .app-route-pending-note-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .app-route-pending-support-layout {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
          gap: 20px;
          align-items: start;
        }
        .app-route-pending-support-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .app-route-pending-faq-row {
          padding: 16px 20px;
          border-top: 1px solid #ebebeb;
        }
        .app-route-pending-checkbox {
          width: 16px;
          height: 16px;
          border: 1px solid #c9cccf;
          border-radius: 4px;
          background: #ffffff;
        }
        .app-route-pending-table-wrap {
          overflow-x: auto;
        }
        .app-route-pending-table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
        }
        .app-route-pending-table th {
          padding: 12px 14px;
          border-bottom: 1px solid #dfe3e8;
          background: #f7f7f7;
          color: #616161;
          font-size: 12px;
          line-height: 16px;
          text-align: left;
          white-space: nowrap;
        }
        .app-route-pending-table td {
          padding: 14px;
          border-bottom: 1px solid #dfe3e8;
        }
        .app-route-pending-line-1 { width: 112px; }
        .app-route-pending-line-2 { width: 80px; }
        .app-route-pending-line-3 { width: 128px; }
        .app-route-pending-line-4 { width: 64px; }
        .app-route-pending-line-5 { width: 156px; }
        @keyframes app-route-pending-pulse {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        @media (max-width: 47.9975em) {
          .app-route-pending-shell {
            padding: 16px;
          }
          .app-route-pending-header {
            flex-direction: column;
          }
          .app-route-pending-grid,
          .app-route-pending-two-col,
          .app-route-pending-three-col,
          .app-route-pending-dashboard-grid,
          .app-route-pending-settings-grid,
          .app-route-pending-field-grid,
          .app-route-pending-pricing-grid,
          .app-route-pending-note-grid,
          .app-route-pending-support-layout,
          .app-route-pending-support-actions {
            grid-template-columns: 1fr;
          }
          .app-route-pending-dashboard-grid {
            grid-template-rows: none;
          }
          .app-route-pending-subtitle {
            width: 240px;
          }
        }
      `}
    </style>
  );
}

function PendingTable({
  headings,
  rows = 6,
  bare = false,
  tableClassName = "",
}: {
  headings: string[];
  rows?: number;
  bare?: boolean;
  tableClassName?: string;
}) {
  const tableMarkup = (
      <div className="app-route-pending-table-wrap">
        <table className={`app-route-pending-table ${tableClassName}`}>
          <thead>
            <tr>
              {headings.map((heading, index) => (
                <th key={heading || `select-${index}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {headings.map((heading, columnIndex) => (
                  <td key={heading || `select-${columnIndex}`}>
                    {columnIndex === 0 && !heading ? (
                      <span className="app-route-pending-checkbox" />
                    ) : (
                      <span className={`app-route-pending-line app-route-pending-line-${(columnIndex % 5) + 1}`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );

  if (bare) {
    return tableMarkup;
  }

  return (
    <div className="app-route-pending-card">
      {tableMarkup}
    </div>
  );
}

function DashboardPendingShell() {
  return (
    <div className="app-route-pending-shell" aria-busy="true" aria-label="Loading dashboard">
      <AppPendingStyles />
      <div className="app-route-pending-page-default">
        <div className="app-route-pending-content">
          <div className="app-route-pending-stack">
            <span className="app-route-pending-line app-route-pending-title" />
            <span className="app-route-pending-line app-route-pending-subtitle" />
          </div>

          <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
            <div className="app-route-pending-header">
              <div className="app-route-pending-stack">
                <span className="app-route-pending-line app-route-pending-line-3" />
                <span className="app-route-pending-line app-route-pending-subtitle" />
                <span className="app-route-pending-pill app-route-pending-pill-small" />
              </div>
              <span className="app-route-pending-pill" />
            </div>
            <div className="app-route-pending-stack">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className={`app-route-pending-setup-step${index === 0 ? " is-active" : ""}`}>
                  <span className="app-route-pending-circle" />
                  <span className="app-route-pending-line app-route-pending-line-5" />
                  <span className="app-route-pending-pill app-route-pending-pill-small" />
                </div>
              ))}
            </div>
          </div>

          <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
            <div className="app-route-pending-header">
              <div className="app-route-pending-stack">
                <span className="app-route-pending-line app-route-pending-line-5" />
                <span className="app-route-pending-line app-route-pending-subtitle" />
              </div>
              <span className="app-route-pending-pill app-route-pending-pill-small" />
            </div>
            <span className="app-route-pending-line app-route-pending-line-5" />
            <span className="app-route-pending-block" style={{ height: 8 }} />
          </div>

          <div className="app-route-pending-dashboard-grid">
            <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
              <div className="app-route-pending-panel">
                <div className="app-route-pending-panel-header">
                  <div className="app-route-pending-stack">
                    <span className="app-route-pending-line app-route-pending-line-5" />
                    <span className="app-route-pending-line app-route-pending-subtitle" />
                  </div>
                  <span className="app-route-pending-pill app-route-pending-pill-small" />
                </div>
                <div className="app-route-pending-panel-body">
                  <PendingTable
                    bare
                    rows={8}
                    tableClassName="app-route-pending-table-dashboard"
                    headings={["Country", "Visits", "Popup", "Redirected", "Blocked"]}
                  />
                </div>
              </div>
            </div>
            <div className="app-route-pending-side-stack">
              {[
                ["Block", "Count"],
                ["Rule", "Redirected"],
              ].map((headings, index) => (
                <div key={index} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                  <div className="app-route-pending-panel">
                    <div className="app-route-pending-panel-header">
                      <div className="app-route-pending-stack">
                        <span className="app-route-pending-line app-route-pending-line-3" />
                        <span className="app-route-pending-line app-route-pending-line-5" />
                      </div>
                      <span className="app-route-pending-pill app-route-pending-pill-small" />
                    </div>
                    <div className="app-route-pending-panel-body">
                      <PendingTable bare rows={3} headings={headings} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RulesPendingShell({ ip = false }: { ip?: boolean }) {
  const headings = ip
    ? ["", "Name", "IP Addresses", "Action", "Status", "Priority", "Actions"]
    : ["", "Name", "Type", "Target", "Target URL", "Status", "Method", "Priority", "Actions"];

  return (
    <div className="app-route-pending-shell" aria-busy="true" aria-label="Loading rules">
      <AppPendingStyles />
      <div className="app-route-pending-content">
        <div className="app-route-pending-header">
          <div className="app-route-pending-stack">
            <span className="app-route-pending-line app-route-pending-title" />
            <span className="app-route-pending-line app-route-pending-subtitle" />
          </div>
          <div className="app-route-pending-actions">
            <span className="app-route-pending-pill app-route-pending-pill-small" />
            <span className="app-route-pending-pill app-route-pending-pill-small" />
            <span className="app-route-pending-pill app-route-pending-pill-primary" />
          </div>
        </div>
        <PendingTable headings={headings} rows={3} />
      </div>
    </div>
  );
}

function SettingsPendingShell() {
  return (
    <div className="app-route-pending-shell" aria-busy="true" aria-label="Loading settings">
      <AppPendingStyles />
      <div className="app-route-pending-content">
        <div className="app-route-pending-header">
          <div className="app-route-pending-stack">
            <span className="app-route-pending-line app-route-pending-title" />
            <span className="app-route-pending-line app-route-pending-subtitle" />
          </div>
          <span className="app-route-pending-pill app-route-pending-pill-primary" />
        </div>
        <div className="app-route-pending-settings-grid">
          <div className="app-route-pending-stack">
            <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
              <span className="app-route-pending-line app-route-pending-line-5" />
              <div className="app-route-pending-settings-summary">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                    <span className="app-route-pending-line app-route-pending-line-2" />
                    <span className="app-route-pending-line app-route-pending-line-4" />
                  </div>
                ))}
              </div>
            </div>
            <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
              <span className="app-route-pending-line app-route-pending-line-5" />
              <div className="app-route-pending-field-grid">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="app-route-pending-field">
                    <span className="app-route-pending-line app-route-pending-line-2" />
                    <span className="app-route-pending-line app-route-pending-input" />
                  </div>
                ))}
              </div>
            </div>
            <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
              <span className="app-route-pending-line app-route-pending-line-5" />
              <div className="app-route-pending-field-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="app-route-pending-field">
                    <span className="app-route-pending-line app-route-pending-line-2" />
                    <span className="app-route-pending-line app-route-pending-input" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="app-route-pending-stack">
            {["popup-preview", "blocked-preview"].map((item) => (
              <div key={item} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                <span className="app-route-pending-line app-route-pending-line-5" />
                <span className="app-route-pending-line app-route-pending-subtitle" />
                <div className="app-route-pending-browser">
                  <div className="app-route-pending-browser-toolbar">
                    <span className="app-route-pending-browser-dot" />
                    <span className="app-route-pending-browser-dot" />
                    <span className="app-route-pending-browser-dot" />
                    <span className="app-route-pending-browser-url" />
                  </div>
                  <div className="app-route-pending-browser-canvas">
                    <span className="app-route-pending-block app-route-pending-block-medium" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingPendingShell() {
  return (
    <div className="app-route-pending-shell" aria-busy="true" aria-label="Loading pricing">
      <AppPendingStyles />
      <div className="app-route-pending-page-narrow">
        <div className="app-route-pending-content">
          <div className="app-route-pending-pricing-header">
            <span className="app-route-pending-back-dot" />
            <div className="app-route-pending-stack">
              <span className="app-route-pending-line app-route-pending-title" />
              <span className="app-route-pending-line app-route-pending-subtitle" />
            </div>
          </div>
          <div className="app-route-pending-card app-route-pending-card-pad">
            <div className="app-route-pending-header">
              <div className="app-route-pending-stack">
                <span className="app-route-pending-line app-route-pending-line-5" />
                <span className="app-route-pending-line app-route-pending-subtitle" />
              </div>
              <div className="app-route-pending-actions">
                <span className="app-route-pending-pill app-route-pending-pill-small" />
                <span className="app-route-pending-pill app-route-pending-pill-primary" />
              </div>
            </div>
          </div>
          <div className="app-route-pending-pricing-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack app-route-pending-plan-card">
                <span className="app-route-pending-ribbon" />
                <span className="app-route-pending-line app-route-pending-title" />
                <span className="app-route-pending-line app-route-pending-line-2" />
                <span className="app-route-pending-line app-route-pending-line-5" style={{ height: 28 }} />
                {Array.from({ length: 5 }).map((_, featureIndex) => (
                  <span key={featureIndex} className={`app-route-pending-line app-route-pending-line-${(featureIndex % 5) + 1}`} />
                ))}
                <span className="app-route-pending-plan-spacer" />
                <span className="app-route-pending-pill" />
              </div>
            ))}
          </div>
          <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
            <span className="app-route-pending-line app-route-pending-line-5" />
            <div className="app-route-pending-note-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                  <span className="app-route-pending-line app-route-pending-line-3" />
                  <span className="app-route-pending-line app-route-pending-line-5" />
                </div>
              ))}
            </div>
            <span className="app-route-pending-line app-route-pending-subtitle" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportPendingShell() {
  return (
    <div className="app-route-pending-shell" aria-busy="true" aria-label="Loading support">
      <AppPendingStyles />
      <div className="app-route-pending-page-default">
        <div className="app-route-pending-content">
          <div className="app-route-pending-stack">
            <span className="app-route-pending-line app-route-pending-title" />
            <span className="app-route-pending-line app-route-pending-subtitle" />
          </div>
          <div className="app-route-pending-support-layout">
            <div className="app-route-pending-stack">
              <div className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                <div className="app-route-pending-header">
                  <div className="app-route-pending-stack">
                    <span className="app-route-pending-line app-route-pending-line-5" />
                    <span className="app-route-pending-line app-route-pending-subtitle" />
                  </div>
                  <span className="app-route-pending-pill app-route-pending-pill-primary" />
                </div>
                <div className="app-route-pending-support-actions">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                      <span className="app-route-pending-line app-route-pending-line-3" />
                      <span className="app-route-pending-line app-route-pending-line-5" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="app-route-pending-card">
                <div className="app-route-pending-card-pad app-route-pending-stack">
                  <span className="app-route-pending-line app-route-pending-line-5" />
                  <span className="app-route-pending-line app-route-pending-subtitle" />
                </div>
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="app-route-pending-faq-row app-route-pending-stack">
                    <span className="app-route-pending-line app-route-pending-line-5" />
                    <span className="app-route-pending-line app-route-pending-subtitle" />
                  </div>
                ))}
              </div>
            </div>
            <div className="app-route-pending-stack">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <div key={cardIndex} className="app-route-pending-card app-route-pending-card-pad app-route-pending-stack">
                  <span className="app-route-pending-line app-route-pending-line-5" />
                  {Array.from({ length: cardIndex === 0 ? 4 : 2 }).map((_, lineIndex) => (
                    <span key={lineIndex} className={`app-route-pending-line app-route-pending-line-${(lineIndex % 5) + 1}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function getPendingShellForPath(pathname: string) {
  if (pathname === "/app") return <DashboardPendingShell />;
  if (pathname === "/app/rules") return <RulesPendingShell />;
  if (pathname === "/app/ip-rules") return <RulesPendingShell ip />;
  if (pathname === "/app/settings") return <SettingsPendingShell />;
  if (pathname === "/app/logs") return <VisitorLogsPendingShell />;
  if (pathname === "/app/pricing") return <PricingPendingShell />;
  if (pathname === "/app/support") return <SupportPendingShell />;
  return null;
}

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const isNavigatingToAppRoute =
    navigation.state !== "idle" &&
    navigation.location?.pathname.startsWith("/app") &&
    location.pathname !== navigation.location.pathname;
  const pendingShell = isNavigatingToAppRoute && navigation.location
    ? getPendingShellForPath(navigation.location.pathname)
    : null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    prepareCrisp(shop);

    let delayTimer: number | undefined;
    let idleCallbackId: number | undefined;
    let hasRequestedLoad = false;

    const intentEvents = ["pointerdown", "keydown", "touchstart"] as const;
    const listenerOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
      once: true,
    };

    const removeIntentListeners = () => {
      for (const eventName of intentEvents) {
        window.removeEventListener(eventName, handleUserIntent, listenerOptions);
      }
    };

    const requestCrispLoad = () => {
      if (hasRequestedLoad) return;
      hasRequestedLoad = true;

      if (delayTimer !== undefined) {
        window.clearTimeout(delayTimer);
      }

      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      removeIntentListeners();
      loadCrisp({ shop });
    };

    function handleUserIntent() {
      requestCrispLoad();
    }

    const queueIdleLoad = () => {
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(requestCrispLoad, {
          timeout: CRISP_IDLE_TIMEOUT_MS,
        });
      } else {
        requestCrispLoad();
      }
    };

    for (const eventName of intentEvents) {
      window.addEventListener(eventName, handleUserIntent, listenerOptions);
    }

    delayTimer = window.setTimeout(queueIdleLoad, CRISP_BOOT_DELAY_MS);

    return () => {
      if (delayTimer !== undefined) {
        window.clearTimeout(delayTimer);
      }

      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }

      removeIntentListeners();
    };
  }, [shop]);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/rules">Geolocation Rules</Link>
        <Link to="/app/ip-rules">IP Rules</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/logs">Visitor Logs</Link>
        <Link to="/app/pricing">Pricing</Link>
        <Link to="/app/support">Support</Link>
      </NavMenu>
      {pendingShell || <Outlet />}
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
