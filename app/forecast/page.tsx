"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Link from "next/link";
import Navbar from "@/components/shared/Navbar";
import CommandCenterTabs from "@/components/shared/CommandCenterTabs";
import ForecastChart from "@/components/forecast/ForecastChart";
import AQIBadge from "@/components/forecast/AQIBadge";
import {
  DELHI_H3_CELLS,
  generateMockHistory,
  forecastPM25,
  getAQIInfo,
  type ForecastResult,
  type SensorReading,
} from "@/lib/forecastEngine";
import { useT } from "@/lib/languageContext";

// ─── Cell selector component ─────────────────────────────────────────────────
function CellSelector({
  selected,
  onChange,
  t,
}: {
  selected: string;
  onChange: (id: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="forecast-cell-selector">
      {DELHI_H3_CELLS.map((cell) => (
        <button
          key={cell.h3CellId}
          className={`forecast-cell-btn${selected === cell.h3CellId ? " active" : ""}`}
          onClick={() => onChange(cell.h3CellId)}
          aria-pressed={selected === cell.h3CellId}
        >
          {cell.labelKey ? t(cell.labelKey) : cell.label}
        </button>
      ))}
    </div>
  );
}

// ─── Trend arrow ─────────────────────────────────────────────────────────────
function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") return <span className="trend-arrow trend-up">↑</span>;
  if (trend === "falling") return <span className="trend-arrow trend-down">↓</span>;
  return <span className="trend-arrow trend-stable">→</span>;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="forecast-metric-card">
      <p className="forecast-metric-label">{label}</p>
      <p className="forecast-metric-value" style={accent ? { color: accent } : {}}>
        {value}
        {unit && <span className="forecast-metric-unit">{unit}</span>}
      </p>
      {sub && <p className="forecast-metric-sub">{sub}</p>}
    </div>
  );
}

// ─── Hourly table row ─────────────────────────────────────────────────────────
function HourRow({
  hour,
  pm25,
  confidence,
}: {
  hour: string;
  pm25: number;
  confidence: "low" | "medium" | "high";
}) {
  const aqi = getAQIInfo(pm25);
  const confClass =
    confidence === "high"
      ? "conf-high"
      : confidence === "medium"
      ? "conf-medium"
      : "conf-low";

  return (
    <div className="forecast-hour-row">
      <span className="forecast-hour-time">{hour}</span>
      <span
        className="forecast-hour-bar-wrap"
        aria-label={`${pm25} µg/m³`}
      >
        <span
          className="forecast-hour-bar"
          style={{
            width: `${Math.min(100, (pm25 / 300) * 100)}%`,
            background: aqi.color,
          }}
        />
      </span>
      <span className="forecast-hour-value" style={{ color: aqi.textColor }}>
        {pm25}
      </span>
      <span className={`forecast-conf-pill ${confClass}`}>{confidence}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ForecastPage() {
  const t = useT();
  const [selectedCell, setSelectedCell] = useState(DELHI_H3_CELLS[0].h3CellId);
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const apiMode = "local" as string;

  const handleSignOut = () => {
    if (auth) signOut(auth);
  };

  const loadForecast = useCallback(
    async (h3CellId: string) => {
      setLoading(true);
      try {
        if (apiMode === "api") {
          // Hit the Next.js API route
          const res = await fetch(`/api/forecast?h3CellId=${h3CellId}`);
          if (!res.ok) throw new Error("API error");
          const data = (await res.json()) as ForecastResult;
          setForecast(data);

          // Re-generate mock history locally for the chart (API doesn't return raw history)
          const cell = DELHI_H3_CELLS.find((c) => c.h3CellId === h3CellId);
          const hist = generateMockHistory(
            h3CellId,
            cell?.label ?? "Delhi",
            cell?.lat ?? 28.6139,
            cell?.lng ?? 77.209,
            72
          );
          setHistory(hist);
        } else {
          // Pure client-side: deterministic, zero-latency
          const cell = DELHI_H3_CELLS.find((c) => c.h3CellId === h3CellId);
          const hist = generateMockHistory(
            h3CellId,
            cell?.label ?? "Delhi",
            cell?.lat ?? 28.6139,
            cell?.lng ?? 77.209,
            72
          );
          const result = forecastPM25(hist);
          setHistory(hist);
          setForecast(result);
        }
      } catch (err) {
        console.error("Forecast error:", err);
        // Fallback to local
        const cell = DELHI_H3_CELLS.find((c) => c.h3CellId === h3CellId);
        const hist = generateMockHistory(
          h3CellId,
          cell?.label ?? "Delhi",
          cell?.lat ?? 28.6139,
          cell?.lng ?? 77.209,
          72
        );
        setHistory(hist);
        setForecast(forecastPM25(hist));
      } finally {
        setLoading(false);
      }
    },
    [apiMode]
  );

  useEffect(() => {
    loadForecast(selectedCell);
  }, [selectedCell, loadForecast]);

  const currentAQI = forecast ? getAQIInfo(forecast.currentPm25) : null;
  const peakAQI = forecast ? getAQIInfo(forecast.peakPm25) : null;

  return (
    <main className="app-page-shell">
      <div className="app-page-container" style={{ zIndex: 100 }}>
        <Navbar />
      </div>

      <div className="app-page-container app-page-content">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="command-hero-row">
          <div className="command-header">
            <p className="eyebrow">{t("forecast_eyebrow")}</p>
            <h1>{t("forecast_title")}</h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "16px" }}>
            <button 
              onClick={handleSignOut} 
              style={{ background: "transparent", border: "none", color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, padding: 0 }}
            >
              {t("nav_sign_out")}
            </button>
            <CommandCenterTabs active="forecast" />
          </div>
        </div>

        {/* ── Cell selector ──────────────────────────────────────────────── */}
        <section className="forecast-section">
          <div className="forecast-section-header">
            <div>
              <h2 className="forecast-section-title">{t("forecast_select_cell_title")}</h2>
              <p className="forecast-section-sub">
                {t("forecast_select_cell_desc")}
              </p>
            </div>

          </div>

          <CellSelector
            selected={selectedCell}
            onChange={(id) => setSelectedCell(id)}
            t={t}
          />
        </section>

        {/* ── Main content ───────────────────────────────────────────────── */}
        {loading && (
          <div className="forecast-loading">
            <span className="forecast-spinner" />
            <p>{t("forecast_loading")}</p>
          </div>
        )}

        {!loading && forecast && currentAQI && peakAQI && (
          <>
            {/* ── Summary banner ────────────────────────────────────────── */}
            <section className="forecast-summary-banner">
              <div className="forecast-summary-left">
                <div className="forecast-location-row">
                  <span className="forecast-location-name">
                    {t(DELHI_H3_CELLS.find(c => c.h3CellId === forecast.h3CellId)?.labelKey || "cell_delhi")}
                  </span>
                  <span className="forecast-cell-id">{forecast.h3CellId}</span>
                </div>
                <p className="forecast-summary-text">
                  {(() => {
                    const trendNote = forecast.trend === "rising"
                      ? t("forecast_trend_upward").replace("{slope}", Math.abs(forecast.trendMagnitude).toFixed(1))
                      : forecast.trend === "falling"
                      ? t("forecast_trend_downward").replace("{slope}", Math.abs(forecast.trendMagnitude).toFixed(1))
                      : t("forecast_trend_stable");
                    
                    const covNote = forecast.covariateNudge > 3 ? t("forecast_covariate_amplified") : "";
                    const windNote = forecast.windDamping ? t("forecast_wind_help") : "";
                    const peakVal = Math.round(forecast.peakPm25).toString();

                    let template = "";
                    if (forecast.trend === "rising") template = t("forecast_summary_rise");
                    else if (forecast.trend === "falling") template = t("forecast_summary_fall");
                    else template = t("forecast_summary_remain");

                    return template
                      .replace("{peakValue}", peakVal)
                      .replace("{peakHour}", forecast.peakHour)
                      .replace("{trendNote}", trendNote)
                      .replace("{covNote}", covNote)
                      .replace("{windNote}", windNote);
                  })()}
                </p>
                <div className="forecast-summary-badges">
                  <AQIBadge
                    pm25={forecast.currentPm25}
                    aqi={currentAQI}
                    size="md"
                  />
                  {forecast.windDamping && (
                    <span className="forecast-wind-badge">{t("forecast_summary_wind_active")}</span>
                  )}
                </div>
              </div>
              <div className="forecast-summary-right">
                <div className="forecast-peak-box">
                  <p className="forecast-peak-label">{t("forecast_summary_peak")}</p>
                  <p
                    className="forecast-peak-value"
                    style={{ color: peakAQI.color }}
                  >
                    {forecast.peakPm25}
                    <span>µg/m³</span>
                  </p>
                  <p className="forecast-peak-time">{t("forecast_at_time").replace("{time}", forecast.peakHour)}</p>
                  <AQIBadge pm25={forecast.peakPm25} aqi={peakAQI} size="sm" showValue={false} />
                </div>
              </div>
            </section>

            {/* ── Metric row ────────────────────────────────────────────── */}
            <div className="forecast-metrics-row">
              <MetricCard
                label={t("forecast_metric_current")}
                value={forecast.currentPm25}
                unit=" µg/m³"
                sub={t(currentAQI.description) || currentAQI.description}
                accent={currentAQI.color}
              />
              <MetricCard
                label={t("forecast_metric_trend")}
                value={
                  `${forecast.trendMagnitude > 0 ? "+" : ""}${forecast.trendMagnitude.toFixed(1)}`
                }
                unit=" µg/m³/hr"
                sub={
                  forecast.trend === "rising"
                    ? t("forecast_metric_trend_rising")
                    : forecast.trend === "falling"
                    ? t("forecast_metric_trend_falling")
                    : t("forecast_metric_trend_stable")
                }
                accent={
                  forecast.trend === "rising"
                    ? "#ef4444"
                    : forecast.trend === "falling"
                    ? "#22c55e"
                    : "#6366f1"
                }
              />
              <MetricCard
                label={t("forecast_metric_covariate")}
                value={`${forecast.covariateNudge > 0 ? "+" : ""}${forecast.covariateNudge.toFixed(1)}`}
                unit=" µg/m³"
                sub={t("forecast_metric_covariate_desc")}
                accent={forecast.covariateNudge > 0 ? "#f97316" : "#22c55e"}
              />
              <MetricCard
                label={t("forecast_metric_generated")}
                value={new Date(forecast.generatedAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                sub={t("forecast_metric_generated_desc")}
              />
            </div>

            {/* ── Chart ─────────────────────────────────────────────────── */}
            <section className="forecast-chart-section">
              <div className="forecast-chart-header">
                <div>
                  <h2 className="forecast-section-title">
                    {t("forecast_chart_title")}
                    <TrendArrow trend={forecast.trend} />
                  </h2>
                  <p className="forecast-section-sub">
                    {t("forecast_chart_subtitle")}
                  </p>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: "0.82rem", minHeight: 36, padding: "0 14px" }}
                  onClick={() => loadForecast(selectedCell)}
                >
                  {t("forecast_chart_refresh")}
                </button>
              </div>
              <ForecastChart forecast={forecast} history={history} />
            </section>

            {/* ── Hourly table ──────────────────────────────────────────── */}
            <section className="forecast-table-section">
              <div className="forecast-table-grid">
                {/* Left: next 12h */}
                <div className="forecast-table-col">
                  <h3 className="forecast-table-heading">{t("forecast_table_next_12")}</h3>
                  <div className="forecast-table-rows">
                    {forecast.forecast.slice(0, 12).map((f) => (
                      <HourRow
                        key={f.hour}
                        hour={f.hour}
                        pm25={f.predicted_pm25}
                        confidence={f.confidence}
                      />
                    ))}
                  </div>
                </div>
                {/* Right: hours 13–24 */}
                <div className="forecast-table-col">
                  <h3 className="forecast-table-heading">{t("forecast_table_hours_13_24")}</h3>
                  <div className="forecast-table-rows">
                    {forecast.forecast.slice(12).map((f) => (
                      <HourRow
                        key={f.hour}
                        hour={f.hour}
                        pm25={f.predicted_pm25}
                        confidence={f.confidence}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── API call preview ──────────────────────────────────────── */}
            <section className="forecast-api-section">
              <h3 className="forecast-table-heading">{t("forecast_api_title")}</h3>
              <div className="forecast-api-code">
                <code>
                  GET /api/forecast?h3CellId=<strong>{forecast.h3CellId}</strong>
                </code>
                <Link
                  href={`/api/forecast?h3CellId=${forecast.h3CellId}`}
                  target="_blank"
                  className="btn btn-outline"
                  style={{ fontSize: "0.8rem", minHeight: 32, padding: "0 12px" }}
                >
                  {t("forecast_api_try")}
                </Link>
              </div>
              <p className="forecast-api-note">
                {t("forecast_api_desc")}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
