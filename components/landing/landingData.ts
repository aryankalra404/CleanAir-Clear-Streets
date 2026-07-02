import { mockForecasts, mockIncidents, mockLiveStats } from "@/lib/mockData";

export const activeIncidents = mockIncidents.filter(
  (incident) => incident.status !== "resolved",
);

export const criticalIncidents = activeIncidents.filter(
  (incident) => incident.severity === "critical",
);

export const priorityIncidents = [...activeIncidents]
  .sort((a, b) => b.aiConfidence - a.aiConfidence)
  .slice(0, 3);

export const highestForecast = [...mockForecasts].sort(
  (a, b) => b.peakPm25 - a.peakPm25,
)[0];

export const heroStats = [
  {
    label: "Active hotspots",
    value: mockLiveStats.activeHotspots,
    detail: `${criticalIncidents.length} critical`,
  },
  {
    label: "Resolved today",
    value: mockLiveStats.resolvedToday,
    detail: "cleanup crews logged",
  },
  {
    label: "Avg response",
    value: `${mockLiveStats.avgResponseTimeMinutes}m`,
    detail: "report to dispatch",
  },
  {
    label: "Next spike",
    value: highestForecast.peakTime,
    detail: `${highestForecast.neighborhood}, PM2.5 ${highestForecast.peakPm25}`,
  },
];

export const workflowSteps = [
  {
    step: "01",
    title: "Citizen evidence",
    text: "Residents submit smoke, dust, or burning-waste reports with photo and location context.",
  },
  {
    step: "02",
    title: "AI validation",
    text: "Gemini checks visual signals while sensors, satellite context, and nearby reports raise confidence.",
  },
  {
    step: "03",
    title: "Targeted response",
    text: "Officials receive a ranked incident queue with suggested crews, mist cannons, and cleanup actions.",
  },
];

export const techStack = [
  "Gemini multimodal",
  "Google Maps",
  "Earth Engine",
  "Firebase",
  "BigQuery",
  "Vertex AI",
];
