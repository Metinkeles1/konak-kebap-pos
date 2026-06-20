export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mb-6 h-12 w-56 animate-pulse rounded-xl bg-slate-800/60" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-900/70" />
        ))}
      </div>
    </div>
  );
}
