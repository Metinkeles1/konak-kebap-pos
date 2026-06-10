import { db } from './db';
import { gunAraligi } from './gun';
import { kalanHesapla } from './hesap';
import type { AdisyonOzet, BolgeOzet, MasaTip, SalonOzet } from './types';

// Floor-plan verisi: bölgeler + masalar + her masanın açık adisyon özeti + üst özet.
// Hem /adisyon sayfası (SSR) hem /api/salon (realtime refetch) bunu kullanır.
export async function getSalon(): Promise<SalonOzet> {
  const bolgeler = await db.bolge.findMany({
    orderBy: { sira: 'asc' },
    include: {
      masalar: {
        orderBy: { id: 'asc' },
        include: {
          adisyonlar: {
            where: { durum: 'acik' },
            include: { kalemler: true, tahsilatlar: true },
          },
        },
      },
    },
  });

  let bos = 0;
  let dolu = 0;
  let odemeBekleyen = 0;
  let acikHesapToplam = 0;

  const bolgeOzet: BolgeOzet[] = bolgeler.map((b) => ({
    id: b.id,
    ad: b.ad,
    sira: b.sira,
    masalar: b.masalar.map((m) => {
      // Kasa/mobilya: sadece krokide çizilir, adisyon/sayım yok.
      if (m.tip !== 'masa') {
        return {
          id: m.id,
          ad: m.ad,
          durum: 'bos' as const,
          x: m.x,
          y: m.y,
          en: m.en,
          sekil: m.sekil,
          tip: m.tip as MasaTip,
          kapasite: m.kapasite,
          adisyon: null,
        };
      }

      const a = m.adisyonlar[0] ?? null;
      let adisyon: AdisyonOzet | null = null;

      if (a) {
        const kalemler = a.kalemler.map((k) => ({
          birimFiyat: Number(k.birimFiyat),
          adet: k.adet,
          durum: k.durum,
          ikram: k.ikram,
        }));
        const { toplam, kalan } = kalanHesapla(
          kalemler,
          Number(a.odenenTutar),
          Number(a.indirim)
        );
        const kismiOdeme = a.tahsilatlar.length > 0 && kalan > 0.001;

        adisyon = {
          id: a.id,
          acilis: a.acilis.toISOString(),
          toplam,
          kalan,
          kalemSayisi: a.kalemler.reduce((s, k) => s + k.adet, 0),
          kismiOdeme,
        };
        dolu++;
        acikHesapToplam += kalan;
        if (kismiOdeme) odemeBekleyen++;
      } else {
        bos++;
      }

      return {
        id: m.id,
        ad: m.ad,
        durum: (a ? 'dolu' : 'bos') as 'dolu' | 'bos',
        x: m.x,
        y: m.y,
        en: m.en,
        sekil: m.sekil,
        tip: 'masa' as const,
        kapasite: m.kapasite,
        adisyon,
      };
    }),
  }));

  const { gte, lt } = gunAraligi();
  // Gün özeti: ciro Tahsilat'tan; iptal/indirim aggregate; ikram kalem kalem
  // (Prisma _sum iki kolonu çarpamaz) — günlük ikram hacmi küçük, reduce yeterli.
  const [ciroAgg, iptalAgg, indirimAgg, ikramKalemler] = await Promise.all([
    db.tahsilat.aggregate({ _sum: { tutar: true }, where: { zaman: { gte, lt } } }),
    db.iptal.aggregate({ _sum: { tutar: true }, where: { zaman: { gte, lt } } }),
    db.adisyon.aggregate({
      _sum: { indirim: true },
      where: { kapanis: { gte, lt } }, // kapanan hesaplarda kesinleşen indirim
    }),
    db.adisyonKalem.findMany({
      where: { ikram: true, zaman: { gte, lt } },
      select: { birimFiyat: true, adet: true },
    }),
  ]);
  const gunIkram = ikramKalemler.reduce(
    (s, k) => s + Number(k.birimFiyat) * k.adet,
    0
  );

  return {
    bolgeler: bolgeOzet,
    ozet: {
      bos,
      dolu,
      odemeBekleyen,
      acikHesapToplam,
      gunlukCiro: Number(ciroAgg._sum.tutar ?? 0),
      gunIptal: Number(iptalAgg._sum.tutar ?? 0),
      gunIkram,
      gunIndirim: Number(indirimAgg._sum.indirim ?? 0),
    },
  };
}
