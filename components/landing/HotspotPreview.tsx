import type { Incident } from "@/lib/types";
import Link from "next/link";

const markerPositions = ["marker-one", "marker-two", "marker-three"];

export default function HotspotPreview({ priorityIncidents, criticalCount }: { priorityIncidents: Incident[], criticalCount: number }) {
  return (
    <aside className="hotspot-panel" aria-label="Live hotspot preview">
      <div className="panel-header">
        <div>
          <p>Live hotspot grid</p>
          <h2>East Delhi corridor</h2>
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
            <span>Priority incidents</span>
            <Link href="/map">View map</Link>
          </div>

          <div className="incident-list">
            {priorityIncidents.length === 0 ? (
              <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.88rem', textAlign: 'center', lineHeight: 1.5 }}>
                No active pollution alerts in Delhi NCR right now.
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
