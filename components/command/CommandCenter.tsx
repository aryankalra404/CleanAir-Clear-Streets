"use client";

import { useT } from "@/lib/languageContext";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import type { Incident } from "@/lib/types";
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
import { TIER_LABELS, TIER_RANK } from "@/lib/supportEvidence";
import { latLngToCell } from "h3-js";

type CommandTab = "priority" | "citizen_reported" | "auto_detected";

const commandTabs: Array<{ id: CommandTab; label: string }> = [
  { id: "priority", label: "Priority" },
  { id: "citizen_reported", label: "Citizen Reported" },
  { id: "auto_detected", label: "Automatically Detected" },
];

export default function CommandCenter() {
  const t = useT();
  const [liveReports, setLiveReports] = useState<Incident[]>([]);
  const [liveAlertIncidents, setLiveAlertIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CommandTab>("priority");
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

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
          .map((report) => reportToIncident(report.id, report.data))
          .filter((incident) => incident.status !== "resolved"),
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
        snapshot.docs
          .map((doc) => reportToIncident(doc.id, doc.data() as FirestoreReport))
          .filter((incident) => incident.status !== "resolved"),
      );
    });
  }, []);

  // Kick off the sensor/satellite-only ambient scan (no citizen report
  // needed). Writes land in the "incidents" collection and flow back through
  // the onSnapshot listener above like any other promoted incident. The route
  // itself has a 5-min in-process cooldown, so this is safe to call on mount.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    fetch("/api/scan-ambient").catch(() => {
      // Non-fatal — ambient detections just won't appear until the next scan succeeds.
    });
  }, []);

  const incomingSignals = useMemo(
    () => liveReports.filter((incident) => !incident.evidence?.alertTier),
    [liveReports],
  );

  // "incidents" collection = anything that has cleared a promotion tier,
  // sorted strongest evidence first (sensor+satellite > crowd > single-channel > detection-only).
  const priorityIncidents = useMemo(
    () =>
      [...liveAlertIncidents].sort((a, b) => {
        const rankA = a.evidence?.tier ? TIER_RANK[a.evidence.tier] : 99;
        const rankB = b.evidence?.tier ? TIER_RANK[b.evidence.tier] : 99;
        return rankA - rankB;
      }),
    [liveAlertIncidents],
  );

  // Citizen Reported: any promoted incident that had at least one citizen
  // report behind it — including sensor+satellite-confirmed incidents that
  // also happened to have citizen reports. Citizen involvement always wins
  // this bucket, since a human-corroborated signal deserves its own
  // priority channel regardless of what else confirmed it.
  const citizenReportedIncidents = useMemo(
    () =>
      liveAlertIncidents.filter(
        (incident) => (incident.evidence?.citizenSignal?.reportCount ?? 0) > 0,
      ),
    [liveAlertIncidents],
  );

  // Automatically Detected: promoted incidents with zero citizen reports —
  // purely sensor/satellite driven, since automatic detection can be wrong
  // and shouldn't be mixed into the citizen-corroborated channel.
  const autoDetectedIncidents = useMemo(
    () =>
      liveAlertIncidents.filter(
        (incident) => (incident.evidence?.citizenSignal?.reportCount ?? 0) === 0,
      ),
    [liveAlertIncidents],
  );

  const incidents = liveAlertIncidents;

  const mapOverlaySignals = incomingSignals;

  const filteredIncidents = useMemo(() => {
    switch (activeTab) {
      case "priority":
        return priorityIncidents;
      case "citizen_reported":
        return citizenReportedIncidents;
      case "auto_detected":
        return autoDetectedIncidents;
      default:
        return priorityIncidents;
    }
  }, [activeTab, priorityIncidents, citizenReportedIncidents, autoDetectedIncidents]);


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
            label: t("command_stat_active"),
            detail: t("command_stat_active_detail"),
            value: incidents.filter((incident) => incident.status !== "resolved").length,
          };
        }
        if (stat.label === "Critical") {
          return {
            ...stat,
            label: t("command_stat_critical"),
            detail: t("command_stat_critical_detail"),
            value: incidents.filter((incident) => incident.severity === "critical")
              .length,
          };
        }
        if (stat.label === "Avg response") {
          return { ...stat, label: t("command_stat_avg_response"), detail: t("command_stat_avg_response_detail"), value: "—" };
        }
        if (stat.label === "Peak risk") {
          return { ...stat, label: t("command_stat_peak_risk"), value: "—", detail: t("hero_stat_awaiting_forecast") };
        }
        return stat;
      }),
    [incidents, t],
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
            <p>{t("command_feed_title")}</p>
            <h2>{t("command_detail_priority")}</h2>
          </div>
          <span>{filteredIncidents.length} active</span>
        </div>

        <div className="source-filter-row" aria-label="Command Center tabs">
          {commandTabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "source-filter active" : "source-filter"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.id === "priority" ? (t("source_filter_priority") || tab.label) :
               tab.id === "citizen_reported" ? (t("source_filter_citizen_reported") || tab.label) :
               (t("source_filter_auto_detected") || tab.label)}
            </button>
          ))}
        </div>

        <div className="incident-queue-list">
          {filteredIncidents.length === 0 ? (
            <div className="incident-empty-state">
              <strong>{t("command_feed_empty_title")}</strong>
              <span>
                {t("command_signals_empty_desc")}
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
                  {t("hazard_" + incident.hazardType)}
                  {incident.evidence?.tier
                    ? ` · ${t("tier_" + incident.evidence.tier) || TIER_LABELS[incident.evidence.tier]}`
                    : ` · ${incident.source === "citizen" ? t("source_filter_citizen") : incident.source === "sensor" ? t("source_filter_sensor") : t("source_filter_satellite")}`}
                  {" · "}
                  {incident.aiConfidence}% {t("map_confidence")}
                </small>
              </span>
              <span className={`queue-status ${incident.status}`}>
                {t("status_" + incident.status) || formatStatus(incident.status)}
              </span>
            </button>
          ))}
        </div>

        {activeTab !== "auto_detected" && <IncomingSignals signals={incomingSignals} t={t} />}
      </aside>

      <div className="command-map-panel">
        <div className="command-panel-header">
          <div>
            <p>{t("command_detail_map_title")}</p>
            <h2>{t("command_detail_map_layer")}</h2>
          </div>
          <span>{filteredIncidents.length + mapOverlaySignals.length} mapped</span>
        </div>

        <GoogleHotspotMap
          incidents={[...filteredIncidents, ...mapOverlaySignals]}
          mode="operations"
          onIncidentSelect={setSelectedId}
          selectedIncidentId={selectedIncidentId}
          showHeader={false}
          showSidebar={false}
        />
      </div>


        {selectedIncident ? (
          isSelectedUnpromoted ? (
            <UnverifiedSignalDetail incident={selectedIncident} t={t} />
          ) : (
            <IncidentDetail 
              incident={selectedIncident} 
              t={t}
              onResolved={() => {
                setSelectedId(null);
                showToast("Incident marked resolved");
              }} 
            />
          )
        ) : (
          <EmptyIncidentDetail t={t} />
        )}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#101828', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: 700, boxShadow: '0 24px 60px rgba(16,24,40,0.16)', zIndex: 1000 }}>
          {toastMessage}
        </div>
      )}
    </section>
  );
}

function IncomingSignals({ signals, t }: { signals: Incident[], t: any }) {
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
        <p>{t("command_signals_title")}</p>
        <span>{groupedSignals.length} unverified</span>
      </div>

      {groupedSignals.length === 0 ? (
        <small>{t("command_signals_empty_title")}</small>
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

function IncidentDetail({ incident, onResolved, t }: { incident: Incident; onResolved: () => void, t: any }) {
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);

  const handleDispatch = async () => {
    if (!db || incident.dispatchStatus === "dispatched") return;
    setIsDispatching(true);
    try {
      const collectionName = incident.evidence?.alertTier ? "incidents" : "reports";
      const docId = incident.id.replace("firestore-", "");
      const actionLabel = getRecommendedAction(incident);
      await updateDoc(doc(db, collectionName, docId), {
        dispatchStatus: "dispatched",
        dispatchedAction: actionLabel,
        dispatchedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to dispatch:", err);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleResolve = async () => {
    if (!db) return;
    setIsResolving(true);
    setResolveError("");
    try {
      const incidentRef = doc(db, incident.id.replace("firestore-", "incidents/").includes("incidents/") ? incident.id.replace("firestore-", "incidents/") : `reports/${incident.id.replace("firestore-", "")}`);
      // Note: for safety, since incidents can be in "incidents" or "reports" collection
      const isPromoted = incident.id.includes("incidents/"); // Wait, reportToIncident sets id to `firestore-${id}`... Let me check how it gets promoted
      // Actually, if it's promoted, it's in the incidents collection? But the hook reads from `reports` for incoming and `incidents` for alerts.
      // Wait, let's just write to both or figure out which collection it belongs to.
      // If the incident has `linkedReportIds` it might be from the `incidents` collection, but wait, reportToIncident takes `id` directly!
      // Let's use `collectionName` logic: if incident.corroboratingReports > 1 or something? 
      // Actually, `liveAlertIncidents` comes from "incidents" collection, `liveReports` comes from "reports".
      // Let's just pass `isPromoted` or infer from `incident.evidence?.alertTier` which means it's in "incidents" collection.
      const collectionName = incident.evidence?.alertTier ? "incidents" : "reports";
      const docId = incident.id.replace("firestore-", "");
      await updateDoc(doc(db, collectionName, docId), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
      });
      setShowResolveModal(false);
      onResolved();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Failed to resolve incident");
    } finally {
      setIsResolving(false);
    }
  };

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
          <p>{t("command_detail_title")}</p>
          <h2>{incident.neighborhood}</h2>
        </div>
        <span className={`detail-severity ${incident.severity}`}>
          {t("severity_" + incident.severity) || incident.severity}
        </span>
      </div>

      <div className="evidence-preview">
        <div 
          className={`evidence-visual ${incident.hazardType}`}
          style={incident.photoUrl ? { backgroundImage: `url(${incident.photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {!incident.photoUrl && <span>{t("hazard_" + incident.hazardType)}</span>}
        </div>
        <div className="evidence-meta">
          <span>Age: {getIncidentAge(incident.timestamp)}</span>
          <span>{incident.corroboratingReports ?? 0} nearby reports</span>
          <span>Health risk: {incident.healthRisk}</span>
        </div>
      </div>

      <div className="ai-analysis-card">
        <p>{t("command_detail_evidence_ai")}</p>
        {isAwaitingClassification ? (
          <>
            <h3>{t("command_detail_status_awaiting_class")}</h3>
            <div className="analysis-meter pending">
              <span style={{ width: "18%" }} />
            </div>
            <small>{t("command_detail_unverified_desc2")}</small>
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
        <p>{t("command_detail_evidence_title")}</p>
        {isAwaitingClassification ? (
          <div className="evidence-awaiting-state">
            <strong>{t("command_detail_status_awaiting_class")}</strong>
            <span>{t("command_detail_unverified_desc1")}</span>
          </div>
        ) : (
          <>
            <div className="evidence-score-row">
              <strong>{fallbackEvidence.coverage.label}</strong>
              <span>H3 {fallbackEvidence.fusion.h3CellId}</span>
            </div>
            <ul>
              <li>
                <span>{t("command_detail_evidence_citizen")}</span>
                <strong>
                  {fallbackEvidence.citizenSignal.reportCount} reports /{" "}
                  {fallbackEvidence.citizenSignal.windowMinutes} min
                </strong>
              </li>
              <li>
                <span>{t("command_detail_nearest_station")}</span>
                <strong>{fallbackEvidence.coverage.nearestSensorKm.toFixed(1)} km</strong>
              </li>
              <li>
                <span>{sensorLabel}</span>
                <strong>
                  {sensorReading} · {sensorMeta}
                </strong>
              </li>
              <li>
                <span>{t("command_detail_evidence_satellite")}</span>
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
        <p>{t("command_detail_recommended_action")}</p>
        <h3>{getRecommendedAction(incident)}</h3>
        <span>
          {t("command_feed_description")}
        </span>
      </div>

      <div className="dispatch-actions">
        <button 
          type="button" 
          className="primary-action" 
          onClick={handleDispatch}
          disabled={isDispatching || incident.dispatchStatus === "dispatched"}
          style={incident.dispatchStatus === "dispatched" ? { background: '#117c72', opacity: 1 } : {}}
        >
          {incident.dispatchStatus === "dispatched" && incident.dispatchedAt 
            ? `Dispatched at ${new Date(incident.dispatchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
            : isDispatching ? "Dispatching..." : getRecommendedAction(incident)}
        </button>
        <button type="button" onClick={() => setShowResolveModal(true)}>{t("command_detail_resolve_button")}</button>
      </div>

      {showResolveModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 24px 60px rgba(16,24,40,0.16)', color: '#172033' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 850 }}>{t("command_detail_resolve_confirm_title")}</h3>
            <p style={{ margin: 0, color: '#667085', fontSize: '0.9rem', lineHeight: 1.5 }}>{t("command_detail_resolve_confirm_desc")}</p>
            {resolveError && <p style={{ color: 'red', marginTop: '12px' }}>{resolveError}</p>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button disabled={isResolving} onClick={() => setShowResolveModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d8e1da', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button disabled={isResolving} onClick={handleResolve} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #0f172a', background: '#0f172a', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                {isResolving ? "Resolving..." : "Confirm Resolve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function EmptyIncidentDetail({ t }: { t: any }) {
  return (
    <aside className="incident-detail-panel">
      <div className="command-panel-header">
        <div>
          <p>{t("command_detail_title")}</p>
          <h2>{t("command_detail_empty")}</h2>
        </div>
      </div>
      <div className="evidence-awaiting-state">
        <strong>{t("command_feed_empty_title")}</strong>
        <span>{t("command_feed_empty_desc")}</span>
      </div>
    </aside>
  );
}

function UnverifiedSignalDetail({ incident, t }: { incident: Incident, t: any }) {
  const reports = incident.corroboratingReports ?? 1;
  return (
    <aside className="incident-detail-panel">
      <div className="command-panel-header">
        <div>
          <p>{t("command_detail_unverified_title")}</p>
          <h2>{incident.neighborhood}</h2>
        </div>
        <span className="detail-severity low">Pending</span>
      </div>
      <div className="evidence-awaiting-state">
        <strong>{t("command_detail_status_awaiting_corrob")}</strong>
        <span>
          {reports} citizen report{reports > 1 ? "s" : ""} received. Waiting for the promotion threshold (3 reports) or sensor/satellite confirmation before municipal escalation.
        </span>
      </div>
    </aside>
  );
}
