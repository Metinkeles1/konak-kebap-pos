// Menü DB'de (Urun tablosu) cache'lenir. Kasadaki "Menüyü Senkronize Et"
// butonu paket sistemden çekip günceller (src/lib/menu-sync.ts).
// DB henüz boşsa (ilk senkrondan önce) eski JSON snapshot'a düşülür.

import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import menuData from '@/data/menu.json';

// Menü nadiren değişir (yalnız senkron butonuyla). Bu yüzden DB okuması
// cache'lenir: masa ekranındaki her router.refresh() menüyü yeniden
// SORGULAMAZ. Senkron route'u revalidateTag('menu') ile bu cache'i tazeler.
export const MENU_CACHE_ETIKET = 'menu';

export type Urun = {
  id: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
  image?: string;
  portionable: boolean;
};

export type UrunGrubu = {
  key: string;
  baslik: string;
  urunler: Urun[];
};

const SIRA = ['corba', 'durum', 'kebap', 'pide', 'lahmacun', 'kilo', 'tatli', 'icecek'];
const BASLIK: Record<string, string> = {
  corba: 'Çorbalar',
  durum: 'Dürümler',
  kebap: 'Kebaplar',
  pide: 'Pideler',
  lahmacun: 'Lahmacun',
  kilo: 'Kilo',
  tatli: 'Tatlılar',
  icecek: 'İçecekler',
};

const SNAPSHOT = menuData as Urun[];

// DB'den aktif menüyü okuyup düz (serileştirilebilir) Urun[]'e çevirir.
// unstable_cache ile sarılı: 'menu' etiketi tazelenene kadar tekrar sorgulanmaz.
const aktifMenuCache = unstable_cache(
  async (): Promise<Urun[]> => {
    const satirlar = await db.urun.findMany({
      where: { available: true },
      orderBy: { name: 'asc' },
    });
    // Decimal → number; tip Urun ile birebir.
    return satirlar.map((u) => ({
      id: u.id,
      name: u.name,
      price: Number(u.price),
      category: u.category,
      available: u.available,
      ...(u.image ? { image: u.image } : {}),
      portionable: u.portionable,
    }));
  },
  ['menu-aktif'],
  { tags: [MENU_CACHE_ETIKET], revalidate: 3600 }
);

// Aktif menüyü döndürür. Önce DB cache (senkronlanan); DB boşsa JSON snapshot.
// Sadece aktif ürünler — pakette available:false yapılan ürün POS menüsünde hiç görünmez.
export async function getMenu(): Promise<Urun[]> {
  const menu = await aktifMenuCache();
  // İlk senkrondan önce DB boş: eski snapshot'tan oku (sistem boş menüyle açılmasın).
  return menu.length > 0 ? menu : SNAPSHOT.filter((u) => u.available);
}

// Kategoriye göre grupla (boş gruplar atlanır)
export function grupla(urunler: Urun[]): UrunGrubu[] {
  return SIRA.map((c) => ({
    key: c,
    baslik: BASLIK[c] ?? c,
    urunler: urunler.filter((u) => u.category === c),
  })).filter((g) => g.urunler.length > 0);
}
