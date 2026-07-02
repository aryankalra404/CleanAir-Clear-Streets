export type HazardType = "fire" | "smog" | "dust" | "industrial";

export type Severity = "low" | "medium" | "critical";

export type IncidentStatus =
  | "pending"
  | "under_review"
  | "verified"
  | "dispatched"
  | "resolved"
  | "predicted";

export type Source = "citizen" | "sensor" | "satellite";

export type HealthRisk = "low" | "medium" | "high";

export interface Incident {
  id: string;
  photoUrl: string;
  hazardType: HazardType;
  latitude: number;
  longitude: number;
  severity: Severity;
  status: IncidentStatus;
  aiConfidence: number; // 0-100
  healthRisk: HealthRisk;
  source: Source;
  timestamp: string; // ISO string
  isAnonymous: boolean;
  neighborhood: string;
  corroboratingReports?: number;
}

export interface ForecastPoint {
  time: string; // e.g. "14:00"
  pm25: number;
}

export interface NeighborhoodForecast {
  id: string;
  neighborhood: string;
  currentPm25: number;
  peakPm25: number;
  peakTime: string;
  windDirection: string; // e.g. "NE"
  windSpeed: number; // km/h
  humidity: number; // %
  riskLevel: Severity;
  points: ForecastPoint[];
}

export interface LiveStats {
  activeHotspots: number;
  resolvedToday: number;
  avgResponseTimeMinutes: number;
}