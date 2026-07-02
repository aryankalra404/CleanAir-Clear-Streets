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

export interface IncidentEvidence {
  alertReason: string;
  citizenSignal: {
    reportCount: number;
    windowMinutes: number;
    averageConfidence: number;
  };
  coverage: {
    level: "good" | "limited" | "low";
    nearestSensorKm: number;
    label: string;
  };
  fusion: {
    finalConfidence: number;
    coverageAdjusted: boolean;
    h3CellId: string;
    visualWeight: number;
    sensorWeight: number;
    satelliteWeight: number;
  };
  satellite: {
    source: "Earth Engine";
    signal: string;
    lastPassTime: string;
    freshness: "fresh" | "stale";
  };
  sensor: {
    pm25Delta: number;
    trend: "rising" | "flat" | "falling";
  };
}

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
  evidence?: IncidentEvidence;
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
