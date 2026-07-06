import { NextResponse } from "next/server";
import {
  forecastPM25,
  generateMockHistory,
  DELHI_H3_CELLS,
  type SensorReading,
} from "@/lib/forecastEngine";

export const runtime = "nodejs";

// ─── Optional BigQuery fetch ────────────────────────────────────────────────
// If GOOGLE_APPLICATION_CREDENTIALS or BIGQUERY_PROJECT_ID is set in env,
// we attempt to pull real historical data. Otherwise we fall back to the
// deterministic mock generator so the demo is always fast.

async function fetchFromBigQuery(
  h3CellId: string
): Promise<SensorReading[] | null> {
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  if (!projectId) return null;

  try {
    // Use Function() to hide the import from Turbopack/webpack static analysis.
    // This means no build-time warning when @google-cloud/bigquery is not installed.
    // At runtime, if the package doesn't exist, the catch below handles it gracefully.
    // eslint-disable-next-line no-new-func
    const dynamicImport = new Function("pkg", "return import(pkg)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bqModule = (await dynamicImport("@google-cloud/bigquery")) as any;
    const bq = new bqModule.BigQuery({ projectId });

    const query = `
      SELECT
        sampledAt,
        h3CellId,
        location_label,
        location_lat,
        location_lng,
        sensor_pm25,
        sensor_pm10,
        sensor_no2,
        sensor_so2,
        sensor_co,
        sensor_nh3,
        sensor_ozone
      FROM \`cleanair-clear-streets.cleanair_analytics.delhi_historical_pm25\`
      WHERE h3CellId = @h3CellId
        AND sampledAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 72 HOUR)
      ORDER BY sampledAt ASC
      LIMIT 500
    `;

    const [rows] = await bq.query({ query, params: { h3CellId } });
    return rows as SensorReading[];
  } catch (err) {
    console.error("[forecast] BigQuery error detail:", (err as { message?: string }).message, (err as { code?: string }).code);
    console.error("[forecast] BigQuery fetch failed, falling back to mock:", err);
    return null;
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const h3CellId = url.searchParams.get("h3CellId")?.trim();

  console.log("[forecast] BIGQUERY_PROJECT_ID:", process.env.BIGQUERY_PROJECT_ID ?? "(not set)");

  if (!h3CellId) {
    return NextResponse.json(
      {
        error:
          "Missing required query parameter: h3CellId. Example: /api/forecast?h3CellId=872a100edffffff",
      },
      { status: 400 }
    );
  }

  // Find known cell metadata (or build a default)
  const knownCell = DELHI_H3_CELLS.find((c) => c.h3CellId === h3CellId);
  const cellLabel = knownCell?.label ?? `Cell ${h3CellId}`;
  const cellLat = knownCell?.lat ?? 28.6139;
  const cellLng = knownCell?.lng ?? 77.209;

  // Attempt BigQuery, fall back to mock
  let history: SensorReading[];
  let source: "bigquery" | "mock";

  const bqData = await fetchFromBigQuery(h3CellId);

  if (bqData && bqData.length >= 3) {
    console.log(`[forecast] BigQuery fetch succeeded — ${bqData.length} rows for ${h3CellId}`);
    history = bqData;
    source = "bigquery";
  } else {
    console.log(`[forecast] Using mock data for ${h3CellId} (BigQuery unavailable or returned no rows)`);
    history = generateMockHistory(h3CellId, cellLabel, cellLat, cellLng, 72);
    source = "mock";
  }

  const result = forecastPM25(history);

  // Return 24-hour forecast with cache-control for CDN caching
  return NextResponse.json(
    { ...result, source },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
