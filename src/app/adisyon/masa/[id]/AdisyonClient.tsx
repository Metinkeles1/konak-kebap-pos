'use client';

import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdisyonDetay, HedefMasa, KalemDetay } from '@/lib/adisyon';
import type { Urun, UrunGrubu } from '@/lib/menu';
import { gecenSure, para } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { AdisyonFis } from '@/components/receipt/AdisyonFis';

type Modal = null | 'bol' | 'masa' | 'kalemTasi' | 'fis';
type BolYontem = 'kalem' | 'esit' | 'serbest';

// Kebapçı için hazır not çipleri — serbest not da eklenebilir.
const NOT_SECENEK = [
  'Acısız',
  'Az acılı',
  'Acılı',
  'Soğansız',
  'Az pişmiş',
  'İyi pişmiş',
  'Ekstra ekmek',
  'Servis sonra',
];

export function AdisyonClient({
  detay,
  gruplar,
}: {
  detay: AdisyonDetay;
  gruplar: UrunGrubu[];
}) {
  const router = useRouter();
  const now = useNow(20000);
  const [adisyonId, setAdisyonId] = useState<number | null>(detay.adisyonId);
  const [aktifKat, setAktifKat] = useState<string>(gruplar[0]?.key ?? '');
  const [secili, setSecili] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [bolYontem, setBolYontem] = useState<BolYontem>('kalem');
  const [kisiSayisi, setKisiSayisi] = useState(2);
  const [odenenPay, setOdenenPay] = useState(1);
  const [serbestTutar, setSerbestTutar] = useState('');
  const [islem, setIslem] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  // Ekle popover'ı: dokunulan ürün + adet/porsiyon/not seçimi
  const [eklenecek, setEklenecek] = useState<Urun | null>(null);
  const [pAdet, setPAdet] = useState(1);
  const [pYarim, setPYarim] = useState(false);
  const [pNotlar, setPNotlar] = useState<Set<string>>(new Set());
  const [pSerbest, setPSerbest] = useState('');

  const aktifGrup = gruplar.find((g) => g.key === aktifKat) ?? gruplar[0];

  // Optimistik kalemler: ürün eklenince hesaba ANINDA düşer, kayıt arka planda
  // gider (useOptimistic). router.refresh ile gerçek veri gelince sorunsuz eşleşir.
  const [optimistikKalemler, ekleOptimistik] = useOptimistic(
    detay.kalemler,
    (state: KalemDetay[], yeni: KalemDetay) => [...state, yeni]
  );
  const [, baslat] = useTransition();

  // Optimistik toplam / KALAN (anında güncellensin)
  const optToplam = optimistikKalemler.reduce(
    (s, k) => s + k.birimFiyat * k.adet,
    0
  );
  const optKalemOdenen = optimistikKalemler
    .filter((k) => k.durum === 'odendi')
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const optKalan = optToplam - optKalemOdenen - detay.odenenTutar;

  // Kalemleri kaynakMasa'ya göre grupla (kendi + birleştirmeden gelenler)
  const { kendi, ekGruplar } = useMemo(() => {
    const kendi: KalemDetay[] = [];
    const m = new Map<string, KalemDetay[]>();
    for (const k of optimistikKalemler) {
      if (!k.kaynakMasa) kendi.push(k);
      else {
        const arr = m.get(k.kaynakMasa) ?? [];
        arr.push(k);
        m.set(k.kaynakMasa, arr);
      }
    }
    return { kendi, ekGruplar: [...m.entries()] };
  }, [optimistikKalemler]);

  const seciliKalemler = optimistikKalemler.filter(
    (k) => secili.has(k.id) && k.durum === 'acik'
  );
  const seciliToplam = seciliKalemler.reduce(
    (s, k) => s + k.birimFiyat * k.adet,
    0
  );

  function toggleSecili(id: number) {
    setSecili((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function ensureAdisyon(): Promise<number> {
    if (adisyonId) return adisyonId;
    const res = await fetch('/api/adisyon/ac', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ masaId: detay.masaId }),
    });
    const j = await res.json();
    setAdisyonId(j.adisyonId);
    return j.adisyonId as number;
  }

  // Ürüne dokununca ekle popover'ını sıfırdan aç
  function acEkle(urun: Urun) {
    if (!urun.available) return;
    setEklenecek(urun);
    setPAdet(1);
    setPYarim(false);
    setPNotlar(new Set());
    setPSerbest('');
  }

  function notCevir(n: string) {
    setPNotlar((s) => {
      const yeni = new Set(s);
      if (yeni.has(n)) yeni.delete(n);
      else yeni.add(n);
      return yeni;
    });
  }

  function eklePopoveriOnayla() {
    const urun = eklenecek;
    if (!urun) return;
    const notlar = [...pNotlar];
    if (pSerbest.trim()) notlar.push(pSerbest.trim());
    const not = notlar.join(', ') || undefined;

    // Hesaba düşecek geçici (optimistik) kalem — fiyatı ekranda doğru görünsün diye
    // yarımsa zaten yarılanmış birim fiyat tutulur (server da yarılar).
    const optimistik: KalemDetay = {
      id: -Date.now(),
      urunId: urun.id,
      urunAd: urun.name,
      birimFiyat: pYarim ? urun.price / 2 : urun.price,
      adet: pAdet,
      yarim: pYarim,
      durum: 'acik',
      kaynakMasa: null,
      not: not ?? null,
    };

    setEklenecek(null); // popover'ı ANINDA kapat
    setHata(null);

    baslat(async () => {
      ekleOptimistik(optimistik); // hesapta ANINDA görün
      try {
        const aid = await ensureAdisyon();
        await fetch('/api/kalem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            adisyonId: aid,
            urunId: urun.id,
            urunAd: urun.name,
            birimFiyat: urun.price,
            adet: pAdet,
            yarim: pYarim,
            not,
          }),
        });
      } catch {
        /* sessiz geç — refresh gerçeği geri getirir */
      }
      router.refresh(); // transition içinde → gerçek veri gelene dek optimistik korunur
    });
  }

  // Ortak POST + sonrası
  async function api(
    path: string,
    body: unknown,
    sonra: (j: { kapandi?: boolean; hedefMasaId?: number }) => void
  ) {
    setIslem(true);
    setHata(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHata(j?.error ?? 'İşlem başarısız');
        return;
      }
      setModal(null);
      setSecili(new Set());
      sonra(j);
    } finally {
      setIslem(false);
    }
  }

  const kapatVeyaTazele = (j: { kapandi?: boolean }) => {
    if (j.kapandi) router.push('/adisyon');
    else router.refresh();
  };

  const hesabiKapat = () =>
    adisyonId &&
    api('/api/odeme/tam', { adisyonId }, () => router.push('/adisyon'));

  const odeKalem = () =>
    adisyonId &&
    api(
      '/api/odeme/kalem',
      { adisyonId, kalemIds: [...secili] },
      kapatVeyaTazele
    );

  const odeEsit = () =>
    adisyonId &&
    api(
      '/api/odeme/esit',
      { adisyonId, kisiSayisi, odenenPay },
      kapatVeyaTazele
    );

  const odeSerbest = () => {
    const tutar = Number(serbestTutar);
    if (!adisyonId || !(tutar > 0)) {
      setHata('Geçerli bir tutar gir');
      return;
    }
    setSerbestTutar('');
    api('/api/odeme/serbest', { adisyonId, tutar }, kapatVeyaTazele);
  };

  const masaTasi = (hedefMasaId: number) =>
    adisyonId &&
    api('/api/masa/tasi', { adisyonId, hedefMasaId }, () =>
      router.push(`/adisyon/masa/${hedefMasaId}`)
    );

  const birlestir = (kaynakAdisyonId: number) =>
    adisyonId &&
    api(
      '/api/masa/birlestir',
      { kaynakAdisyonId, hedefAdisyonId: adisyonId },
      () => router.refresh()
    );

  const kalemTasi = (hedefMasaId: number) =>
    api('/api/kalem/tasi', { kalemIds: [...secili], hedefMasaId }, () =>
      router.refresh()
    );

  const pay = kisiSayisi > 0 ? optToplam / kisiSayisi : 0;

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* SOL — Menü */}
      <div className="flex flex-1 flex-col border-b border-slate-800 md:border-b-0 md:border-r">
        <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <Link
            href="/adisyon"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← Salon
          </Link>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold">{detay.masaAd}</span>
            {detay.acilis && (
              <span className="text-xs text-slate-400">
                {gecenSure(detay.acilis, now)} açık
              </span>
            )}
          </div>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
          {gruplar.map((g) => (
            <button
              key={g.key}
              onClick={() => setAktifKat(g.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                g.key === aktifKat
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {g.baslik}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-auto p-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {aktifGrup?.urunler.map((u) => (
            <button
              key={u.id}
              onClick={() => acEkle(u)}
              disabled={!u.available}
              className={`group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 text-left transition-transform active:scale-[0.97] ${
                u.available ? 'hover:border-slate-600' : 'opacity-50'
              }`}
            >
              <div className="relative aspect-4/3 bg-slate-800">
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.image}
                    alt={u.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl opacity-40">
                    🍽️
                  </div>
                )}
                {u.available && u.portionable && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur">
                    ½
                  </span>
                )}
                {!u.available && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Tükendi
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="truncate text-xs font-semibold leading-tight">
                  {u.name}
                </div>
                <div className="text-[13px] font-extrabold tabular-nums text-amber-300">
                  {para(u.price)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* SAĞ — Hesap */}
      <aside className="flex w-full flex-col bg-slate-900/40 md:w-96">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-300">Hesap</span>
            {detay.kismiOdeme && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                Kısmi ödeme alındı
              </span>
            )}
          </div>
          {optimistikKalemler.length > 0 && (
            <button
              onClick={() => setModal('fis')}
              className="shrink-0 rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              🧾 Fiş
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2 py-2">
          {optimistikKalemler.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">
              Henüz ürün eklenmedi. Soldan seç.
            </p>
          ) : (
            <div className="space-y-3">
              <KalemGrubu
                kalemler={kendi}
                secili={secili}
                onToggle={toggleSecili}
              />
              {ekGruplar.map(([kaynak, ks]) => (
                <div key={kaynak}>
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {kaynak}&apos;ten
                  </div>
                  <KalemGrubu
                    kalemler={ks}
                    secili={secili}
                    onToggle={toggleSecili}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seçim bandı */}
        {seciliKalemler.length > 0 && (
          <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-800/60 px-3 py-2 text-sm">
            <span className="text-slate-300">
              {seciliKalemler.length} seçili ·{' '}
              <b className="tabular-nums">{para(seciliToplam)}</b>
            </span>
            <button
              onClick={odeKalem}
              disabled={islem}
              className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Öde
            </button>
            <button
              onClick={() => setModal('kalemTasi')}
              disabled={islem}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              Taşı
            </button>
          </div>
        )}

        {/* Toplam / KALAN + aksiyonlar */}
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Toplam</span>
            <span className="tabular-nums">{para(optToplam)}</span>
          </div>
          {detay.tahsilatToplam > 0 && (
            <div className="flex items-center justify-between text-sm text-amber-300/80">
              <span>Ödenen</span>
              <span className="tabular-nums">-{para(detay.tahsilatToplam)}</span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-300">KALAN</span>
            <span className="text-2xl font-extrabold tabular-nums text-emerald-300">
              {para(optKalan)}
            </span>
          </div>

          {hata && (
            <p className="mt-2 rounded bg-rose-500/15 px-2 py-1 text-center text-xs text-rose-300">
              {hata}
            </p>
          )}

          {adisyonId && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                onClick={hesabiKapat}
                disabled={islem || optKalan <= 0.001}
                className="rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Hesabı Kapat
              </button>
              <button
                onClick={() => {
                  setHata(null);
                  setModal('bol');
                }}
                disabled={islem}
                className="rounded-lg border border-slate-600 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                Böl
              </button>
              <button
                onClick={() => {
                  setHata(null);
                  setModal('masa');
                }}
                disabled={islem}
                className="rounded-lg border border-slate-600 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                Masa
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MODAL: Böl */}
      {modal === 'bol' && (
        <ModalKabuk baslik="Hesabı Böl" onClose={() => setModal(null)}>
          <div className="mb-3 flex gap-1">
            {(['kalem', 'esit', 'serbest'] as BolYontem[]).map((y) => (
              <button
                key={y}
                onClick={() => setBolYontem(y)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize ${
                  bolYontem === y
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {y === 'kalem' ? 'Kalem' : y === 'esit' ? 'Eşit' : 'Serbest'}
              </button>
            ))}
          </div>

          {bolYontem === 'kalem' && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-400">
                Soldaki hesaptan kalemleri seç, sonra öde. Seçili:{' '}
                <b className="tabular-nums text-slate-200">
                  {seciliKalemler.length} kalem · {para(seciliToplam)}
                </b>
              </p>
              <button
                onClick={odeKalem}
                disabled={islem || seciliKalemler.length === 0}
                className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Seçili Kalemleri Tahsil Et
              </button>
            </div>
          )}

          {bolYontem === 'esit' && (
            <div className="space-y-4 text-sm">
              <Sayac
                etiket="Kişi sayısı"
                deger={kisiSayisi}
                min={1}
                onChange={(v) => {
                  setKisiSayisi(v);
                  if (odenenPay > v) setOdenenPay(v);
                }}
              />
              <Sayac
                etiket="Kaç pay ödenecek"
                deger={odenenPay}
                min={1}
                max={kisiSayisi}
                onChange={setOdenenPay}
              />
              <div className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
                <span className="text-slate-400">
                  Kişi başı {para(pay)} · tahsil
                </span>
                <b className="tabular-nums text-emerald-300">
                  {para(pay * odenenPay)}
                </b>
              </div>
              <button
                onClick={odeEsit}
                disabled={islem}
                className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Tahsil Et
              </button>
            </div>
          )}

          {bolYontem === 'serbest' && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={serbestTutar}
                  onChange={(e) => setSerbestTutar(e.target.value)}
                  placeholder="Tutar (₺)"
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 tabular-nums outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => setSerbestTutar(String(Math.round(detay.kalan)))}
                  className="rounded-lg border border-slate-600 px-3 py-2.5 text-slate-300 hover:bg-slate-700"
                >
                  KALAN
                </button>
              </div>
              <button
                onClick={odeSerbest}
                disabled={islem}
                className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Tahsil Et
              </button>
            </div>
          )}
        </ModalKabuk>
      )}

      {/* MODAL: Masa işlemleri (taşı / birleştir) */}
      {modal === 'masa' && (
        <ModalKabuk baslik="Masa İşlemleri" onClose={() => setModal(null)}>
          <Bolum baslik="Boş masaya taşı">
            <MasaListesi
              masalar={detay.hedefMasalar.filter((m) => m.durum === 'bos')}
              onSec={(m) => masaTasi(m.id)}
              bos="Boş masa yok"
            />
          </Bolum>
          <Bolum baslik="Başka masayı buraya kat (birleştir)">
            <MasaListesi
              masalar={detay.hedefMasalar.filter(
                (m) => m.durum === 'dolu' && m.adisyonId
              )}
              onSec={(m) => m.adisyonId && birlestir(m.adisyonId)}
              bos="Dolu masa yok"
            />
          </Bolum>
        </ModalKabuk>
      )}

      {/* MODAL: Seçili kalemleri taşı */}
      {modal === 'kalemTasi' && (
        <ModalKabuk
          baslik={`${seciliKalemler.length} kalemi taşı`}
          onClose={() => setModal(null)}
        >
          <p className="mb-3 text-sm text-slate-400">
            Hedef masa seç (dolu masaya eklenir, boş masada yeni adisyon açılır):
          </p>
          <MasaListesi
            masalar={detay.hedefMasalar}
            onSec={(m) => kalemTasi(m.id)}
            bos="Masa yok"
            durumGoster
          />
        </ModalKabuk>
      )}

      {/* POPOVER: Ürün ekle — adet + porsiyon + not */}
      {eklenecek && (
        <ModalKabuk
          baslik={eklenecek.name}
          onClose={() => setEklenecek(null)}
        >
          <div className="flex items-center gap-3">
            {eklenecek.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={eklenecek.image}
                alt={eklenecek.name}
                className="h-16 w-16 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-800 text-2xl opacity-40">
                🍽️
              </div>
            )}
            <div className="text-sm text-amber-300">
              {para(pYarim ? eklenecek.price / 2 : eklenecek.price)}
              {pYarim && (
                <span className="ml-1 text-xs text-slate-500">(yarım)</span>
              )}
            </div>
          </div>

          {/* Adet */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-400">Adet</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPAdet((a) => Math.max(1, a - 1))}
                className="h-10 w-10 rounded-lg bg-slate-800 text-xl font-bold text-slate-200 hover:bg-slate-700"
              >
                −
              </button>
              <span className="w-7 text-center text-lg font-bold tabular-nums">
                {pAdet}
              </span>
              <button
                onClick={() => setPAdet((a) => a + 1)}
                className="h-10 w-10 rounded-lg bg-sky-400 text-xl font-bold text-slate-900 hover:bg-sky-300"
              >
                +
              </button>
            </div>
          </div>

          {/* Porsiyon */}
          {eklenecek.portionable && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPYarim(false)}
                className={`rounded-lg py-2 text-sm font-semibold ${
                  !pYarim
                    ? 'border-2 border-sky-400 bg-sky-400/10 text-sky-200'
                    : 'border border-slate-700 text-slate-300'
                }`}
              >
                Tam porsiyon
              </button>
              <button
                onClick={() => setPYarim(true)}
                className={`rounded-lg py-2 text-sm font-semibold ${
                  pYarim
                    ? 'border-2 border-sky-400 bg-sky-400/10 text-sky-200'
                    : 'border border-slate-700 text-slate-300'
                }`}
              >
                ½ Yarım ({para(eklenecek.price / 2)})
              </button>
            </div>
          )}

          {/* Not çipleri */}
          <div className="mt-4">
            <div className="mb-1.5 text-sm text-slate-400">Not</div>
            <div className="flex flex-wrap gap-1.5">
              {NOT_SECENEK.map((n) => {
                const sec = pNotlar.has(n);
                return (
                  <button
                    key={n}
                    onClick={() => notCevir(n)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      sec
                        ? 'bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/50'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {n}
                    {sec && ' ✓'}
                  </button>
                );
              })}
            </div>
            <input
              value={pSerbest}
              onChange={(e) => setPSerbest(e.target.value)}
              placeholder="Serbest not (örn. ayran yerine kola)…"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          <button
            onClick={eklePopoveriOnayla}
            disabled={islem}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Hesaba ekle ·{' '}
            {para((pYarim ? eklenecek.price / 2 : eklenecek.price) * pAdet)}
          </button>
        </ModalKabuk>
      )}

      {/* MODAL: Hesap fişi (önizleme + yazdır) */}
      {modal === 'fis' && (
        <ModalKabuk baslik="Hesap Fişi" onClose={() => setModal(null)}>
          <div className="flex flex-col items-center gap-3">
            <AdisyonFis detay={detay} />
            <button
              onClick={() => window.print()}
              className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-500"
            >
              🖨 Yazdır
            </button>
          </div>
        </ModalKabuk>
      )}
    </div>
  );
}

function KalemGrubu({
  kalemler,
  secili,
  onToggle,
}: {
  kalemler: KalemDetay[];
  secili: Set<number>;
  onToggle: (id: number) => void;
}) {
  return (
    <ul className="space-y-1">
      {kalemler.map((k) => {
        const odendi = k.durum === 'odendi';
        return (
          <li
            key={k.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
              odendi ? 'opacity-50' : 'hover:bg-slate-800/50'
            }`}
          >
            {!odendi ? (
              <input
                type="checkbox"
                checked={secili.has(k.id)}
                onChange={() => onToggle(k.id)}
                className="h-4 w-4 shrink-0 accent-emerald-500"
              />
            ) : (
              <span className="w-4 shrink-0 text-center text-[10px] text-emerald-400">
                ✓
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5">
                <span className={`truncate ${odendi ? 'line-through' : ''}`}>
                  {k.urunAd}
                </span>
                {k.yarim && (
                  <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300">
                    ½
                  </span>
                )}
                {k.adet > 1 && (
                  <span className="shrink-0 text-slate-400">×{k.adet}</span>
                )}
              </span>
              {k.not && (
                <span className="truncate text-[11px] text-amber-300/80">
                  {k.not}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-slate-200">
              {para(k.birimFiyat * k.adet)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ModalKabuk({
  baslik,
  onClose,
  children,
}: {
  baslik: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-auto rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{baslik}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Bolum({
  baslik,
  children,
}: {
  baslik: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {baslik}
      </div>
      {children}
    </div>
  );
}

function MasaListesi({
  masalar,
  onSec,
  bos,
  durumGoster,
}: {
  masalar: HedefMasa[];
  onSec: (m: HedefMasa) => void;
  bos: string;
  durumGoster?: boolean;
}) {
  if (masalar.length === 0) {
    return <p className="px-1 py-2 text-sm text-slate-500">{bos}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {masalar.map((m) => (
        <button
          key={m.id}
          onClick={() => onSec(m)}
          className={`rounded-lg border px-2 py-2 text-sm font-medium ${
            m.durum === 'dolu'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
          } hover:brightness-125`}
        >
          {m.ad}
          {durumGoster && (
            <span className="block text-[10px] opacity-60">
              {m.durum === 'dolu' ? 'dolu' : 'boş'}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Sayac({
  etiket,
  deger,
  min = 1,
  max = 99,
  onChange,
}: {
  etiket: string;
  deger: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-300">{etiket}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, deger - 1))}
          className="h-9 w-9 rounded-lg bg-slate-800 text-lg font-bold text-slate-200 hover:bg-slate-700"
        >
          −
        </button>
        <span className="w-6 text-center text-lg font-bold tabular-nums">
          {deger}
        </span>
        <button
          onClick={() => onChange(Math.min(max, deger + 1))}
          className="h-9 w-9 rounded-lg bg-slate-800 text-lg font-bold text-slate-200 hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  );
}
