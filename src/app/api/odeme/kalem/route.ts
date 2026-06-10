import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kapatKontrol } from '@/lib/hesap';
import { gecerliArac } from '@/lib/odeme';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Kalem bazlı bölme ("kim ne yediyse"): seçili kalemler 'odendi' işaretlenir, KALAN düşer.
export async function POST(req: Request) {
  const { adisyonId, kalemIds, arac } = await req.json();
  if (
    typeof adisyonId !== 'number' ||
    !Array.isArray(kalemIds) ||
    kalemIds.length === 0 ||
    !kalemIds.every((id) => typeof id === 'number')
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const kalemler = await tx.adisyonKalem.findMany({
      // ikram=false: ücretsiz kalemler tahsilata girmez
      where: { id: { in: kalemIds }, adisyonId, durum: 'acik', ikram: false },
    });
    if (kalemler.length === 0) throw new Error('Seçili açık kalem yok');

    const tutar = kalemler.reduce(
      (s, k) => s + Number(k.birimFiyat) * k.adet,
      0
    );
    // Önce tahsilatı oluştur, sonra ödenen kalemleri ona BAĞLA (tahsilatId).
    // Böylece bu tahsilat geri alınınca tam olarak bu kalemler "acik"a döner.
    const tahsilat = await tx.tahsilat.create({
      data: {
        adisyonId,
        tutar,
        yontem: 'kalem',
        arac: gecerliArac(arac),
        detay: `${kalemler.length} kalem`,
      },
      select: { id: true },
    });
    await tx.adisyonKalem.updateMany({
      where: { id: { in: kalemler.map((k) => k.id) } },
      data: { durum: 'odendi', tahsilatId: tahsilat.id },
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
