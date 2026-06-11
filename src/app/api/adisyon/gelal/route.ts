import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { gunAraligi } from '@/lib/gun';
import { tetikle } from '@/lib/pusher-server';
import { SALON_KANAL, OLAY_MASA } from '@/lib/realtime';

// Yeni gel-al (paket) adisyonu açar — masaya bağlı değil. Etiket otomatik:
// o günün (Istanbul) sıradaki "Paket N" numarası.
export async function POST() {
  const { gte, lt } = gunAraligi();
  const bugunSayi = await db.adisyon.count({
    where: { tip: 'gelal', acilis: { gte, lt } },
  });
  const etiket = `Paket ${bugunSayi + 1}`;

  const adisyon = await db.adisyon.create({
    data: { tip: 'gelal', etiket, masaId: null },
    select: { id: true },
  });

  // Salon, açık gel-al listesini tazelesin (masaId yok → highlight'sız refetch).
  await tetikle(SALON_KANAL, OLAY_MASA, { masaId: null });
  return NextResponse.json({ adisyonId: adisyon.id, etiket });
}
