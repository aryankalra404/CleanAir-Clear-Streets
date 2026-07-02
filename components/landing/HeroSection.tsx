import Link from "next/link";
import HotspotPreview from "@/components/landing/HotspotPreview";
import { heroStats } from "@/components/landing/landingData";

export default function HeroSection() {
  return (
    <div className="hero-layout">
      <div className="hero-copy">
        <div className="live-pill">
          <span />
          Delhi NCR neighbourhood radar live
        </div>

        <h1>Detect pollution hotspots before they spread.</h1>

        <p>
          CleanAir Command combines citizen photos, local sensor readings, and
          satellite context to detect street-level smoke, dust, and waste
          burning, then turns them into action-ready municipal alerts.
        </p>

        <div className="hero-actions">
          <Link href="/report" className="btn btn-primary">
            Report a Hotspot
          </Link>
          <Link href="/dashboard" className="btn btn-secondary">
            Open Command Center
          </Link>
        </div>

        <div className="stats-grid" aria-label="Live city metrics">
          {heroStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>
      </div>

      <HotspotPreview />
    </div>
  );
}
