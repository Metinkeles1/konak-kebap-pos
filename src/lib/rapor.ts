// Gün sonu raporu — belirli bir günün (Istanbul takvimi) tahsilat kırılımları.
// Ciro Tahsilat'tan hesaplanır (bölme/birleştirme ciroyu bozmasın, SETUP §8B).
//   arac    = ödeme aracı (nakit / kart / yemek / havale)
//   yontem  = bölme yöntemi (tam / kalem / esit / serbest)
// İptal/ikram/indirim ayrıca "düşülenler" olarak gösterilir.

import { db } from './db';
import { gunAraligi, gunKaydir, istanbulTarih } from './gun';
import { ODEME_ARACLARI } from './odeme';

const YONTEMLER = [
  { key: 'tam', label: 'Tüm masa (tam)' },
  { key: 'kalem', label: 'Kalem / ticket' },
  { key: 'esit', label: 'Eşit bölme' },
  { key: 'serbest', label: 'Serbest tutar' },
] as const;

export type KirilimSatir = {
  key: string;
  label: string;
  ikon?: string;
  tutar: number;
  adet: number;
};

export type GunSonu = {
  tarih: string; // YYYY-MM-DD (Istanbul)
  oncekiTarih: string;
  sonrakiTarih: string;
  bugunMu: boolean;
  ciro: number;
  tahsilatAdet: number;
  satisAdet: number; // tahsilat alan farklı adisyon sayısı (≈ kapanan masa)
  ortalama: number; // ciro / satisAdet
  araclar: KirilimSatir[];
  yontemler: KirilimSatir[];
  iptal: number;
  ikram: number;
  indirim: number;
};

export async function getGunSonu(tarihStr?: string): Promise<GunSonu> {
  // tarihStr "YYYY-MM-DD" verilirse o günü, yoksa bugünü baz al (Istanbul öğlen → DST güvenli).
  const base =
    tarihStr && /^\d{4}-\d{2}-\d{2}$/.test(tarihStr)
      ? new Date(`${tarihStr}T12:00:00+03:00`)
      : new Date();
  const tarih = istanbulTarih(base);
  const { gte, lt } = gunAraligi(base);

  const [
    aracGrup,
    yontemGrup,
    ciroAgg,
    iptalAgg,
    indirimAgg,
    ikramKalemler,
    satisAdisyonlar,
  ] = await Promise.all([
    db.tahsilat.groupBy({
      by: ['arac'],
      where: { zaman: { gte, lt } },
      _sum: { tutar: true },
      _count: true,
    }),
    db.tahsilat.groupBy({
      by: ['yontem'],
      where: { zaman: { gte, lt } },
      _sum: { tutar: true },
      _count: true,
    }),
    db.tahsilat.aggregate({
      _sum: { tutar: true },
      _count: true,
      where: { zaman: { gte, lt } },
    }),
    db.iptal.aggregate({ _sum: { tutar: true }, where: { zaman: { gte, lt } } }),
    db.adisyon.aggregate({
      _sum: { indirim: true },
      where: { kapanis: { gte, lt } },
    }),
    db.adisyonKalem.findMany({
      where: { ikram: true, zaman: { gte, lt } },
      select: { birimFiyat: true, adet: true },
    }),
    db.tahsilat.findMany({
      where: { zaman: { gte, lt } },
      distinct: ['adisyonId'],
      select: { adisyonId: true },
    }),
  ]);

  const aracSum = new Map(
    aracGrup.map((g) => [g.arac, { tutar: Number(g._sum.tutar ?? 0), adet: g._count }])
  );
  const araclar: KirilimSatir[] = ODEME_ARACLARI.map((a) => ({
    key: a.key,
    label: a.label,
    ikon: a.ikon,
    tutar: aracSum.get(a.key)?.tutar ?? 0,
    adet: aracSum.get(a.key)?.adet ?? 0,
  }));

  const yontemSum = new Map(
    yontemGrup.map((g) => [g.yontem, { tutar: Number(g._sum.tutar ?? 0), adet: g._count }])
  );
  const yontemler: KirilimSatir[] = YONTEMLER.map((y) => ({
    key: y.key,
    label: y.label,
    tutar: yontemSum.get(y.key)?.tutar ?? 0,
    adet: yontemSum.get(y.key)?.adet ?? 0,
  }));

  const ikram = ikramKalemler.reduce(
    (s, k) => s + Number(k.birimFiyat) * k.adet,
    0
  );
  const ciro = Number(ciroAgg._sum.tutar ?? 0);
  const satisAdet = satisAdisyonlar.length;

  return {
    tarih,
    oncekiTarih: gunKaydir(tarih, -1),
    sonrakiTarih: gunKaydir(tarih, 1),
    bugunMu: tarih === istanbulTarih(new Date()),
    ciro,
    tahsilatAdet: ciroAgg._count,
    satisAdet,
    ortalama: satisAdet > 0 ? ciro / satisAdet : 0,
    araclar,
    yontemler,
    iptal: Number(iptalAgg._sum.tutar ?? 0),
    ikram,
    indirim: Number(indirimAgg._sum.indirim ?? 0),
  };
}
