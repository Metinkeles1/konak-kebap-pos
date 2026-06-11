import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hesapla } from '@/lib/hesap';
import { gecerliArac } from '@/lib/odeme';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Geçmiş (gün sonu) düzeltmeleri:
//   islem='arac' → tahsilatın ödeme aracını değiştir (toplamı/KALAN'ı etkilemez).
//   islem='sil'  → tahsilatı geri al: kalem bazlıysa kalemleri "acik"a döndür,
//                  tutar bazlıysa odenenTutar'dan düş; gerekiyorsa hesabı yeniden aç.
export async function POST(req: Request) {
  const { tahsilatId, islem, arac } = await req.json();

  if (typeof tahsilatId !== 'number') {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  // --- Ödeme aracını düzelt ---
  if (islem === 'arac') {
    await db.tahsilat.update({
      where: { id: tahsilatId },
      data: { arac: gecerliArac(arac) },
    });
    return NextResponse.json({ ok: true });
  }

  // --- Tahsilatı geri al / sil ---
  if (islem === 'sil') {
    const sonuc = await db.$transaction(async (tx) => {
      const t = await tx.tahsilat.findUnique({
        where: { id: tahsilatId },
        select: { adisyonId: true, tutar: true, yontem: true },
      });
      if (!t) throw new Error('Tahsilat bulunamadı');

      if (t.yontem === 'kalem') {
        // Bu tahsilatın kapattığı kalemleri tekrar "acik" yap, bağı kopar.
        await tx.adisyonKalem.updateMany({
          where: { tahsilatId },
          data: { durum: 'acik', tahsilatId: null },
        });
      } else {
        // Tutar bazlı (tam/eşit/serbest): ödenen tutardan düş (0'ın altına inme).
        const a = await tx.adisyon.findUnique({
          where: { id: t.adisyonId },
          select: { odenenTutar: true },
        });
        const yeni = Math.max(0, Number(a?.odenenTutar ?? 0) - Number(t.tutar));
        await tx.adisyon.update({
          where: { id: t.adisyonId },
          data: { odenenTutar: yeni },
        });
      }

      await tx.tahsilat.delete({ where: { id: tahsilatId } });

      // Geri alma sonrası KALAN > 0 ise hesabı yeniden aç, masayı doldur.
      const { kalan, masaId } = await hesapla(tx, t.adisyonId);
      let yenidenAcildi = false;
      if (kalan > 0.001) {
        await tx.adisyon.update({
          where: { id: t.adisyonId },
          data: { durum: 'acik', kapanis: null },
        });
        // Gel-al adisyonunda masa yok (masaId null) — doldurulacak masa da yok.
        if (masaId != null) {
          await tx.masa.update({
            where: { id: masaId },
            data: { durum: 'dolu' },
          });
        }
        yenidenAcildi = true;
      }
      return { masaId, yenidenAcildi };
    });

    await tetikle(SALON_KANAL, OLAY_MASA, { masaId: sonuc.masaId });
    return NextResponse.json({ ok: true, yenidenAcildi: sonuc.yenidenAcildi });
  }

  return NextResponse.json({ error: 'geçersiz işlem' }, { status: 400 });
}
