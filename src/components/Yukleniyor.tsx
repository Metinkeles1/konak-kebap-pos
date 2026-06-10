// Ortak yükleme tasarımı — skeleton yerine markalı, sade bir loader.
// Tüm route loading.tsx'leri bunu kullanır (salon / masa / rapor).
export function Yukleniyor({ mesaj = 'Yükleniyor…' }: { mesaj?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-slate-950">
      {/* Dönen halka + ortada kebap */}
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-amber-400 border-r-amber-400/40" />
        <div className="absolute inset-0 flex items-center justify-center text-2xl">
          🥙
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-lg font-black tracking-tight text-amber-400">
          KONAK KEBAP
        </span>
        <span className="text-sm text-slate-500">{mesaj}</span>
      </div>
    </div>
  );
}
