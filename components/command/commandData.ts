import type { Incident } from "@/lib/types";

const actionByHazard: Record<Incident["hazardType"], string> = {
  fire: "Dispatch fire/cleanup crew",
  smog: "Issue traffic advisory",
  dust: "Deploy water-mist cannon",
  industrial: "Notify pollution control board",
};

// Template stat cards. Every value/detail here is a placeholder that
// CommandCenter.tsx always overwrites with a live-computed figure (or "—"
// when no live figure is available yet) — see the `stats` useMemo there.
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
    value: "—",
    detail: "Report to dispatch",
  },
  {
    label: "Peak risk",
    value: "—",
    detail: "Awaiting forecast",
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
  const now = Date.now();
  const minutes = Math.max(1, Math.round((now - then) / 60000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}
