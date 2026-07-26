import {
  LineChart,
  PolarisVizProvider,
} from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";

interface TrafficPoint {
  date: string;
  label: string;
  redirects: number;
  blocked: number;
}

export default function TrafficLineChart({
  points,
}: {
  points: TrafficPoint[];
}) {
  const data = [
    {
      name: "Redirects",
      color: "#1769e0",
      data: points.map((point) => ({
        key: point.label,
        value: point.redirects,
      })),
    },
    {
      name: "Blocked visits",
      color: "#ef6c00",
      data: points.map((point) => ({
        key: point.label,
        value: point.blocked,
      })),
    },
  ];

  return (
    <PolarisVizProvider>
      <LineChart
        id="home-traffic-chart"
        data={data}
        isAnimated={false}
        legendPosition="left"
        showLegend
        skipLinkText="Skip traffic chart"
        xAxisOptions={{
          allowLineWrap: false,
        }}
        yAxisOptions={{
          integersOnly: true,
        }}
        tooltipOptions={{
          valueFormatter: (value) =>
            typeof value === "number" ? value.toLocaleString() : String(value),
        }}
      />
    </PolarisVizProvider>
  );
}
