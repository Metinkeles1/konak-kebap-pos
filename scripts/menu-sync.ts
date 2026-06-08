// Paket sistemin menüsünü PROJEYE çeker: src/data/menu.json snapshot'ı.
// Runtime'da artık network yok — menü bu dosyadan okunur (hızlı + API'ye bağımsız).
// Menü değişince:  npm run menu:sync   (sonra commit / yeniden deploy)

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const MENU_URL =
  process.env.NEXT_PUBLIC_MENU_URL ??
  'https://take-away-system.vercel.app/api/products';
const OUT = join(process.cwd(), 'src', 'data', 'menu.json');

type Ham = Record<string, unknown>;

async function main() {
  let data: Ham[];
  try {
    const res = await fetch(MENU_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    if (!Array.isArray(data)) throw new Error('Beklenmeyen format (dizi değil)');
  } catch (e) {
    // API erişilemezse: eski snapshot varsa onu koru (build kırılmasın)
    if (existsSync(OUT)) {
      console.warn(`⚠ Menü çekilemedi (${String(e)}). Mevcut snapshot korunuyor.`);
      return;
    }
    throw e;
  }

  // Sadece kullandığımız alanlara normalize et — temiz, tipli snapshot
  const urunler = data.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    price: Number(p.price),
    category: String(p.category),
    available: Boolean(p.available),
    ...(p.image ? { image: String(p.image) } : {}),
    portionable: Boolean(p.portionable),
  }));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(urunler, null, 2) + '\n', 'utf8');
  console.log(`✔ ${urunler.length} ürün → src/data/menu.json`);
}

main().catch((e) => {
  console.error('Menü sync hatası:', e);
  process.exit(1);
});
