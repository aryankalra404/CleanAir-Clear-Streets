"use client";

import type { Incident, Severity } from "@/lib/types";
import Link from "next/link";
import { useT } from "@/lib/languageContext";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, type GoogleMapInstance, type GoogleMapMarker } from "@/lib/googleMaps";
import { CITY_CENTER } from "@/lib/mockData";

const severityColor: Record<Severity, string> = {
  critical: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
};

export default function HotspotPreview({ priorityIncidents, criticalCount }: { priorityIncidents: Incident[], criticalCount: number }) {
  const t = useT();
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markerRefs = useRef<GoogleMapMarker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapNodeRef.current) return;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!mapNodeRef.current) return;
        const maps = window.google!.maps;
        
        const map = new maps.Map(mapNodeRef.current, {
          center: CITY_CENTER,
          zoom: 11,
          disableDefaultUI: true,
          gestureHandling: "none",
          clickableIcons: false,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3748" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#1a202c" }] },
            { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#2a4365" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#a0aec0" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a202c" }] },
          ],
        });

        mapRef.current = map;
        setMapLoaded(true);
      })
      .catch((err) => console.error("Failed to load Google Maps for hero preview", err));
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;

    // Clear old markers
    markerRefs.current.forEach(m => m.setMap(null));
    markerRefs.current = [];

    priorityIncidents.forEach((incident) => {
      const color = severityColor[incident.severity] || severityColor.medium;
      const marker = new maps.Marker({
        map: mapRef.current,
        position: { lat: incident.latitude, lng: incident.longitude },
        title: incident.neighborhood,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="0.8" stroke="white" stroke-width="2"/>
            </svg>
          `)}`,
          scaledSize: new maps.Size(24, 24),
          anchor: new maps.Point(12, 12),
        },
      });
      markerRefs.current.push(marker);
    });
  }, [mapLoaded, priorityIncidents]);

  return (
    <aside className="hotspot-panel" aria-label="Live hotspot preview" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <div>
          <p>{t("hotspot_preview_eyebrow")}</p>
          <h2>{t("hotspot_preview_location")}</h2>
        </div>
        <span>{criticalCount} critical</span>
      </div>

      <div className="map-preview" style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: '360px', padding: 0 }}>
        {/* Google Map Container */}
        <div 
          ref={mapNodeRef} 
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, backgroundColor: '#1a202c' }} 
        />
        
        {/* Overlay overlay to make it look embedded/darker */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at center, transparent 40%, rgba(15, 23, 42, 0.4) 100%)' }} />

        {/* Priority Card Overlay */}
        <div className="priority-card" style={{ position: 'absolute', bottom: '16px', left: '16px', right: '16px', zIndex: 10 }}>
          <div className="priority-card-header">
            <span>{t("hotspot_preview_priority_incidents")}</span>
            <Link href="/map">{t("hotspot_preview_view_map")}</Link>
          </div>

          <div className="incident-list">
            {priorityIncidents.length === 0 ? (
              <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.88rem', textAlign: 'center', lineHeight: 1.5 }}>
                {t("hotspot_preview_no_alerts")}
              </div>
            ) : (
              priorityIncidents.map((incident) => (
                <article className="incident-row" key={incident.id}>
                  <div>
                    <h3>{incident.neighborhood}</h3>
                    <p>
                      {t("hazard_" + incident.hazardType) || incident.hazardType} · {incident.source} ·{" "}
                      {incident.aiConfidence}% confidence
                    </p>
                  </div>
                  <span className={`severity-badge ${incident.severity}`}>
                    {incident.severity}
                  </span>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
