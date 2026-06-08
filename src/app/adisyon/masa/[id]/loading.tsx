// Masaya tıklayınca SSR (Neon sorguları) sürerken anında görünen iskelet.
// AdisyonClient'ın sol menü + sağ hesap düzenini taklit eder.
export default function Loading() {
  return (
    <div className="flex flex-1 animate-pulse flex-col md:flex-row">
      {/* SOL — Menü iskeleti */}
      <div className="flex flex-1 flex-col border-b border-slate-800 md:border-b-0 md:border-r">
        <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="h-8 w-20 rounded-lg bg-slate-800" />
          <div className="h-5 w-16 rounded bg-slate-800" />
        </header>

        {/* Kategori sekmeleri */}
        <div className="flex gap-2 border-b border-slate-800 px-3 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 rounded-full bg-slate-800" />
          ))}
        </div>

        {/* Ürün ızgarası */}
        <div className="grid flex-1 grid-cols-2 content-start gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl border border-slate-800 bg-slate-900/40"
            />
          ))}
        </div>
      </div>

      {/* SAĞ — Hesap iskeleti */}
      <aside className="flex w-full flex-col bg-slate-900/40 md:w-96">
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="h-5 w-16 rounded bg-slate-800" />
        </div>
        <div className="flex-1 space-y-3 px-3 py-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-800/60" />
          ))}
        </div>
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="ml-auto h-8 w-28 rounded bg-slate-800" />
        </div>
      </aside>
    </div>
  );
}
