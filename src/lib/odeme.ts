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
