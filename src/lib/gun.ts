// Gün sonu sınırı — Europe/Istanbul (UTC+3, DST yok).
// Vercel sunucusu UTC çalışır; bu yüzden saat dilimini SABİTLEMEK şart,
// yoksa gece yarısı civarı satışlar yanlış güne yazılır (docs/SETUP.md §10).

export function gunAraligi(now: Date = new Date()): { gte: Date; lt: Date } {
  // Istanbul saatine göre bugünün tarihi (YYYY-MM-DD)
  const tarih = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Istanbul sabit +03:00 → 00:00 Istanbul = 21:00 UTC (önceki gün)
  const gte = new Date(`${tarih}T00:00:00+03:00`);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}
