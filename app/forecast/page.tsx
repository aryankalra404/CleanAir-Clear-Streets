import CommandCenterTabs from "@/components/shared/CommandCenterTabs";
import Navbar from "@/components/shared/Navbar";

export default function ForecastPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="command-header">
          <p className="eyebrow">Command Center</p>
          <h1>Forecast Planning</h1>
          <p>
            The predictive view of the same official workspace: identify
            neighbourhood PM spikes over the next 24 hours and stage response
            teams before exposure rises.
          </p>
        </div>

        <CommandCenterTabs active="forecast" />

        <div className="placeholder-panel command-placeholder">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-700">
            24-hour forecast
          </p>
          <h2>Predicted spikes become preemptive incident alerts</h2>
          <p>
            This view will show PM2.5 time-series, weather spread risk, model
            confidence, and a button to push a predicted hotspot into the live
            incident queue.
          </p>
        </div>
      </div>
    </main>
  );
}
