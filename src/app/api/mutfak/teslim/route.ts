import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMenu } from '@/lib/menu';
import { mutfagaGider } from '@/lib/mutfak';
import { tetikle } from '@/lib/pusher-server';
import { MUTFAK_KANAL, OLAY_MUTFAK } from '@/lib/realtime';

// Garson servise aldı ("Aldım"): adisyonun mutfağa giden tüm kalemlerini "alindi"
// yapar → mutfak ekranından düşer. Salon bildirimindeki butondan çağrılır.
export async function POST(req: Request) {
  const { adisyonId } = await req.json();
  if (typeof adisyonId !== 'number') {
    return NextResponse.json({ error: 'geçersiz veri' }, { status: 400 });
  }

  const [menu, kalemler] = await Promise.all([
    getMenu(),
    db.adisyonKalem.findMany({
      where: { adisyonId },
      select: { id: true, urunId: true },
    }),
  ]);
  const katMap = new Map(menu.map((u) => [u.id, u.category]));
  const ids = kalemler
    .filter((k) => mutfagaGider(katMap.get(k.urunId)))
    .map((k) => k.id);

  if (ids.length > 0) {
    await db.adisyonKalem.updateMany({
      where: { id: { in: ids } },
      data: { mutfakDurum: 'alindi' },
    });
    await tetikle(MUTFAK_KANAL, OLAY_MUTFAK, { durum: 'alindi' });
  }

  return NextResponse.json({ ok: true });
}
