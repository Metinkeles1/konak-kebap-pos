import { notFound } from 'next/navigation';
import { getAdisyonDetay } from '@/lib/adisyon';
import { getMenu, grupla } from '@/lib/menu';
import { AdisyonClient } from './AdisyonClient';

export const dynamic = 'force-dynamic';

export default async function MasaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const masaId = Number(id);
  if (!Number.isFinite(masaId)) notFound();

  const [detay, urunler] = await Promise.all([
    getAdisyonDetay(masaId),
    getMenu(),
  ]);
  if (!detay) notFound();

  return <AdisyonClient detay={detay} gruplar={grupla(urunler)} />;
}
