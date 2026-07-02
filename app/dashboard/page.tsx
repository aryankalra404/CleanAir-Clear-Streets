import CommandCenterTabs from "@/components/shared/CommandCenterTabs";
import Navbar from "@/components/shared/Navbar";

export default function DashboardPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="command-header">
          <p className="eyebrow">Municipal workspace</p>
          <h1>Command Center</h1>
          <p>
            One official view for live hotspot verification, dispatch decisions,
            and escalation tracking across Delhi NCR.
          </p>
        </div>

        <CommandCenterTabs active="incidents" />

        <div className="placeholder-panel command-placeholder">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">
            Live incidents
          </p>
          <h2>Detected hotspots ready for municipal action</h2>
          <p>
            This view will hold the incident feed, operational map, Gemini
            analysis, and dispatch controls for water-mist cannons and cleanup
            crews.
          </p>
        </div>
      </div>
    </main>
  );
}
