// Mutfak yapılandırması — TEK KAYNAK (single source of truth).
//
// İki şeyi tanımlar:
//  1) İSTASYON YÖNLENDİRME: hangi menü kategorisi hangi mutfak istasyonuna gider
//     (lahmacun → Fırın, kebap → Izgara …). Mutfak fişi bu haritaya göre bölünür.
//  2) PİŞİRME TERCİHLERİ: her kategoriye özel hızlı not çipleri (Pişirme/Acı/…)
//     ki garson toplu siparişte tercihleri tek tek söylemeden işaretleyebilsin.
//
// Bu modül hem sipariş ekranında (AdisyonClient) hem mutfak fişinde (MutfakFisi)
// kullanılır; ayar değişikliği tek yerden yapılır.

// --- 1) İSTASYONLAR ---------------------------------------------------------

export type Istasyon = {
  key: string;
  ad: string; // fişte/başlıkta görünen ad
  ikon: string; // emoji rozet
};

export const ISTASYONLAR: Record<string, Istasyon> = {
  izgara: { key: 'izgara', ad: 'Izgara', ikon: '🔥' },
  firin: { key: 'firin', ad: 'Fırın', ikon: '🫓' },
  ocak: { key: 'ocak', ad: 'Ocak', ikon: '🍳' },
};

// İstasyon çıktı sırası — fişte üstten alta bu sırayla basılır.
export const ISTASYON_SIRA = ['izgara', 'firin', 'ocak'];

// Menü kategorisi → istasyon anahtarı. Burada olmayan kategori (içecek, tatlı…)
// mutfağa GİTMEZ; mutfak fişinde görünmez (bar/servis işi).
export const KATEGORI_ISTASYON: Record<string, string> = {
  kebap: 'izgara',
  durum: 'izgara', // dürümler de ızgaradan
  kilo: 'izgara',
  lahmacun: 'firin',
  pide: 'firin', // pideler fırından
  tatli: 'firin', // tatlılar (künefe vb.) fırından — mutfakta görünür
  corba: 'ocak',
};

// Bir kategori mutfağa gidiyor mu? (içecek/tatlı → false)
export function mutfagaGider(kategori: string | undefined): boolean {
  return !!kategori && kategori in KATEGORI_ISTASYON;
}

// Kategorinin istasyonu (yoksa null).
export function istasyonBul(kategori: string | undefined): Istasyon | null {
  if (!kategori) return null;
  const key = KATEGORI_ISTASYON[kategori];
  return key ? ISTASYONLAR[key] : null;
}

// --- 2) PİŞİRME TERCİHLERİ (kategori bazlı çipler) ---------------------------

export type MutfakGrubu = {
  baslik: string;
  secenekler: string[];
  tekli?: boolean; // true = tek seç (Pişirme/Acı gibi); false = çoklu
};

// Kategoriye özel tercih grupları. Kebap ve lahmacun ayrıntılı; diğer mutfak
// kategorileri (dürüm/pide/çorba…) temel grubu kullanır.
const TEMEL: MutfakGrubu[] = [
  { baslik: 'Acı', secenekler: ['Acısız', 'Az acılı', 'Acılı'], tekli: true },
  { baslik: 'Servis', secenekler: ['Ekstra ekmek', 'Servis sonra'] },
];

const GRUPLAR: Record<string, MutfakGrubu[]> = {
  kebap: [
    { baslik: 'Pişirme', secenekler: ['Az pişmiş', 'Orta', 'İyi pişmiş', 'Çok pişmiş'], tekli: true },
    { baslik: 'Acı', secenekler: ['Acısız', 'Az acılı', 'Acılı', 'Çok acılı'], tekli: true },
    { baslik: 'Ekmek', secenekler: ['Lavaş', 'Pide', 'Ekstra ekmek', 'Ekmeksiz'], tekli: true },
    { baslik: 'Çıkarılsın', secenekler: ['Soğansız', 'Domatessiz', 'Salatasız', 'Az tuz'] },
    { baslik: 'Yanında', secenekler: ['Pilav', 'Patates', 'Acılı ezme'] },
  ],
  lahmacun: [
    { baslik: 'Acı', secenekler: ['Acısız', 'Acılı', 'Çok acılı'], tekli: true },
    { baslik: 'Soğan', secenekler: ['Soğanlı', 'Soğansız'], tekli: true },
    { baslik: 'Pişirme', secenekler: ['Az pişmiş', 'Normal', 'Çıtır'], tekli: true },
    { baslik: 'Ekstra', secenekler: ['Maydanozsuz', 'Limonsuz', 'Bol maydanoz', 'Dürüm olsun'] },
  ],
};

// Kategorinin tercih gruplarını döndürür (tanımsızsa temel grup).
export function mutfakGruplari(kategori: string | undefined): MutfakGrubu[] {
  if (kategori && GRUPLAR[kategori]) return GRUPLAR[kategori];
  return TEMEL;
}

// Bir seçeneğin hangi tekli (tek-seç) gruba ait olduğunu bulur — çip tıklamada
// aynı gruptaki diğer seçeneği değiştirmek için. (örn. "Acılı" seçilince "Acısız" kalkar)
export function tekliGrupSecenekleri(
  kategori: string | undefined,
  secenek: string
): string[] | null {
  for (const g of mutfakGruplari(kategori)) {
    if (g.tekli && g.secenekler.includes(secenek)) return g.secenekler;
  }
  return null;
}

// notAyikla round-trip'i için: TÜM kategorilerdeki bilinen seçeneklerin birleşimi.
// Kayıtlı not metni bu listeye göre "hazır çip" vs "serbest not" diye ayrılır.
export const TUM_NOT_SECENEKLERI: string[] = [
  ...new Set([
    ...TEMEL.flatMap((g) => g.secenekler),
    ...Object.values(GRUPLAR).flatMap((gs) => gs.flatMap((g) => g.secenekler)),
  ]),
];

// Kayıtlı not metnini bilinen tercih çiplerine ve serbest (özel/alerji) nota ayırır.
// Mutfak ekranı: çipler renkli rozet, serbest not kırmızı uyarı bandı olur.
export function ayirNot(not: string | null): { cipler: string[]; ozel: string | null } {
  if (!not) return { cipler: [], ozel: null };
  const parcalar = not.split(',').map((s) => s.trim()).filter(Boolean);
  const cipler: string[] = [];
  const ozel: string[] = [];
  for (const p of parcalar) (TUM_NOT_SECENEKLERI.includes(p) ? cipler : ozel).push(p);
  return { cipler, ozel: ozel.join(', ') || null };
}
