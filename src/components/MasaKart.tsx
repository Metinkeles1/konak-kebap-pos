'use client';

import type { CSSProperties } from 'react';
import type { MasaOzet } from '@/lib/types';
import { CHAIR, sekilBilgi } from '@/lib/kroki';
import { gecenDakika, gecenSure, para } from '@/lib/format';

const UZUN_DK = 120; // 2 saatten uzun açık masa = uyarı

// Sandalye konumları (footprint kenarındaki paya yerleşir). color: currentColor.
// Uzun kenara çok sandalye, kısa kenarlara birer tane.
function sandalyeler(
  dikdortgen: boolean,
  dikey: boolean,
  en: number
): CSSProperties[] {
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

  if (dikdortgen) {
    const pcts = en >= 2 ? [22, 50, 78] : [30, 70];
    if (dikey) {
      // uzun kenarlar = sol/sağ
      return [
        ...pcts.map((p) => yan(p, false)),
        ...pcts.map((p) => yan(p, true)),
        ust(50, false),
        ust(50, true),
      ];
    }
    // uzun kenarlar = üst/alt
    return [
      ...pcts.map((p) => ust(p, false)),
      ...pcts.map((p) => ust(p, true)),
      yan(50, false),
      yan(50, true),
    ];
  }
  // kare / yuvarlak — 4 kenar
  return [ust(50, false), ust(50, true), yan(50, false), yan(50, true)];
}

export function MasaKart({
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
  const { dikdortgen, dikey, yuvarlak } = sekilBilgi(masa.sekil);

  // Durum dili — serin/hayalet (boş) → sıcak amber (dolu)
  let durum =
    'border border-slate-400/35 bg-slate-800/50 text-slate-300 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]';
  if (a)
    durum =
      'border border-amber-400/60 bg-gradient-to-br from-amber-400/25 to-amber-600/10 text-amber-50 shadow-[0_0_28px_-6px_rgba(245,158,11,0.6)]';
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
        {sandalyeler(dikdortgen, dikey, masa.en).map((st, i) => (
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

        <span className="text-[15px] font-bold leading-none tracking-tight">
          {masa.ad}
        </span>

        {!a ? (
          <span className="mt-1 text-[10px] uppercase tracking-[0.15em] opacity-50">
            boş
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
}
