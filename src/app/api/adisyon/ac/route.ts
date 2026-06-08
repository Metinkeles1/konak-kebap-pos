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

  let adisyon = await db.adisyon.findFirst({
    where: { masaId, durum: 'acik' },
  });

  if (!adisyon) {
    adisyon = await db.adisyon.create({ data: { masaId } });
    await db.masa.update({ where: { id: masaId }, data: { durum: 'dolu' } });
    await tetikle(SALON_KANAL, OLAY_MASA, { masaId });
  }

  return NextResponse.json({ adisyonId: adisyon.id });
}
