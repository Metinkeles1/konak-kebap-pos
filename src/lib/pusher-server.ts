import Pusher from 'pusher';

// Bir env değeri GERÇEKTEN dolu mu? Boş, tanımsız veya placeholder "..." ise kurulu sayma.
function gercek(v?: string): boolean {
  return !!v && v.trim() !== '' && v !== '...';
}

// Pusher anahtarları yoksa (henüz kurulmadıysa) null döner; tetikleme sessizce atlanır.
// Böylece sistem Pusher kurulmadan da çalışır (senkron olmaz, sayfa yenilenince güncellenir).
const hazir =
  gercek(process.env.PUSHER_APP_ID) &&
  gercek(process.env.NEXT_PUBLIC_PUSHER_KEY) &&
  gercek(process.env.PUSHER_SECRET) &&
  gercek(process.env.NEXT_PUBLIC_PUSHER_CLUSTER);

export const pusher = hazir
  ? new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      useTLS: true,
    })
  : null;

// Güvenli tetikleyici — Pusher kurulu değilse hata fırlatmaz
export async function tetikle(kanal: string, olay: string, veri: unknown) {
  if (!pusher) return;
  try {
    await pusher.trigger(kanal, olay, veri);
  } catch (e) {
    console.error('Pusher tetikleme hatası:', e);
  }
}
