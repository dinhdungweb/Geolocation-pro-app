import { getGeoFromIP } from "./maxmind.server";
import { getStateName } from "./states";

type VisitorLogRegionInput = {
  ipAddress?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
};

export async function resolveVisitorLogRegionName(log: VisitorLogRegionInput) {
  const storedRegionName = log.regionName?.trim();
  if (storedRegionName) return storedRegionName;

  const regionCode = log.regionCode?.trim();
  if (!regionCode) return null;

  const mappedName = getStateName(regionCode);
  if (mappedName !== regionCode) return mappedName;

  if (!log.ipAddress) return regionCode;

  const geo = await getGeoFromIP(log.ipAddress);
  if (
    geo.regionName &&
    geo.regionCode &&
    geo.regionCode.toUpperCase() === regionCode.toUpperCase()
  ) {
    return geo.regionName;
  }

  return regionCode;
}
