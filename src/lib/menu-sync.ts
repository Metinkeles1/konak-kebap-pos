// Paket (take-away) sistemin menüsünü DB'ye (Urun tablosu) çeker.
// "Menüyü Senkronize Et" butonu /api/menu/sync üzerinden bunu çağırır —
// artık VS Code / npm gerekmez, kasadan tek tıkla menü güncellenir.

import { db } from '@/lib/db';

const MENU_URL =
  process.env.NEXT_PUBLIC_MENU_URL ??
  'https://take-away-system.vercel.app/api/products';

type Ham = Record<string, unknown>;

export type SenkronSonuc = {
  toplam: number; // DB'ye yazılan ürün sayısı
  silinen: number; // pakette artık olmayan, DB'den silinen ürün sayısı
};

// Paket API'sini çekip Urun tablosunu birebir eşitler (upsert + eksikleri sil).
// Hata olursa fırlatır — çağıran (route) kullanıcıya gösterir, DB'ye dokunulmaz.
export async function menuSenkronize(): Promise<SenkronSonuc> {
  const res = await fetch(MENU_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Paket sistem yanıtı: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('Beklenmeyen format (dizi değil)');

  // Sadece kullandığımız alanlara normalize et
  const urunler = (data as Ham[]).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    price: Number(p.price),
    category: String(p.category),
    available: Boolean(p.available),
    image: p.image ? String(p.image) : null,
    portionable: Boolean(p.portionable),
  }));

  if (urunler.length === 0) {
    // Boş cevap büyük ihtimalle bir arıza — menüyü silmektense koru.
    throw new Error('Paket sistem boş menü döndürdü; senkron iptal edildi.');
  }

  const idler = urunler.map((u) => u.id);

  // Tek transaction: tümünü upsert et, sonra pakette artık olmayanları sil.
  const sonuc = await db.$transaction([
    ...urunler.map((u) =>
      db.urun.upsert({ where: { id: u.id }, create: u, update: u })
    ),
    db.urun.deleteMany({ where: { id: { notIn: idler } } }),
  ]);

  const silme = sonuc[sonuc.length - 1] as { count: number };
  return { toplam: urunler.length, silinen: silme.count };
}
