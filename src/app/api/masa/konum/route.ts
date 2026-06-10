import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SEKILLER = ['kare', 'yuvarlak', 'dikdortgen', 'dikdortgen-d'];

// Düzenle modu: masanın konumu (x/y), şekli (sekil/en), adı ve kapasitesi kaydedilir.
export async function PATCH(req: Request) {
  const { id, x, y, sekil, en, ad, kapasite } = await req.json();
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 });
  }

  const data: {
    x?: number;
    y?: number;
    sekil?: string;
    en?: number;
    ad?: string;
    kapasite?: number;
  } = {};
  if (typeof x === 'number') data.x = Math.round(x);
  if (typeof y === 'number') data.y = Math.round(y);
  if (typeof sekil === 'string' && SEKILLER.includes(sekil)) data.sekil = sekil;
  if (typeof en === 'number' && en >= 1 && en <= 3) data.en = Math.round(en);
  if (typeof ad === 'string' && ad.trim()) data.ad = ad.trim().slice(0, 24);
  if (typeof kapasite === 'number' && kapasite >= 1 && kapasite <= 20)
    data.kapasite = Math.round(kapasite);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'güncellenecek alan yok' }, { status: 400 });
  }

  await db.masa.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
