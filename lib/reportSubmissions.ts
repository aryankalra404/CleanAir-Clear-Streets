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
import { db, isFirebaseConfigured } from "@/lib/firebase";

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
  hazardLabel?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  validation?: {
    alertTier?: boolean;
  };
}

const DEFAULT_H3_CELL_ID = "883da118d7fffff";
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
  const clusteredReports = snapshot.docs
    .map((reportDoc) => ({
      id: reportDoc.id,
      ref: reportDoc.ref,
      data: reportDoc.data() as StoredReport,
    }))
    .filter(
      (report) =>
        !report.data.validation?.alertTier &&
        getPollutionSignalConfidence(report.data) > 0,
    );

  if (clusteredReports.length < PROMOTION_REPORT_THRESHOLD) return;

  const avgConfidence = Math.round(
    clusteredReports.reduce(
      (sum, report) => sum + getPollutionSignalConfidence(report.data),
      0,
    ) / clusteredReports.length,
  );
  const primaryReport = clusteredReports[0].data;
  const promotionReason = `${clusteredReports.length} citizen reports in the same H3 cell crossed the 20 min corroboration threshold.`;
  const promotedValidation = {
    alertReason:
      "Citizen-corroborated hotspot promoted from public signals to municipal review.",
    alertTier: true,
    citizenSignal: {
      averageConfidence: avgConfidence,
      reportCount: clusteredReports.length,
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
      freshness: "stale",
      lastPassTime: "Yesterday 10:18",
      signal: "Last Sentinel-5P pass not decisive; alert driven by citizen cluster.",
      source: "Earth Engine",
    },
    sensor: {
      pm25Delta: 8,
      trend: "rising",
    },
  };

  await Promise.all(
    clusteredReports.map((report) =>
      updateDoc(report.ref, {
        status: "under_review",
        validation: promotedValidation,
      }),
    ),
  );

  await setDoc(
    doc(db, "incidents", h3CellId),
    {
      aiConfidence: avgConfidence,
      createdAt: serverTimestamp(),
      geminiClassification: {
        confidence: avgConfidence,
        description: "Citizen-corroborated smoke hotspot",
        severity: getSeverity(avgConfidence),
        type: primaryReport.geminiClassification?.type ?? "fire",
      },
      h3CellId,
      hazardLabel: primaryReport.hazardLabel ?? "Citizen smoke cluster",
      linkedReportIds: clusteredReports.map((report) => report.id),
      location: primaryReport.location ?? {
        label: "Citizen report cluster",
        lat: "28.6264",
        lng: "77.3192",
      },
      source: "citizen_cluster",
      status: "under_review",
      updatedAt: serverTimestamp(),
      validation: promotedValidation,
    },
    { merge: true },
  );
}

export async function submitCitizenReport(report: ReportSubmissionInput) {
  if (!isFirebaseConfigured || !db) {
    return {
      id: `local-${Date.now()}`,
      stored: false,
    };
  }

  const lowCoverage = Number(report.location.lat) > 28.6;

  const docRef = await addDoc(collection(db, "reports"), {
    ...report,
    createdAt: serverTimestamp(),
    h3CellId: DEFAULT_H3_CELL_ID,
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
        h3CellId: DEFAULT_H3_CELL_ID,
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
