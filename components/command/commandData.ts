import { mockForecasts, mockLiveStats } from "@/lib/mockData";
import type { Incident } from "@/lib/types";

const actionByHazard: Record<Incident["hazardType"], string> = {
  fire: "Dispatch fire/cleanup crew",
  smog: "Issue traffic advisory",
  dust: "Deploy water-mist cannon",
  industrial: "Notify pollution control board",
};

export const commandStats = [
  {
    label: "Active incidents",
    value: 0,
    detail: "Across Delhi NCR",
  },
  {
    label: "Critical",
    value: 0,
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
