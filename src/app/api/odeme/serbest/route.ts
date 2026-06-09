import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kapatKontrol } from '@/lib/hesap';
import { gecerliArac } from '@/lib/odeme';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Serbest tutar tahsilatı ("500 TL al"). Masa açık kalır, KALAN düşer.
export async function POST(req: Request) {
  const { adisyonId, tutar, arac } = await req.json();
  if (typeof adisyonId !== 'number' || typeof tutar !== 'number' || tutar <= 0) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const a = await tx.adisyon.findUnique({
      where: { id: adisyonId },
      select: { durum: true },
    });
    if (!a || a.durum !== 'acik') throw new Error('Açık adisyon bulunamadı');

    await tx.tahsilat.create({
      data: { adisyonId, tutar, yontem: 'serbest', arac: gecerliArac(arac) },
    });
    await tx.adisyon.update({
      where: { id: adisyonId },
      data: { odenenTutar: { increment: tutar } },
    });
    return kapatKontrol(tx, adisyonId);
  });

  await tetikle(
    SALON_KANAL,
    sonuc.kapandi ? OLAY_ADISYON_KAPANDI : OLAY_MASA,
    { masaId: sonuc.masaId }
  );
  return NextResponse.json({ kapandi: sonuc.kapandi });
}
