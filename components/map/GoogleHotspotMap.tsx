"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { commandIncidents, formatStatus } from "@/components/command/commandData";
import { CITY_CENTER } from "@/lib/mockData";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import {
  hasPollutionSignal,
  reportToIncident,
  type FirestoreReport,
} from "@/lib/firestoreReports";
import type { Incident, Severity } from "@/lib/types";

declare global {
  interface Window {
    google?: GoogleMapsApi;
    cleanAirGoogleMapsPromise?: Promise<void>;
  }
}

type GoogleMapSize = unknown;
type GoogleMapPoint = unknown;

interface GoogleMapMarker {
  addListener: (eventName: string, handler: () => void) => void;
  setMap: (map: GoogleMapInstance | null) => void;
  setAnimation: (animation: unknown) => void;
}

interface GoogleMapCircle {
  setMap: (map: GoogleMapInstance | null) => void;
}

interface GoogleMapInstance {
  panTo: (position: { lat: number; lng: number }) => void;
}

interface GoogleMapInfoWindow {
  setContent: (content: string) => void;
  open: (options: { anchor?: GoogleMapMarker; map: GoogleMapInstance }) => void;
}

interface GoogleMapsApi {
  maps: {
    Animation: {
      BOUNCE: unknown;
    };
    Circle: new (options: Record<string, unknown>) => GoogleMapCircle;
    ControlPosition: {
      RIGHT_BOTTOM: unknown;
      TOP_RIGHT: unknown;
    };
    InfoWindow: new () => GoogleMapInfoWindow;
    Map: new (node: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMapMarker;
    Point: new (x: number, y: number) => GoogleMapPoint;
    Size: new (width: number, height: number) => GoogleMapSize;
  };
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

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.cleanAirGoogleMapsPromise) return window.cleanAirGoogleMapsPromise;

  window.cleanAirGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return window.cleanAirGoogleMapsPromise;
}

function markerIcon(incident: Incident) {
  const isPending = incident.status === "pending" || incident.status === "classification_failed";
  const color = isPending ? "#667085" : severityColor[incident.severity];
  const label = isPending ? "?" : incident.severity === "critical" ? "!" : incident.severity === "medium" ? "•" : "";

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="38" height="46" viewBox="0 0 38 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 45C19 45 35 29.8 35 17.8C35 8.5 27.8 1 19 1C10.2 1 3 8.5 3 17.8C3 29.8 19 45 19 45Z" fill="${color}" stroke="white" stroke-width="3"/>
        <circle cx="19" cy="18" r="8" fill="white" fill-opacity="0.96"/>
        <text x="19" y="22" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${color}">${label}</text>
      </svg>
    `)}`,
    scaledSize: new window.google!.maps.Size(38, 46),
    anchor: new window.google!.maps.Point(19, 45),
  };
}

export default function GoogleHotspotMap() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<Record<string, GoogleMapMarker>>({});
  const circleRefs = useRef<GoogleMapCircle[]>([]);
  const infoWindowRef = useRef<GoogleMapInfoWindow | null>(null);
  const [liveReports, setLiveReports] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState(commandIncidents[0]?.id);
  const hasApiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    hasApiKey ? "loading" : "error",
  );

  useEffect(() => {
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
  }, []);

  const incidents = useMemo(
    () => [...liveReports, ...commandIncidents],
    [liveReports],
  );

  const selectedIncident = useMemo(
    () =>
      incidents.find((incident) => incident.id === selectedId) ??
      incidents[0],
    [incidents, selectedId],
  );

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
          fullscreenControl: true,
          mapTypeControl: true,
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

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !window.google?.maps) return;

    Object.values(markerRefs.current).forEach((marker) => marker.setMap(null));
    circleRefs.current.forEach((circle) => circle.setMap(null));
    markerRefs.current = {};
    circleRefs.current = [];

    const maps = window.google.maps;
    incidents.forEach((incident) => {
      const position = { lat: incident.latitude, lng: incident.longitude };
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: incident.neighborhood,
        icon: markerIcon(incident),
        zIndex: incident.evidence?.alertTier ? 3 : 1,
      });

      const circle = new maps.Circle({
        center: position,
        fillColor:
          incident.status === "pending" || incident.status === "classification_failed"
            ? "#667085"
            : severityColor[incident.severity],
        fillOpacity: incident.evidence?.alertTier ? 0.16 : 0.06,
        map: mapRef.current,
        radius: incident.evidence?.alertTier ? severityRadius[incident.severity] : 1400,
        strokeColor:
          incident.status === "pending" || incident.status === "classification_failed"
            ? "#667085"
            : severityColor[incident.severity],
        strokeOpacity: incident.evidence?.alertTier ? 0.42 : 0.22,
        strokeWeight: 1,
      });

      marker.addListener("click", () => {
        setSelectedId(incident.id);
      });
      markerRefs.current[incident.id] = marker;
      circleRefs.current.push(circle);
    });
  }, [incidents, status]);

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

    infoWindowRef.current?.setContent(`
      <div class="google-map-infowindow">
        <strong>${selectedIncident.neighborhood}</strong>
        <span>${selectedIncident.hazardType} · ${selectedIncident.aiConfidence}% confidence</span>
      </div>
    `);
    infoWindowRef.current?.open({
      anchor: marker,
      map: mapRef.current,
    });
  }, [selectedIncident]);

  return (
    <section className="public-map-layout">
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
        </div>
      </div>

      <div className="public-map-shell">
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

        <aside className="public-map-sidebar">
          <div className="map-sidebar-header">
            <p>Hotspot feed</p>
            <span>Live</span>
          </div>
          <div className="map-incident-list">
            {incidents.map((incident) => (
              <button
                className={
                  incident.id === selectedIncident.id
                    ? "map-incident-card selected"
                    : "map-incident-card"
                }
                key={incident.id}
                onClick={() => setSelectedId(incident.id)}
                type="button"
              >
                <span className={`severity-dot ${incident.severity}`} />
                <span>
                  <strong>{incident.neighborhood}</strong>
                  <small>
                    {incident.hazardType} · {formatStatus(incident.status)} ·{" "}
                    {incident.evidence?.alertTier ? "alert-tier" : "public signal"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
