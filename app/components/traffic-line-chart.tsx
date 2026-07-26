import {
  LineChart,
  PolarisVizProvider,
} from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";
import "./traffic-line-chart.css";

interface TrafficPoint {
  date: string;
  label: string;
  redirects: number;
  blocked: number;
}

const chartThemes = {
  HomeTraffic: {
    chartContainer: {
      minHeight: 190,
      padding: "0",
    },
    grid: {
      horizontalOverflow: false,
      verticalOverflow: false,
    },
    line: {
      hasArea: true,
      hasSpline: false,
      width: 2,
    },
  },
};

function formatCompactNumber(value: string | number | null) {
  if (typeof value !== "number") return String(value ?? "");
  if (Math.abs(value) < 1000) return value.toLocaleString();

  return `${(value / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}K`;
}

function formatDateLabel(value: string | number | null) {
  if (typeof value !== "string") return String(value ?? "");

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function TrafficLineChart({
  points,
}: {
  points: TrafficPoint[];
}) {
  const redirectsTotal = points.reduce(
    (sum, point) => sum + point.redirects,
    0,
  );
  const blockedTotal = points.reduce(
    (sum, point) => sum + point.blocked,
    0,
  );
  const data = [
    {
      name: "Redirects",
      color: "#1769e0",
      styleOverride: { line: { hasArea: true } },
      data: points.map((point) => ({
        key: point.date,
        value: point.redirects,
      })),
    },
    {
      name: "Blocked visits",
      color: "#ef6c00",
      styleOverride: { line: { hasArea: true } },
      data: points.map((point) => ({
        key: point.date,
        value: point.blocked,
      })),
    },
  ];

  return (
    <div className="geo-polaris-traffic-chart">
      <div className="geo-polaris-traffic-summary" aria-hidden="true">
        <span>
          <i className="is-blue" />
          Redirects <strong>{redirectsTotal.toLocaleString()}</strong>
        </span>
        <span>
          <i className="is-orange" />
          Blocked visits <strong>{blockedTotal.toLocaleString()}</strong>
        </span>
      </div>
      <PolarisVizProvider
        themes={chartThemes}
        defaultTheme="HomeTraffic"
      >
        <div className="geo-polaris-traffic-plot">
          <LineChart
            id="home-traffic-chart"
            data={data}
            isAnimated={false}
            showLegend={false}
            skipLinkText="Skip traffic chart"
            xAxisOptions={{
              allowLineWrap: false,
              hide: true,
              labelFormatter: formatDateLabel,
            }}
            yAxisOptions={{
              fixedWidth: 36,
              integersOnly: true,
              labelFormatter: formatCompactNumber,
            }}
            tooltipOptions={{
              titleFormatter: formatDateLabel,
              valueFormatter: (value) =>
                typeof value === "number"
                  ? value.toLocaleString()
                  : String(value),
            }}
          />
        </div>
      </PolarisVizProvider>
      <div className="geo-polaris-traffic-dates" aria-hidden="true">
        {points.map((point, index) => (
          <span
            key={point.date}
            style={{
              left: `${
                (index / Math.max(1, points.length - 1)) * 100
              }%`,
            }}
          >
            {formatDateLabel(point.date)}
          </span>
        ))}
      </div>
    </div>
  );
}
