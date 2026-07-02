import type { HazardType, Incident, IncidentEvidence } from "@/lib/types";

const fallbackH3ByHazard: Record<HazardType, string> = {
  dust: "883da118c3fffff",
  fire: "883da118d7fffff",
  industrial: "883da1198bfffff",
  smog: "883da1189bfffff",
};

export function buildIncidentEvidence(incident: Incident): IncidentEvidence {
  const reports = incident.corroboratingReports ?? (incident.source === "citizen" ? 1 : 0);
  const lowCoverage = incident.source === "citizen" && reports >= 2;
  const satelliteFresh = incident.source === "satellite" || incident.severity === "critical";
  const nearestSensorKm = lowCoverage ? 3.2 : incident.source === "sensor" ? 0.4 : 1.6;
  const coverageLevel = nearestSensorKm > 2.5 ? "low" : nearestSensorKm > 1 ? "limited" : "good";
  const citizenBoost = Math.min(12, reports * 3);
  const coverageBoost = coverageLevel === "low" ? 8 : coverageLevel === "limited" ? 4 : 0;
  const satelliteBoost = satelliteFresh ? 5 : 1;
  const finalConfidence = Math.min(
    98,
    incident.aiConfidence + citizenBoost + coverageBoost + satelliteBoost,
  );
  const alertTier =
    incident.status === "verified" ||
    incident.status === "dispatched" ||
    incident.status === "predicted" ||
    reports >= 3 ||
    (incident.severity === "critical" && incident.source !== "citizen");

  return {
    alertReason:
      coverageLevel === "low"
        ? `${reports} citizen reports in a low station coverage zone; citizen corroboration is driving the alert.`
        : `${incident.source} signal corroborated with nearby reports and satellite context.`,
    alertTier,
    citizenSignal: {
      reportCount: reports,
      windowMinutes: reports >= 3 ? 14 : 28,
      averageConfidence: incident.aiConfidence,
    },
    coverage: {
      level: coverageLevel,
      nearestSensorKm,
      label:
        coverageLevel === "low"
          ? "Low station coverage"
          : coverageLevel === "limited"
            ? "Limited station coverage"
            : "Nearby sensor coverage",
    },
    fusion: {
      finalConfidence,
      coverageAdjusted: coverageLevel !== "good",
      h3CellId: fallbackH3ByHazard[incident.hazardType],
      visualWeight: incident.source === "citizen" ? 0.45 : 0.25,
      sensorWeight: coverageLevel === "low" ? 0.12 : 0.34,
      satelliteWeight: satelliteFresh ? 0.32 : 0.2,
    },
    promotionReason: alertTier
      ? "Promoted to Command Center after corroboration threshold."
      : "Waiting for corroboration before municipal alert.",
    satellite: {
      source: "Earth Engine",
      signal: satelliteFresh
        ? "NO2/aerosol anomaly overlaps cell"
        : "Last pass broad signal not decisive",
      lastPassTime: satelliteFresh ? "09:42" : "Yesterday 10:18",
      freshness: satelliteFresh ? "fresh" : "stale",
    },
    sensor: {
      pm25Delta: incident.source === "sensor" ? 42 : coverageLevel === "low" ? 8 : 18,
      trend: incident.severity === "critical" ? "rising" : "flat",
    },
  };
}
