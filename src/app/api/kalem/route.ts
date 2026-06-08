import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import { SALON_KANAL, OLAY_MASA } from '@/lib/realtime';

// Adisyona kalem ekle. Yarım porsiyon = yarım fiyat (SETUP §8).
export async function POST(req: Request) {
  const { adisyonId, urunId, urunAd, birimFiyat, adet, yarim, not } =
    await req.json();

  if (
    typeof adisyonId !== 'number' ||
    typeof urunId !== 'string' ||
    typeof urunAd !== 'string' ||
    typeof birimFiyat !== 'number'
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const fiyat = yarim ? birimFiyat / 2 : birimFiyat;
  const adetN = Number(adet) > 0 ? Number(adet) : 1;

  // Eşzamanlılık: kalem ekle + toplam yeniden hesapla tek transaction (SETUP §8B)
  const masaId = await db.$transaction(async (tx) => {
    const adisyon = await tx.adisyon.findUnique({
      where: { id: adisyonId },
      select: { masaId: true, durum: true },
    });
    if (!adisyon || adisyon.durum !== 'acik') {
      throw new Error('Açık adisyon bulunamadı');
    }

    await tx.adisyonKalem.create({
      data: {
        adisyonId,
        urunId,
        urunAd,
        birimFiyat: fiyat,
        adet: adetN,
        yarim: !!yarim,
        not: typeof not === 'string' && not.trim() ? not.trim() : null,
      },
    });

    const kalemler = await tx.adisyonKalem.findMany({ where: { adisyonId } });
    const toplam = kalemler.reduce(
      (s, k) => s + Number(k.birimFiyat) * k.adet,
      0
    );
    await tx.adisyon.update({ where: { id: adisyonId }, data: { toplam } });
    return adisyon.masaId;
  });

  await tetikle(SALON_KANAL, OLAY_MASA, { masaId });
  return NextResponse.json({ ok: true });
}
