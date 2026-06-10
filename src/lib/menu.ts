// Menü artık PROJEDE — src/data/menu.json snapshot'ından okunur (runtime'da network YOK).
// Paket sistemde fiyat/stok değişince:  npm run menu:sync  (sonra commit / deploy).
// Bkz. scripts/menu-sync.ts ve docs/SETUP.md §1.

import menuData from '@/data/menu.json';

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

const MENU = menuData as Urun[];

// Snapshot'tan menüyü döndürür (anında, network yok). async — çağıranlar değişmesin.
// Sadece aktif ürünler — pakette available:false yapılan ürün POS menüsünde hiç görünmez.
export async function getMenu(): Promise<Urun[]> {
  return MENU.filter((u) => u.available);
}

// Kategoriye göre grupla (boş gruplar atlanır)
export function grupla(urunler: Urun[]): UrunGrubu[] {
  return SIRA.map((c) => ({
    key: c,
    baslik: BASLIK[c] ?? c,
    urunler: urunler.filter((u) => u.category === c),
  })).filter((g) => g.urunler.length > 0);
}
