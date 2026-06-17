import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import { SALON_KANAL, OLAY_MASA } from '@/lib/realtime';

// Boş masaya dokununca açık adisyon yoksa açar (idempotent).
export async function POST(req: Request) {
  const { masaId } = await req.json();
  if (typeof masaId !== 'number') {
    return NextResponse.json({ error: 'masaId gerekli' }, { status: 400 });
  }

  // Eşzamanlı iki "aç" isteği aynı masada İKİ açık adisyon oluşturmasın diye
  // masa bazlı transaction-advisory kilidi (namespace 1 = masa-aç). Kilit COMMIT'te
  // otomatik düşer → "findFirst + create" check-then-create yarışı kapanır.
  const sonuc = await db.$transaction(async (tx) => {
    // Tek 64-bit anahtar: masaId (pozitif) → masa-aç kilidi. ($executeRaw: void
    // sonucu deserialize edilmez.) gel-al negatif anahtar kullanır → çakışmaz.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${masaId}::bigint)`;
    const acik = await tx.adisyon.findFirst({
      where: { masaId, durum: 'acik' },
      select: { id: true },
    });
    if (acik) return { adisyonId: acik.id, yeni: false };

    const a = await tx.adisyon.create({ data: { masaId }, select: { id: true } });
    await tx.masa.update({ where: { id: masaId }, data: { durum: 'dolu' } });
    return { adisyonId: a.id, yeni: true };
  });

  if (sonuc.yeni) await tetikle(SALON_KANAL, OLAY_MASA, { masaId });
  return NextResponse.json({ adisyonId: sonuc.adisyonId });
}
