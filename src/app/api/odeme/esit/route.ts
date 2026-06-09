import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hesapla, kapatKontrol } from '@/lib/hesap';
import { gecerliArac } from '@/lib/odeme';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Eşit bölme ("4 kişiyiz"): pay = toplam / kişi sayısı; her ödemede 1+ pay düşülür.
export async function POST(req: Request) {
  const { adisyonId, kisiSayisi, odenenPay, arac } = await req.json();
  if (
    typeof adisyonId !== 'number' ||
    typeof kisiSayisi !== 'number' ||
    kisiSayisi < 1 ||
    typeof odenenPay !== 'number' ||
    odenenPay < 1 ||
    odenenPay > kisiSayisi
  ) {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const sonuc = await db.$transaction(async (tx) => {
    const { toplam } = await hesapla(tx, adisyonId);
    const pay = toplam / kisiSayisi;
    const tutar = pay * odenenPay;

    await tx.tahsilat.create({
      data: {
        adisyonId,
        tutar,
        yontem: 'esit',
        arac: gecerliArac(arac),
        detay: `${kisiSayisi} kişiden ${odenenPay} pay`,
      },
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
