// Mutfak ekranı (KDS) veri katmanı — SUNUCU. Açık adisyonların mutfağa giden
// kalemlerini, istasyona/masaya göre çıkarır. AdisyonKalem kategori tutmadığından
// urunId → kategori eşlemesi menüden (getMenu) yapılır; menüde olmayan ürün
// (silinmiş) mutfak ekranına düşmez.

import { db } from '@/lib/db';
import { getMenu } from '@/lib/menu';
import { ayirNot, istasyonBul, mutfagaGider } from '@/lib/mutfak';

// Bir kalemin "ek sipariş" sayılması için ilk kalemden bu kadar sonra eklenmiş
// olması gerekir (ms). Aynı turda girilen kalemler ek sayılmaz.
const EK_ESIK_MS = 90_000;

export type MutfakKalem = {
  id: number;
  urunAd: string;
  adet: number;
  istasyon: string; // istasyon anahtarı: "izgara" | "firin" | "ocak"
  durum: string; // mutfakDurum: "bekliyor" | "hazir"
  yarim: boolean;
  ikram: boolean;
  cipler: string[]; // tanınan tercihler (Acılı, Orta, Soğansız…)
  ozelNot: string | null; // serbest/özel not (alerji vb.) — uyarı bandı
  ek: boolean; // sonradan eklendi mi
  zaman: string; // ISO
  hazirZaman: string | null; // "hazir" olduğu an (soğuma sayacı) — ISO veya null
};

export type MutfakSiparis = {
  adisyonId: number;
  masaId: number | null;
  masaAd: string;
  tip: 'masa' | 'gelal';
  acilis: string; // ISO
  kalemler: MutfakKalem[];
};

export async function getMutfakSiparisleri(): Promise<MutfakSiparis[]> {
  const [menu, adisyonlar] = await Promise.all([
    getMenu(),
    db.adisyon.findMany({
      where: { durum: 'acik' },
      include: {
        masa: { select: { id: true, ad: true } },
        kalemler: { orderBy: { id: 'asc' } },
      },
      orderBy: { acilis: 'asc' },
    }),
  ]);

  const katMap = new Map(menu.map((u) => [u.id, u.category]));

  const sonuc: MutfakSiparis[] = [];
  for (const a of adisyonlar) {
    // Bu adisyonun mutfağa giden, henüz alınmamış kalemleri.
    const ham = a.kalemler.filter((k) => {
      const kat = katMap.get(k.urunId);
      return mutfagaGider(kat) && k.mutfakDurum !== 'alindi';
    });
    if (ham.length === 0) continue;

    // Ek sipariş eşiği: bu adisyonun en erken mutfak kalemine göre.
    const ilkZaman = Math.min(...ham.map((k) => k.zaman.getTime()));

    const kalemler: MutfakKalem[] = ham.map((k) => {
      const kat = katMap.get(k.urunId);
      const ist = istasyonBul(kat);
      const { cipler, ozel } = ayirNot(k.not);
      return {
        id: k.id,
        urunAd: k.urunAd,
        adet: k.adet,
        istasyon: ist?.key ?? 'ocak',
        durum: k.mutfakDurum,
        yarim: k.yarim,
        ikram: k.ikram,
        cipler,
        ozelNot: ozel,
        ek: k.zaman.getTime() - ilkZaman > EK_ESIK_MS,
        zaman: k.zaman.toISOString(),
        hazirZaman: k.hazirZaman ? k.hazirZaman.toISOString() : null,
      };
    });

    sonuc.push({
      adisyonId: a.id,
      masaId: a.masaId,
      masaAd: a.masa?.ad ?? a.etiket ?? 'Gel-Al',
      tip: a.tip === 'gelal' ? 'gelal' : 'masa',
      acilis: a.acilis.toISOString(),
      kalemler,
    });
  }
  return sonuc;
}
