"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { commandIncidents, formatStatus } from "@/components/command/commandData";
import { latLngToCell } from "h3-js";
import { CITY_CENTER } from "@/lib/mockData";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  hasPollutionSignal,
  reportToIncident,
  type FirestoreReport,
} from "@/lib/firestoreReports";
import {
  loadGoogleMaps,
  type GoogleMapCircle,
  type GoogleMapInfoWindow,
  type GoogleMapInstance,
  type GoogleMapMarker,
  type GoogleMapsApi,
} from "@/lib/googleMaps";
import type { Incident, Severity } from "@/lib/types";

declare global {
  interface Window {
    google?: GoogleMapsApi;
    cleanAirGoogleMapsPromises?: Partial<Record<string, Promise<void>>>;
  }
}

const severityColor: Record<Severity, string> = {
  critical: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

const severityRadius: Record<Severity, number> = {
  critical: 4200,
  medium: 3000,
  low: 2200,
};

type GoogleHotspotMapProps = {
  incidents?: Incident[];
  mode?: "public" | "operations";
  onIncidentSelect?: (incidentId: string) => void;
  selectedIncidentId?: string | null;
  showDemoToggle?: boolean;
  showHeader?: boolean;
  showSidebar?: boolean;
};

const mapStyles = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#d8e1da" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#d9ece7" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#eef4f1" }],
  },
];

interface MapCluster {
  id: string;
  h3CellId: string;
  isMock: boolean;
  latitude: number;
  longitude: number;
  incidents: Incident[];
  promotedIncident?: Incident;
}

function getEvidenceSourceSummary(incident: Incident) {
  const sources = new Set<string>();
  const evidence = incident.evidence;

  if ((evidence?.citizenSignal?.reportCount ?? incident.corroboratingReports ?? 0) > 0) {
    sources.add("citizen");
  }
  if (
    evidence?.sensor?.source === "CPCB" &&
    ((evidence.sensor.primaryDelta !== undefined && evidence.sensor.primaryDelta > 300) || 
     (evidence.sensor.pm25Delta !== undefined && evidence.sensor.pm25Delta > 300) || 
     evidence.sensor.trend === "rising") &&
    evidence.sensor.lastUpdated
  ) {
    sources.add("sensor");
  }
  if (evidence?.satellite?.signal && !evidence.satellite.signal.includes("not decisive") && !evidence.satellite.signal.includes("pending")) {
    sources.add("satellite");
  }
  if (sources.size === 0) sources.add(incident.source);

  return {
    count: sources.size,
    label: [...sources].join(" + "),
  };
}

function markerIcon(cluster: MapCluster, mode: "public" | "operations") {
  const isPromoted = !!cluster.promotedIncident;
  const primaryIncident = cluster.promotedIncident ?? cluster.incidents[0];
  const isPending = primaryIncident.status === "pending" || primaryIncident.status === "classification_failed";
  const evidenceSummary = getEvidenceSourceSummary(primaryIncident);
  
  if (!isPromoted || isPending) {
    const hasMultiple = cluster.incidents.length > 1;
    const r = hasMultiple ? 14 : 8;
    const size = hasMultiple ? 28 : 16;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${r - 1}" fill="#94a3b8" stroke="#475569" stroke-width="1.5" stroke-dasharray="2 2" fill-opacity="0.3"/>
          ${hasMultiple ? `<text x="${size/2}" y="${size/2 + 3.5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="800" fill="#334155">${cluster.incidents.length}</text>` : `<circle cx="${size/2}" cy="${size/2}" r="3" fill="#64748b"/>`}
        </svg>
      `)}`,
      scaledSize: new window.google!.maps.Size(size, size),
      anchor: new window.google!.maps.Point(size/2, size/2),
    };
  }

  const color = primaryIncident.isMock
    ? "#94a3b8"
    : severityColor[primaryIncident.severity];

  let label = "";
  if (primaryIncident.isMock) {
    label = "D";
  } else if (primaryIncident.linkedReportIds) {
    label = String(primaryIncident.linkedReportIds.length);
  } else if (mode === "operations") {
    label = String(evidenceSummary.count);
  } else if (primaryIncident.severity === "critical") {
    label = "!";
  } else if (primaryIncident.severity === "medium") {
    label = "•";
  }

  const dash = primaryIncident.isMock ? `stroke-dasharray="4 3"` : "";

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="38" height="46" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 45C19 45 35 29.8 35 17.8C35 8.5 27.8 1 19 1C10.2 1 3 8.5 3 17.8C3 29.8 19 45 19 45Z" fill="${color}" stroke="white" stroke-width="3" ${dash}/>
        <circle cx="19" cy="18" r="8" fill="white" fill-opacity="0.96"/>
        <text x="19" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${color}">${label}</text>
      </svg>
    `)}`,
    scaledSize: new window.google!.maps.Size(38, 46),
    anchor: new window.google!.maps.Point(19, 45),
  };
}

export default function GoogleHotspotMap({
  incidents: controlledIncidents,
  mode = "public",
  onIncidentSelect,
  selectedIncidentId: controlledSelectedIncidentId,
  showDemoToggle = true,
  showHeader = true,
  showSidebar = true,
}: GoogleHotspotMapProps = {}) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<Record<string, GoogleMapMarker>>({});
  const circleRefs = useRef<GoogleMapCircle[]>([]);
  const infoWindowRef = useRef<GoogleMapInfoWindow | null>(null);
  const [liveReports, setLiveReports] = useState<Incident[]>([]);
  const [selectedIdInternal, setSelectedIdInternal] = useState<string | null>(null);
  const [showDemoIncidents, setShowDemoIncidents] = useState(false);
  const hasApiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    hasApiKey ? "loading" : "error",
  );
  const isControlled = controlledIncidents !== undefined;

  useEffect(() => {
    if (isControlled) return;
    if (!isFirebaseConfigured || !db) return;

    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc"),
      limit(20),
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
  }, [isControlled]);

  const incidents = useMemo(
    () => {
      if (controlledIncidents) return controlledIncidents;
      return showDemoIncidents ? [...liveReports, ...commandIncidents] : liveReports;
    },
    [controlledIncidents, liveReports, showDemoIncidents],
  );

  const clusters = useMemo(() => {
    const groupMap = new Map<string, MapCluster>();
    
    incidents.forEach((incident) => {
      const h3CellId = incident.h3CellId ?? latLngToCell(incident.latitude, incident.longitude, 8);
      const isMock = !!incident.isMock;
      const groupId = `${h3CellId}-${isMock ? "demo" : "real"}`;
      
      let cluster = groupMap.get(groupId);
      if (!cluster) {
        cluster = {
          id: groupId,
          h3CellId,
          isMock,
          latitude: incident.latitude,
          longitude: incident.longitude,
          incidents: [],
        };
        groupMap.set(groupId, cluster);
      }
      
      cluster.incidents.push(incident);
      if (incident.linkedReportIds || incident.evidence?.alertTier) {
        cluster.promotedIncident = incident;
      }
    });
    
    return Array.from(groupMap.values());
  }, [incidents]);

  const selectedId = controlledSelectedIncidentId ?? selectedIdInternal;

  const selectedIncident = useMemo(
    () => {
      const selected = incidents.find((incident) => incident.id === selectedId);
      if (isControlled) return selected ?? null;
      const newestLiveIncident = liveReports[0];
      const fallbackDemoIncident = showDemoIncidents ? commandIncidents[0] : undefined;
      if (selected?.isMock && newestLiveIncident) return newestLiveIncident;
      return selected ?? newestLiveIncident ?? fallbackDemoIncident ?? null;
    },
    [incidents, isControlled, liveReports, selectedId, showDemoIncidents],
  );
  const selectedIncidentId = selectedIncident?.id ?? null;

  const selectIncident = useCallback((incidentId: string) => {
    onIncidentSelect?.(incidentId);
    if (!isControlled) setSelectedIdInternal(incidentId);
  }, [isControlled, onIncidentSelect]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return;
    }

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapNodeRef.current) return;

        const maps = window.google!.maps;
        const map = new maps.Map(mapNodeRef.current, {
          center: CITY_CENTER,
          clickableIcons: false,
          controlSize: 28,
          disableDefaultUI: true,
          fullscreenControl: mode === "public",
          mapTypeControl: mode === "public",
          mapTypeControlOptions: {
            position: maps.ControlPosition.TOP_RIGHT,
          },
          streetViewControl: false,
          styles: mapStyles,
          zoom: 10,
          zoomControl: true,
          zoomControlOptions: {
            position: maps.ControlPosition.RIGHT_BOTTOM,
          },
        });

        mapRef.current = map;
        infoWindowRef.current = new maps.InfoWindow();
        window.setTimeout(() => {
          if (!cancelled) {
            maps.event.trigger(map, "resize");
            map.setCenter?.(CITY_CENTER);
          }
        }, 0);

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (status !== "ready" || !mapNodeRef.current || !mapRef.current || !window.google?.maps) {
      return;
    }

    const mapNode = mapNodeRef.current;
    const map = mapRef.current;
    const resizeMap = () => {
      window.google?.maps.event.trigger(map, "resize");
      if (selectedIncident) {
        map.setCenter?.({
          lat: selectedIncident.latitude,
          lng: selectedIncident.longitude,
        });
      } else {
        map.setCenter?.(CITY_CENTER);
      }
    };

    resizeMap();
    const observer = new ResizeObserver(resizeMap);
    observer.observe(mapNode);
    window.addEventListener("resize", resizeMap);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeMap);
    };
  }, [selectedIncident, status]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !window.google?.maps) return;

    Object.values(markerRefs.current).forEach((marker) => marker.setMap(null));
    circleRefs.current.forEach((circle) => circle.setMap(null));
    markerRefs.current = {};
    circleRefs.current = [];

    const maps = window.google.maps;
    clusters.forEach((cluster) => {
      const primaryIncident = cluster.promotedIncident ?? cluster.incidents[0];
      const position = { lat: cluster.latitude, lng: cluster.longitude };
      
      // Calculate display status for circles
      const isPending = primaryIncident.status === "pending" || primaryIncident.status === "classification_failed";
      const isPromoted = !!cluster.promotedIncident;
      
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: primaryIncident.neighborhood,
        icon: markerIcon(cluster, mode),
        zIndex: primaryIncident.evidence?.alertTier ? 3 : 1,
      });

      const circle = new maps.Circle({
        center: position,
        fillColor:
          primaryIncident.isMock
            ? "#94a3b8"
            : !isPromoted
            ? "#667085"
            : isPending
            ? "#667085"
            : severityColor[primaryIncident.severity],
        fillOpacity: primaryIncident.evidence?.alertTier ? 0.16 : 0.06,
        map: mapRef.current,
        radius: primaryIncident.evidence?.alertTier ? severityRadius[primaryIncident.severity] : 1400,
        strokeColor:
          primaryIncident.isMock
            ? "#94a3b8"
            : !isPromoted
            ? "#667085"
            : isPending
            ? "#667085"
            : severityColor[primaryIncident.severity],
        strokeOpacity: primaryIncident.evidence?.alertTier ? 0.42 : 0.22,
        strokeWeight: 1,
      });

      marker.addListener("click", () => {
        // If there's a promoted incident, select that. Otherwise just select the first one in the cluster.
        selectIncident(primaryIncident.id);
      });
      
      // Map all incidents in this cluster to the same marker so we can focus them when selected
      cluster.incidents.forEach((incident) => {
        markerRefs.current[incident.id] = marker;
      });
      circleRefs.current.push(circle);
    });
  }, [clusters, mode, selectIncident, status]);

  useEffect(() => {
    if (!selectedIncident || !mapRef.current || !window.google?.maps) return;

    const marker = markerRefs.current[selectedIncident.id];
    const position = {
      lat: selectedIncident.latitude,
      lng: selectedIncident.longitude,
    };

    mapRef.current.panTo(position);
    marker?.setAnimation(window.google.maps.Animation.BOUNCE);
    window.setTimeout(() => marker?.setAnimation(null), 700);

    // Find which cluster this incident belongs to so we can display cluster counts in the info window
    const h3CellId = selectedIncident.h3CellId ?? latLngToCell(selectedIncident.latitude, selectedIncident.longitude, 8);
    const groupId = `${h3CellId}-${selectedIncident.isMock ? "demo" : "real"}`;
    const cluster = clusters.find((c) => c.id === groupId);
    
    const reportCount = cluster?.promotedIncident?.linkedReportIds?.length ?? cluster?.incidents.length ?? 1;
    const isPromoted = !!cluster?.promotedIncident;
    const evidenceSummary = getEvidenceSourceSummary(selectedIncident);
    
    let content = "";
    if (!isPromoted) {
      content = `
        <div class="google-map-infowindow unverified-tooltip" style="padding: 4px; text-align: center;">
          <strong style="display: block; margin-bottom: 4px;">${selectedIncident.neighborhood}</strong>
          <span style="color: #64748b; font-size: 13px;">${reportCount} citizen report${reportCount > 1 ? "s" : ""} · awaiting corroboration</span>
        </div>
      `;
    } else {
      content = `
        <div class="google-map-infowindow">
          <strong>${selectedIncident.neighborhood}</strong>
          <span>${selectedIncident.isMock ? "DEMO · " : ""}${selectedIncident.hazardType} · ${selectedIncident.aiConfidence}% confidence</span>
          ${reportCount > 1 ? `<span>${reportCount} citizen reports</span>` : ""}
          ${mode === "operations" ? `<span>${evidenceSummary.count} evidence source${evidenceSummary.count === 1 ? "" : "s"} · ${evidenceSummary.label}</span>` : ""}
        </div>
      `;
    }
    
    infoWindowRef.current?.setContent(content);
    infoWindowRef.current?.open({
      anchor: marker,
      map: mapRef.current,
    });
  }, [mode, selectedIncident, clusters]);

  return (
    <section className={mode === "operations" ? "operations-map-layout" : "public-map-layout"}>
      {showHeader && (
        <div className="public-map-header">
          <div>
            <p className="eyebrow">Public map</p>
            <h1>Live pollution hotspots</h1>
            <p>
              Verified reports, sensor flags, and predicted risk zones across Delhi NCR.
            </p>
          </div>
          <div className="map-status-card">
            <span>{incidents.length} visible</span>
            <strong>Google Maps layer</strong>
            {showDemoToggle && (
              <label className="demo-toggle compact">
                <input
                  checked={showDemoIncidents}
                  onChange={(event) => setShowDemoIncidents(event.target.checked)}
                  type="checkbox"
                />
                <span>Show demo incidents</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div
        className={
          showSidebar
            ? "public-map-shell"
            : "public-map-shell operations-map-shell"
        }
      >
        <div className="google-map-panel">
          <div className="google-map-canvas" ref={mapNodeRef} />
          {status !== "ready" && (
            <div className="google-map-state">
              <strong>
                {status === "error" ? "Map unavailable" : "Loading Google Maps"}
              </strong>
              <span>
                {status === "error"
                  ? "Check the Maps JavaScript API key and browser restrictions."
                  : "Plotting Delhi NCR hotspot markers."}
              </span>
            </div>
          )}
        </div>

        {showSidebar && (
          <aside className="public-map-sidebar">
            <div className="map-sidebar-header">
              <p>Hotspot feed</p>
              <span>{showDemoIncidents ? "Live + demo" : "Live"}</span>
            </div>
            <div className="map-incident-list">
              {clusters.length === 0 ? (
                <div className="incident-empty-state compact">
                  <strong>No live hotspots yet</strong>
                  <span>Citizen reports with pollution signals will appear here after classification.</span>
                </div>
              ) : clusters.map((cluster) => {
                const primaryIncident = cluster.promotedIncident ?? cluster.incidents[0];
                const reportCount = cluster.promotedIncident?.linkedReportIds?.length ?? cluster.incidents.length ?? 1;
                const isSelected = cluster.incidents.some((incident) => incident.id === selectedIncidentId);
                
                return (
                  <button
                    className={
                      isSelected
                        ? `map-incident-card selected ${primaryIncident.isMock ? "demo" : ""}`
                        : `map-incident-card ${primaryIncident.isMock ? "demo" : ""}`
                    }
                    key={cluster.id}
                    onClick={() => selectIncident(primaryIncident.id)}
                    type="button"
                  >
                    <span className={`severity-dot ${primaryIncident.severity}`} />
                    <span>
                      <strong>
                        {primaryIncident.neighborhood}
                        {primaryIncident.isMock && <i className="demo-badge">DEMO</i>}
                      </strong>
                      <small>
                        {reportCount > 1 ? `${reportCount} reports · ` : ""}
                        {primaryIncident.hazardType} · {formatStatus(primaryIncident.status)} ·{" "}
                        {primaryIncident.evidence?.alertTier ? "alert-tier" : "public signal"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
