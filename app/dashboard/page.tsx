import CommandCenterTabs from "@/components/shared/CommandCenterTabs";
import CommandCenter from "@/components/command/CommandCenter";
import Navbar from "@/components/shared/Navbar";

export default function DashboardPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="command-hero-row">
          <div className="command-header">
            <p className="eyebrow">Municipal workspace</p>
            <h1>Command Center</h1>
            <p>
              Live hotspot verification, dispatch decisions, and escalation
              tracking across Delhi NCR.
            </p>
          </div>

          <CommandCenterTabs active="incidents" />
        </div>

        <CommandCenter />
      </div>
    </main>
  );
}
