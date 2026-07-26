import type { LoaderFunctionArgs } from "react-router";
import { data as responseData } from "react-router";
import { authenticate } from "../shopify.server";
import { COUNTRY_MAP } from "../utils/countries";
import { searchCityOptions } from "../utils/city-options.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

export interface CityOptionsResult {
  cities: Array<{ label: string; value: string }>;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const countryCode = String(url.searchParams.get("country") || "").trim().toUpperCase();
  const regionCode = String(url.searchParams.get("region") || "").trim().toUpperCase();
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 100);

  if (!COUNTRY_MAP[countryCode]) {
    return responseData<CityOptionsResult>(
      { cities: [], error: "Select a valid country" },
      { status: 400 },
    );
  }

  if (regionCode && !regionCode.startsWith(`${countryCode}-`)) {
    return responseData<CityOptionsResult>(
      { cities: [], error: "The selected state/region does not belong to this country" },
      { status: 400 },
    );
  }

  const cities = searchCityOptions({ countryCode, regionCode, query }).map((city) => ({
    label: city,
    value: city,
  }));

  return responseData<CityOptionsResult>(
    { cities },
    {
      headers: {
        "Cache-Control": "private, max-age=3600",
      },
    },
  );
};
