'use client';

import { memo, type CSSProperties } from 'react';
import type { MasaOzet } from '@/lib/types';
import { CHAIR, sekilBilgi } from '@/lib/kroki';
import { gecenDakika, gecenSure, para } from '@/lib/format';

const UZUN_DK = 120; // 2 saatten uzun açık masa = uyarı

// Sandalye konumları (footprint kenarındaki paya yerleşir). color: currentColor.
// Sandalye SAYISI = kapasite; iki ana kenara bölünür (üst/alt veya sol/sağ),
// yan kenarlar boş kalır. Örn. 4 kişilik = 2 üst + 2 alt. Tek sayıda üst kenara
// bir fazla düşer. Dikey (döndürülmüş) ise ana kenarlar sol/sağ olur.
function sandalyeler(dikey: boolean, kapasite: number): CSSProperties[] {
  const bar = (s: CSSProperties): CSSProperties => ({
    position: 'absolute',
    background: 'currentColor',
    borderRadius: 4,
    ...s,
  });
  const ust = (pct: number, alt = false): CSSProperties =>
    bar({ left: `${pct}%`, marginLeft: -9, width: 18, height: 6, [alt ? 'bottom' : 'top']: 2 });
  const yan = (pct: number, sag = false): CSSProperties =>
    bar({ top: `${pct}%`, marginTop: -9, width: 6, height: 18, [sag ? 'right' : 'left']: 2 });

  const k = Math.max(1, kapasite);
  const aN = Math.ceil(k / 2); // ana kenar 1 (fazlalık buraya)
  const bN = Math.floor(k / 2); // ana kenar 2
  // n sandalyeyi kenar boyunca dengeli dağıt: (i+1)/(n+1) → ör. 2 → %33, %67
  const dagit = (n: number) =>
    Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * 100);

  // dikey (döndürülmüş): ana kenarlar sol/sağ; yatay halde üst/alt
  if (dikey) {
    return [
      ...dagit(aN).map((p) => yan(p, false)),
      ...dagit(bN).map((p) => yan(p, true)),
    ];
  }
  return [
    ...dagit(aN).map((p) => ust(p, false)),
    ...dagit(bN).map((p) => ust(p, true)),
  ];
}

export const MasaKart = memo(function MasaKart({
  masa,
  now,
  vurgulu,
  bekleyen,
  secili,
}: {
  masa: MasaOzet;
  now: number;
  vurgulu?: boolean;
  bekleyen?: boolean;
  secili?: boolean;
}) {
  const a = masa.adisyon;
  const kismi = a?.kismiOdeme ?? false;
  const uzun = a ? gecenDakika(a.acilis, now) >= UZUN_DK : false;
  const { dikey, yuvarlak } = sekilBilgi(masa.sekil);

  // Durum dili — serin/hayalet (boş) → sıcak amber (dolu)
  let durum =
    'border border-slate-400/35 bg-slate-800/50 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]';
  if (a)
    durum =
      'border border-amber-400/60 bg-linear-to-br from-amber-400/25 to-amber-600/10 text-amber-50 shadow-[0_0_28px_-6px_rgba(245,158,11,0.6)]';
  if (kismi)
    durum =
      'border-2 border-dashed border-amber-300/70 bg-amber-400/12 text-amber-50 shadow-[0_0_24px_-6px_rgba(245,158,11,0.5)]';
  if (uzun)
    durum =
      'border border-rose-400/70 bg-rose-500/12 text-rose-50 shadow-[0_0_26px_-6px_rgba(244,63,94,0.5)] animate-nabiz';

  return (
    <div className="relative h-full w-full select-none">
      {/* Sandalyeler */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ color: a ? 'rgba(217,119,6,0.6)' : 'rgba(100,116,139,0.55)' }}
      >
        {sandalyeler(dikey, masa.kapasite).map((st, i) => (
          <span key={i} style={st} />
        ))}
      </div>

      {/* Masa üstü */}
      <div
        className={`absolute flex flex-col items-center justify-center overflow-hidden text-center transition-all ${
          yuvarlak ? 'rounded-full' : 'rounded-xl'
        } ${durum} ${vurgulu ? 'animate-vurgu' : ''} ${
          secili ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-[#0a111e]' : ''
        }`}
        style={{ top: CHAIR, right: CHAIR, bottom: CHAIR, left: CHAIR }}
      >
        {bekleyen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1px]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
          </div>
        )}

        {/* Kapasite rozeti — oturtma kararı için bir bakışta kişi sayısı */}
        <span className="pointer-events-none absolute right-1 top-1 flex items-center gap-0.5 text-[9px] font-bold leading-none opacity-55">
          {masa.kapasite}
          <span className="text-[8px]">👤</span>
        </span>

        <span className="text-[15px] font-bold leading-none tracking-tight">
          {masa.ad}
        </span>

        {!a ? (
          <span className="mt-1 text-[10px] uppercase tracking-[0.15em] opacity-50">
            {masa.kapasite} kişi
          </span>
        ) : (
          <>
            <span className="mt-0.5 text-[13px] font-extrabold leading-tight tabular-nums">
              {para(a.kalan)}
            </span>
            <span className="text-[9px] leading-none opacity-80">
              {kismi ? (
                <span className="font-semibold text-amber-200">KALAN</span>
              ) : (
                gecenSure(a.acilis, now)
              )}
              {uzun && <span className="text-rose-200"> · ⚠</span>}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
