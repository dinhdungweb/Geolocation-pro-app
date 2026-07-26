import WorldMap, {
  type CountryContext,
  type ISOCode,
} from "react-svg-worldmap";

interface WorldTrafficMapProps {
  countries: Array<{
    code: string;
    visitors: number;
  }>;
}

export default function WorldTrafficMap({
  countries,
}: WorldTrafficMapProps) {
  const data = countries.map((country) => ({
    country: country.code.toLowerCase() as ISOCode,
    value: country.visitors,
  }));
  const styleCountry = ({
    countryValue,
    minValue,
    maxValue,
  }: CountryContext) => {
    const hasTraffic =
      typeof countryValue === "number" && countryValue > 0;
    const intensity = hasTraffic
      ? maxValue === minValue
        ? 1
        : (countryValue - minValue) / (maxValue - minValue)
      : 0;

    return {
      fill: hasTraffic ? "#1769e0" : "#dbeafe",
      fillOpacity: hasTraffic ? 0.25 + Math.sqrt(intensity) * 0.75 : 1,
      stroke: "#ffffff",
      strokeWidth: 0.8,
      strokeOpacity: 1,
      outline: "none",
      cursor: hasTraffic ? "pointer" : "default",
      transition: "fill-opacity 120ms ease",
    };
  };

  return (
    <WorldMap
      data={data}
      size="responsive"
      color="#1769e0"
      backgroundColor="transparent"
      borderColor="#ffffff"
      frame={false}
      regionClassName="geo-map-region"
      styleFunction={styleCountry}
      hrefFunction={({ countryCode, countryName, countryValue }) =>
        typeof countryValue === "number" && countryValue > 0
          ? {
              href: `/app/logs?country=${countryCode.toUpperCase()}`,
              "aria-label": `View visitor logs from ${countryName}`,
            }
          : undefined
      }
      tooltipTextFunction={({ countryName, countryValue }) =>
        typeof countryValue === "number"
          ? `${countryName}: ${countryValue.toLocaleString()} visitors — click to view logs`
          : `${countryName}: no traffic`
      }
    />
  );
}
