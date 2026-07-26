import {
  DonutChart,
  LineChart,
  PolarisVizProvider,
} from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";

type DailyPoint = {
  date: string;
  visitors: number;
  redirects: number;
  blocked: number;
};

type BreakdownItem = {
  name: string;
  value: number;
  color: string;
};

function formatDateLabel(value: string, compact: boolean) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en", {
    ...(compact
      ? { weekday: "short" as const }
      : { month: "short" as const, day: "numeric" as const }),
    timeZone: "UTC",
  }).format(date);
}

export function AnalyticsTrendChart({
  points,
}: {
  points: DailyPoint[];
}) {
  const compact = points.length <= 7;
  const data = [
    {
      name: "Visits",
      color: "#2563eb",
      data: points.map((point) => ({
        key: formatDateLabel(point.date, compact),
        value: point.visitors,
      })),
    },
    {
      name: "Redirects",
      color: "#7c3aed",
      data: points.map((point) => ({
        key: formatDateLabel(point.date, compact),
        value: point.redirects,
      })),
    },
    {
      name: "Blocked",
      color: "#f97316",
      data: points.map((point) => ({
        key: formatDateLabel(point.date, compact),
        value: point.blocked,
      })),
    },
  ];

  return (
    <PolarisVizProvider>
      <LineChart
        id="analytics-traffic-actions-chart"
        data={data}
        isAnimated={false}
        legendPosition="left"
        showLegend
        skipLinkText="Skip traffic and actions chart"
        xAxisOptions={{ allowLineWrap: false }}
        yAxisOptions={{ integersOnly: true }}
        tooltipOptions={{
          valueFormatter: (value) =>
            typeof value === "number" ? value.toLocaleString() : String(value),
        }}
      />
    </PolarisVizProvider>
  );
}

export function AnalyticsBreakdownChart({
  items,
}: {
  items: BreakdownItem[];
}) {
  const data = items.map((item) => ({
    name: item.name,
    color: item.color,
    data: [{ key: item.name, value: item.value }],
  }));

  return (
    <PolarisVizProvider>
      <DonutChart
        data={data}
        isAnimated={false}
        showLegend
        showLegendValues
        legendPosition="right"
        maxSeries={5}
        tooltipOptions={{
          valueFormatter: (value) =>
            typeof value === "number" ? value.toLocaleString() : String(value),
        }}
      />
    </PolarisVizProvider>
  );
}
