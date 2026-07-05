"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { Incident, Source } from "@/lib/types";
import {
  commandStats,
  formatStatus,
  getIncidentAge,
  getRecommendedAction,
} from "@/components/command/commandData";
import GoogleHotspotMap from "@/components/map/GoogleHotspotMap";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  hasPollutionSignal,
  reportToIncident,
  type FirestoreReport,
} from "@/lib/firestoreReports";
import { buildIncidentEvidence } from "@/lib/incidentEvidence";
import { latLngToCell } from "h3-js";

const sourceFilters: Array<{ id: Source | "all"; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "citizen", label: "Photo reports" },
  { id: "sensor", label: "Sensors" },
  { id: "satellite", label: "Satellite" },
];

export default function CommandCenter() {
  const [liveReports, setLiveReports] = useState<Incident[]>([]);
  const [liveAlertIncidents, setLiveAlertIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [source, setSource] = useState<Source | "all">("all");

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc"),
      limit(8),
    );

    return onSnapshot(reportsQuery, (snapshot) => {
      setLiveReports(
        snapshot.docs
          .map((reportDoc) => ({
            data: reportDoc.data() as FirestoreReport,
            id: reportDoc.id,
          }))
          .filter((report) => hasPollutionSignal(report.data))
          .map((report) => reportToIncident(report.id, report.data)),
      );
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const incidentsQuery = query(
      collection(db, "incidents"),
      orderBy("updatedAt", "desc"),
      limit(8),
    );

    return onSnapshot(incidentsQuery, (snapshot) => {
      setLiveAlertIncidents(
        snapshot.docs.map((doc) =>
          reportToIncident(doc.id, doc.data() as FirestoreReport),
        ),
      );
    });
  }, []);

  const incomingSignals = useMemo(
    () => liveReports.filter((incident) => !incident.evidence?.alertTier),
    [liveReports],
  );

  const incidents = liveAlertIncidents;

  const filteredIncidents = useMemo(() => {
    if (source === "all") return incidents;
    return incidents.filter((incident) => incident.source === source);
  }, [incidents, source]);

  const selectedIncident =
    (() => {
      const allIncidents = [...incidents, ...incomingSignals];
      const selected = allIncidents.find((incident) => incident.id === selectedId);
      const newestLiveIncident = liveAlertIncidents[0];
      return selected ?? newestLiveIncident ?? null;
    })();
  const selectedIncidentId = selectedIncident?.id ?? null;
  const isSelectedUnpromoted = selectedIncident && !selectedIncident.evidence?.alertTier;

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
        if (stat.label === "Avg response") {
          return { ...stat, value: "—" };
        }
        if (stat.label === "Peak risk") {
          return { ...stat, value: "—", detail: "Awaiting forecast data" };
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
          {filteredIncidents.length === 0 ? (
            <div className="incident-empty-state">
              <strong>No live incidents yet</strong>
              <span>
                Promoted Firestore incidents will appear here as soon as the
                corroboration threshold is crossed.
              </span>
            </div>
          ) : filteredIncidents.map((incident) => (
            <button
              className={
                incident.id === selectedIncidentId
                  ? `queue-item selected`
                  : `queue-item`
              }
              key={incident.id}
              onClick={() => setSelectedId(incident.id)}
              type="button"
            >
              <span className={`severity-dot ${incident.severity}`} />
              <span className="queue-copy">
                <strong>
                  {incident.neighborhood}
                </strong>
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

        <IncomingSignals signals={incomingSignals} />
      </aside>

      <div className="command-map-panel">
        <div className="command-panel-header">
          <div>
            <p>Operational map</p>
            <h2>Delhi NCR hotspot layer</h2>
          </div>
          <span>{filteredIncidents.length + incomingSignals.length} mapped</span>
        </div>

        <GoogleHotspotMap
          incidents={[...filteredIncidents, ...incomingSignals]}
          mode="operations"
          onIncidentSelect={setSelectedId}
          selectedIncidentId={selectedIncidentId}
          showHeader={false}
          showSidebar={false}
        />
      </div>

      {selectedIncident ? (
        isSelectedUnpromoted ? (
          <UnverifiedSignalDetail incident={selectedIncident} />
        ) : (
          <IncidentDetail incident={selectedIncident} />
        )
      ) : (
        <EmptyIncidentDetail />
      )}
    </section>
  );
}

function IncomingSignals({ signals }: { signals: Incident[] }) {
  const groupedSignals = useMemo(() => {
    const groupMap = new Map<string, { primary: Incident; count: number }>();
    signals.forEach((signal) => {
      const h3CellId = signal.h3CellId ?? latLngToCell(signal.latitude, signal.longitude, 8);
      const groupId = `${h3CellId}-${signal.hazardType}`;
      
      const cluster = groupMap.get(groupId);
      if (!cluster) {
        groupMap.set(groupId, { primary: signal, count: 1 });
      } else {
        cluster.count++;
      }
    });
    return Array.from(groupMap.values());
  }, [signals]);

  return (
    <div className="incoming-signals-panel">
      <div>
        <p>Incoming signals</p>
        <span>{groupedSignals.length} unverified</span>
      </div>

      {groupedSignals.length === 0 ? (
        <small>No raw citizen reports waiting for corroboration.</small>
      ) : (
        <ul>
          {groupedSignals.slice(0, 3).map((group) => {
            const signal = group.primary;
            const evidence = signal.evidence ?? null;
            return (
              <li key={signal.id}>
                <strong>{signal.neighborhood}</strong>
                <span>
                  {group.count > 1 
                    ? `${group.count} reports · awaiting corroboration threshold` 
                    : (evidence?.promotionReason ?? "Awaiting classification and fusion evidence.")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function IncidentDetail({ incident }: { incident: Incident }) {
  const evidence = incident.evidence ?? null;
  const isAwaitingClassification = !evidence;
  const fallbackEvidence = evidence ?? buildIncidentEvidence(incident);
  const sensorLabel =
    fallbackEvidence.sensor.source === "CPCB" && fallbackEvidence.sensor.stationName
      ? `${fallbackEvidence.sensor.stationName} · ${fallbackEvidence.sensor.distanceKm?.toFixed(1)} km`
      : "Estimated sensor context";
  const pollutantName = fallbackEvidence.sensor.primaryName ?? "PM2.5";
  const pollutantValue = fallbackEvidence.sensor.primaryValue ?? fallbackEvidence.sensor.pm25;
  const pollutantDelta = fallbackEvidence.sensor.primaryDelta ?? fallbackEvidence.sensor.pm25Delta;

  const sensorReading =
    pollutantValue !== undefined && pollutantValue !== null
      ? `${pollutantName} ${pollutantValue} µg/m³`
      : `${pollutantName} ${pollutantDelta >= 0 ? "+" : ""}${pollutantDelta}%`;
  const sensorMeta =
    fallbackEvidence.sensor.source === "CPCB" && fallbackEvidence.sensor.lastUpdated
      ? `updated ${fallbackEvidence.sensor.lastUpdated}`
      : fallbackEvidence.sensor.trend;

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
        <div 
          className={`evidence-visual ${incident.hazardType}`}
          style={incident.photoUrl ? { backgroundImage: `url(${incident.photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {!incident.photoUrl && <span>{incident.hazardType}</span>}
        </div>
        <div className="evidence-meta">
          <span>Age: {getIncidentAge(incident.timestamp)}</span>
          <span>{incident.corroboratingReports ?? 0} nearby reports</span>
          <span>Health risk: {incident.healthRisk}</span>
        </div>
      </div>

      <div className="ai-analysis-card">
        <p>Gemini multimodal analysis</p>
        {isAwaitingClassification ? (
          <>
            <h3>Awaiting classification</h3>
            <div className="analysis-meter pending">
              <span style={{ width: "18%" }} />
            </div>
            <small>Fusion confidence will appear after Gemini, CPCB, and satellite evidence are written to Firestore.</small>
          </>
        ) : (
          <>
            <h3>
              {fallbackEvidence.fusion.finalConfidence}% fusion confidence
            </h3>
            <div className="analysis-meter">
              <span style={{ width: `${fallbackEvidence.fusion.finalConfidence}%` }} />
            </div>
            <small>
              Visual {incident.aiConfidence}% · sensor weight{" "}
              {Math.round(fallbackEvidence.fusion.sensorWeight * 100)}% · satellite weight{" "}
              {Math.round(fallbackEvidence.fusion.satelliteWeight * 100)}%
            </small>
          </>
        )}
      </div>

      <div className="evidence-trail-card">
        <p>Coverage-aware evidence trail</p>
        {isAwaitingClassification ? (
          <div className="evidence-awaiting-state">
            <strong>Awaiting classification...</strong>
            <span>Live Firestore report has not received validation evidence yet.</span>
          </div>
        ) : (
          <>
            <div className="evidence-score-row">
              <strong>{fallbackEvidence.coverage.label}</strong>
              <span>H3 {fallbackEvidence.fusion.h3CellId}</span>
            </div>
            <ul>
              <li>
                <span>Citizen corroboration</span>
                <strong>
                  {fallbackEvidence.citizenSignal.reportCount} reports /{" "}
                  {fallbackEvidence.citizenSignal.windowMinutes} min
                </strong>
              </li>
              <li>
                <span>Nearest station</span>
                <strong>{fallbackEvidence.coverage.nearestSensorKm.toFixed(1)} km</strong>
              </li>
              <li>
                <span>{sensorLabel}</span>
                <strong>
                  {sensorReading} · {sensorMeta}
                </strong>
              </li>
              <li>
                <span>Satellite context</span>
                <strong>
                  {fallbackEvidence.satellite.freshness} · {fallbackEvidence.satellite.lastPassTime}
                </strong>
              </li>
            </ul>
            <small>{fallbackEvidence.alertReason}</small>
          </>
        )}
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

function EmptyIncidentDetail() {
  return (
    <aside className="incident-detail-panel">
      <div className="command-panel-header">
        <div>
          <p>Incident detail</p>
          <h2>No live incident selected</h2>
        </div>
      </div>
      <div className="evidence-awaiting-state">
        <strong>No live incidents yet</strong>
        <span>Turn on demo incidents to preview the dashboard with sample data.</span>
      </div>
    </aside>
  );
}

function UnverifiedSignalDetail({ incident }: { incident: Incident }) {
  const reports = incident.corroboratingReports ?? 1;
  return (
    <aside className="incident-detail-panel">
      <div className="command-panel-header">
        <div>
          <p>Unverified signal</p>
          <h2>{incident.neighborhood}</h2>
        </div>
        <span className="detail-severity low">Pending</span>
      </div>
      <div className="evidence-awaiting-state">
        <strong>Awaiting corroboration</strong>
        <span>
          {reports} citizen report{reports > 1 ? "s" : ""} received. Waiting for the promotion threshold (3 reports) or sensor/satellite confirmation before municipal escalation.
        </span>
      </div>
    </aside>
  );
}
