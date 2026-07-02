import Navbar from "@/components/shared/Navbar";

export default function DashboardPage() {
  return (
    <main className="app-page-shell">
      <div className="app-page-container">
        <Navbar />
      </div>
      <div className="app-page-container app-page-content">
        <div className="placeholder-panel">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">
          Officials
        </p>
        <h1 className="mt-3 text-3xl font-bold">Municipal command center</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Incident triage, dispatch recommendations, and response status tracking
          goes here.
        </p>
        </div>
      </div>
    </main>
  );
}
