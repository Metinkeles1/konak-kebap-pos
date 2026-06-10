import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_MASA, SALON_KANAL } from '@/lib/realtime';
import type { MasaTip } from '@/lib/types';

const TIPLER: MasaTip[] = [
  'masa',
  'kasa',
  'tezgah',
  'ocak',
  'merdiven',
  'kapi',
  'gecit',
];

// Sabit elemanlar için varsayılan etiket (masa adı düzenlemede değiştirilir).
const VARSAYILAN_AD: Record<string, string> = {
  kasa: 'KASA',
  tezgah: 'TEZGAH',
  ocak: 'OCAK',
  merdiven: 'MERDİVEN',
  kapi: 'KAPI',
  gecit: 'GEÇİT',
};

// Düzenle modu: bölgeye yeni masa veya sabit eleman ekler.
export async function POST(req: Request) {
  const { bolgeId, tip, ad, x, y } = await req.json();
  if (typeof bolgeId !== 'number') {
    return NextResponse.json({ error: 'bolgeId gerekli' }, { status: 400 });
  }
  const t: MasaTip = TIPLER.includes(tip) ? tip : 'masa';

  // Ad: verilmediyse masa için sıradaki numara, eleman için tip etiketi.
  let yeniAd = typeof ad === 'string' && ad.trim() ? ad.trim().slice(0, 24) : '';
  if (!yeniAd) {
    if (t === 'masa') {
      const sayi = await db.masa.count({ where: { bolgeId, tip: 'masa' } });
      yeniAd = `M${sayi + 1}`;
    } else {
      yeniAd = VARSAYILAN_AD[t] ?? 'YENİ';
    }
  }

  const masa = await db.masa.create({
    data: {
      bolgeId,
      ad: yeniAd,
      tip: t,
      x: typeof x === 'number' ? Math.round(x) : 40,
      y: typeof y === 'number' ? Math.round(y) : 40,
      sekil: t === 'masa' ? 'kare' : 'dikdortgen',
    },
    select: { id: true },
  });

  await tetikle(SALON_KANAL, OLAY_MASA, { masaId: masa.id });
  return NextResponse.json({ ok: true, id: masa.id });
}
