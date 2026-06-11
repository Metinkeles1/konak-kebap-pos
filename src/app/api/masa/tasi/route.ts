import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Masa taşıma (komple): adisyon olduğu gibi başka BOŞ masaya geçer.
export async function POST(req: Request) {
  const { adisyonId, hedefMasaId } = await req.json();
  if (typeof adisyonId !== 'number' || typeof hedefMasaId !== 'number') {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const a = await tx.adisyon.findUnique({
      where: { id: adisyonId },
      select: { masaId: true, durum: true },
    });
    if (!a || a.durum !== 'acik') throw new Error('Açık adisyon bulunamadı');

    const hedefAcik = await tx.adisyon.findFirst({
      where: { masaId: hedefMasaId, durum: 'acik' },
      select: { id: true },
    });
    if (hedefAcik) throw new Error('Hedef masa dolu — birleştirmeyi kullan');

    const eskiMasaId = a.masaId;
    await tx.adisyon.update({
      where: { id: adisyonId },
      data: { masaId: hedefMasaId },
    });
    // Kaynak gel-al ise (masaId null) boşaltılacak eski masa yok.
    if (eskiMasaId != null) {
      await tx.masa.update({ where: { id: eskiMasaId }, data: { durum: 'bos' } });
    }
    await tx.masa.update({ where: { id: hedefMasaId }, data: { durum: 'dolu' } });
    return { eskiMasaId, hedefMasaId };
  });

  await Promise.all([
    tetikle(SALON_KANAL, OLAY_MASA, { masaId: sonuc.eskiMasaId }),
    tetikle(SALON_KANAL, OLAY_MASA, { masaId: sonuc.hedefMasaId }),
  ]);
  return NextResponse.json({ ok: true, hedefMasaId: sonuc.hedefMasaId });
}
