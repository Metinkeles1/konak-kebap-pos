import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tetikle } from '@/lib/pusher-server';
import { OLAY_MASA, SALON_KANAL } from '@/lib/realtime';

// Düzenle modu: masa/eleman siler. Adisyon GEÇMİŞİ olan masa silinemez
// (mali kayıt korunur); sabit elemanların adisyonu olmaz, serbestçe silinir.
export async function POST(req: Request) {
  const { id } = await req.json();
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 });
  }

  const masa = await db.masa.findUnique({
    where: { id },
    select: { tip: true, _count: { select: { adisyonlar: true } } },
  });
  if (!masa) {
    return NextResponse.json({ error: 'masa bulunamadı' }, { status: 404 });
  }
  if (masa._count.adisyonlar > 0) {
    return NextResponse.json(
      { error: 'Bu masada adisyon geçmişi var, silinemez.' },
      { status: 409 }
    );
  }

  await db.masa.delete({ where: { id } });
  await tetikle(SALON_KANAL, OLAY_MASA, { masaId: id });
  return NextResponse.json({ ok: true });
}
