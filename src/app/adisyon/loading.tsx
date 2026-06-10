import { Yukleniyor } from '@/components/Yukleniyor';

// Salona dönerken (geri butonu / ilk açılış) SSR sürerken görünen loader.
export default function Loading() {
  return <Yukleniyor mesaj="Salon yükleniyor…" />;
}
