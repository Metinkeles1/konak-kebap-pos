'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { para } from '@/lib/format';
import { ODEME_ARACLARI } from '@/lib/odeme';
import { Ikon, type IkonAd } from '@/components/PosIkon';
import type {
  GecmisAdisyon,
  GecmisTahsilat,
  MasaGecmisi,
} from '@/lib/gecmis';

function saat(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function tarihEtiket(tarih: string): string {
  return new Date(`${tarih}T12:00:00+03:00`).toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function MasaKarti({ a }: { a: GecmisAdisyon }) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [duzenle, setDuzenle] = useState<GecmisTahsilat | null>(null);
  const [bekliyor, baslat] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(false);

  const sonZaman = a.tahsilatlar[a.tahsilatlar.length - 1]?.zaman ?? a.acilis;
  const kismi = a.durum !== 'kapali';

  function istek(body: object, onTamam?: () => void) {
    setHata(null);
    baslat(async () => {
      try {
        const res = await fetch('/api/gecmis/tahsilat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHata(j?.error ?? 'İşlem başarısız');
          return;
        }
        onTamam?.();
        router.refresh();
      } catch {
        setHata('Bağlantı hatası');
      }
    });
  }

  const aracDegistir = (arac: string) =>
    duzenle &&
    istek({ tahsilatId: duzenle.id, islem: 'arac', arac }, () =>
      setDuzenle(null)
    );

  const geriAl = () =>
    duzenle &&
    istek({ tahsilatId: duzenle.id, islem: 'sil' }, () => {
      setDuzenle(null);
      setSilOnay(false);
    });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      {/* Özet satırı — tıklanınca detay açılır */}
      <button
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/50"
      >
        <span className="flex h-9 w-12 flex-none items-center justify-center rounded-lg bg-amber-400/15 text-sm font-bold text-amber-300">
          {a.masaAd}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="tabular-nums">{saat(sonZaman)}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
              {a.parcaSayisi} parça
            </span>
            {kismi && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">
                kısmi / açık
              </span>
            )}
          </div>
          {/* Ödeme araçları rozetleri */}
          <div className="mt-1 flex flex-wrap gap-2">
            {a.tahsilatlar.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 text-[11px] tabular-nums text-slate-400"
              >
                <Ikon ad={t.arac as IkonAd} className="h-3.5 w-3.5" />
                {para(t.tutar)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2 text-right">
          <div>
            <div className="tabular-nums font-bold text-emerald-300">
              {para(a.odenen)}
            </div>
            {a.indirim > 0 && (
              <div className="text-[11px] tabular-nums text-rose-300">
                −{para(a.indirim)} ind.
              </div>
            )}
          </div>
          <span
            className={`text-slate-500 transition-transform ${acik ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
        </div>
      </button>

      {acik && (
        <div className="space-y-4 border-t border-slate-800 px-3 py-3">
          {/* Kalemler */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Satılanlar
            </div>
            <div className="space-y-1">
              {a.kalemler.map((k, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm text-slate-300"
                >
                  <span className="min-w-0 truncate">
                    <span className="tabular-nums text-slate-500">
                      {k.adet}×
                    </span>{' '}
                    {k.urunAd}
                    {k.yarim && (
                      <span className="ml-1 text-[11px] text-sky-300">yarım</span>
                    )}
                    {k.kaynakMasa && (
                      <span className="ml-1 text-[11px] text-slate-500">
                        ({k.kaynakMasa})
                      </span>
                    )}
                    {k.ikram && (
                      <span className="ml-1 text-[11px] text-emerald-300">
                        ikram
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {k.ikram ? '—' : para(k.birimFiyat * k.adet)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-800 pt-2 text-sm">
              <span className="text-slate-400">Hesap toplamı</span>
              <span className="tabular-nums font-medium text-slate-200">
                {para(a.toplam)}
              </span>
            </div>
            {a.indirim > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">İndirim</span>
                <span className="tabular-nums text-rose-300">
                  −{para(a.indirim)}
                </span>
              </div>
            )}
          </div>

          {/* Tahsilatlar — dokun → ödeme aracını değiştir / geri al */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Ödemeler ({a.parcaSayisi} parça)
              </span>
              <span className="text-[10px] text-slate-600">
                düzenlemek için dokun
              </span>
            </div>
            <div className="space-y-1.5">
              {a.tahsilatlar.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSilOnay(false);
                    setHata(null);
                    setDuzenle(t);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-800/40 px-2.5 py-2 text-left transition-colors hover:bg-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Ikon
                      ad={t.arac as IkonAd}
                      className="h-4 w-4 shrink-0 text-slate-300"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm text-slate-200">
                        <span>{t.aracLabel}</span>
                        <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {t.yontemLabel}
                        </span>
                      </div>
                      {t.detay && (
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                          {t.detay}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <div className="text-right">
                      <div className="tabular-nums font-semibold text-emerald-300">
                        {para(t.tutar)}
                      </div>
                      <div className="text-[10px] tabular-nums text-slate-500">
                        {saat(t.zaman)}
                      </div>
                    </div>
                    <Ikon
                      ad="duzenle"
                      className="h-4 w-4 text-slate-500"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* İptaller */}
          {a.iptaller.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                İptal edilenler
              </div>
              <div className="space-y-1">
                {a.iptaller.map((ip, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm text-rose-300/90"
                  >
                    <span className="min-w-0 truncate">
                      <span className="tabular-nums">{ip.adet}×</span> {ip.urunAd}
                      {ip.sebep && (
                        <span className="ml-1 text-[11px] text-slate-500">
                          ({ip.sebep})
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums">−{para(ip.tutar)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Açılış/kapanış */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
            <span>Açılış: {saat(a.acilis)}</span>
            {a.kapanis && <span>Kapanış: {saat(a.kapanis)}</span>}
          </div>
        </div>
      )}

      {/* Tahsilat düzenleme penceresi */}
      {duzenle && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setDuzenle(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">
                  {a.masaAd} · Ödeme
                </div>
                <div className="text-[11px] text-slate-500">
                  {duzenle.yontemLabel} · {para(duzenle.tutar)} ·{' '}
                  {saat(duzenle.zaman)}
                </div>
              </div>
              <button
                onClick={() => setDuzenle(null)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Ödeme aracını değiştir */}
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Ödeme aracı
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {ODEME_ARACLARI.map((opt) => {
                const sec = duzenle.arac === opt.key;
                return (
                  <button
                    key={opt.key}
                    disabled={bekliyor}
                    onClick={() => aracDegistir(opt.key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2 transition-all disabled:opacity-50 ${
                      sec
                        ? 'border-sky-400 bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/60'
                        : 'border-slate-700/70 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    <Ikon ad={opt.key as IkonAd} className="h-5 w-5" />
                    <span className="text-[11px] font-medium leading-none">
                      {opt.key === 'yemek' ? 'Yemek' : opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {hata && (
              <p className="mt-3 rounded-lg bg-rose-500/15 px-2 py-1.5 text-center text-xs font-medium text-rose-300 ring-1 ring-rose-500/20">
                {hata}
              </p>
            )}

            {/* Tahsilatı geri al */}
            <div className="mt-4 border-t border-slate-800 pt-3">
              {!silOnay ? (
                <button
                  onClick={() => setSilOnay(true)}
                  disabled={bekliyor}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <Ikon ad="cop" className="h-4.5 w-4.5" />
                  Tahsilatı geri al
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    {duzenle.yontem === 'kalem'
                      ? 'Bu ödemenin kapattığı kalemler tekrar "açık" olacak.'
                      : `${para(duzenle.tutar)} KALAN'a iade edilecek.`}{' '}
                    Hesap gerekiyorsa yeniden açılır (masa tekrar dolu olur). Emin
                    misin?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSilOnay(false)}
                      disabled={bekliyor}
                      className="rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Vazgeç
                    </button>
                    <button
                      onClick={geriAl}
                      disabled={bekliyor}
                      className="rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      Evet, geri al
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GecmisClient({ data: r }: { data: MasaGecmisi }) {
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
          <h1 className="text-base font-bold sm:text-lg">Masa Geçmişi</h1>
        </div>

        {/* Tarih navigasyonu — mobilde tam genişlik */}
        <div className="flex items-center gap-1.5 text-sm">
          <Link
            href={`/adisyon/gecmis?tarih=${r.oncekiTarih}`}
            aria-label="Önceki gün"
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            ◀
          </Link>
          <span className="flex-1 text-center font-medium text-slate-200 sm:min-w-44 sm:flex-none">
            {tarihEtiket(r.tarih)}
          </span>
          <Link
            href={`/adisyon/gecmis?tarih=${r.sonrakiTarih}`}
            aria-label="Sonraki gün"
            aria-disabled={r.bugunMu}
            className={`rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 ${
              r.bugunMu ? 'pointer-events-none opacity-30' : 'hover:bg-slate-800'
            }`}
          >
            ▶
          </Link>
          {!r.bugunMu && (
            <Link
              href="/adisyon/gecmis"
              className="ml-1 rounded-lg bg-sky-400 px-3 py-1.5 font-medium text-slate-900 hover:bg-sky-300"
            >
              Bugün
            </Link>
          )}
        </div>
      </header>

      <div className="pb-safe mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {/* Özet */}
        <section className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              İşlem yapılan masa
            </div>
            <div className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-100">
              {r.masaSayisi}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Toplam tahsilat
            </div>
            <div className="mt-0.5 text-2xl font-extrabold tabular-nums text-emerald-300">
              {para(r.toplamCiro)}
            </div>
          </div>
        </section>

        {/* Masa listesi */}
        {r.adisyonlar.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-12 text-center text-slate-500">
            Bu gün henüz işlem yapılmış masa yok.
          </div>
        ) : (
          <div className="space-y-2">
            {r.adisyonlar.map((a) => (
              <MasaKarti key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
