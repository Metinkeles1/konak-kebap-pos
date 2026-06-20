import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import { SALON_KANAL, OLAY_MASA, MUTFAK_KANAL, OLAY_MUTFAK } from '@/lib/realtime';

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
  const temizNot = typeof not === 'string' && not.trim() ? not.trim() : null;

  // Eşzamanlılık: kalem ekle + toplam yeniden hesapla tek transaction (SETUP §8B)
  const sonuc = await db.$transaction(async (tx) => {
    const adisyon = await tx.adisyon.findUnique({
      where: { id: adisyonId },
      select: { masaId: true, durum: true },
    });
    if (!adisyon || adisyon.durum !== 'acik') {
      throw new Error('Açık adisyon bulunamadı');
    }

    // Sade satır = yarım/not YOK, ikram değil, açık, birleştirmeden gelmemiş.
    // Varsa adedini artır; yoksa yeni satır → "5 lahmacun" tek satırda ×5 olur.
    // NOT: Eşzamanlı create yarışı istemcide sıraya alınarak (serialize) önlenir;
    // bu yüzden burada DB satır kilidine (FOR UPDATE) gerek yok.
    // DİKKAT: "not" alanı Prisma where'de rezerve operatörle çakışır → filtreyi
    // where'e koyma, çekip JS'te `not === null` uygula (motor paniğini önler).
    const sade =
      !yarim && !temizNot
        ? (
            await tx.adisyonKalem.findMany({
              where: {
                adisyonId,
                urunId,
                yarim: false,
                ikram: false,
                durum: 'acik',
                kaynakMasa: null,
              },
            })
          ).find((k) => k.not === null) ?? null
        : null;

    let kalemId: number;
    if (sade) {
      const g = await tx.adisyonKalem.update({
        where: { id: sade.id },
        data: { adet: sade.adet + adetN }, // satırın kilitli fiyatı korunur
        select: { id: true },
      });
      kalemId = g.id;
    } else {
      const y = await tx.adisyonKalem.create({
        data: {
          adisyonId,
          urunId,
          urunAd,
          birimFiyat: fiyat,
          adet: adetN,
          yarim: !!yarim,
          not: temizNot,
        },
        select: { id: true },
      });
      kalemId = y.id;
    }

    // toplam + etkin indirim ₺'yi birlikte yeniden hesapla (yüzde indirimli
    // masada ürün eklenince indirim de kaymalı — diğer route'larla aynı yol).
    await toplamYenidenHesapla(tx, adisyonId);
    return { masaId: adisyon.masaId, kalemId };
  });

  await tetikle(SALON_KANAL, OLAY_MASA, { masaId: sonuc.masaId });
  await tetikle(MUTFAK_KANAL, OLAY_MUTFAK, {}); // yeni/ek ürün mutfak ekranına düşsün
  // kalemId: istemci optimistik satırın geçici id'sini gerçek id ile değiştirir,
  // böylece yeni eklenen kalem refresh beklemeden düzenlenebilir/silinebilir olur.
  return NextResponse.json({ ok: true, kalemId: sonuc.kalemId });
}
