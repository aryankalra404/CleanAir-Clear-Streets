import type { Timestamp } from "firebase/firestore";
import { buildIncidentEvidence } from "@/lib/incidentEvidence";
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
  geminiClassification?: {
    confidence?: number;
    severity?: Severity;
    type?: HazardType;
  };
  hazardLabel?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  note?: string;
  result?: string;
  status?: IncidentStatus | "submitted" | "classified";
  validation?: IncidentEvidence;
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

export function reportToIncident(id: string, report: FirestoreReport): Incident {
  const severity = report.geminiClassification?.severity ?? "medium";
  const hazardType = report.geminiClassification?.type ?? "fire";
  const aiConfidence =
    report.geminiClassification?.confidence ?? report.aiConfidence ?? 72;
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
    photoUrl: "",
    severity,
    source: "citizen",
    status: normalizeStatus(report.status),
    timestamp: report.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
  };

  return {
    ...incident,
    evidence: incident.evidence ?? buildIncidentEvidence(incident),
  };
}
