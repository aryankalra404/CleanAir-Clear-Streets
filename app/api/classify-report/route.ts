import { NextResponse } from "next/server";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  getNearestStationReading,
  getPm25DeltaFromReference,
  getPrimaryPollutant,
} from "@/lib/cpcbSensor";
import { getSatelliteDataForPoint } from "@/lib/earthEngineSatellite";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { getWindData } from "@/lib/openWeather";
import { recordPollutionSnapshot } from "@/lib/pollutionSnapshots";
import {
  computeFusionConfidence,
  satelliteWeightToScore,
  sensorDeltaToScore,
} from "@/lib/fusionConfidence";
import {
  DEFAULT_H3_CELL_ID,
  promoteCellIfThresholdPassed,
} from "@/lib/reportSubmissions";
import { isSensorReadingFresh } from "@/lib/supportEvidence";

const GEMINI_MODEL = "gemini-2.5-flash";
const CLASSIFICATION_PROMPT = `You are an air quality sensor for a municipal pollution monitoring system in Delhi NCR. 
Analyze this citizen-uploaded photo for VISIBLE, active air pollution signals only.

 Count as pollution:
- Smoke plumes (from fires, vehicles, industrial stacks)
- Visible dust clouds (from construction or soil disturbance)
- Open flames or actively burning material
- Dense atmospheric haze with a clear pollution source visible

 Do NOT flag as pollution:
- Natural fog, morning mist, or overcast/cloudy sky
- Camera glare, lens flare, or blurry/dark photos
- Garbage or waste with NO visible smoke or dust rising from it
- General grey sky with no identifiable pollution source

Respond ONLY with valid JSON, no markdown, no preamble:
{
  "type": "smoke" | "dust" | "haze" | "fire" | "clear" | "unclear",
  "severity": 1-5 (1=barely visible trace, 3=clearly present, 5=severe dense plume or active fire),
  "confidence": 0.0-1.0,
  "description": "one sentence: what specific pollution signal is visible, or why image is unclear/clean"
}

Set type to "unclear" and severity to 0 if the image is blurry, too dark, shows only weather/fog, or you cannot confidently identify an active pollution source.`;

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
  createdAt?: { toDate?: () => Date } | Date | string;
  hazardId?: string;
  hazardLabel?: string;
  h3CellId?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  photoUrl?: string;
  validation?: Record<string, unknown>;
}

type SensorTrend = "rising" | "flat" | "falling" | "insufficient_data";

function getReportCreatedAtDate(report: ReportDoc) {
  if (report.createdAt instanceof Date && Number.isFinite(report.createdAt.getTime())) {
    return report.createdAt;
  }

  if (typeof report.createdAt === "string") {
    const parsed = new Date(report.createdAt);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const timestampDate =
    report.createdAt &&
    typeof report.createdAt === "object" &&
    "toDate" in report.createdAt
      ? report.createdAt.toDate?.()
      : undefined;
  return timestampDate && Number.isFinite(timestampDate.getTime())
    ? timestampDate
    : new Date();
}

function getEstimatedSensorValidation(lat: number, confidence: number) {
  const lowCoverage = Number.isFinite(lat) && lat > 28.6;
  return {
    pm25Delta: lowCoverage ? 8 : 24,
    primaryDelta: lowCoverage ? 8 : 24,
    primaryName: "PM2.5",
    primaryValue: null,
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
  let finalAttempt = true;
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as { finalAttempt?: boolean; reportId?: string };
    reportId = body.reportId ?? "";
    finalAttempt = body.finalAttempt ?? true;

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

    const lat = Number(report.location?.lat);
    const lng = Number(report.location?.lng);
    const inlineData = await fetchImageAsInlineData(report.photoUrl, request.url);
    const classification = await callGeminiWithRetry(inlineData);
    const h3CellId = report.h3CellId ?? DEFAULT_H3_CELL_ID;
    const pollutionSignalConfidence = getPollutionSignalConfidence(classification);

    if (!isPollutionClassification(classification)) {
      await updateDoc(reportRef, {
        aiModel: GEMINI_MODEL,
        classifiedAt: serverTimestamp(),
        geminiClassification: classification,
        status: "no_signal",
        validation: {
          ...(report.validation ?? {}),
          alertReason: getPostClassificationReason(classification),
          citizenSignal: {
            averageConfidence: 0,
            reportCount: 1,
            windowMinutes: 1,
          },
          fusion: {
            coverageAdjusted: false,
            finalConfidence: 0,
            h3CellId,
            satelliteWeight: 0,
            sensorWeight: 0,
            visualWeight: 1,
          },
          promotionReason:
            "Not promotion eligible because Gemini did not find a pollution signal.",
        },
      });

      console.info(
        `Report ${reportId} classified as ${classification.type} in ${Date.now() - startedAt}ms; local context skipped.`,
      );

      return NextResponse.json({ classification, ok: true });
    }

    const reportCreatedAt = getReportCreatedAtDate(report);
    const [satelliteData, nearestStation, windData] =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? await Promise.all([
            getSatelliteDataForPoint(lat, lng, reportCreatedAt),
            getNearestStationReading(lat, lng),
            getWindData(lat, lng),
          ])
        : [null, null, null];
    const primaryPollutant = getPrimaryPollutant(classification.type, nearestStation);
    const sensorFresh = nearestStation
      ? isSensorReadingFresh(nearestStation.lastUpdated)
      : false;
    const sensorValidation = nearestStation
      ? {
          distanceKm: nearestStation.distanceKm,
          lastUpdated: nearestStation.lastUpdated,
          no2: nearestStation.no2,
          pm10: nearestStation.pm10,
          pm25: nearestStation.pm25,
          pm25Delta: getPm25DeltaFromReference(nearestStation.pm25),
          primaryDelta: primaryPollutant.delta,
          primaryName: primaryPollutant.name,
          primaryValue: primaryPollutant.value,
          so2: nearestStation.so2,
          source: nearestStation.source,
          stationName: nearestStation.stationName,
          trend: sensorFresh ? "rising" as SensorTrend : "insufficient_data" as SensorTrend,
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
    // Real weighted fusion instead of "Gemini score + a satellite nudge,
    // with sensor decoration that never enters the math". A source only
    // gets scored — and only pulls weight — when it's real: the estimated
    // sensor fallback (no station within range) doesn't count as sensor
    // evidence, and a failed satellite fetch doesn't count as satellite
    // evidence, so the displayed weights always reflect what actually
    // contributed to the number above them.
    const fusion = computeFusionConfidence({
      corroborationScore: null, // corroboration only applies once a cell is promoted — see reportSubmissions.ts
      satelliteScore:
        satelliteData && !satelliteData.error ? satelliteWeightToScore(satelliteAnomaly) : null,
      sensorScore: nearestStation && sensorFresh
        ? sensorDeltaToScore(primaryPollutant.delta)
        : null,
      visualScore: pollutionSignalConfidence,
    });
    const finalConfidence = fusion.finalConfidence;

    const snapshot = await recordPollutionSnapshot({
      lat,
      lng,
      locationLabel: report.location?.label ?? null,
      reportId,
      satellite: satelliteData,
      sensor: nearestStation,
      sourceContext: "report_classification",
      wind: windData,
    });

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
          satelliteWeight: fusion.satelliteWeight,
          sensorWeight: fusion.sensorWeight,
          visualWeight: fusion.visualWeight,
        },
        promotionReason: "Gemini classified report; waiting for corroboration threshold.",
        satellite: {
          anomalyScore: satelliteAnomaly,
          aerosolIndexAnomaly: satelliteData?.aerosolIndex.anomalyScore ?? 0,
          aerosolIndexRaw: satelliteData?.aerosolIndex.rawValue ?? null,
          fireDustSmokeWeight: satelliteData?.hazardWeights.fireDustSmoke ?? 0,
          freshness:
            satelliteData?.no2.rawValue || satelliteData?.aerosolIndex.rawValue
              ? "fresh"
              : "stale",
          hazardWeight: satelliteAnomaly,
          industrialTrafficWeight: satelliteData?.hazardWeights.industrialTraffic ?? 0,
          computedAt: satelliteData?.computedAt ?? new Date().toISOString(),
          lastPassTime: satelliteData
            ? `window ${satelliteData.windowStart} to ${satelliteData.windowEnd}`
            : "unavailable",
          windowEnd: satelliteData?.windowEnd,
          windowStart: satelliteData?.windowStart,
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

    console.info(
      `Report ${reportId} classified as ${classification.type} in ${Date.now() - startedAt}ms; snapshot stored: ${snapshot.stored}.`,
    );

    return NextResponse.json({ classification, ok: true });
  } catch (error) {
    console.error("Report classification failed", error);

    if (reportId && isFirebaseConfigured && db) {
      const failurePayload = finalAttempt
        ? {
            classificationError:
              error instanceof Error ? error.message : "Unknown classification error.",
            classificationFailedAt: serverTimestamp(),
            status: "classification_failed",
          }
        : {
            classificationAttemptError:
              error instanceof Error ? error.message : "Unknown classification error.",
            classificationAttemptFailedAt: serverTimestamp(),
            status: "pending",
          };

      await updateDoc(doc(db, "reports", reportId), {
        ...failurePayload,
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
