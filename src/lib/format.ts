// Para ve süre biçimlendirme (TR)

export function para(n: number): string {
  return '₺' + Math.round(n).toLocaleString('tr-TR');
}

// "14dk" / "1s05dk" — masa açık süresi
export function gecenSure(acilisISO: string, now: number = Date.now()): string {
  const ms = now - new Date(acilisISO).getTime();
  const dk = Math.max(0, Math.floor(ms / 60000));
  if (dk < 60) return `${dk}dk`;
  const saat = Math.floor(dk / 60);
  const kalan = dk % 60;
  return `${saat}s${String(kalan).padStart(2, '0')}dk`;
}

// Süreyi dakikaya çevir — "uzun süredir açık" uyarısı için
export function gecenDakika(acilisISO: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(acilisISO).getTime()) / 60000));
}
