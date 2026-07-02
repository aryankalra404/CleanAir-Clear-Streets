export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f3] px-5 py-12 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-red-700">
          Officials
        </p>
        <h1 className="mt-3 text-3xl font-bold">Municipal command center</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Incident triage, dispatch recommendations, and response status tracking
          goes here.
        </p>
      </div>
    </main>
  );
}
