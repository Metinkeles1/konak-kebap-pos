// Pusher kanal/olay sabitleri — hem sunucu (tetikleme) hem istemci (dinleme) kullanır.
// Nötr modül ('use client' yok) ki sunucu rotaları da import edebilsin.

export const SALON_KANAL = 'salon';
export const OLAY_MASA = 'masa-guncellendi';
export const OLAY_ADISYON_KAPANDI = 'adisyon-kapandi';

// --- Mutfak ekranı (KDS) ---
// Ayrı kanal: mutfak ekranı yalnız mutfak olaylarını dinler (salon trafiğinden
// bağımsız), salon da garson bildirimini buradan alır.
export const MUTFAK_KANAL = 'mutfak';
// Mutfak verisi değişti (kalem eklendi/hazır/alındı) → mutfak ekranı yeniden çeksin.
export const OLAY_MUTFAK = 'mutfak-guncellendi';
// Bir masa servise hazır → garson/salon bilgilendirilir (çan + bildirim).
export const OLAY_MUTFAK_HAZIR = 'mutfak-hazir';
// Mutfağa gitmiş bir kalem iptal edildi/azaltıldı → mutfak ekranı uyarsın (israf önleme).
export const OLAY_MUTFAK_IPTAL = 'mutfak-iptal';
