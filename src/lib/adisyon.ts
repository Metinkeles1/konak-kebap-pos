import { Prisma } from '@prisma/client';
import { db } from './db';
import { kalanHesapla } from './hesap';

// Adisyon detayını kurmak için gereken ortak include (hem masa hem gel-al loader).
const adisyonInclude = {
  kalemler: { orderBy: { id: 'asc' } },
  tahsilatlar: true,
  iptaller: { orderBy: { id: 'asc' } },
} satisfies Prisma.AdisyonInclude;

type AdisyonKayit = Prisma.AdisyonGetPayload<{ include: typeof adisyonInclude }>;

export type KalemDetay = {
  id: number;
  urunId: string;
  urunAd: string;
  birimFiyat: number;
  adet: number;
  yarim: boolean;
  ikram: boolean; // ücretsiz — toplama girmez, ekranda/fişte görünür
  durum: string; // "acik" | "odendi"
  kaynakMasa: string | null;
  not: string | null;
};

export type IptalKaydi = {
  id: number;
  urunAd: string;
  adet: number;
  tutar: number;
  zaman: string;
};

export type HedefMasa = {
  id: number;
  ad: string;
  bolgeAd: string;
  durum: 'bos' | 'dolu';
  adisyonId: number | null; // doluysa açık adisyon id'si (birleştirme için)
};

export type AdisyonDetay = {
  masaId: number | null; // gel-al'da null
  masaAd: string; // masa adı veya gel-al etiketi ("Paket 3")
  tip: 'masa' | 'gelal';
  adisyonId: number | null; // null = henüz açık adisyon yok
  acilis: string | null;
  kalemler: KalemDetay[];
  toplam: number; // ikram hariç ara toplam
  indirim: number; // etkin indirim ₺
  indirimTip: string | null; // "yuzde" | "tutar" | null
  indirimDeger: number; // girilen değer (%10 → 10)
  kalan: number;
  odenenTutar: number;
  tahsilatToplam: number;
  kismiOdeme: boolean;
  iptaller: IptalKaydi[]; // bu adisyonda iptal edilen kalemler
  hedefMasalar: HedefMasa[]; // bu masa hariç tüm masalar (taşıma/birleştirme)
};

// Yüklenmiş bir adisyon kaydından (veya null) hesap/kalem/iptal alanlarını çıkarır.
// masaId/masaAd/tip/hedefMasalar çağıran tarafça eklenir (masa vs gel-al farkı).
function ortakDetay(a: AdisyonKayit | null) {
  const kalemler: KalemDetay[] = a
    ? a.kalemler.map((k) => ({
        id: k.id,
        urunId: k.urunId,
        urunAd: k.urunAd,
        birimFiyat: Number(k.birimFiyat),
        adet: k.adet,
        yarim: k.yarim,
        ikram: k.ikram,
        durum: k.durum,
        kaynakMasa: k.kaynakMasa,
        not: k.not,
      }))
    : [];

  const odenenTutar = a ? Number(a.odenenTutar) : 0;
  const indirim = a ? Number(a.indirim) : 0;
  const { toplam, kalemOdenen, kalan } = kalanHesapla(
    kalemler.map((k) => ({
      birimFiyat: k.birimFiyat,
      adet: k.adet,
      durum: k.durum,
      ikram: k.ikram,
    })),
    odenenTutar,
    indirim
  );
  const tahsilatToplam = a
    ? a.tahsilatlar.reduce((s, t) => s + Number(t.tutar), 0)
    : 0;
  const kismiOdeme = (odenenTutar > 0 || kalemOdenen > 0) && kalan > 0.001;
  const iptaller: IptalKaydi[] = a
    ? a.iptaller.map((i) => ({
        id: i.id,
        urunAd: i.urunAd,
        adet: i.adet,
        tutar: Number(i.tutar),
        zaman: i.zaman.toISOString(),
      }))
    : [];

  return {
    adisyonId: a?.id ?? null,
    acilis: a?.acilis.toISOString() ?? null,
    kalemler,
    toplam,
    indirim,
    indirimTip: a?.indirimTip ?? null,
    indirimDeger: a ? Number(a.indirimDeger) : 0,
    kalan,
    odenenTutar,
    tahsilatToplam,
    kismiOdeme,
    iptaller,
  };
}

// Masaya ait AÇIK adisyonu + kalemleri + diğer masaları getirir (salt-okunur).
export async function getAdisyonDetay(masaId: number): Promise<AdisyonDetay | null> {
  const [masa, digerMasalar] = await Promise.all([
    db.masa.findUnique({
      where: { id: masaId },
      include: {
        adisyonlar: { where: { durum: 'acik' }, include: adisyonInclude },
      },
    }),
    db.masa.findMany({
      where: { id: { not: masaId }, tip: 'masa' }, // kasa/mobilya taşıma hedefi olamaz
      orderBy: [{ bolge: { sira: 'asc' } }, { id: 'asc' }],
      include: {
        bolge: { select: { ad: true } },
        adisyonlar: { where: { durum: 'acik' }, select: { id: true } },
      },
    }),
  ]);
  if (!masa) return null;

  const hedefMasalar: HedefMasa[] = digerMasalar.map((m) => {
    const acik = m.adisyonlar[0] ?? null;
    return {
      id: m.id,
      ad: m.ad,
      bolgeAd: m.bolge.ad,
      durum: (acik ? 'dolu' : 'bos') as 'bos' | 'dolu',
      adisyonId: acik?.id ?? null,
    };
  });

  return {
    masaId: masa.id,
    masaAd: masa.ad,
    tip: 'masa',
    ...ortakDetay(masa.adisyonlar[0] ?? null),
    hedefMasalar,
  };
}

// Gel-al (paket) adisyonunu id ile getirir — masa yok, etiket başlık olur.
export async function getAdisyonById(adisyonId: number): Promise<AdisyonDetay | null> {
  const a = await db.adisyon.findUnique({
    where: { id: adisyonId },
    include: adisyonInclude,
  });
  if (!a || a.tip !== 'gelal') return null;

  return {
    masaId: null,
    masaAd: a.etiket ?? 'Gel-Al',
    tip: 'gelal',
    ...ortakDetay(a),
    hedefMasalar: [], // gel-al'da masa taşı/birleştir yok
  };
}
