import Link from "next/link";
import {
  criticalIncidents,
  priorityIncidents,
} from "@/components/landing/landingData";

const markerPositions = ["marker-one", "marker-two", "marker-three"];

export default function HotspotPreview() {
  return (
    <aside className="hotspot-panel" aria-label="Live hotspot preview">
      <div className="panel-header">
        <div>
          <p>Live hotspot grid</p>
          <h2>East Delhi corridor</h2>
        </div>
        <span>{criticalIncidents.length} critical</span>
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
            {priorityIncidents.map((incident) => (
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
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
