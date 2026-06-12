import { SalonClient } from './SalonClient';

// Salon verisi istemci tarafında /api/salon'dan beslenir ve Pusher ile canlı
// kalır. Sayfa kabuğunu statik tutuyoruz ki masa↔salon geçişleri SSR'ı (6 DB
// sorgusu) beklemeden ANINDA açılsın; son görüntü sessionStorage'dan boyanıp
// taze veri arkada tazelenir.
export default function AdisyonPage() {
  return <SalonClient initial={null} />;
}
