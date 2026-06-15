import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { menuSenkronize } from '@/lib/menu-sync';
import { MENU_CACHE_ETIKET } from '@/lib/menu';

// "Menüyü Senkronize Et" butonu buraya POST atar: paket sistemden menüyü
// çekip DB'deki Urun tablosunu eşitler. Başarısızsa DB'ye dokunulmaz.
export async function POST() {
  try {
    const sonuc = await menuSenkronize();
    revalidateTag(MENU_CACHE_ETIKET, 'max'); // getMenu cache'ini tazele → yeni menü görünür
    return NextResponse.json({ ok: true, ...sonuc });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Senkron hatası' },
      { status: 502 }
    );
  }
}
