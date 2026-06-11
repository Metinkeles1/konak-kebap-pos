import type { MasaOzet } from './types';

// Floor-plan (kroki) ölçü/snap yardımcıları — hem SalonClient (konumlama) hem
// MasaKart (şekil) kullanır. Masalar şekline göre gerçek footprint'le çizilir.

export const KROKI_GRID = 20; // snap adımı (px)
export const CHAIR = 13; // masa kenarındaki sandalye payı (her kenar)
export const HIZA_ESIK = 12; // komşu masaya manyetik hizalama / kılavuz eşiği (px)

export type Boyut = { w: number; h: number };

// Şekil yorumu. Yön ayrı bir DB kolonu gerektirmesin diye sekil string'ine
// '-d' son ekiyle kodlanır: yatay (sandalyeler üst/alt) / '-d' = dikey
// (sandalyeler sol/sağ). Her şekil döndürülebilir: 'kare-d', 'yuvarlak-d',
// 'dikdortgen-d'.
export function sekilBilgi(sekil: string) {
  const dikey = sekil.endsWith('-d');
  const taban = dikey ? sekil.slice(0, -2) : sekil;
  const dikdortgen = taban === 'dikdortgen';
  const yuvarlak = taban === 'yuvarlak';
  return { dikdortgen, dikey, yuvarlak };
}

// Bir şeklin yönünü çevir (yatay ↔ dikey). '-d' son ekini ekler/kaldırır.
export function yonCevir(sekil: string): string {
  return sekil.endsWith('-d') ? sekil.slice(0, -2) : `${sekil}-d`;
}

// Sabit elemanların (mobilya/dekor) temel ölçüsü. uzun = uzun kenar, kisa =
// kısa kenar. Yön `sekil` ('dikdortgen-d' = dikey), uzunluk `en` (>=2 ise %50
// uzar) ile ayarlanır — masalardaki kodlamanın aynısı, DB değişikliği yok.
export const SABIT_BOYUT: Record<string, { uzun: number; kisa: number }> = {
  kasa: { uzun: 130, kisa: 58 },
  tezgah: { uzun: 240, kisa: 54 },
  ocak: { uzun: 92, kisa: 92 },
  merdiven: { uzun: 210, kisa: 88 },
  kapi: { uzun: 96, kisa: 18 },
  gecit: { uzun: 230, kisa: 74 },
};

// Masanın krokideki toplam footprint'i (sandalyeler dahil). Sabit elemanlarda
// sandalye yok; kendi SABIT_BOYUT ölçüsünü kullanır.
export function masaBoyut(m: MasaOzet): Boyut {
  if (m.tip !== 'masa') {
    const base = SABIT_BOYUT[m.tip] ?? SABIT_BOYUT.kasa;
    const dikey = m.sekil === 'dikdortgen-d';
    const uzun = m.en >= 2 ? Math.round(base.uzun * 1.5) : base.uzun;
    return dikey ? { w: base.kisa, h: uzun } : { w: uzun, h: base.kisa };
  }
  const { dikdortgen, dikey } = sekilBilgi(m.sekil);
  if (dikdortgen) {
    const uzun = m.en >= 2 ? 162 : 126;
    const kisa = 74;
    const topW = dikey ? kisa : uzun;
    const topH = dikey ? uzun : kisa;
    return { w: topW + CHAIR * 2, h: topH + CHAIR * 2 };
  }
  const top = 84; // kare / yuvarlak
  return { w: top + CHAIR * 2, h: top + CHAIR * 2 };
}

export function snap(v: number): number {
  return Math.round(v / KROKI_GRID) * KROKI_GRID;
}

// Oda (bölge) çerçevesinin ölçüsü. odaW/odaH verilmişse onu kullan; değilse
// içindeki masaların footprint'inden otomatik hesapla (kenar payı + minimum).
export const ODA_PAD = 48; // oda iç kenar payı (px)
export function odaBoyut(
  oda: { odaW: number; odaH: number },
  masalar: MasaOzet[]
): Boyut {
  if (oda.odaW > 0 && oda.odaH > 0) return { w: oda.odaW, h: oda.odaH };
  let mw = 0;
  let mh = 0;
  for (const m of masalar) {
    const b = masaBoyut(m);
    mw = Math.max(mw, m.x + b.w);
    mh = Math.max(mh, m.y + b.h);
  }
  return {
    w: oda.odaW > 0 ? oda.odaW : Math.max(mw + ODA_PAD, 240),
    h: oda.odaH > 0 ? oda.odaH : Math.max(mh + ODA_PAD, 200),
  };
}

type Kutu = { x: number; y: number; w: number; h: number };

// Sürükleme sonu hizalama: merkezi komşu masaların merkezine manyetik çek
// (aynı satır/sütun tam ortalanır), yoksa gride oturt. Köşe değil MERKEZ
// hizalandığı için farklı boyuttaki masalar bile "eşit seviyede" durur.
export function hizalaMerkez(
  rawX: number,
  rawY: number,
  b: Boyut,
  digerleri: Kutu[]
): { x: number; y: number } {
  let cx = rawX + b.w / 2;
  let cy = rawY + b.h / 2;
  let xKilit = false;
  let yKilit = false;

  for (const o of digerleri) {
    const ocx = o.x + o.w / 2;
    const ocy = o.y + o.h / 2;
    if (!xKilit && Math.abs(cx - ocx) <= HIZA_ESIK) {
      cx = ocx;
      xKilit = true;
    }
    if (!yKilit && Math.abs(cy - ocy) <= HIZA_ESIK) {
      cy = ocy;
      yKilit = true;
    }
  }
  if (!xKilit) cx = snap(cx);
  if (!yKilit) cy = snap(cy);

  return {
    x: Math.max(0, Math.round(cx - b.w / 2)),
    y: Math.max(0, Math.round(cy - b.h / 2)),
  };
}
