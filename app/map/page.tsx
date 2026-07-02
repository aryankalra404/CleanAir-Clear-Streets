import Navbar from "@/components/shared/Navbar";

export default function MapPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="placeholder-panel">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-700">
          Public map
        </p>
        <h1 className="mt-3 text-3xl font-bold">Live pollution hotspots</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Read-only hotspot map with citizen reports, sensors, and risk zones
          goes here.
        </p>
        </div>
      </div>
    </main>
  );
}
