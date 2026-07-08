import type { HazardType, IncidentEvidence, PromotionTier } from "@/lib/types";
import type { NearbyStationReading } from "@/lib/cpcbSensor";
import type { SatelliteDataResult } from "@/lib/earthEngineSatellite";

/**
 * Thresholds for treating sensor/satellite readings as genuine *support* for
 * a specific hazard type, not just background context.
 *
 * These are intentionally conservative for a hackathon demo: they should
 * catch clearly elevated readings without requiring hand-tuned per-station
 * calibration.
 */
export const SENSOR_PROXIMITY_KM = 3; // CPCB stations are sparse; anything further isn't "hyper-local"
export const SENSOR_SUPPORT_DELTA_PCT = 50; // % above WHO reference for the hazard-relevant pollutant
export const SATELLITE_SUPPORT_SCORE = 0.5; // 0-1 anomaly score (see earthEngineSatellite.ts)
export const CITIZEN_PROMOTION_THRESHOLD = 3;



/**
 * Reads support directly off *already-stored* evidence (validation.sensor /
 * validation.satellite) rather than re-fetching — used for citizen reports,
 * where /api/classify-report already captured this at submission time.
 */
export function checkStoredSensorSupport(
  hazardType: HazardType,
  sensor: IncidentEvidence["sensor"] | null | undefined,
): boolean {
  if (!sensor) return false;
  const distanceKm = sensor.distanceKm ?? null;
  if (distanceKm === null || distanceKm > SENSOR_PROXIMITY_KM) return false;
  const delta = sensor.primaryDelta ?? sensor.pm25Delta ?? 0;
  return delta >= SENSOR_SUPPORT_DELTA_PCT;
}

export function checkStoredSatelliteSupport(
  satellite: IncidentEvidence["satellite"] | null | undefined,
): boolean {
  if (!satellite) return false;
  const weight = satellite.hazardWeight ?? satellite.anomalyScore ?? 0;
  return weight >= SATELLITE_SUPPORT_SCORE;
}

/**
 * Decides which promotion tier (if any) a hotspot qualifies for.
 * Returns null if none of the promotion paths are satisfied yet.
 */
export function determineTier(input: {
  reportCount: number;
  sensorSupported: boolean;
  satelliteSupported: boolean;
}): PromotionTier | null {
  const { reportCount, sensorSupported, satelliteSupported } = input;

  if (sensorSupported && satelliteSupported) return "sensor_satellite_confirmed";
  if (reportCount >= CITIZEN_PROMOTION_THRESHOLD) return "crowd_verified";
  if (reportCount > 0 && sensorSupported) return "citizen_sensor_confirmed";
  if (reportCount > 0 && satelliteSupported) return "citizen_satellite_confirmed";
  if (reportCount === 0 && sensorSupported) return "sensor_detected";
  if (reportCount === 0 && satelliteSupported) return "satellite_detected";
  return null;
}

// Lower number = shown first in the Priority tab.
export const TIER_RANK: Record<PromotionTier, number> = {
  sensor_satellite_confirmed: 0,
  crowd_verified: 1,
  citizen_sensor_confirmed: 2,
  citizen_satellite_confirmed: 3,
  sensor_detected: 4,
  satellite_detected: 5,
};

export const TIER_LABELS: Record<PromotionTier, string> = {
  sensor_satellite_confirmed: "Sensor + Satellite confirmed",
  crowd_verified: "Crowd-verified",
  citizen_sensor_confirmed: "Citizen + Sensor confirmed",
  citizen_satellite_confirmed: "Citizen + Satellite confirmed",
  sensor_detected: "Sensor-detected",
  satellite_detected: "Satellite-detected",
};

export function tierPromotionReason(tier: PromotionTier, reportCount: number): string {
  switch (tier) {
    case "sensor_satellite_confirmed":
      return "Sensor and satellite readings independently confirmed this hazard in the same zone.";
    case "crowd_verified":
      return `${reportCount} citizen reports of the same hazard corroborated in the same H3 cell.`;
    case "citizen_sensor_confirmed":
      return "Citizen report corroborated by a nearby sensor crossing the pollution threshold.";
    case "citizen_satellite_confirmed":
      return "Citizen report corroborated by a satellite anomaly over the same area.";
    case "sensor_detected":
      return "Sensor reading crossed the pollution threshold; no citizen report yet.";
    case "satellite_detected":
      return "Satellite anomaly detected over this zone; no citizen report yet.";
    default:
      return "Waiting for corroboration before municipal alert.";
  }
}
