import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Masa birleştirme: kaynak adisyonun TÜM kalemleri hedefe taşınır, her birine
// kaynakMasa etiketi yazılır (listede ayrı grup). Kaynak adisyon boş kapanır
// (toplam=0 → ciro Tahsilat'tan hesaplandığı için çift sayım olmaz, SETUP §8B).
export async function POST(req: Request) {
  const { kaynakAdisyonId, hedefAdisyonId } = await req.json();
  if (
    typeof kaynakAdisyonId !== 'number' ||
    typeof hedefAdisyonId !== 'number' ||
    kaynakAdisyonId === hedefAdisyonId
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const kaynak = await tx.adisyon.findUnique({
      where: { id: kaynakAdisyonId },
      include: { masa: { select: { id: true, ad: true } } },
    });
    const hedef = await tx.adisyon.findUnique({
      where: { id: hedefAdisyonId },
      select: { masaId: true, durum: true },
    });
    if (!kaynak || kaynak.durum !== 'acik') throw new Error('Kaynak adisyon yok');
    if (!hedef || hedef.durum !== 'acik') throw new Error('Hedef adisyon yok');
    if (!kaynak.masa) throw new Error('Gel-al adisyonu birleştirilemez');

    await tx.adisyonKalem.updateMany({
      where: { adisyonId: kaynakAdisyonId },
      data: { adisyonId: hedefAdisyonId, kaynakMasa: kaynak.masa.ad },
    });
    await tx.adisyon.update({
      where: { id: kaynakAdisyonId },
      data: { durum: 'kapali', kapanis: new Date(), toplam: 0 },
    });
    await tx.masa.update({ where: { id: kaynak.masa.id }, data: { durum: 'bos' } });
    await toplamYenidenHesapla(tx, hedefAdisyonId);

    return { kaynakMasaId: kaynak.masa.id, hedefMasaId: hedef.masaId };
  });

  await Promise.all([
    tetikle(SALON_KANAL, OLAY_ADISYON_KAPANDI, { masaId: sonuc.kaynakMasaId }),
    tetikle(SALON_KANAL, OLAY_MASA, { masaId: sonuc.hedefMasaId }),
  ]);
  return NextResponse.json({ ok: true, hedefMasaId: sonuc.hedefMasaId });
}
