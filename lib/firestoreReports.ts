import type { Timestamp } from "firebase/firestore";
import type {
  HazardType,
  HealthRisk,
  Incident,
  IncidentEvidence,
  IncidentStatus,
  Severity,
} from "@/lib/types";

export interface FirestoreReport {
  anonymous?: boolean;
  aiConfidence?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  geminiClassification?: {
    confidence?: number;
    severity?: Severity | number;
    type?: HazardType | "clear" | "haze" | "smoke" | "unclear";
  };
  hazardLabel?: string;
  hazardId?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  note?: string;
  result?: string;
  status?: IncidentStatus | "submitted" | "classified" | "no_signal";
  validation?: IncidentEvidence;
  photoUrl?: string;
  h3CellId?: string;
  linkedReportIds?: string[];
}

function normalizeStatus(status?: FirestoreReport["status"]): IncidentStatus {
  if (status === "submitted" || status === "classified") return "pending";
  return status ?? "pending";
}

function getHealthRisk(severity: Severity): HealthRisk {
  if (severity === "critical") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function normalizeSeverity(severity?: Severity | number): Severity {
  if (severity === "critical" || severity === "medium" || severity === "low") {
    return severity;
  }
  if (typeof severity === "number") {
    if (severity >= 4) return "critical";
    if (severity >= 2) return "medium";
  }
  return "low";
}

function normalizeConfidence(confidence?: number, fallback = 0) {
  if (typeof confidence !== "number") return fallback;
  return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
}

export function hasPollutionSignal(report: FirestoreReport) {
  const classification = report.geminiClassification;
  return (
    classification?.severity !== 0 &&
    (classification?.type === "dust" ||
      classification?.type === "fire" ||
      classification?.type === "haze" ||
      classification?.type === "smoke")
  );
}

export function resolveIncidentHazardType(report: {
  hazardId?: string;
  geminiClassification?: { type?: string; severity?: string | number };
}): HazardType {
  const classification = report.geminiClassification;
  const isPollution =
    classification?.type &&
    classification.type !== "clear" &&
    classification.type !== "unclear" &&
    Number(classification.severity) > 0;

  if (isPollution) {
    if (report.hazardId === "garbage-fire") return "fire";
    if (report.hazardId === "traffic-smog") return "smog";
    if (report.hazardId === "construction-dust") return "dust";
    if (report.hazardId === "industrial-emission") return "industrial";
    
    const lowerId = (report.hazardId || "").toLowerCase();
    if (lowerId.includes("industrial")) return "industrial";
    if (lowerId.includes("dust")) return "dust";
    if (lowerId.includes("fire")) return "fire";
    if (lowerId.includes("smog") || lowerId.includes("traffic")) return "smog";
  }

  const type = classification?.type;
  if (type === "dust" || type === "fire" || type === "industrial" || type === "smog") {
    return type as HazardType;
  }
  if (type === "smoke" || type === "haze") return "smog";
  return "smog";
}

export function reportToIncident(id: string, report: FirestoreReport): Incident {
  const severity = normalizeSeverity(report.geminiClassification?.severity);
  const hazardType = resolveIncidentHazardType(report);
  const aiConfidence = hasPollutionSignal(report)
    ? normalizeConfidence(report.geminiClassification?.confidence, report.aiConfidence ?? 0)
    : 0;
  const incident: Incident = {
    id: `firestore-${id}`,
    aiConfidence,
    corroboratingReports: report.validation?.citizenSignal.reportCount ?? 1,
    evidence: report.validation,
    hazardType,
    healthRisk: getHealthRisk(severity),
    isAnonymous: report.anonymous ?? true,
    latitude: Number(report.location?.lat ?? 28.6264),
    longitude: Number(report.location?.lng ?? 77.3192),
    neighborhood: report.location?.label ?? "Citizen report",
    photoUrl: report.photoUrl ?? "",
    severity,
    source: "citizen",
    status: normalizeStatus(report.status),
    timestamp:
      report.updatedAt?.toDate().toISOString() ??
      report.createdAt?.toDate().toISOString() ??
      new Date().toISOString(),
    h3CellId: report.h3CellId,
    linkedReportIds: report.linkedReportIds,
  };
  return incident;
}
