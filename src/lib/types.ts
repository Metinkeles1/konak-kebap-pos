// Salon ekranı için sunucudan istemciye giden özet tipler (Decimal -> number çevrilmiş)

// Masa = tıklanır/adisyon açar. Diğerleri = sabit dekor (krokide çizilir,
// sayıma girmez, tıklanamaz). Tip `sekil`/`en` ile yön/uzunluk alır.
export type MasaTip =
  | 'masa'
  | 'kasa'
  | 'tezgah'
  | 'ocak'
  | 'merdiven'
  | 'kapi'
  | 'gecit';

export type AdisyonOzet = {
  id: number;
  acilis: string; // ISO tarih
  toplam: number;
  kalan: number;
  kalemSayisi: number;
  kismiOdeme: boolean; // tahsilat var ama KALAN > 0
};

export type MasaOzet = {
  id: number;
  ad: string;
  durum: 'bos' | 'dolu';
  x: number;
  y: number;
  en: number;
  sekil: string;
  tip: MasaTip;
  kapasite: number;
  adisyon: AdisyonOzet | null;
};

export type BolgeOzet = {
  id: number;
  ad: string;
  sira: number;
  kat: string; // üst sekme grubu — aynı kat'taki bölgeler tek krokide yan yana
  odaX: number; // oda çerçevesinin kat krokisindeki konumu (px)
  odaY: number;
  odaW: number; // oda ölçüsü (0 = masalardan otomatik hesapla)
  odaH: number;
  masalar: MasaOzet[];
};

// Gel-al (paket) adisyonu — masaya bağlı değil; salonda ayrı sekmede listelenir.
export type GelalOzet = {
  id: number; // adisyonId
  etiket: string; // "Paket 3"
  acilis: string; // ISO
  toplam: number;
  kalan: number;
  kalemSayisi: number;
  kismiOdeme: boolean;
};

export type SalonOzet = {
  bolgeler: BolgeOzet[];
  gelaller: GelalOzet[];
  ozet: {
    bos: number;
    dolu: number;
    odemeBekleyen: number;
    acikHesapToplam: number;
    gunlukCiro: number;
    gunIptal: number; // bugün iptal edilen kalem tutarı
    gunIkram: number; // bugün ikram edilen tutar
    gunIndirim: number; // bugün kapanan hesaplardaki toplam indirim
  };
};
