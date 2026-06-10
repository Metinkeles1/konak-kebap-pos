import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kapatKontrol, toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Mevcut kalemi güncelle (adet / yarım / ikram / not) veya sil.
// Yarım porsiyon = yarım fiyat, ikram = toplama 0 (SETUP §8). Tekrar dokununca
// adet artırmak için de kullanılır. Silinen kalem Iptal olarak kaydedilir (denetim).
// Toplam/indirim yeniden hesaplanır; KALAN<=0 olursa adisyon kapanır (kapatKontrol).
export async function POST(req: Request) {
  const { kalemId, sil, birimFiyat, adet, yarim, ikram, not } = await req.json();

  if (typeof kalemId !== 'number') {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const kalem = await tx.adisyonKalem.findUnique({
      where: { id: kalemId },
      select: {
        adisyonId: true,
        durum: true,
        urunAd: true,
        birimFiyat: true,
        adet: true,
        ikram: true,
      },
    });
    if (!kalem) throw new Error('Kalem bulunamadı');
    if (kalem.durum !== 'acik') throw new Error('Ödenmiş kalem değiştirilemez');
    const adisyonId = kalem.adisyonId;

    if (sil) {
      // İptal izi: ikramsa tutar 0, değilse birimFiyat*adet
      await tx.iptal.create({
        data: {
          adisyonId,
          urunAd: kalem.urunAd,
          adet: kalem.adet,
          tutar: kalem.ikram ? 0 : Number(kalem.birimFiyat) * kalem.adet,
        },
      });
      await tx.adisyonKalem.delete({ where: { id: kalemId } });
    } else {
      if (typeof birimFiyat !== 'number') {
        throw new Error('geçersiz fiyat');
      }
      const fiyat = yarim ? birimFiyat / 2 : birimFiyat;
      const adetN = Number(adet) > 0 ? Number(adet) : 1;
      await tx.adisyonKalem.update({
        where: { id: kalemId },
        data: {
          birimFiyat: fiyat,
          adet: adetN,
          yarim: !!yarim,
          ikram: !!ikram,
          not: typeof not === 'string' && not.trim() ? not.trim() : null,
        },
      });
    }

    await toplamYenidenHesapla(tx, adisyonId);
    return kapatKontrol(tx, adisyonId);
  });

  await tetikle(
    SALON_KANAL,
    sonuc.kapandi ? OLAY_ADISYON_KAPANDI : OLAY_MASA,
    { masaId: sonuc.masaId }
  );
  return NextResponse.json({ ok: true, kapandi: sonuc.kapandi });
}
