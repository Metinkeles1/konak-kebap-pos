'use client';

import PusherClient from 'pusher-js';

// Gerçek değer mi? Placeholder "..." veya boş ise kurulu sayma.
const gercek = (v?: string): boolean => !!v && v.trim() !== '' && v !== '...';

const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

// Anahtar yoksa null — istemci tarafı senkronu devre dışı (sayfa yenileme ile güncellenir).
export const pusherClient =
  gercek(KEY) && gercek(CLUSTER)
    ? new PusherClient(KEY!, { cluster: CLUSTER! })
    : null;

export { SALON_KANAL, OLAY_MASA, OLAY_ADISYON_KAPANDI } from './realtime';
