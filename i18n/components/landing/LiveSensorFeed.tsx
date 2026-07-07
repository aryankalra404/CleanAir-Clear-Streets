"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/languageContext";

type LiveSensorReading = {
  stationName: string;
  pm25: number | null;
  pm10: number | null;
  lastUpdated: string | null;
};

const REFRESH_MS = 5 * 60 * 1000; // matches the API's own 5-min CPCB cache
const AQI_SCALE_MAX = 300; // bar scale reference, WHO-unhealthy territory

function aqiTier(pm25: number | null): "good" | "moderate" | "poor" | "severe" {
  if (pm25 === null) return "good";
  if (pm25 <= 60) return "good";
  if (pm25 <= 120) return "moderate";
  if (pm25 <= 200) return "poor";
  return "severe";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function LiveSensorFeed() {
  const t = useT();
  const [stations, setStations] = useState<LiveSensorReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/live-sensors");
        const data = await res.json();
        if (cancelled) return;
        setStations(data.stations ?? []);
        setFailed(!data.ok);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="sensor-feed">
      <div className="sensor-feed-header">
        <span className="sensor-feed-dot" />
        <span>{t("sensor_feed_title") ?? "LIVE CPCB SENSOR NETWORK"}</span>
      </div>

      {loading ? (
        <div className="sensor-feed-empty">{t("sensor_feed_loading") ?? "Pulling live station data…"}</div>
      ) : failed || stations.length === 0 ? (
        <div className="sensor-feed-empty">
          {t("sensor_feed_unavailable") ?? "CPCB network temporarily unavailable."}
        </div>
      ) : (
        <div className="sensor-feed-list">
          {stations.map((station) => {
            const tier = aqiTier(station.pm25);
            const barWidth = station.pm25 ? Math.min(100, (station.pm25 / AQI_SCALE_MAX) * 100) : 0;
            return (
              <div className="sensor-row" key={station.stationName}>
                <div className="sensor-row-top">
                  <span className="sensor-row-name">{station.stationName}</span>
                  <span className={`sensor-row-value tier-${tier}`}>
                    {station.pm25 !== null ? `${Math.round(station.pm25)} PM2.5` : "—"}
                  </span>
                </div>
                <div className="sensor-row-bar-track">
                  <div className={`sensor-row-bar tier-${tier}`} style={{ width: `${barWidth}%` }} />
                </div>
                <span className="sensor-row-updated">{relativeTime(station.lastUpdated)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="sensor-feed-footer">
        {t("sensor_feed_source") ?? "Source: CPCB real-time monitoring · data.gov.in"}
      </div>
    </div>
  );
}
