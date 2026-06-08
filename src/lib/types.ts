// Salon ekranı için sunucudan istemciye giden özet tipler (Decimal -> number çevrilmiş)

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
  tip: 'masa' | 'kasa';
  adisyon: AdisyonOzet | null;
};

export type BolgeOzet = {
  id: number;
  ad: string;
  sira: number;
  masalar: MasaOzet[];
};

export type SalonOzet = {
  bolgeler: BolgeOzet[];
  ozet: {
    bos: number;
    dolu: number;
    odemeBekleyen: number;
    acikHesapToplam: number;
    gunlukCiro: number;
  };
};
