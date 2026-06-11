import { Yukleniyor } from '@/components/Yukleniyor';

// Gel-al adisyonu SSR sürerken görünen loader.
export default function Loading() {
  return <Yukleniyor mesaj="Gel-al açılıyor…" />;
}
