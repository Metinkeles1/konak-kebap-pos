import { getMasaGecmisi } from '@/lib/gecmis';
import { GecmisClient } from './GecmisClient';

export const dynamic = 'force-dynamic'; // canlı veri

export default async function GecmisPage({
  searchParams,
}: {
  searchParams: Promise<{ tarih?: string }>;
}) {
  const { tarih } = await searchParams;
  const data = await getMasaGecmisi(tarih);
  return <GecmisClient data={data} />;
}
