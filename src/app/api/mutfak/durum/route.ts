import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import {
  MUTFAK_KANAL,
  OLAY_MUTFAK,
  OLAY_MUTFAK_HAZIR,
  SALON_KANAL,
} from '@/lib/realtime';

// Mutfak ekranından kalem aşaması güncelle:
//  durum: "hazir"   → pişti (garson bekliyor)
//         "alindi"  → garson servise aldı (ekrandan düşer)
//         "bekliyor"→ geri al (yanlış işaretleme)
// hazirBildir=true → masa servise hazır; salon/garson bildirimi (çan) tetiklenir.
const GECERLI = new Set(['bekliyor', 'hazir', 'alindi']);

export async function POST(req: Request) {
  const { kalemIds, durum, hazirBildir, masaAd, adisyonId } = await req.json();

  if (
    !Array.isArray(kalemIds) ||
    kalemIds.length === 0 ||
    !kalemIds.every((x) => typeof x === 'number') ||
    typeof durum !== 'string' ||
    !GECERLI.has(durum)
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  // "hazir" → soğuma sayacı için zaman damgala; geri alınırsa ("bekliyor") sıfırla.
  // "alindi"de damgaya dokunma (gerek yok).
  await db.adisyonKalem.updateMany({
    where: { id: { in: kalemIds } },
    data: {
      mutfakDurum: durum,
      ...(durum === 'hazir' ? { hazirZaman: new Date() } : {}),
      ...(durum === 'bekliyor' ? { hazirZaman: null } : {}),
    },
  });

  // Mutfak ekranları yeniden çeksin.
  await tetikle(MUTFAK_KANAL, OLAY_MUTFAK, { durum });

  // Masa servise hazırsa salonu/garsonu bilgilendir (çan + bildirim + "Aldım").
  if (hazirBildir) {
    await tetikle(SALON_KANAL, OLAY_MUTFAK_HAZIR, {
      masaAd: typeof masaAd === 'string' ? masaAd : null,
      adisyonId: typeof adisyonId === 'number' ? adisyonId : null,
    });
  }

  return NextResponse.json({ ok: true });
}
