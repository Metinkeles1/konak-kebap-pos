import { Yukleniyor } from '@/components/Yukleniyor';

// Masaya tıklayınca SSR (Neon sorguları) sürerken görünen loader.
export default function Loading() {
  return <Yukleniyor mesaj="Adisyon açılıyor…" />;
}
