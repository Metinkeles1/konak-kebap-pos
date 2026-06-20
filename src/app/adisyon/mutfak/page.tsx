import { getMutfakSiparisleri } from '@/lib/mutfak-siparis';
import { MutfakClient } from './MutfakClient';

// Mutfak ekranı (KDS). İlk veri sunucuda çekilir (hızlı ilk boya), sonra istemci
// Pusher ile canlı kalır ve /api/mutfak'tan yeniden çeker.
export const dynamic = 'force-dynamic';

export default async function MutfakPage() {
  const siparisler = await getMutfakSiparisleri();
  return <MutfakClient initial={siparisler} />;
}
