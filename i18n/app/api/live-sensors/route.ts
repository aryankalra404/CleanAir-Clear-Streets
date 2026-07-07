import { NextResponse } from "next/server";
import { fetchNearbyStations } from "@/lib/cpcbSensor";

export const runtime = "nodejs";
export const revalidate = 300; // 5 min

// Centroid of Delhi NCR — wide enough radius to pull in Gurugram, Noida,
// Ghaziabad, and Faridabad stations alongside central Delhi.
const NCR_CENTER_LAT = 28.6139;
const NCR_CENTER_LNG = 77.209;
const NCR_RADIUS_KM = 45;
const MAX_STATIONS = 6;

export async function GET() {
  try {
    const stations = await fetchNearbyStations(NCR_CENTER_LAT, NCR_CENTER_LNG, NCR_RADIUS_KM);

    const withReadings = stations.filter((station) => station.pm25 !== null);
    const top = withReadings
      .sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0))
      .slice(0, MAX_STATIONS)
      .map((station) => ({
        stationName: station.stationName,
        pm25: station.pm25,
        pm10: station.pm10,
        lastUpdated: station.lastUpdated,
      }));

    return NextResponse.json(
      { ok: true, stations: top, fetchedAt: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    console.warn("live-sensors route failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, stations: [], fetchedAt: new Date().toISOString() }, { status: 200 });
  }
}
