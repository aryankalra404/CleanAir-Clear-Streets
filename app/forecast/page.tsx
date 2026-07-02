import Navbar from "@/components/shared/Navbar";

export default function ForecastPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="placeholder-panel">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-700">
          Predictive planning
        </p>
        <h1 className="mt-3 text-3xl font-bold">24-hour pollution forecast</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Neighbourhood PM spike predictions and recommended resource staging
          goes here.
        </p>
        </div>
      </div>
    </main>
  );
}
