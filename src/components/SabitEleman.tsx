'use client';

import { memo, type CSSProperties } from 'react';
import type { MasaOzet } from '@/lib/types';

// Krokideki sabit (tıklanamaz) elemanlar: tezgah/kasa, ocak, merdiven, kapı,
// geçit. Hepsi blueprint stilinde ama tipine göre ayrı ikon + dokuyla çizilir
// ki salonun yönü (giriş/çıkış/merdiven/mutfak) bir bakışta okunsun.
// Düzenle modunda sürüklenip yeri kaydedilir.

const HATCH = (renk: string): string =>
  `repeating-linear-gradient(45deg, ${renk} 0, ${renk} 1px, transparent 1px, transparent 7px)`;

export const SabitEleman = memo(function SabitEleman({ masa }: { masa: MasaOzet }) {
  const dikey = masa.sekil === 'dikdortgen-d';
  const ad = masa.ad;

  // Ortak kutu sarmalayıcı
  const Kutu = ({
    children,
    style,
    className = '',
  }: {
    children?: React.ReactNode;
    style?: CSSProperties;
    className?: string;
  }) => (
    <div
      className={`relative flex h-full w-full select-none items-center justify-center overflow-hidden rounded-md ${className}`}
      style={style}
    >
      {children}
    </div>
  );

  const Etiket = ({ ust }: { ust?: string }) => (
    <span
      className="px-1 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.18em]"
      style={dikey ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
    >
      {ust ? `${ust} ` : ''}
      {ad}
    </span>
  );

  switch (masa.tip) {
    // Mutfak ocağı / kebap pişirme — sıcak turuncu doku + alev
    case 'ocak':
      return (
        <Kutu
          className="border border-orange-400/40 text-orange-100/90"
          style={{
            backgroundColor: 'rgba(67,20,7,0.55)',
            backgroundImage: HATCH('rgba(251,146,60,0.18)'),
            boxShadow: 'inset 0 0 18px -4px rgba(251,146,60,0.55)',
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-base leading-none">🔥</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{ad}</span>
          </div>
        </Kutu>
      );

    // Merdiven — basamak çizgileri + yön oku (üst kata)
    case 'merdiven':
      return (
        <Kutu
          className="border border-slate-300/30 text-slate-200/80"
          style={{
            backgroundColor: 'rgba(30,41,59,0.55)',
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(148,163,184,0.22) 0, rgba(148,163,184,0.22) 2px, transparent 2px, transparent 14px)',
            boxShadow: 'inset 0 0 0 1px rgba(148,163,184,0.12)',
          }}
        >
          <div className="flex flex-col items-center">
            <span className="text-sm leading-none">↑</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em]">{ad}</span>
          </div>
        </Kutu>
      );

    // Kapı — ince blok + açılış yayı + komşu bölge etiketi
    case 'kapi':
      return (
        <div className="relative flex h-full w-full select-none items-center justify-center">
          <div
            className="absolute rounded-sm border border-emerald-300/45"
            style={{
              inset: 0,
              backgroundColor: 'rgba(16,185,129,0.10)',
              backgroundImage: HATCH('rgba(110,231,183,0.20)'),
            }}
          />
          <span
            className="relative z-10 px-1 text-center text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-emerald-100/90"
            style={dikey ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
          >
            ⇄ {ad}
          </span>
        </div>
      );

    // Geçit / koridor — kesik çizgili saydam yol + yön oku
    case 'gecit':
      return (
        <Kutu
          className="border border-dashed border-sky-300/35 text-sky-200/70"
          style={{ backgroundColor: 'rgba(14,165,233,0.05)' }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs leading-none">{dikey ? '↓' : '→'}</span>
            <Etiket />
          </div>
        </Kutu>
      );

    // Tezgah / kasa — çapraz taramalı blok (varsayılan)
    default:
      return (
        <Kutu
          className="border border-sky-300/30 text-sky-100/80"
          style={{
            backgroundColor: 'rgba(30,41,59,0.55)',
            backgroundImage: HATCH('rgba(125,211,252,0.10)'),
            boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.12)',
          }}
        >
          <span className="text-xs font-bold tracking-[0.3em]">{ad}</span>
        </Kutu>
      );
  }
});
