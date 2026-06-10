import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { kapatKontrol, toplamYenidenHesapla } from '@/lib/hesap';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_ADISYON_KAPANDI, OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Hesap geneli indirim tanımla / kaldır. tip="yuzde"|"tutar", deger>0 → indirim;
// deger=0 veya tip=null → indirimi kaldır. Etkin ₺ toplamYenidenHesapla'da türetilir.
export async function POST(req: Request) {
  const { adisyonId, tip, deger } = await req.json();
  const degerN = Number(deger);
  const gecerliTip = tip === 'yuzde' || tip === 'tutar';

  if (typeof adisyonId !== 'number') {
    return NextResponse.json({ error: 'adisyonId gerekli' }, { status: 400 });
  }
  if (deger != null && !Number.isFinite(degerN)) {
    return NextResponse.json({ error: 'geçersiz değer' }, { status: 400 });
  }
  if (tip === 'yuzde' && degerN > 100) {
    return NextResponse.json({ error: 'yüzde 100ü aşamaz' }, { status: 400 });
  }

  // Kaldırma: tip yok ya da değer <= 0
  const kaldir = !gecerliTip || !(degerN > 0);

  const sonuc = await db.$transaction(async (tx) => {
    const a = await tx.adisyon.findUnique({
      where: { id: adisyonId },
      select: { durum: true },
    });
    if (!a || a.durum !== 'acik') throw new Error('Açık adisyon bulunamadı');

    await tx.adisyon.update({
      where: { id: adisyonId },
      data: kaldir
        ? { indirimTip: null, indirimDeger: 0 }
        : { indirimTip: tip, indirimDeger: degerN },
    });

    await toplamYenidenHesapla(tx, adisyonId); // etkin indirim ₺'yi yeniden türetir
    return kapatKontrol(tx, adisyonId); // %100 indirim hesabı sıfırlarsa kapanır
  });

  await tetikle(
    SALON_KANAL,
    sonuc.kapandi ? OLAY_ADISYON_KAPANDI : OLAY_MASA,
    { masaId: sonuc.masaId }
  );
  return NextResponse.json({ ok: true, kapandi: sonuc.kapandi });
}
