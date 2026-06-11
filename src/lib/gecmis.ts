// Masa işlem geçmişi — belirli bir günde (Istanbul takvimi) tahsilat alınmış
// her adisyonun (masa oturumunun) detayı: hangi masa, ne satıldı, nasıl bölündü,
// hangi araçla ne kadar ödendi. Gün sonu raporunun (rapor.ts) drill-down hali.

import { db } from './db';
import { gunAraligi, gunKaydir, istanbulTarih } from './gun';
import { aracEtiket } from './odeme';

const YONTEM_ETIKET: Record<string, string> = {
  tam: 'Tüm masa',
  kalem: 'Kalem',
  esit: 'Eşit bölme',
  serbest: 'Serbest tutar',
};

export function yontemEtiket(key: string): string {
  return YONTEM_ETIKET[key] ?? key;
}

export type GecmisKalem = {
  urunAd: string;
  adet: number;
  birimFiyat: number;
  yarim: boolean;
  ikram: boolean;
  kaynakMasa: string | null;
};

export type GecmisTahsilat = {
  id: number;
  tutar: number;
  yontem: string; // tam | kalem | esit | serbest
  yontemLabel: string;
  arac: string; // nakit | kart | yemek | havale
  aracLabel: string;
  detay: string | null;
  zaman: string; // ISO
};

export type GecmisIptal = {
  urunAd: string;
  adet: number;
  tutar: number;
  sebep: string | null;
  zaman: string;
};

export type GecmisAdisyon = {
  id: number;
  masaAd: string;
  acilis: string; // ISO
  kapanis: string | null; // ISO
  durum: string; // acik | kapali
  toplam: number; // ikram hariç kalem toplamı
  indirim: number; // etkin indirim ₺
  odenen: number; // bu adisyonun toplam tahsilatı (gün içinde)
  parcaSayisi: number; // kaç parçaya bölünmüş (tahsilat adedi)
  kalemler: GecmisKalem[];
  tahsilatlar: GecmisTahsilat[];
  iptaller: GecmisIptal[];
};

export type MasaGecmisi = {
  tarih: string; // YYYY-MM-DD (Istanbul)
  oncekiTarih: string;
  sonrakiTarih: string;
  bugunMu: boolean;
  toplamCiro: number;
  masaSayisi: number;
  adisyonlar: GecmisAdisyon[];
};

export async function getMasaGecmisi(tarihStr?: string): Promise<MasaGecmisi> {
  const base =
    tarihStr && /^\d{4}-\d{2}-\d{2}$/.test(tarihStr)
      ? new Date(`${tarihStr}T12:00:00+03:00`)
      : new Date();
  const tarih = istanbulTarih(base);
  const { gte, lt } = gunAraligi(base);

  // O gün içinde en az bir tahsilat alınmış adisyonlar = "işlem yapılan masalar".
  const rows = await db.adisyon.findMany({
    where: { tahsilatlar: { some: { zaman: { gte, lt } } } },
    include: {
      masa: { select: { ad: true } },
      kalemler: {
        orderBy: { zaman: 'asc' },
        select: {
          urunAd: true,
          adet: true,
          birimFiyat: true,
          yarim: true,
          ikram: true,
          kaynakMasa: true,
        },
      },
      tahsilatlar: {
        where: { zaman: { gte, lt } },
        orderBy: { zaman: 'asc' },
        select: {
          id: true,
          tutar: true,
          yontem: true,
          arac: true,
          detay: true,
          zaman: true,
        },
      },
      iptaller: {
        orderBy: { zaman: 'asc' },
        select: { urunAd: true, adet: true, tutar: true, sebep: true, zaman: true },
      },
    },
  });

  const adisyonlar: GecmisAdisyon[] = rows.map((a) => {
    const tahsilatlar: GecmisTahsilat[] = a.tahsilatlar.map((t) => ({
      id: t.id,
      tutar: Number(t.tutar),
      yontem: t.yontem,
      yontemLabel: yontemEtiket(t.yontem),
      arac: t.arac,
      aracLabel: aracEtiket(t.arac),
      detay: t.detay,
      zaman: t.zaman.toISOString(),
    }));
    const odenen = tahsilatlar.reduce((s, t) => s + t.tutar, 0);
    return {
      id: a.id,
      masaAd: a.masa?.ad ?? a.etiket ?? 'Gel-Al', // gel-al'da masa yok → etiket
      acilis: a.acilis.toISOString(),
      kapanis: a.kapanis ? a.kapanis.toISOString() : null,
      durum: a.durum,
      toplam: Number(a.toplam),
      indirim: Number(a.indirim),
      odenen,
      parcaSayisi: tahsilatlar.length,
      kalemler: a.kalemler.map((k) => ({
        urunAd: k.urunAd,
        adet: k.adet,
        birimFiyat: Number(k.birimFiyat),
        yarim: k.yarim,
        ikram: k.ikram,
        kaynakMasa: k.kaynakMasa,
      })),
      tahsilatlar,
      iptaller: a.iptaller.map((i) => ({
        urunAd: i.urunAd,
        adet: i.adet,
        tutar: Number(i.tutar),
        sebep: i.sebep,
        zaman: i.zaman.toISOString(),
      })),
    };
  });

  // En son işlem yapılan masa en üstte (son tahsilat zamanına göre).
  adisyonlar.sort((x, y) => {
    const xs = x.tahsilatlar[x.tahsilatlar.length - 1]?.zaman ?? x.acilis;
    const ys = y.tahsilatlar[y.tahsilatlar.length - 1]?.zaman ?? y.acilis;
    return ys.localeCompare(xs);
  });

  const toplamCiro = adisyonlar.reduce((s, a) => s + a.odenen, 0);

  return {
    tarih,
    oncekiTarih: gunKaydir(tarih, -1),
    sonrakiTarih: gunKaydir(tarih, 1),
    bugunMu: tarih === istanbulTarih(new Date()),
    toplamCiro,
    masaSayisi: adisyonlar.length,
    adisyonlar,
  };
}
