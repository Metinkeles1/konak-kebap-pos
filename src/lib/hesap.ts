// KALAN hesabı ve adisyon kapanış mantığı (docs/SETUP.md §8B).
//   toplam      = tüm kalemler (birimFiyat * adet)
//   kalemOdenen = durum='odendi' kalemler (kalem bazlı bölme)
//   tutarOdenen = adisyon.odenenTutar (eşit/serbest/tam bölme)
//   KALAN       = toplam - kalemOdenen - tutarOdenen

import { Prisma } from '@prisma/client';
import { db } from './db';

export type KalemHesap = { birimFiyat: number; adet: number; durum: string };

export function kalanHesapla(kalemler: KalemHesap[], odenenTutar: number) {
  const toplam = kalemler.reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const kalemOdenen = kalemler
    .filter((k) => k.durum === 'odendi')
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const kalan = toplam - kalemOdenen - odenenTutar;
  return { toplam, kalemOdenen, tutarOdenen: odenenTutar, kalan };
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
  }));
  return { ...kalanHesapla(kalemler, Number(a.odenenTutar)), masaId: a.masaId };
}

// Kalem ekleme/taşıma sonrası adisyon.toplam'ı senkron tutar.
export async function toplamYenidenHesapla(
  tx: Prisma.TransactionClient,
  adisyonId: number
): Promise<number> {
  const kalemler = await tx.adisyonKalem.findMany({ where: { adisyonId } });
  const toplam = kalemler.reduce((s, k) => s + Number(k.birimFiyat) * k.adet, 0);
  await tx.adisyon.update({ where: { id: adisyonId }, data: { toplam } });
  return toplam;
}

// KALAN <= 0 ise adisyonu kapatır, masayı boşaltır. masaId döner (Pusher için).
export async function kapatKontrol(
  tx: Prisma.TransactionClient,
  adisyonId: number
): Promise<{ kapandi: boolean; masaId: number; kalan: number }> {
  const { kalan, masaId } = await hesapla(tx, adisyonId);
  if (kalan <= 0.001) {
    await tx.adisyon.update({
      where: { id: adisyonId },
      data: { durum: 'kapali', kapanis: new Date() },
    });
    await tx.masa.update({ where: { id: masaId }, data: { durum: 'bos' } });
    return { kapandi: true, masaId, kalan: 0 };
  }
  return { kapandi: false, masaId, kalan };
}
