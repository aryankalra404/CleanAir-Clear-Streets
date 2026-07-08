import "server-only";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import type { NearbyStationReading } from "@/lib/cpcbSensor";
import { getNearestStationReading, getPrimaryPollutant } from "@/lib/cpcbSensor";
import type { SatelliteDataResult } from "@/lib/earthEngineSatellite";
import { getSatelliteDataForPoint } from "@/lib/earthEngineSatellite";
import { getH3CellId, getSeverity } from "@/lib/reportSubmissions";
import {
  SENSOR_PROXIMITY_KM,
  SENSOR_SUPPORT_DELTA_PCT,
  SATELLITE_SUPPORT_SCORE,
  determineTier,
  tierPromotionReason,
} from "@/lib/supportEvidence";
import type { HazardType } from "@/lib/types";

export type SensorSupportResult = {
  supported: boolean;
  pollutantName: string;
  pollutantValue: number | null;
  deltaPct: number;
  distanceKm: number | null;
};

export type SatelliteSupportResult = {
  supported: boolean;
  hazardWeight: number;
};

/**
 * Which satellite band is relevant for which hazard.
 * - dust / fire  -> aerosol index (particulate-driven, "fireDustSmoke" weight)
 * - industrial / smog -> NO2 (combustion/traffic-driven, "industrialTraffic" weight)
 */
export function getSatelliteHazardWeight(
  hazardType: HazardType,
  satellite: Pick<SatelliteDataResult, "hazardWeights"> | null | undefined,
): number {
  if (!satellite) return 0;
  if (hazardType === "dust" || hazardType === "fire") {
    return satellite.hazardWeights.fireDustSmoke;
  }
  return satellite.hazardWeights.industrialTraffic;
}

export function checkSensorSupport(
  hazardType: HazardType,
  station: Partial<NearbyStationReading> | null | undefined,
  geminiType?: string,
): SensorSupportResult {
  if (!station) {
    return { supported: false, pollutantName: "PM2.5", pollutantValue: null, deltaPct: 0, distanceKm: null };
  }

  const distanceKm = station.distanceKm ?? null;
  if (distanceKm === null || distanceKm > SENSOR_PROXIMITY_KM) {
    return { supported: false, pollutantName: "PM2.5", pollutantValue: null, deltaPct: 0, distanceKm };
  }

  // getPrimaryPollutant already maps hazard -> the right pollutant:
  // dust -> PM10, industrial -> NO2/SO2, fire/smog -> PM2.5.
  const primary = getPrimaryPollutant(geminiType ?? hazardType, station);
  const supported = primary.value !== null && primary.delta >= SENSOR_SUPPORT_DELTA_PCT;

  return {
    supported,
    pollutantName: primary.name,
    pollutantValue: primary.value,
    deltaPct: primary.delta,
    distanceKm,
  };
}

export function checkSatelliteSupport(
  hazardType: HazardType,
  satellite: SatelliteDataResult | null | undefined,
): SatelliteSupportResult {
  if (!satellite || satellite.error) return { supported: false, hazardWeight: 0 };
  const hazardWeight = getSatelliteHazardWeight(hazardType, satellite);
  return { supported: hazardWeight >= SATELLITE_SUPPORT_SCORE, hazardWeight };
}

// Fixed list of known NCR pollution-prone zones. This stands in for a full
// grid scan (which would need a scheduled background job we don't have) —
// scanning a bounded, known-relevant set of cells on demand is cheap
// (Earth Engine responses are cached 3h per cell) and safe to call from the
// Command Center on load.
export const MONITORED_CELLS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "Anand Vihar", lat: 28.6469, lng: 77.3152 },
  { label: "Wazirpur Industrial Area", lat: 28.7041, lng: 77.1653 },
  { label: "ITO Crossing", lat: 28.6292, lng: 77.241 },
  { label: "Mundka", lat: 28.6822, lng: 77.031 },
  { label: "Okhla Industrial Area", lat: 28.5355, lng: 77.291 },
  { label: "RK Puram", lat: 28.5651, lng: 77.1815 },
  { label: "Rohini", lat: 28.7346, lng: 77.1177 },
  { label: "Naraina Industrial Area", lat: 28.6285, lng: 77.1409 },
  { label: "Ghazipur Landfill", lat: 28.6264, lng: 77.3192 },
  { label: "Bawana Industrial Area", lat: 28.8039, lng: 77.0469 },
];

const HAZARD_TYPES: HazardType[] = ["dust", "fire", "industrial", "smog"];

export type AmbientScanResult = {
  cell: string;
  hazardType: HazardType;
  tier: "sensor_detected" | "satellite_detected" | "sensor_satellite_confirmed";
  h3CellId: string;
};

export async function scanAmbientHotspots(): Promise<{
  scanned: number;
  promoted: AmbientScanResult[];
}> {
  if (!isFirebaseConfigured || !db) {
    return { scanned: 0, promoted: [] };
  }

  const promoted: AmbientScanResult[] = [];

  for (const cell of MONITORED_CELLS) {
    const h3CellId = getH3CellId({ label: cell.label, lat: String(cell.lat), lng: String(cell.lng) });

    const [station, satellite] = await Promise.all([
      getNearestStationReading(cell.lat, cell.lng).catch(() => null),
      getSatelliteDataForPoint(cell.lat, cell.lng).catch(() => null),
    ]);

    for (const hazardType of HAZARD_TYPES) {
      const sensorResult = checkSensorSupport(hazardType, station);
      const satelliteResult = checkSatelliteSupport(hazardType, satellite);

      const tier = determineTier({
        reportCount: 0,
        sensorSupported: sensorResult.supported,
        satelliteSupported: satelliteResult.supported,
      });

      // Ambient scan only ever produces the three no-citizen tiers.
      if (
        tier !== "sensor_detected" &&
        tier !== "satellite_detected" &&
        tier !== "sensor_satellite_confirmed"
      ) {
        continue;
      }

      const source: "sensor" | "satellite" =
        tier === "satellite_detected" ? "satellite" : "sensor";
      const confidence = Math.max(
        sensorResult.supported ? Math.min(95, 50 + sensorResult.deltaPct / 2) : 0,
        satelliteResult.supported ? Math.round(satelliteResult.hazardWeight * 100) : 0,
      );

      await setDoc(
        doc(db, "incidents", `ambient-${h3CellId}-${hazardType}`),
        {
          aiConfidence: Math.round(confidence),
          createdAt: serverTimestamp(),
          geminiClassification: {
            confidence: Math.round(confidence),
            description: `${hazardType} — ${tierPromotionReason(tier, 0)}`,
            severity: getSeverity(confidence),
            type: hazardType,
          },
          h3CellId,
          hazardLabel: `Ambient ${hazardType} detection`,
          location: { label: cell.label, lat: String(cell.lat), lng: String(cell.lng) },
          photoUrl: "",
          source,
          status: "under_review",
          updatedAt: serverTimestamp(),
          validation: {
            alertReason: tierPromotionReason(tier, 0),
            alertTier: true,
            tier,
            citizenSignal: { averageConfidence: 0, reportCount: 0, windowMinutes: 0 },
            coverage: {
              label: sensorResult.distanceKm !== null ? `${sensorResult.distanceKm.toFixed(1)} km to nearest station` : "No nearby station",
              level: sensorResult.distanceKm !== null && sensorResult.distanceKm <= 1 ? "good" : "limited",
              nearestSensorKm: sensorResult.distanceKm ?? 5,
            },
            fusion: {
              coverageAdjusted: false,
              finalConfidence: Math.round(confidence),
              h3CellId,
              satelliteWeight: satelliteResult.hazardWeight,
              sensorWeight: sensorResult.supported ? 0.4 : 0,
              visualWeight: 0,
            },
            promotionReason: tierPromotionReason(tier, 0),
            satellite: {
              freshness: satellite && !satellite.error ? "fresh" : "stale",
              lastPassTime: satellite?.timestamp ?? "unavailable",
              signal: satelliteResult.supported
                ? "Anomaly crosses hazard threshold"
                : "No decisive anomaly",
              source: "Earth Engine",
              anomalyScore: satelliteResult.hazardWeight,
              hazardWeight: satelliteResult.hazardWeight,
            },
            sensor: {
              pm25Delta: sensorResult.pollutantName === "PM2.5" ? sensorResult.deltaPct : 0,
              primaryDelta: sensorResult.deltaPct,
              primaryName: sensorResult.pollutantName,
              primaryValue: sensorResult.pollutantValue,
              distanceKm: sensorResult.distanceKm ?? undefined,
              source: "CPCB",
              trend: sensorResult.supported ? "rising" : "flat",
            },
          },
        },
        { merge: true },
      );

      promoted.push({ cell: cell.label, hazardType, tier, h3CellId });
    }
  }

  return { scanned: MONITORED_CELLS.length, promoted };
}
