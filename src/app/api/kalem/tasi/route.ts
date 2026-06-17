import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Kalem taşıma (parçalı): seçili kalemler başka masanın adisyonuna geçer.
// Hedefte açık adisyon yoksa açılır. Kaynakta kalem kalmazsa kapanır.
export async function POST(req: Request) {
  const { kalemIds, hedefMasaId } = await req.json();
  if (
    !Array.isArray(kalemIds) ||
    kalemIds.length === 0 ||
    !kalemIds.every((id) => typeof id === 'number') ||
    typeof hedefMasaId !== 'number'
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const kalemler = await tx.adisyonKalem.findMany({
      where: { id: { in: kalemIds } },
      select: { id: true, adisyonId: true },
    });
    if (kalemler.length === 0) throw new Error('Kalem bulunamadı');
    const kaynakAdisyonIds = [...new Set(kalemler.map((k) => k.adisyonId))];

    // Hedef açık adisyon (yoksa aç). /api/adisyon/ac ile AYNI masa kilidi → aynı
    // masada eşzamanlı "aç" + "kalem taşı" iki açık adisyon oluşturamaz.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hedefMasaId}::bigint)`;
    let hedef = await tx.adisyon.findFirst({
      where: { masaId: hedefMasaId, durum: 'acik' },
      select: { id: true },
    });
    if (!hedef) {
      hedef = await tx.adisyon.create({
        data: { masaId: hedefMasaId },
        select: { id: true },
      });
      await tx.masa.update({ where: { id: hedefMasaId }, data: { durum: 'dolu' } });
    }
    if (kaynakAdisyonIds.includes(hedef.id)) {
      throw new Error('Kalemler zaten bu masada');
    }

    await tx.adisyonKalem.updateMany({
      where: { id: { in: kalemler.map((k) => k.id) } },
      data: { adisyonId: hedef.id },
    });
    await toplamYenidenHesapla(tx, hedef.id);

    const etkilenenMasalar = new Set<number>([hedefMasaId]);
    for (const kid of kaynakAdisyonIds) {
      await toplamYenidenHesapla(tx, kid);
      const kalanKalem = await tx.adisyonKalem.count({ where: { adisyonId: kid } });
      const kadisyon = await tx.adisyon.findUnique({
        where: { id: kid },
        select: { masaId: true },
      });
      if (kadisyon) {
        if (kadisyon.masaId != null) etkilenenMasalar.add(kadisyon.masaId);
        if (kalanKalem === 0) {
          await tx.adisyon.update({
            where: { id: kid },
            data: { durum: 'kapali', kapanis: new Date() },
          });
          // Gel-al kaynak adisyonunda (masaId null) boşaltılacak masa yok.
          if (kadisyon.masaId != null) {
            await tx.masa.update({
              where: { id: kadisyon.masaId },
              data: { durum: 'bos' },
            });
          }
        }
      }
    }
    return { hedefMasaId, etkilenenMasalar: [...etkilenenMasalar] };
  });

  await Promise.all(
    sonuc.etkilenenMasalar.map((masaId) =>
      tetikle(SALON_KANAL, OLAY_MASA, { masaId })
    )
  );
  return NextResponse.json({ ok: true, hedefMasaId: sonuc.hedefMasaId });
}
