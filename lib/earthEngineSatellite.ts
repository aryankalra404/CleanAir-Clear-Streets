import "server-only";

import * as ee from "@google/earthengine";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDemoH3CellId } from "@/lib/reportSubmissions";

const EE_KEY_PATH = path.join(process.cwd(), "credentials", "earth-engine-key.json");
const NO2_COLLECTION = "COPERNICUS/S5P/OFFL/L3_NO2";
const NO2_BAND = "tropospheric_NO2_column_number_density";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

// Typical urban Sentinel-5P tropospheric NO2 columns often sit around
// 0.00002-0.00025 mol/m^2. Values above the high bound are treated as a
// strong anomaly for this demo fusion score.
const URBAN_NO2_MIN = 0.00002;
const URBAN_NO2_MAX = 0.00025;

type EarthEngineKey = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

export type SatelliteDataResult = {
  rawValue: number | null;
  anomalyScore: number;
  source: "Earth Engine / Sentinel-5P";
  timestamp: string;
  cached: boolean;
  cacheKey: string;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  value: SatelliteDataResult;
};

const cache = new Map<string, CacheEntry>();
let initPromise: Promise<void> | null = null;

function getCacheKey(lat: number, lng: number) {
  return getDemoH3CellId({
    label: "Satellite sample",
    lat: String(lat),
    lng: String(lng),
  });
}

function normalizeNo2Anomaly(rawValue: number) {
  const normalized = (rawValue - URBAN_NO2_MIN) / (URBAN_NO2_MAX - URBAN_NO2_MIN);
  return Math.max(0, Math.min(1, Number(normalized.toFixed(3))));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
    }),
  ]);
}

function authenticateViaPrivateKey(key: EarthEngineKey) {
  return new Promise<void>((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      key,
      () => resolve(),
      (error: unknown) =>
        reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

function initializeEarthEngine(projectId?: string) {
  return new Promise<void>((resolve, reject) => {
    ee.initialize(
      null,
      null,
      () => resolve(),
      (error: unknown) =>
        reject(error instanceof Error ? error : new Error(String(error))),
      null,
      projectId,
    );
  });
}

async function ensureEarthEngineReady() {
  if (!initPromise) {
    initPromise = (async () => {
      const key = JSON.parse(await readFile(EE_KEY_PATH, "utf8")) as EarthEngineKey;
      if (!key.client_email || !key.private_key) {
        throw new Error("Earth Engine service account key is missing required fields.");
      }

      await authenticateViaPrivateKey(key);
      await initializeEarthEngine(key.project_id);
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

function getInfo<T>(eeObject: {
  getInfo: (success: (value: T) => void, error: (error: unknown) => void) => void;
}) {
  return new Promise<T>((resolve, reject) => {
    eeObject.getInfo(
      (value: T) => resolve(value),
      (error: unknown) =>
        reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

function buildFallback(cacheKey: string, error: string): SatelliteDataResult {
  return {
    rawValue: null,
    anomalyScore: 0,
    source: "Earth Engine / Sentinel-5P",
    timestamp: new Date().toISOString(),
    cached: false,
    cacheKey,
    error,
  };
}

export async function getSatelliteDataForPoint(
  lat: number,
  lng: number,
): Promise<SatelliteDataResult> {
  const cacheKey = getCacheKey(lat, lng);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("lat and lng must be valid numbers.");
    }

    await withTimeout(ensureEarthEngineReady(), REQUEST_TIMEOUT_MS, "Earth Engine auth");

    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const region = ee.Geometry.Point([lng, lat]).buffer(5000);
    const composite = ee
      .ImageCollection(NO2_COLLECTION)
      .select(NO2_BAND)
      .filterDate(startDate, endDate)
      .filterBounds(region)
      .median();

    const reduction = composite.reduceRegion({
      reducer: ee.ApiFunction._call("Reducer.mean"),
      geometry: region,
      scale: 1113,
      maxPixels: 1e9,
    });
    const raw = await withTimeout(
      getInfo<number | null>(reduction.get(NO2_BAND)),
      REQUEST_TIMEOUT_MS,
      "Earth Engine NO2 reduction",
    );

    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new Error("Earth Engine returned no unmasked NO2 value for this area.");
    }

    const value: SatelliteDataResult = {
      rawValue: raw,
      anomalyScore: normalizeNo2Anomaly(raw),
      source: "Earth Engine / Sentinel-5P",
      timestamp: new Date().toISOString(),
      cached: false,
      cacheKey,
    };

    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });

    return value;
  } catch (error) {
    return buildFallback(
      cacheKey,
      error instanceof Error ? error.message : "Unknown Earth Engine error.",
    );
  }
}
