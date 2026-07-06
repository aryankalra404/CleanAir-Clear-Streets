"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import type { ForecastResult, SensorReading } from "@/lib/forecastEngine";
import { getAQIInfo } from "@/lib/forecastEngine";
import { useT } from "@/lib/languageContext";

interface ForecastChartProps {
  forecast: ForecastResult;
  history: SensorReading[];
}

interface ChartPoint {
  label: string;
  actual?: number;
  predicted?: number;
  confidenceBand?: number;
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;

  return (
    <div className="forecast-tooltip">
      <p className="forecast-tooltip-time">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="forecast-tooltip-row"
          style={{ color: entry.color }}
        >
          <span>{entry.name === "predicted" ? t("forecast_chart_label_forecast") : t("forecast_chart_label_actual")}</span>
          <strong>{entry.value} µg/m³</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Confidence dot renderer ─────────────────────────────────────────────────
function ConfidenceDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}) {
  const { cx, cy, payload } = props;
  if (!payload?.predicted || cx === undefined || cy === undefined) return null;

  const aqi = getAQIInfo(payload.predicted);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={aqi.color}
      stroke="white"
      strokeWidth={1.5}
    />
  );
}

export default function ForecastChart({ forecast, history }: ForecastChartProps) {
  const t = useT();
  // Build unified chart data: last 12h actual + 24h forecast
  const points: ChartPoint[] = [];

  // Historical actuals — last 12 readings (1 per hour)
  const recentHistory = [...history]
    .sort((a, b) => new Date(a.sampledAt).getTime() - new Date(b.sampledAt).getTime())
    .slice(-12);

  for (const r of recentHistory) {
    if (r.sensor_pm25 === null) continue;
    const d = new Date(r.sampledAt);
    const label = `${String(d.getHours()).padStart(2, "0")}:00`;
    points.push({ label, actual: Math.round(r.sensor_pm25) });
  }

  // Forecast points
  for (const f of forecast.forecast) {
    // Confidence band: ±10% for high, ±20% for medium, ±35% for low
    const band =
      f.confidence === "high"
        ? Math.round(f.predicted_pm25 * 0.1)
        : f.confidence === "medium"
        ? Math.round(f.predicted_pm25 * 0.2)
        : Math.round(f.predicted_pm25 * 0.35);

    points.push({
      label: f.hour,
      predicted: f.predicted_pm25,
      confidenceBand: band,
    });
  }

  const maxVal = Math.max(
    ...points.map((p) => p.actual ?? 0),
    ...points.map((p) => (p.predicted ?? 0) + (p.confidenceBand ?? 0))
  );

  return (
    <div className="forecast-chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ top: 12, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(216,225,218,0.5)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#98a2b3", fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            interval={3}
          />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.1 / 50) * 50]}
            tick={{ fontSize: 11, fill: "#98a2b3", fontWeight: 700 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}`}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* WHO PM2.5 guideline reference */}
          <ReferenceLine
            y={15}
            stroke="#22c55e"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "WHO 15", fontSize: 10, fill: "#22c55e", position: "insideTopRight" }}
          />
          {/* India NAAQS 24h standard */}
          <ReferenceLine
            y={60}
            stroke="#eab308"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: "NAAQS 60", fontSize: 10, fill: "#eab308", position: "insideTopRight" }}
          />

          {/* Actual historical line */}
          <Line
            dataKey="actual"
            name="actual"
            stroke="#117c72"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: "#117c72" }}
            connectNulls
          />

          {/* Forecast line */}
          <Line
            dataKey="predicted"
            name="predicted"
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={<ConfidenceDot />}
            activeDot={{ r: 5, fill: "#6366f1" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="forecast-chart-legend">
        <span className="forecast-legend-item">
          <span style={{ background: "#117c72" }} />
          {t("forecast_chart_legend_actual")}
        </span>
        <span className="forecast-legend-item">
          <span
            style={{
              background: "#6366f1",
              backgroundImage:
                "repeating-linear-gradient(90deg, #6366f1 0, #6366f1 6px, transparent 6px, transparent 9px)",
              backgroundColor: "transparent",
              height: 2,
              width: 24,
              borderRadius: 0,
            }}
          />
          {t("forecast_chart_legend_forecast")}
        </span>
        <span className="forecast-legend-item">
          <span style={{ background: "#22c55e" }} />
          {t("forecast_chart_legend_who")}
        </span>
        <span className="forecast-legend-item">
          <span style={{ background: "#eab308" }} />
          {t("forecast_chart_legend_naaqs")}
        </span>
      </div>
    </div>
  );
}
