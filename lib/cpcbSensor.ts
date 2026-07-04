import "server-only";

const CPCB_ENDPOINT =
  "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";
const PUBLIC_SAMPLE_KEY = "579b464db66ec23bdd000001";
const CACHE_TTL_MS = 15 * 60 * 1000;
const PAGE_LIMIT = 1000;
const NCR_STATES = ["Delhi", "Haryana", "Uttar Pradesh", "Rajasthan"];
const WHO_PM25_REFERENCE = 15;

type CpcbApiResponse = {
  records?: CpcbRecord[];
  total?: string | number;
};

type CpcbRecord = {
  avg_value?: string | number;
  city?: string;
  last_update?: string;
  latitude?: string | number;
  longitude?: string | number;
  pollutant_avg?: string | number;
  pollutant_id?: string;
  state?: string;
  station?: string;
  station_name?: string;
};

type PollutantKey = "co" | "nh3" | "no2" | "ozone" | "pm10" | "pm25" | "so2";

type GroupedStation = {
  city: string | null;
  state: string | null;
  stationName: string;
  lat: number;
  lng: number;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  nh3: number | null;
  ozone: number | null;
  lastUpdated: string | null;
};

type StationWithDistance = GroupedStation & {
  distanceKm: number;
};

export type NearbyStationReading = {
  stationName: string;
  distanceKm: number;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  nh3: number | null;
  ozone: number | null;
  lastUpdated: string | null;
  source: "CPCB";
};

let cachedStations:
  | {
      expiresAt: number;
      stations: GroupedStation[];
    }
  | null = null;
let warnedAboutSampleKey = false;

function getApiKey() {
  const configuredKey = process.env.CPCB_API_KEY?.trim();
  if (configuredKey) return configuredKey;

  if (process.env.NODE_ENV !== "production") {
    if (!warnedAboutSampleKey) {
      console.warn(
        "CPCB_API_KEY is not set; using the data.gov.in public sample key for development.",
      );
      warnedAboutSampleKey = true;
    }
    return PUBLIC_SAMPLE_KEY;
  }

  return null;
}

function toNumber(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePollutantId(value?: string): PollutantKey | null {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (normalized === "pm25") return "pm25";
  if (normalized === "pm10") return "pm10";
  if (normalized === "no2") return "no2";
  if (normalized === "so2") return "so2";
  if (normalized === "co") return "co";
  if (normalized === "nh3") return "nh3";
  if (normalized === "ozone" || normalized === "o3") return "ozone";
  return null;
}

function getPollutantValue(record: CpcbRecord) {
  return toNumber(record.avg_value ?? record.pollutant_avg);
}

function getStationName(record: CpcbRecord) {
  return record.station ?? record.station_name ?? "Unknown CPCB station";
}

function getStationKey(record: CpcbRecord, lat: number, lng: number) {
  return `${getStationName(record)}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
}

function createStation(record: CpcbRecord, lat: number, lng: number): GroupedStation {
  return {
    city: record.city ?? null,
    state: record.state ?? null,
    stationName: getStationName(record),
    lat,
    lng,
    pm25: null,
    pm10: null,
    no2: null,
    so2: null,
    co: null,
    nh3: null,
    ozone: null,
    lastUpdated: record.last_update ?? null,
  };
}

function hasUsablePollutantData(station: NearbyStationReading | StationWithDistance) {
  return [
    station.pm25,
    station.pm10,
    station.no2,
    station.so2,
    station.co,
    station.nh3,
    station.ozone,
  ].some((value) => value !== null);
}

function haversineKm(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(destinationLat - originLat);
  const lngDelta = toRadians(destinationLng - originLng);
  const lat1 = toRadians(originLat);
  const lat2 = toRadians(destinationLat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchStateRecords(apiKey: string, state: string) {
  const records: CpcbRecord[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(CPCB_ENDPOINT);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("filters[state]", state);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CPCB request failed (${response.status}).`);
    }

    const payload = (await response.json()) as CpcbApiResponse & { error?: string };
    if (payload.error) throw new Error(payload.error);

    const page = Array.isArray(payload.records) ? payload.records : [];
    records.push(...page);

    const total = Number(payload.total);
    offset += page.length;

    if (page.length === 0) break;
    if (Number.isFinite(total) && offset >= total) break;
    if (page.length < PAGE_LIMIT) break;
  }

  return records;
}

async function fetchAllStations() {
  if (cachedStations && cachedStations.expiresAt > Date.now()) {
    return cachedStations.stations;
  }

  const apiKey = getApiKey();
  if (!apiKey) return [];

  const records = (await Promise.all(
    NCR_STATES.map((state) => fetchStateRecords(apiKey, state)),
  )).flat();
  const stations = new Map<string, GroupedStation>();

  for (const record of records) {
    const lat = toNumber(record.latitude);
    const lng = toNumber(record.longitude);
    if (lat === null || lng === null) continue;

    const key = getStationKey(record, lat, lng);
    const station = stations.get(key) ?? createStation(record, lat, lng);
    const pollutant = normalizePollutantId(record.pollutant_id);

    if (pollutant) {
      station[pollutant] = getPollutantValue(record);
    }

    if (record.last_update) station.lastUpdated = record.last_update;
    stations.set(key, station);
  }

  const stationList = [...stations.values()];
  cachedStations = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    stations: stationList,
  };

  return stationList;
}

function toNearbyStationReading(station: StationWithDistance): NearbyStationReading {
  return {
    co: station.co,
    distanceKm: station.distanceKm,
    lastUpdated: station.lastUpdated,
    nh3: station.nh3,
    no2: station.no2,
    ozone: station.ozone,
    pm10: station.pm10,
    pm25: station.pm25,
    so2: station.so2,
    source: "CPCB",
    stationName: station.stationName,
  };
}

export async function fetchNearbyStations(
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<NearbyStationReading[]> {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    const stations = await fetchAllStations();
    return stations
      .map((station) => ({
        ...station,
        distanceKm: Number(haversineKm(lat, lng, station.lat, station.lng).toFixed(2)),
      }))
      .filter((station) => station.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map(toNearbyStationReading);
  } catch (error) {
    console.warn(
      "Could not fetch CPCB nearby stations",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function getNearestStationReading(lat: number, lng: number) {
  const stations = await fetchNearbyStations(lat, lng);
  const nearestStation = stations[0];
  if (!nearestStation || !hasUsablePollutantData(nearestStation)) return null;
  return nearestStation;
}

export function getPm25DeltaFromReference(pm25: number | null) {
  if (pm25 === null) return 0;
  return Math.round(((pm25 - WHO_PM25_REFERENCE) / WHO_PM25_REFERENCE) * 100);
}
