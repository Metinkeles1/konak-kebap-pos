'use client';

import type { MasaOzet } from '@/lib/types';

// Krokideki sabit tezgah/mobilya. Tıklanamaz; Düzenle modunda sürüklenip yeri
// kaydedilir. Blueprint hissi için çapraz tarama dokulu, masalardan ayrışan blok.
export function KasaKart({ masa }: { masa: MasaOzet }) {
  return (
    <div
      className="flex h-full w-full select-none items-center justify-center rounded-md border border-sky-300/30 text-sky-100/80"
      style={{
        backgroundColor: 'rgba(30,41,59,0.55)',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(125,211,252,0.10) 0, rgba(125,211,252,0.10) 1px, transparent 1px, transparent 7px)',
        boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.12)',
      }}
    >
      <span className="text-xs font-bold tracking-[0.3em]">{masa.ad}</span>
    </div>
  );
}
