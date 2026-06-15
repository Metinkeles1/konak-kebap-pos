// Ödeme araçları — hem UI segmenti hem API doğrulaması bunu kullanır.
// "yontem" (tam/eşit/kalem/serbest) bölme yöntemidir; "arac" ödeme aracıdır.

export const ODEME_ARACLARI = [
  { key: 'nakit', label: 'Nakit', ikon: '💵' },
  { key: 'kart', label: 'Kart', ikon: '💳' },
  { key: 'yemek', label: 'Yemek Kartı', ikon: '🍽️' },
  { key: 'havale', label: 'Havale', ikon: '🏦' },
] as const;

export type OdemeArac = (typeof ODEME_ARACLARI)[number]['key'];

const KEYS = ODEME_ARACLARI.map((a) => a.key) as readonly string[];

// API'de gelen değeri güvene al — bilinmeyen/eksikse nakit.
export function gecerliArac(v: unknown): OdemeArac {
  return typeof v === 'string' && KEYS.includes(v) ? (v as OdemeArac) : 'nakit';
}

// Rapor/etiket için: anahtardan okunur etiket.
export function aracEtiket(key: string): string {
  return ODEME_ARACLARI.find((a) => a.key === key)?.label ?? key;
}

// Yemek kartı markaları — arac='yemek' seçilince hangi kart olduğu (gün sonu
// dökümünde sağlayıcı bazında ayrışsın diye Tahsilat.aracDetay'da saklanır).
export const YEMEK_KARTLARI = [
  { key: 'multinet', label: 'Multinet' },
  { key: 'sodexo', label: 'Sodexo' },
  { key: 'edenred', label: 'Edenred' },
  { key: 'setcard', label: 'Setcard' },
  { key: 'metropol', label: 'Metropol' },
  { key: 'paye', label: 'Paye' },
] as const;

export type YemekKarti = (typeof YEMEK_KARTLARI)[number]['key'];

const YK_KEYS = YEMEK_KARTLARI.map((y) => y.key) as readonly string[];

// API'de gelen yemek kartı markasını güvene al — bilinmeyen/eksikse null.
export function gecerliYemekKarti(v: unknown): string | null {
  return typeof v === 'string' && YK_KEYS.includes(v) ? v : null;
}

// Rapor/etiket için: marka anahtarından okunur etiket.
export function yemekKartiEtiket(key: string): string {
  return YEMEK_KARTLARI.find((y) => y.key === key)?.label ?? key;
}
