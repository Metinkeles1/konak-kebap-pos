import Link from 'next/link';
import { getGunSonu } from '@/lib/rapor';
import { para } from '@/lib/format';

export const dynamic = 'force-dynamic'; // canlı veri

function tarihEtiket(tarih: string): string {
  return new Date(`${tarih}T12:00:00+03:00`).toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function RaporPage({
  searchParams,
}: {
  searchParams: Promise<{ tarih?: string }>;
}) {
  const { tarih } = await searchParams;
  const r = await getGunSonu(tarih);
  const yuzde = (t: number) => (r.ciro > 0 ? (t / r.ciro) * 100 : 0);

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-950 text-slate-100">
      {/* Üst bar — mobilde iki satır (başlık + tarih navigasyonu) */}
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/adisyon"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Salon
          </Link>
          <h1 className="text-base font-bold sm:text-lg">Gün Sonu</h1>
          <Link
            href={`/adisyon/gecmis?tarih=${r.tarih}`}
            className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 sm:ml-0"
          >
            🧾 Masa Geçmişi
          </Link>
        </div>

        {/* Tarih navigasyonu — mobilde tam genişlik */}
        <div className="flex items-center gap-1.5 text-sm">
          <Link
            href={`/adisyon/rapor?tarih=${r.oncekiTarih}`}
            aria-label="Önceki gün"
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            ◀
          </Link>
          <span className="flex-1 text-center font-medium text-slate-200 sm:min-w-44 sm:flex-none">
            {tarihEtiket(r.tarih)}
          </span>
          <Link
            href={`/adisyon/rapor?tarih=${r.sonrakiTarih}`}
            aria-label="Sonraki gün"
            aria-disabled={r.bugunMu}
            className={`rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 ${
              r.bugunMu
                ? 'pointer-events-none opacity-30'
                : 'hover:bg-slate-800'
            }`}
          >
            ▶
          </Link>
          {!r.bugunMu && (
            <Link
              href="/adisyon/rapor"
              className="ml-1 rounded-lg bg-sky-400 px-3 py-1.5 font-medium text-slate-900 hover:bg-sky-300"
            >
              Bugün
            </Link>
          )}
        </div>
      </header>

      <div className="pb-safe mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {/* Toplam ciro */}
        <section className="rounded-2xl border border-slate-800 bg-linear-to-br from-emerald-500/10 to-slate-900/40 p-5">
          <div className="text-sm font-medium uppercase tracking-wide text-emerald-300/70">
            Toplam Satış (Ciro)
          </div>
          <div className="mt-1 text-4xl font-extrabold tabular-nums text-emerald-300">
            {para(r.ciro)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
            <span>
              Satış:{' '}
              <b className="tabular-nums text-slate-200">{r.satisAdet}</b> masa
            </span>
            <span>
              Tahsilat:{' '}
              <b className="tabular-nums text-slate-200">{r.tahsilatAdet}</b> işlem
            </span>
            <span>
              Ortalama:{' '}
              <b className="tabular-nums text-slate-200">{para(r.ortalama)}</b>
            </span>
          </div>
        </section>

        {/* Ödeme aracına göre */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Ödeme aracına göre
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {r.araclar.map((a) => (
              <div
                key={a.key}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <span className="text-lg">{a.ikon}</span>
                    {a.label}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {a.adet} işlem
                  </span>
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-100">
                  {para(a.tutar)}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400/70"
                    style={{ width: `${yuzde(a.tutar)}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-[11px] tabular-nums text-slate-500">
                  %{yuzde(a.tutar).toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bölme yöntemine göre */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Bölme yöntemine göre
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            {r.yontemler.map((y, i) => (
              <div
                key={y.key}
                className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                  i > 0 ? 'border-t border-slate-800' : ''
                } ${y.tutar > 0 ? 'bg-slate-900/50' : 'bg-slate-900/20'}`}
              >
                <span className="text-slate-300">
                  {y.label}
                  <span className="ml-2 text-[11px] text-slate-500">
                    {y.adet} işlem
                  </span>
                </span>
                <span className="tabular-nums font-semibold text-slate-100">
                  {para(y.tutar)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Düşülenler */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Düşülenler <span className="text-slate-600">(ciroya girmez)</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'İptal', deger: r.iptal, renk: 'text-rose-300' },
              { label: 'İkram', deger: r.ikram, renk: 'text-emerald-300' },
              { label: 'İndirim', deger: r.indirim, renk: 'text-rose-300' },
            ].map((d) => (
              <div
                key={d.label}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center"
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  {d.label}
                </div>
                <div className={`mt-1 text-lg font-bold tabular-nums ${d.renk}`}>
                  {para(d.deger)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
