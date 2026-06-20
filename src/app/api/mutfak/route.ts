import { NextResponse } from 'next/server';
import { getMutfakSiparisleri } from '@/lib/mutfak-siparis';

// Mutfak ekranı verisi — açık adisyonların mutfağa giden kalemleri.
// İstemci Pusher olayında bunu yeniden çeker (salon /api/salon deseni gibi).
export const dynamic = 'force-dynamic';

export async function GET() {
  const siparisler = await getMutfakSiparisleri();
  return NextResponse.json({ siparisler });
}
