import "server-only";

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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
  isDustDominant,
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
 * - dust / particulate -> aerosol index (particulate-driven, "fireDustSmoke" weight)
 * - industrial / smog / fire -> NO2 or aerosol depending on channel (see below)
 *
 * "particulate" takes over the aerosol-index channel that used to be split
 * across separate "fire" and "smog" checks — see the HAZARD_TYPES comment
 * below for why those two were merged.
 */
export function getSatelliteHazardWeight(
  hazardType: HazardType,
  satellite: Pick<SatelliteDataResult, "hazardWeights"> | null | undefined,
): number {
  if (!satellite) return 0;
  if (hazardType === "dust" || hazardType === "fire" || hazardType === "particulate") {
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
  // dust -> PM10, industrial -> NO2/SO2, particulate/fire/smog -> PM2.5
  // (getPrimaryPollutant only special-cases "dust" and "industrial";
  // everything else — including our new "particulate" bucket — falls
  // through to its PM2.5 default, which is exactly what we want here).
  const primary = getPrimaryPollutant(geminiType ?? hazardType, station);
  let supported = primary.value !== null && primary.delta >= SENSOR_SUPPORT_DELTA_PCT;

  // PM10 alone can't tell dust apart from an ordinary bad-air day (PM10
  // rises on both) — require the PM10:PM2.5 ratio to actually look
  // dust-like, not just "PM10 crossed a number".
  if (supported && hazardType === "dust" && !isDustDominant(station.pm10, station.pm25)) {
    supported = false;
  }

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

// Ambient (sensor/satellite-only, zero citizen reports) detection can only
// test 3 real, independent hypotheses — not 4. "fire" and "smog" both
// resolved to the exact same underlying test (PM2.5 delta + aerosol index
// anomaly), so testing them separately meant a single elevated PM2.5/AI
// reading would cross both thresholds at once and stack two near-identical
// pins on the same spot. A CPCB PM2.5 sensor or a Sentinel-5P aerosol
// reading can't tell a fire apart from general haze/smog without a photo —
// only Gemini looking at an actual citizen-submitted image can make that
// call (see resolveIncidentHazardType in firestoreReports.ts). So ambient
// scan reports the honest, source-agnostic "particulate" bucket instead;
// once a citizen report comes in for the same cell, promoteCellIfThreshold
// Passed will resolve it to a specific fire/smog hazardType from the photo.
//
// We run all three checks per cell, collect whichever ones fired into
// possibleSources, then write ONE doc per cell — not one per hazard — so
// a single map pin shows the full picture rather than 2-3 overlapping pins.
const HAZARD_TYPES: HazardType[] = ["dust", "industrial", "particulate"];

// Priority order for picking the single hazardType that drives the map icon
// color when multiple checks fire. industrial > dust > particulate keeps the
// most specific/actionable type on top.
const HAZARD_PRIORITY: HazardType[] = ["industrial", "dust", "particulate"];

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

    // Run all three checks and collect results — we write ONE doc per cell,
    // not one per hazard, to avoid stacking 2-3 markers on the same spot.
    type CheckResult = {
      hazardType: HazardType;
      sensorResult: ReturnType<typeof checkSensorSupport>;
      satelliteResult: ReturnType<typeof checkSatelliteSupport>;
      tier: "sensor_detected" | "satellite_detected" | "sensor_satellite_confirmed";
    };
    const passedChecks: CheckResult[] = [];

    for (const hazardType of HAZARD_TYPES) {
      const sensorResult = checkSensorSupport(hazardType, station);
      const satelliteResult = checkSatelliteSupport(hazardType, satellite);
      const tier = determineTier({
        reportCount: 0,
        sensorSupported: sensorResult.supported,
        satelliteSupported: satelliteResult.supported,
      });

      if (
        tier === "sensor_detected" ||
        tier === "satellite_detected" ||
        tier === "sensor_satellite_confirmed"
      ) {
        passedChecks.push({ hazardType, sensorResult, satelliteResult, tier });
      }
    }

    // Nothing triggered for this cell — skip it entirely.
    if (passedChecks.length === 0) continue;

    // Pick the single dominant hazardType for icon color (industrial > dust > particulate).
    const dominant =
      passedChecks.find((c) => c.hazardType === HAZARD_PRIORITY[0]) ??
      passedChecks.find((c) => c.hazardType === HAZARD_PRIORITY[1]) ??
      passedChecks[0];

    const { sensorResult, satelliteResult, tier } = dominant;
    const hazardType = dominant.hazardType;

    // All source categories whose threshold was crossed — shown in the popup
    // as "Possible sources" so the operator sees the full picture.
    const possibleSources = passedChecks.map((c) => c.hazardType);

    const source: "sensor" | "satellite" =
      tier === "satellite_detected" ? "satellite" : "sensor";

    const confidence = Math.max(
      sensorResult.supported ? Math.min(95, 50 + sensorResult.deltaPct / 2) : 0,
      satelliteResult.supported ? Math.round(satelliteResult.hazardWeight * 100) : 0,
    );

    // Build a label that lists which pollutants are actually elevated,
    // e.g. "Elevated PM2.5 · NO2" — honest and immediately actionable.
    const elevatedNames: string[] = [];
    if (station?.pm25 != null && station.pm25 > 0) elevatedNames.push("PM2.5");
    if (station?.pm10 != null && station.pm10 > 0) elevatedNames.push("PM10");
    if (station?.no2 != null && station.no2 > 0) elevatedNames.push("NO2");
    if (station?.so2 != null && station.so2 > 0) elevatedNames.push("SO2");
    const elevatedLabel = elevatedNames.length > 0
      ? `Elevated ${elevatedNames.join(" · ")}`
      : "Sensor anomaly detected";

    // Check if this cell's incident doc already exists so we can preserve
    // its original createdAt timestamp. setDoc with merge:true would
    // overwrite createdAt on every scan, making Age always show "1m".
    const incidentRef = doc(db, "incidents", `ambient-${h3CellId}`);
    const existingSnap = await getDoc(incidentRef);

    const sharedPayload = {
      aiConfidence: Math.round(confidence),
      geminiClassification: {
        confidence: Math.round(confidence),
        description: `${elevatedLabel} — ${tierPromotionReason(tier, 0)}`,
        severity: getSeverity(confidence),
        type: hazardType,
      },
      h3CellId,
      hazardLabel: elevatedLabel,
      possibleSources,
      elevatedPollutants: {
        pm25: station?.pm25 ?? null,
        pm10: station?.pm10 ?? null,
        no2: station?.no2 ?? null,
        so2: station?.so2 ?? null,
      },
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
    };

    if (existingSnap.exists()) {
      // Doc already exists — update in place, preserving the original createdAt
      // so the "Age" displayed in the Command Center reflects when pollution
      // was FIRST detected, not when this scan last ran.
      await updateDoc(incidentRef, sharedPayload);
    } else {
      // Brand new detection — set createdAt for the first and only time.
      await setDoc(incidentRef, { ...sharedPayload, createdAt: serverTimestamp() });
    }

    promoted.push({ cell: cell.label, hazardType, tier, h3CellId });
  }

  return { scanned: MONITORED_CELLS.length, promoted };
}
