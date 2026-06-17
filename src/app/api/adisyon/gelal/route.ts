import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { gunAraligi } from '@/lib/gun';
import { tetikle } from '@/lib/pusher-server';
import { SALON_KANAL, OLAY_MASA } from '@/lib/realtime';

// Yeni gel-al (paket) adisyonu açar — masaya bağlı değil. Etiket otomatik:
// o günün (Istanbul) sıradaki "Paket N" numarası.
export async function POST() {
  const { gte, lt } = gunAraligi();

  // Eşzamanlı iki "yeni paket" isteği aynı numarayı almasın / iki adisyon
  // oluşturmasın diye gel-al bazlı transaction-advisory kilidi (namespace 2).
  // Kilit COMMIT'te düşer → "count + create" yarışı kapanır.
  const adisyon = await db.$transaction(async (tx) => {
    // Sabit negatif anahtar → gel-al "yeni paket" kilidi (masa-aç pozitif anahtarlarıyla
    // çakışmaz). $executeRaw: void sonucu deserialize edilmez.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock((-1)::bigint)`;
    const bugunSayi = await tx.adisyon.count({
      where: { tip: 'gelal', acilis: { gte, lt } },
    });
    return tx.adisyon.create({
      data: { tip: 'gelal', etiket: `Paket ${bugunSayi + 1}`, masaId: null },
      select: { id: true, etiket: true },
    });
  });

  // Salon, açık gel-al listesini tazelesin (masaId yok → highlight'sız refetch).
  await tetikle(SALON_KANAL, OLAY_MASA, { masaId: null });
  return NextResponse.json({ adisyonId: adisyon.id, etiket: adisyon.etiket });
}
