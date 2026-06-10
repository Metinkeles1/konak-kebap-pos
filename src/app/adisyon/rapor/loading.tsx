import { Yukleniyor } from '@/components/Yukleniyor';

// Gün Sonu raporu hazırlanırken görünen loader.
export default function Loading() {
  return <Yukleniyor mesaj="Gün sonu hazırlanıyor…" />;
}
