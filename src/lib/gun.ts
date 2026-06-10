// Gün sonu sınırı — Europe/Istanbul (UTC+3, DST yok).
// Vercel sunucusu UTC çalışır; bu yüzden saat dilimini SABİTLEMEK şart,
// yoksa gece yarısı civarı satışlar yanlış güne yazılır (docs/SETUP.md §10).

// Verilen anın Istanbul takvim tarihi (YYYY-MM-DD).
export function istanbulTarih(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function gunAraligi(now: Date = new Date()): { gte: Date; lt: Date } {
  const tarih = istanbulTarih(now);
  // Istanbul sabit +03:00 → 00:00 Istanbul = 21:00 UTC (önceki gün)
  const gte = new Date(`${tarih}T00:00:00+03:00`);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

// "YYYY-MM-DD" tarihini gün bazında kaydırır (önceki/sonraki gün navigasyonu).
export function gunKaydir(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}
