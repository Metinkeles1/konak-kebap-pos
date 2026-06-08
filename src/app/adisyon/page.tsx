import { getSalon } from '@/lib/salon';
import { SalonClient } from './SalonClient';

export const dynamic = 'force-dynamic'; // canlı veri, build'de prerender etme

export default async function AdisyonPage() {
  const data = await getSalon();
  return <SalonClient initial={data} />;
}
