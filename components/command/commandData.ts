import { mockForecasts, mockIncidents, mockLiveStats } from "@/lib/mockData";
import { buildIncidentEvidence } from "@/lib/incidentEvidence";
import type { Incident } from "@/lib/types";

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

export const commandIncidents = [...mockIncidents]
  .filter((incident) => incident.status !== "resolved")
  .map((incident) => ({
    ...incident,
    evidence: incident.evidence ?? buildIncidentEvidence(incident),
    isMock: true,
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
