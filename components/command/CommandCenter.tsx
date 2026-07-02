"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import type { HazardType, HealthRisk, Incident, IncidentEvidence, IncidentStatus, Severity, Source } from "@/lib/types";
import {
  buildIncidentEvidence,
  commandIncidents,
  commandStats,
  formatStatus,
  getIncidentAge,
  getRecommendedAction,
} from "@/components/command/commandData";
import { db, isFirebaseConfigured } from "@/lib/firebase";

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

interface FirestoreReport {
  anonymous?: boolean;
  aiConfidence?: number;
  createdAt?: Timestamp;
  geminiClassification?: {
    confidence?: number;
    severity?: Severity;
    type?: HazardType;
  };
  hazardLabel?: string;
  location?: {
    label?: string;
    lat?: string;
    lng?: string;
  };
  note?: string;
  result?: string;
  status?: IncidentStatus | "submitted" | "classified";
  validation?: IncidentEvidence;
}

function normalizeStatus(status?: FirestoreReport["status"]): IncidentStatus {
  if (status === "submitted" || status === "classified") return "under_review";
  return status ?? "under_review";
}

function getHealthRisk(severity: Severity): HealthRisk {
  if (severity === "critical") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function reportToIncident(id: string, report: FirestoreReport): Incident {
  const severity = report.geminiClassification?.severity ?? "medium";
  const hazardType = report.geminiClassification?.type ?? "fire";
  const aiConfidence =
    report.geminiClassification?.confidence ?? report.aiConfidence ?? 72;
  const incident: Incident = {
    id: `firestore-${id}`,
    aiConfidence,
    corroboratingReports: report.validation?.citizenSignal.reportCount ?? 1,
    evidence: report.validation,
    hazardType,
    healthRisk: getHealthRisk(severity),
    isAnonymous: report.anonymous ?? true,
    latitude: Number(report.location?.lat ?? 28.6264),
    longitude: Number(report.location?.lng ?? 77.3192),
    neighborhood: report.location?.label ?? "Citizen report",
    photoUrl: "",
    severity,
    source: "citizen",
    status: normalizeStatus(report.status),
    timestamp: report.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
  };

  return {
    ...incident,
    evidence: incident.evidence ?? buildIncidentEvidence(incident),
  };
}

export default function CommandCenter() {
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState(commandIncidents[0]?.id);
  const [source, setSource] = useState<Source | "all">("all");

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc"),
      limit(8),
    );

    return onSnapshot(reportsQuery, (snapshot) => {
      setLiveIncidents(
        snapshot.docs.map((doc) =>
          reportToIncident(doc.id, doc.data() as FirestoreReport),
        ),
      );
    });
  }, []);

  const incidents = useMemo(
    () => [...liveIncidents, ...commandIncidents],
    [liveIncidents],
  );

  const filteredIncidents = useMemo(() => {
    if (source === "all") return incidents;
    return incidents.filter((incident) => incident.source === source);
  }, [incidents, source]);

  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === selectedId) ??
    filteredIncidents[0] ??
    incidents[0];

  const stats = useMemo(
    () =>
      commandStats.map((stat) => {
        if (stat.label === "Active incidents") {
          return {
            ...stat,
            value: incidents.filter((incident) => incident.status !== "resolved").length,
          };
        }
        if (stat.label === "Critical") {
          return {
            ...stat,
            value: incidents.filter((incident) => incident.severity === "critical")
              .length,
          };
        }
        return stat;
      }),
    [incidents],
  );

  return (
    <section className="command-center-grid">
      <div className="command-stat-grid" aria-label="Command Center metrics">
        {stats.map((stat) => (
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
  const evidence = incident.evidence ?? buildIncidentEvidence(incident);

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
          {evidence.fusion.finalConfidence}% fusion confidence
        </h3>
        <div className="analysis-meter">
          <span style={{ width: `${evidence.fusion.finalConfidence}%` }} />
        </div>
        <small>
          Visual {incident.aiConfidence}% · sensor weight{" "}
          {Math.round(evidence.fusion.sensorWeight * 100)}% · satellite weight{" "}
          {Math.round(evidence.fusion.satelliteWeight * 100)}%
        </small>
      </div>

      <div className="evidence-trail-card">
        <p>Coverage-aware evidence trail</p>
        <div className="evidence-score-row">
          <strong>{evidence.coverage.label}</strong>
          <span>H3 {evidence.fusion.h3CellId}</span>
        </div>
        <ul>
          <li>
            <span>Citizen corroboration</span>
            <strong>
              {evidence.citizenSignal.reportCount} reports /{" "}
              {evidence.citizenSignal.windowMinutes} min
            </strong>
          </li>
          <li>
            <span>Nearest station</span>
            <strong>{evidence.coverage.nearestSensorKm.toFixed(1)} km</strong>
          </li>
          <li>
            <span>Sensor trend</span>
            <strong>
              PM2.5 {evidence.sensor.pm25Delta >= 0 ? "+" : ""}
              {evidence.sensor.pm25Delta}% · {evidence.sensor.trend}
            </strong>
          </li>
          <li>
            <span>Satellite context</span>
            <strong>
              {evidence.satellite.freshness} · {evidence.satellite.lastPassTime}
            </strong>
          </li>
        </ul>
        <small>{evidence.alertReason}</small>
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
