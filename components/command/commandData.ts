import { mockForecasts, mockIncidents, mockLiveStats } from "@/lib/mockData";
import type { HazardType, Incident, IncidentEvidence } from "@/lib/types";

const severityRank: Record<Incident["severity"], number> = {
  critical: 3,
  medium: 2,
  low: 1,
};

const actionByHazard: Record<Incident["hazardType"], string> = {
  fire: "Deploy water-mist cannon",
  smog: "Send traffic enforcement team",
  dust: "Dispatch dust-control crew",
  industrial: "Send inspection unit",
};

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

  return {
    alertReason:
      coverageLevel === "low"
        ? `${reports} citizen reports in a low station coverage zone; citizen corroboration is driving the alert.`
        : `${incident.source} signal corroborated with nearby reports and satellite context.`,
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

export const commandIncidents = [...mockIncidents]
  .filter((incident) => incident.status !== "resolved")
  .map((incident) => ({
    ...incident,
    evidence: incident.evidence ?? buildIncidentEvidence(incident),
  }))
  .sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.aiConfidence - a.aiConfidence;
  });

export const commandStats = [
  {
    label: "Active incidents",
    value: mockLiveStats.activeHotspots,
    detail: "Across Delhi NCR",
  },
  {
    label: "Critical",
    value: commandIncidents.filter((incident) => incident.severity === "critical")
      .length,
    detail: "Need response now",
  },
  {
    label: "Avg response",
    value: `${mockLiveStats.avgResponseTimeMinutes}m`,
    detail: "Report to dispatch",
  },
  {
    label: "Peak risk",
    value: mockForecasts[0].peakTime,
    detail: `${mockForecasts[0].neighborhood}`,
  },
];

export function getRecommendedAction(incident: Incident) {
  return actionByHazard[incident.hazardType];
}

export function formatStatus(status: Incident["status"]) {
  return status.replace("_", " ");
}

export function getIncidentAge(timestamp: string) {
  const then = new Date(timestamp).getTime();
  const now = new Date("2026-07-02T10:15:00Z").getTime();
  const minutes = Math.max(1, Math.round((now - then) / 60000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}
