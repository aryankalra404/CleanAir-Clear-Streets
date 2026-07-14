export const DELHI_NCR_OPERATIONAL_BOUNDS = {
  maxLat: 29.25,
  maxLng: 77.85,
  minLat: 28.1,
  minLng: 76.55,
} as const;

export function isInOperationalRegion(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= DELHI_NCR_OPERATIONAL_BOUNDS.minLat &&
    lat <= DELHI_NCR_OPERATIONAL_BOUNDS.maxLat &&
    lng >= DELHI_NCR_OPERATIONAL_BOUNDS.minLng &&
    lng <= DELHI_NCR_OPERATIONAL_BOUNDS.maxLng
  );
}
