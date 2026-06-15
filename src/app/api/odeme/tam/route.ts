import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hesapla, kapatKontrol } from '@/lib/hesap';
import { gecerliArac, gecerliYemekKarti } from '@/lib/odeme';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, SALON_KANAL } from '@/lib/realtime';

// Hesabı Kapat (tam): kalan tutarın tamamı tek tahsilat → adisyon kapanır, masa boşalır.
export async function POST(req: Request) {
  const { adisyonId, arac, aracDetay } = await req.json();
  if (typeof adisyonId !== 'number') {
    return NextResponse.json({ error: 'adisyonId gerekli' }, { status: 400 });
  }
  const gArac = gecerliArac(arac);
  const ykDetay = gArac === 'yemek' ? gecerliYemekKarti(aracDetay) : null;

  const sonuc = await db.$transaction(async (tx) => {
    const { kalan } = await hesapla(tx, adisyonId);
    if (kalan > 0.001) {
      await tx.tahsilat.create({
        data: { adisyonId, tutar: kalan, yontem: 'tam', arac: gArac, aracDetay: ykDetay },
      });
      await tx.adisyon.update({
        where: { id: adisyonId },
        data: { odenenTutar: { increment: kalan } },
      });
    }
    return kapatKontrol(tx, adisyonId);
  });

  await tetikle(SALON_KANAL, OLAY_ADISYON_KAPANDI, { masaId: sonuc.masaId });
  return NextResponse.json({ kapandi: sonuc.kapandi });
}
