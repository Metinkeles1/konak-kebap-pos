import { NextResponse } from 'next/server';
import { getSalon } from '@/lib/salon';

export const dynamic = 'force-dynamic'; // her zaman taze veri

export async function GET() {
  const data = await getSalon();
  return NextResponse.json(data);
}
