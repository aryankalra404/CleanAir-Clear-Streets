"use client";

import type { Incident } from "@/lib/types";
import Link from "next/link";
import { useT } from "@/lib/languageContext";

const markerPositions = ["marker-one", "marker-two", "marker-three"];

export default function HotspotPreview({ priorityIncidents, criticalCount }: { priorityIncidents: Incident[], criticalCount: number }) {
  const t = useT();

  return (
    <aside className="hotspot-panel" aria-label="Live hotspot preview">
      <div className="panel-header">
        <div>
          <p>{t("hotspot_preview_eyebrow")}</p>
          <h2>{t("hotspot_preview_location")}</h2>
        </div>
        <span>{criticalCount} critical</span>
      </div>

      <div className="map-preview">
        <div className="map-preview-grid" />
        <div className="map-ring ring-large" />
        <div className="map-ring ring-small" />
        <div className="road road-one" />
        <div className="road road-two" />
        <div className="road road-three" />

        {priorityIncidents.map((incident, index) => (
          <div
            className={`hotspot-marker ${markerPositions[index]}`}
            key={incident.id}
          >
            <span />
          </div>
        ))}

        <div className="priority-card">
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
                      {incident.hazardType} · {incident.source} ·{" "}
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
