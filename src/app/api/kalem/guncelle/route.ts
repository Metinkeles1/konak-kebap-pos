import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMenu } from '@/lib/menu';
import { mutfagaGider } from '@/lib/mutfak';
import { kapatKontrol, toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import {
  OLAY_ADISYON_KAPANDI,
  OLAY_MASA,
  SALON_KANAL,
  MUTFAK_KANAL,
  OLAY_MUTFAK,
  OLAY_MUTFAK_IPTAL,
} from '@/lib/realtime';

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
        urunId: true,
        urunAd: true,
        birimFiyat: true,
        adet: true,
        ikram: true,
        adisyon: { select: { masa: { select: { ad: true } }, etiket: true } },
      },
    });
    if (!kalem) throw new Error('Kalem bulunamadı');
    if (kalem.durum !== 'acik') throw new Error('Ödenmiş kalem değiştirilemez');
    const adisyonId = kalem.adisyonId;

    const adetN = Number(adet) > 0 ? Number(adet) : 1;
    // Mutfak iptal/azaltma uyarısı için bilgi (kategori kontrolü tx dışında).
    const iptalBilgi = {
      urunId: kalem.urunId,
      urunAd: kalem.urunAd,
      masaAd: kalem.adisyon.masa?.ad ?? kalem.adisyon.etiket ?? 'Gel-Al',
      sil: !!sil,
      eksilen: sil ? kalem.adet : kalem.adet - adetN, // kaç adet düştü
    };

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
    const k = await kapatKontrol(tx, adisyonId);
    return { ...k, iptalBilgi };
  });

  await tetikle(
    SALON_KANAL,
    sonuc.kapandi ? OLAY_ADISYON_KAPANDI : OLAY_MASA,
    { masaId: sonuc.masaId }
  );
  await tetikle(MUTFAK_KANAL, OLAY_MUTFAK, {}); // kalem değişimi mutfağa yansısın

  // İptal/azaltma uyarısı — mutfağa gitmiş bir kalem silindiyse/azaltıldıysa
  // mutfak ekranını uyar (israf önleme). İçecek/tatlı gibi mutfağa gitmeyenler atlanır.
  const b = sonuc.iptalBilgi;
  if (b.eksilen > 0) {
    const menu = await getMenu();
    const kat = menu.find((u) => u.id === b.urunId)?.category;
    if (mutfagaGider(kat)) {
      await tetikle(MUTFAK_KANAL, OLAY_MUTFAK_IPTAL, {
        masaAd: b.masaAd,
        urunAd: b.urunAd,
        adet: b.eksilen,
        tur: b.sil ? 'iptal' : 'azalt',
      });
    }
  }

  return NextResponse.json({ ok: true, kapandi: sonuc.kapandi });
}
