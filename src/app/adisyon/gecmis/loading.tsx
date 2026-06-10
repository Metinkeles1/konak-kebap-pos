import { Yukleniyor } from '@/components/Yukleniyor';

// Masa geçmişi yüklenirken görünen loader.
export default function Loading() {
  return <Yukleniyor mesaj="Masa geçmişi yükleniyor…" />;
}
