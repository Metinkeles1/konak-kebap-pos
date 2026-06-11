// KALAN hesabı ve adisyon kapanış mantığı (docs/SETUP.md §8B).
//   toplam      = ikram OLMAYAN kalemler (birimFiyat * adet)
//   indirim     = hesap geneli etkin indirim ₺ (adisyon.indirim)
//   kalemOdenen = durum='odendi' kalemler (kalem bazlı bölme)
//   tutarOdenen = adisyon.odenenTutar (eşit/serbest/tam bölme)
//   KALAN       = toplam - indirim - kalemOdenen - tutarOdenen
// İkram = ücretsiz (toplama girmez). İndirim KALAN'dan düşer → müşteri az öder →
// Tahsilat az → ciro kendiliğinden doğru (ciro Tahsilat'tan hesaplanır, SETUP §8B).

import { Prisma } from '@prisma/client';
import { db } from './db';

export type KalemHesap = {
  birimFiyat: number;
  adet: number;
  durum: string;
  ikram: boolean;
};

// Girilen indirim (tip+değer) ile toplamdan ETKİN indirim ₺'sini hesaplar (toplamı aşamaz).
export function indirimHesapla(
  toplam: number,
  indirimTip: string | null,
  indirimDeger: number
): number {
  if (!indirimTip || indirimDeger <= 0) return 0;
  const ham = indirimTip === 'yuzde' ? (toplam * indirimDeger) / 100 : indirimDeger;
  return Math.min(Math.max(ham, 0), toplam);
}

export function kalanHesapla(
  kalemler: KalemHesap[],
  odenenTutar: number,
  indirim = 0
) {
  const toplam = kalemler
    .filter((k) => !k.ikram)
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const kalemOdenen = kalemler
    .filter((k) => k.durum === 'odendi' && !k.ikram)
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const kalan = toplam - indirim - kalemOdenen - odenenTutar;
  return { toplam, indirim, kalemOdenen, tutarOdenen: odenenTutar, kalan };
}

// İşlem (transaction) içinde adisyonun KALAN'ını hesaplar.
export async function hesapla(tx: Prisma.TransactionClient, adisyonId: number) {
  const a = await tx.adisyon.findUnique({
    where: { id: adisyonId },
    include: { kalemler: true },
  });
  if (!a) throw new Error('Adisyon bulunamadı');
  const kalemler = a.kalemler.map((k) => ({
    birimFiyat: Number(k.birimFiyat),
    adet: k.adet,
    durum: k.durum,
    ikram: k.ikram,
  }));
  return {
    ...kalanHesapla(kalemler, Number(a.odenenTutar), Number(a.indirim)),
    masaId: a.masaId,
  };
}

// Kalem ekleme/taşıma/ikram/silme sonrası adisyon.toplam'ı (ikram hariç) VE etkin
// indirim ₺'sini (yüzde indirimde toplam değişince kayar) senkron tutar.
export async function toplamYenidenHesapla(
  tx: Prisma.TransactionClient,
  adisyonId: number
): Promise<number> {
  const a = await tx.adisyon.findUnique({
    where: { id: adisyonId },
    select: { indirimTip: true, indirimDeger: true, kalemler: true },
  });
  if (!a) throw new Error('Adisyon bulunamadı');
  const toplam = a.kalemler
    .filter((k) => !k.ikram)
    .reduce((s, k) => s + Number(k.birimFiyat) * k.adet, 0);
  const indirim = indirimHesapla(toplam, a.indirimTip, Number(a.indirimDeger));
  await tx.adisyon.update({ where: { id: adisyonId }, data: { toplam, indirim } });
  return toplam;
}

// KALAN <= 0 ise adisyonu kapatır, masayı boşaltır. masaId döner (Pusher için).
export async function kapatKontrol(
  tx: Prisma.TransactionClient,
  adisyonId: number
): Promise<{ kapandi: boolean; masaId: number | null; kalan: number }> {
  const { kalan, masaId } = await hesapla(tx, adisyonId);
  if (kalan <= 0.001) {
    await tx.adisyon.update({
      where: { id: adisyonId },
      data: { durum: 'kapali', kapanis: new Date() },
    });
    // Gel-al adisyonunda masa yok (masaId null) — boşaltılacak masa da yok.
    if (masaId != null) {
      await tx.masa.update({ where: { id: masaId }, data: { durum: 'bos' } });
    }
    return { kapandi: true, masaId, kalan: 0 };
  }
  return { kapandi: false, masaId, kalan };
}
