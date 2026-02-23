export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="bg-white border-b border-ink-100">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center">
          <div className="w-24 h-4 bg-ink-100 rounded animate-pulse" />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-white rounded-xl border border-ink-100 p-6 mb-8">
          <div className="w-full h-20 bg-ink-50 rounded-lg animate-pulse" />
        </div>
      </main>
    </div>
  );
}
