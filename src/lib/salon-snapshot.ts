import type { AdisyonOzet, SalonOzet } from './types';

// SalonClient ile masa ekranı arasında paylaşılan istemci-tarafı önbellek.
// Salona dönüş, son görüntüyü sessionStorage'dan ANINDA boyar (SSR beklemez);
// masa ekranı ayrıldığında ilgili masanın tutarını buraya yazar → dönüşte eski
// tutar "flash"ı olmaz, değişen masa kısa parlar.
export const SALON_SNAPSHOT = 'salon-anlik';
export const SALON_VURGU = 'salon-vurgu';

export function snapshotOku(): SalonOzet | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SALON_SNAPSHOT);
    return raw ? (JSON.parse(raw) as SalonOzet) : null;
  } catch {
    return null;
  }
}

export function snapshotYaz(salon: SalonOzet) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SALON_SNAPSHOT, JSON.stringify(salon));
  } catch {
    /* kota dolabilir — yut */
  }
}

// Masa ekranından dönmeden önce: snapshot'taki masanın tutarını güncelle ve
// dönüşte o masayı parlatmak üzere işaretle (adisyon doluysa). Salon henüz
// snapshot oluşturmadıysa sessizce çıkar — refetch zaten doğru veriyi getirir.
export function snapshotMasaGuncelle(masaId: number, adisyon: AdisyonOzet | null) {
  if (typeof window === 'undefined') return;
  try {
    if (adisyon) sessionStorage.setItem(SALON_VURGU, String(masaId));
    const raw = sessionStorage.getItem(SALON_SNAPSHOT);
    if (!raw) return;
    const salon = JSON.parse(raw) as SalonOzet;
    for (const b of salon.bolgeler) {
      const m = b.masalar.find((mm) => mm.id === masaId);
      if (m) {
        m.adisyon = adisyon;
        m.durum = adisyon ? 'dolu' : 'bos';
        break;
      }
    }
    sessionStorage.setItem(SALON_SNAPSHOT, JSON.stringify(salon));
  } catch {
    /* yut */
  }
}

// Dönüşte parlatılacak masa id'sini bir kez okur (ve tüketir).
export function vurguOku(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SALON_VURGU);
    if (!raw) return null;
    sessionStorage.removeItem(SALON_VURGU);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
