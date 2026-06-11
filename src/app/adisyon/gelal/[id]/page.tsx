import { notFound } from 'next/navigation';
import { getAdisyonById } from '@/lib/adisyon';
import { getMenu, grupla } from '@/lib/menu';
import { AdisyonClient } from '../../masa/[id]/AdisyonClient';

export const dynamic = 'force-dynamic';

export default async function GelalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adisyonId = Number(id);
  if (!Number.isFinite(adisyonId)) notFound();

  const [detay, urunler] = await Promise.all([
    getAdisyonById(adisyonId),
    getMenu(),
  ]);
  if (!detay) notFound();

  return <AdisyonClient detay={detay} gruplar={grupla(urunler)} />;
}
