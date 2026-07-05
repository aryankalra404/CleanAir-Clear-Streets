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

function normalizeHazardType(type?: FirestoreReport["geminiClassification"] extends infer Classification
  ? Classification extends { type?: infer Type }
    ? Type
    : never
  : never): HazardType {
  if (type === "dust" || type === "fire" || type === "industrial" || type === "smog") {
    return type;
  }
  if (type === "smoke" || type === "haze") return "smog";
  return "smog";
}

export function reportToIncident(id: string, report: FirestoreReport): Incident {
  const severity = normalizeSeverity(report.geminiClassification?.severity);
  const hazardType = normalizeHazardType(report.geminiClassification?.type);
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
