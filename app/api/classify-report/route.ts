import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  getNearestStationReading,
  getPm25DeltaFromReference,
} from "@/lib/cpcbSensor";
import { getSatelliteDataForPoint } from "@/lib/earthEngineSatellite";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  DEFAULT_H3_CELL_ID,
  promoteCellIfThresholdPassed,
} from "@/lib/reportSubmissions";

const GEMINI_MODEL = "gemini-2.5-flash";
const CLASSIFICATION_PROMPT = `Analyze this photo for signs of air pollution. Respond ONLY with valid JSON, no markdown formatting, no preamble:
{
  "type": "smoke" | "dust" | "haze" | "fire" | "clear" | "unclear",
  "severity": 1-5 (1=minimal, 5=severe),
  "confidence": 0.0-1.0,
  "description": "one sentence describing what's visible"
}
If the image does not clearly show pollution-related content, set type to "unclear" and severity to 0.`;

type GeminiClassificationType = "clear" | "dust" | "fire" | "haze" | "smoke" | "unclear";

interface GeminiClassification {
  confidence: number;
  description: string;
  severity: number;
  type: GeminiClassificationType;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface ReportDoc {
  hazardId?: string;
  hazardLabel?: string;
  h3CellId?: string;
  location?: {
    lat?: string;
    lng?: string;
  };
  photoUrl?: string;
  validation?: Record<string, unknown>;
}

type SensorTrend = "rising" | "flat" | "falling" | "insufficient_data";

function getEstimatedSensorValidation(lat: number, confidence: number) {
  const lowCoverage = Number.isFinite(lat) && lat > 28.6;
  return {
    pm25Delta: lowCoverage ? 8 : 24,
    source: "estimated" as const,
    trend: confidence >= 80 ? "rising" as SensorTrend : "flat" as SensorTrend,
  };
}

function isPollutionClassification(classification: GeminiClassification) {
  return (
    classification.severity > 0 &&
    ["dust", "fire", "haze", "smoke"].includes(classification.type)
  );
}

function getPollutionSignalConfidence(classification: GeminiClassification) {
  if (!isPollutionClassification(classification)) return 0;
  return Math.round(classification.confidence * 100);
}

function getPostClassificationReason(classification: GeminiClassification) {
  if (!isPollutionClassification(classification)) {
    return "Gemini did not find a clear pollution signal; keeping this as a public report only.";
  }

  return "Gemini classified a pollution signal; waiting for citizen, sensor, or satellite corroboration.";
}

function getSatelliteHazardChannel(
  classification: GeminiClassification,
  report: ReportDoc,
) {
  const hazardText = `${report.hazardId ?? ""} ${report.hazardLabel ?? ""}`.toLowerCase();
  if (
    hazardText.includes("industrial") ||
    hazardText.includes("traffic") ||
    classification.type === "clear"
  ) {
    return "industrialTraffic";
  }

  if (
    hazardText.includes("dust") ||
    hazardText.includes("fire") ||
    hazardText.includes("smog") ||
    classification.type === "dust" ||
    classification.type === "fire" ||
    classification.type === "haze" ||
    classification.type === "smoke"
  ) {
    return "fireDustSmoke";
  }

  return "balanced";
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseClassification(text: string): GeminiClassification {
  const parsed = JSON.parse(stripJsonFences(text)) as Partial<GeminiClassification>;
  const validTypes: GeminiClassificationType[] = [
    "clear",
    "dust",
    "fire",
    "haze",
    "smoke",
    "unclear",
  ];

  if (
    !parsed ||
    !validTypes.includes(parsed.type as GeminiClassificationType) ||
    typeof parsed.severity !== "number" ||
    typeof parsed.confidence !== "number" ||
    typeof parsed.description !== "string"
  ) {
    throw new Error("Gemini returned malformed classification JSON.");
  }

  return {
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    description: parsed.description,
    severity: Math.max(0, Math.min(5, Math.round(parsed.severity))),
    type: parsed.type as GeminiClassificationType,
  };
}

async function fetchImageAsInlineData(photoUrl: string, requestUrl: string) {
  const imageUrl = photoUrl.startsWith("/")
    ? new URL(photoUrl, requestUrl).toString()
    : photoUrl;
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch photoUrl (${response.status}).`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");

  return {
    data,
    mimeType,
  };
}

async function callGeminiWithRetry(inlineData: { data: string; mimeType: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          { text: CLASSIFICATION_PROMPT },
          {
            inline_data: {
              data: inlineData.data,
              mime_type: inlineData.mimeType,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (response.status === 429 && attempt === 0) {
        await sleep(900);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Gemini request failed (${response.status}).`);
      }

      const json = (await response.json()) as GeminiResponse;
      const text = json.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
      if (!text) throw new Error("Gemini response did not include text.");
      return parseClassification(text);
    } catch (error) {
      if (attempt === 0) {
        await sleep(900);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Gemini classification failed.");
}

export async function POST(request: Request) {
  let reportId = "";

  try {
    const body = (await request.json()) as { reportId?: string };
    reportId = body.reportId ?? "";

    if (!reportId) {
      return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
    }
    if (!isFirebaseConfigured || !db) {
      return NextResponse.json({ error: "Firebase is not configured." }, { status: 500 });
    }

    const reportRef = doc(db, "reports", reportId);
    const reportSnapshot = await getDoc(reportRef);

    if (!reportSnapshot.exists()) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const report = reportSnapshot.data() as ReportDoc;
    if (!report.photoUrl) {
      throw new Error("Report is missing photoUrl; cannot classify image.");
    }

    const inlineData = await fetchImageAsInlineData(report.photoUrl, request.url);
    const classification = await callGeminiWithRetry(inlineData);
    const h3CellId = report.h3CellId ?? DEFAULT_H3_CELL_ID;
    const pollutionSignalConfidence = getPollutionSignalConfidence(classification);
    const lat = Number(report.location?.lat);
    const lng = Number(report.location?.lng);
    const satelliteData =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? await getSatelliteDataForPoint(lat, lng)
        : null;
    const nearestStation =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? await getNearestStationReading(lat, lng)
        : null;
    const sensorValidation = nearestStation
      ? {
          distanceKm: nearestStation.distanceKm,
          lastUpdated: nearestStation.lastUpdated,
          no2: nearestStation.no2,
          pm10: nearestStation.pm10,
          pm25: nearestStation.pm25,
          pm25Delta: getPm25DeltaFromReference(nearestStation.pm25),
          so2: nearestStation.so2,
          source: nearestStation.source,
          stationName: nearestStation.stationName,
          trend: "insufficient_data" as SensorTrend,
        }
      : getEstimatedSensorValidation(lat, pollutionSignalConfidence);
    const satelliteChannel = satelliteData
      ? getSatelliteHazardChannel(classification, report)
      : "balanced";
    const satelliteAnomaly =
      satelliteChannel === "industrialTraffic"
        ? (satelliteData?.hazardWeights.industrialTraffic ?? 0)
        : satelliteChannel === "fireDustSmoke"
          ? (satelliteData?.hazardWeights.fireDustSmoke ?? 0)
          : (satelliteData?.anomalyScore ?? 0);
    const satelliteBoost = Math.round(satelliteAnomaly * 12);
    const finalConfidence = Math.min(
      98,
      pollutionSignalConfidence > 0
        ? pollutionSignalConfidence + satelliteBoost
        : satelliteBoost,
    );

    await updateDoc(reportRef, {
      aiModel: GEMINI_MODEL,
      classifiedAt: serverTimestamp(),
      geminiClassification: classification,
      status: "classified",
      validation: {
        ...(report.validation ?? {}),
        alertReason: getPostClassificationReason(classification),
        citizenSignal: {
          averageConfidence: pollutionSignalConfidence,
          reportCount: 1,
          windowMinutes: 1,
        },
        coverage: {
          label: nearestStation ? "Nearby sensor coverage" : "Low station coverage",
          level: nearestStation ? "good" : "low",
          nearestSensorKm: nearestStation?.distanceKm ?? 3.2,
        },
        fusion: {
          coverageAdjusted: true,
          finalConfidence,
          h3CellId,
          satelliteWeight: 0.2,
          sensorWeight: 0.12,
          visualWeight: 0.5,
        },
        promotionReason: isPollutionClassification(classification)
          ? "Gemini classified report; waiting for corroboration threshold."
          : "Not promotion eligible until another source shows a pollution signal.",
        satellite: {
          aerosolIndexAnomaly: satelliteData?.aerosolIndex.anomalyScore ?? 0,
          aerosolIndexRaw: satelliteData?.aerosolIndex.rawValue ?? null,
          fireDustSmokeWeight: satelliteData?.hazardWeights.fireDustSmoke ?? 0,
          freshness:
            satelliteData?.no2.rawValue || satelliteData?.aerosolIndex.rawValue
              ? "fresh"
              : "stale",
          industrialTrafficWeight: satelliteData?.hazardWeights.industrialTraffic ?? 0,
          lastPassTime: satelliteData?.timestamp ?? new Date().toISOString(),
          no2Anomaly: satelliteData?.no2.anomalyScore ?? 0,
          rawNo2: satelliteData?.no2.rawValue ?? null,
          selectedChannel: satelliteChannel,
          signal: satelliteData && !satelliteData.error
            ? `Sentinel-5P ${satelliteChannel} score ${satelliteAnomaly}; NO2 ${satelliteData.no2.anomalyScore}, aerosol ${satelliteData.aerosolIndex.anomalyScore}`
            : (satelliteData?.error ?? "Satellite anomaly unavailable."),
          source: satelliteData?.source ?? "Earth Engine / Sentinel-5P",
        },
        sensor: sensorValidation,
      },
    });

    await promoteCellIfThresholdPassed(h3CellId);

    return NextResponse.json({ classification, ok: true });
  } catch (error) {
    console.error("Report classification failed", error);

    if (reportId && isFirebaseConfigured && db) {
      await updateDoc(doc(db, "reports", reportId), {
        classificationError:
          error instanceof Error ? error.message : "Unknown classification error.",
        classificationFailedAt: serverTimestamp(),
        status: "classification_failed",
      }).catch((updateError) => {
        console.error("Could not mark report classification_failed", updateError);
      });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown classification error.",
        ok: false,
      },
      { status: 500 },
    );
  }
}
