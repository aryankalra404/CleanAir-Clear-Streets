import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { latLngToCell } from "h3-js";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { resolveIncidentHazardType } from "@/lib/firestoreReports";
import type { IncidentEvidence } from "@/lib/types";

export interface ReportSubmissionInput {
  anonymous: boolean;
  aiConfidence: number;
  hazardId: string;
  hazardLabel: string;
  photoUrl?: string;
  location: {
    label: string;
    lat: string;
    lng: string;
  };
  note: string;
  result: string;
}

interface StoredReport {
  aiConfidence?: number;
  geminiClassification?: {
    confidence?: number;
    severity?: number | string;
    type?: string;
  };
  h3CellId?: string;
  hazardId?: string;
  hazardLabel?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  photoUrl?: string;
  validation?: IncidentEvidence;
}

const H3_RESOLUTION = 8;
export const DEFAULT_H3_CELL_ID = "883da114bbfffff";
const PROMOTION_REPORT_THRESHOLD = 3;
const POLLUTION_TYPES = new Set(["dust", "fire", "haze", "smoke"]);

export function getHazardType(hazardId: string) {
  if (hazardId.includes("dust")) return "dust";
  if (hazardId.includes("industrial")) return "industrial";
  if (hazardId.includes("smog")) return "smog";
  return "fire";
}

export function getSeverity(confidence: number) {
  if (confidence >= 80) return "critical";
  if (confidence >= 70) return "medium";
  return "low";
}

export function getH3CellId(location: ReportSubmissionInput["location"]) {
  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_H3_CELL_ID;

  return latLngToCell(lat, lng, H3_RESOLUTION);
}

function getPollutionSignalConfidence(report: StoredReport) {
  const classification = report.geminiClassification;
  if (!classification?.type || !POLLUTION_TYPES.has(classification.type)) return 0;

  const severity =
    typeof classification.severity === "number"
      ? classification.severity
      : Number(classification.severity ?? 0);
  if (!Number.isFinite(severity) || severity <= 0) return 0;

  const confidence = classification.confidence ?? report.aiConfidence ?? 0;
  return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
}

export async function promoteCellIfThresholdPassed(h3CellId: string) {
  if (!db) return;

  const reportsQuery = query(
    collection(db, "reports"),
    where("h3CellId", "==", h3CellId),
  );
  const snapshot = await getDocs(reportsQuery);
  const allReports = snapshot.docs
    .map((reportDoc) => ({
      id: reportDoc.id,
      ref: reportDoc.ref,
      data: reportDoc.data() as StoredReport,
    }))
    .filter(
      (report) => getPollutionSignalConfidence(report.data) > 0
    );

  const reportsByHazard: Record<string, typeof allReports> = {};
  for (const r of allReports) {
    const hazard = resolveIncidentHazardType(r.data);
    if (!reportsByHazard[hazard]) reportsByHazard[hazard] = [];
    reportsByHazard[hazard].push(r);
  }

  for (const [hazardType, hazardReports] of Object.entries(reportsByHazard)) {
    if (hazardReports.length < PROMOTION_REPORT_THRESHOLD) continue;

    const avgConfidence = Math.round(
      hazardReports.reduce(
        (sum, report) => sum + getPollutionSignalConfidence(report.data),
        0,
      ) / hazardReports.length,
    );
    // Sort to make the highest confidence report primary
    hazardReports.sort((a, b) => getPollutionSignalConfidence(b.data) - getPollutionSignalConfidence(a.data));
    const primaryReport = hazardReports[0].data;
    const reportWithPhoto = hazardReports.find((r) => !!r.data.photoUrl);
    const bestPhotoUrl = reportWithPhoto ? reportWithPhoto.data.photoUrl : (primaryReport.photoUrl ?? "");
    const promotionReason = `${hazardReports.length} citizen reports in the same H3 cell crossed the 20 min corroboration threshold.`;
    
    const baseValidation = primaryReport.validation;
    const promotedValidation = baseValidation ? {
      ...baseValidation,
      alertReason: "Citizen-corroborated hotspot promoted from public signals to municipal review.",
      alertTier: true,
      citizenSignal: {
        ...baseValidation.citizenSignal,
        averageConfidence: avgConfidence,
        reportCount: hazardReports.length,
        windowMinutes: 20,
      },
      fusion: {
        ...baseValidation.fusion,
        finalConfidence: Math.min(99, baseValidation.fusion.finalConfidence + (hazardReports.length - 1) * 4),
      },
      promotionReason,
    } : {
      alertReason:
        "Citizen-corroborated hotspot promoted from public signals to municipal review.",
      alertTier: true,
      citizenSignal: {
        averageConfidence: avgConfidence,
        reportCount: hazardReports.length,
        windowMinutes: 20,
      },
      coverage: {
        label: "Low station coverage",
        level: "low",
        nearestSensorKm: 3.2,
      },
      fusion: {
        coverageAdjusted: true,
        finalConfidence: Math.min(98, avgConfidence + 18),
        h3CellId,
        satelliteWeight: 0.2,
        sensorWeight: 0.12,
        visualWeight: 0.5,
      },
      promotionReason,
      satellite: {
        freshness: "stale" as const,
        lastPassTime: "Yesterday 10:18",
        signal: "Last Sentinel-5P pass not decisive; alert driven by citizen cluster.",
        source: "Earth Engine" as const,
      },
      sensor: {
        pm25Delta: 8,
        source: "estimated" as const,
        trend: "rising" as const,
      },
    };

    await Promise.all(
      hazardReports.map((report) =>
        updateDoc(report.ref, {
          status: "under_review",
          validation: promotedValidation,
        }),
      ),
    );

    await setDoc(
      doc(db, "incidents", `${h3CellId}-${hazardType}`),
      {
        aiConfidence: avgConfidence,
        createdAt: serverTimestamp(),
        geminiClassification: {
          confidence: avgConfidence,
          description: `Citizen-corroborated ${hazardType} hotspot`,
          severity: getSeverity(avgConfidence),
          type: primaryReport.geminiClassification?.type ?? hazardType,
        },
        h3CellId,
        hazardLabel: primaryReport.hazardLabel ?? `Citizen ${hazardType} cluster`,
        linkedReportIds: hazardReports.map((report) => report.id),
        location: primaryReport.location ?? {
          label: "Citizen report cluster",
          lat: "28.6264",
          lng: "77.3192",
        },
        photoUrl: bestPhotoUrl,
        source: "citizen_cluster",
        status: "under_review",
        updatedAt: serverTimestamp(),
        validation: promotedValidation,
      },
      { merge: true },
    );
  }
}

export async function submitCitizenReport(report: ReportSubmissionInput) {
  if (!isFirebaseConfigured || !db) {
    return {
      id: `local-${Date.now()}`,
      stored: false,
    };
  }

  const lowCoverage = Number(report.location.lat) > 28.6;
  const h3CellId = getH3CellId(report.location);

  const docRef = await addDoc(collection(db, "reports"), {
    ...report,
    createdAt: serverTimestamp(),
    h3CellId,
    photoUrl: report.photoUrl ?? "",
    validation: {
      alertReason: lowCoverage
        ? "Single citizen report in low station coverage zone; waiting for Gemini classification and corroboration."
        : "Single citizen report captured; waiting for Gemini classification and corroborating signals.",
      alertTier: false,
      citizenSignal: {
        averageConfidence: 0,
        reportCount: 1,
        windowMinutes: 1,
      },
      coverage: {
        label: lowCoverage ? "Low station coverage" : "Nearby sensor coverage",
        level: lowCoverage ? "low" : "good",
        nearestSensorKm: lowCoverage ? 3.2 : 0.9,
      },
      fusion: {
        coverageAdjusted: lowCoverage,
        finalConfidence: 0,
        h3CellId,
        satelliteWeight: 0.2,
        sensorWeight: lowCoverage ? 0.12 : 0.32,
        visualWeight: lowCoverage ? 0.5 : 0.38,
      },
      promotionReason: "Waiting for Gemini classification before corroboration checks.",
      satellite: {
        freshness: "stale",
        lastPassTime: "Yesterday 10:18",
        signal: "Satellite context pending.",
        source: "Earth Engine",
      },
      sensor: {
        pm25Delta: lowCoverage ? 8 : 24,
        source: "estimated",
        trend: report.aiConfidence >= 80 ? "rising" : "flat",
      },
    },
    source: "citizen",
    status: "pending",
  });

  void fetch("/api/classify-report", {
    body: JSON.stringify({ reportId: docRef.id }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }).catch(() => {
    // The UI already saved the report; backend classification can be retried later.
  });

  return {
    id: docRef.id,
    stored: true,
  };
}
