"use client";

import { useMemo, useState } from "react";
import type { Incident, Source } from "@/lib/types";
import {
  commandIncidents,
  commandStats,
  formatStatus,
  getIncidentAge,
  getRecommendedAction,
} from "@/components/command/commandData";

const sourceFilters: Array<{ id: Source | "all"; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "citizen", label: "Photo reports" },
  { id: "sensor", label: "Sensors" },
  { id: "satellite", label: "Satellite" },
];

const markerPositions = [
  "command-marker-one",
  "command-marker-two",
  "command-marker-three",
  "command-marker-four",
  "command-marker-five",
  "command-marker-six",
];

export default function CommandCenter() {
  const [selectedId, setSelectedId] = useState(commandIncidents[0]?.id);
  const [source, setSource] = useState<Source | "all">("all");

  const filteredIncidents = useMemo(() => {
    if (source === "all") return commandIncidents;
    return commandIncidents.filter((incident) => incident.source === source);
  }, [source]);

  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === selectedId) ??
    filteredIncidents[0] ??
    commandIncidents[0];

  return (
    <section className="command-center-grid">
      <div className="command-stat-grid" aria-label="Command Center metrics">
        {commandStats.map((stat) => (
          <article className="command-stat-card" key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
            <small>{stat.detail}</small>
          </article>
        ))}
      </div>

      <aside className="incident-queue-panel">
        <div className="command-panel-header">
          <div>
            <p>Incident feed</p>
            <h2>Response priority</h2>
          </div>
          <span>{filteredIncidents.length} active</span>
        </div>

        <div className="source-filter-row" aria-label="Source filters">
          {sourceFilters.map((filter) => (
            <button
              className={source === filter.id ? "source-filter active" : "source-filter"}
              key={filter.id}
              onClick={() => setSource(filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="incident-queue-list">
          {filteredIncidents.map((incident) => (
            <button
              className={
                incident.id === selectedIncident.id
                  ? "queue-item selected"
                  : "queue-item"
              }
              key={incident.id}
              onClick={() => setSelectedId(incident.id)}
              type="button"
            >
              <span className={`severity-dot ${incident.severity}`} />
              <span className="queue-copy">
                <strong>{incident.neighborhood}</strong>
                <small>
                  {incident.hazardType} · {incident.source} ·{" "}
                  {incident.aiConfidence}% confidence
                </small>
              </span>
              <span className={`queue-status ${incident.status}`}>
                {formatStatus(incident.status)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="command-map-panel">
        <div className="command-panel-header">
          <div>
            <p>Operational map</p>
            <h2>Delhi NCR hotspot layer</h2>
          </div>
          <span>Heatmap + reports</span>
        </div>

        <div className="command-map">
          <div className="command-map-grid" />
          <div className="risk-zone risk-zone-critical" />
          <div className="risk-zone risk-zone-medium" />
          <div className="command-road command-road-one" />
          <div className="command-road command-road-two" />
          <div className="command-road command-road-three" />

          {filteredIncidents.slice(0, 6).map((incident, index) => (
            <button
              aria-label={`Select ${incident.neighborhood}`}
              className={`command-marker ${markerPositions[index]} ${incident.severity} ${
                selectedIncident.id === incident.id ? "selected" : ""
              }`}
              key={incident.id}
              onClick={() => setSelectedId(incident.id)}
              type="button"
            >
              <span />
            </button>
          ))}

          <div className="map-legend">
            <span><i className="legend-critical" /> Critical</span>
            <span><i className="legend-medium" /> Medium</span>
            <span><i className="legend-low" /> Low</span>
          </div>
        </div>
      </div>

      <IncidentDetail incident={selectedIncident} />
    </section>
  );
}

function IncidentDetail({ incident }: { incident: Incident }) {
  return (
    <aside className="incident-detail-panel">
      <div className="command-panel-header">
        <div>
          <p>Incident detail</p>
          <h2>{incident.neighborhood}</h2>
        </div>
        <span className={`detail-severity ${incident.severity}`}>
          {incident.severity}
        </span>
      </div>

      <div className="evidence-preview">
        <div className={`evidence-visual ${incident.hazardType}`}>
          <span>{incident.hazardType}</span>
        </div>
        <div className="evidence-meta">
          <span>Age: {getIncidentAge(incident.timestamp)}</span>
          <span>{incident.corroboratingReports ?? 0} nearby reports</span>
          <span>Health risk: {incident.healthRisk}</span>
        </div>
      </div>

      <div className="ai-analysis-card">
        <p>Gemini multimodal analysis</p>
        <h3>
          {incident.aiConfidence}% confidence · {incident.hazardType} signal
        </h3>
        <div className="analysis-meter">
          <span style={{ width: `${incident.aiConfidence}%` }} />
        </div>
        <small>
          Fused with {incident.source} input, nearby reports, and geospatial risk
          context.
        </small>
      </div>

      <div className="recommended-action-card">
        <p>Recommended action</p>
        <h3>{getRecommendedAction(incident)}</h3>
        <span>
          Dispatch based on severity, confidence, local exposure, and forecasted
          spread.
        </span>
      </div>

      <div className="dispatch-actions">
        <button type="button">Deploy water cannon</button>
        <button type="button">Dispatch cleanup crew</button>
        <button type="button">Mark resolved</button>
      </div>
    </aside>
  );
}
