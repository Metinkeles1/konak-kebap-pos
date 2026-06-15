'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  AdisyonDetay,
  HedefMasa,
  IptalKaydi,
  KalemDetay,
} from '@/lib/adisyon';
import type { Urun, UrunGrubu } from '@/lib/menu';
import type { AdisyonOzet } from '@/lib/types';
import { snapshotMasaGuncelle } from '@/lib/salon-snapshot';
import { gecenSure, para } from '@/lib/format';
import { ODEME_ARACLARI, type OdemeArac } from '@/lib/odeme';
import { useNow } from '@/lib/useNow';
import { AdisyonFis } from '@/components/receipt/AdisyonFis';
import { Ikon, type IkonAd } from '@/components/PosIkon';

type Modal = null | 'bol' | 'masa' | 'kalemTasi' | 'fis' | 'indirim';
// Ürün bazlı bölme zaten "hesaptan seç + Öde" ile yapılır; Böl modalı yalnızca
// modal gerektiren iki yöntem içindir.
type BolYontem = 'esit' | 'serbest';

// Ödeme aracı seçicide dar sütuna sığan kısa etiketler.
const ARAC_KISA: Record<string, string> = { yemek: 'Yemek' };

// Optimistik kalem güncellemeleri (ekle / düzenle / sil) — hesaba ANINDA yansır.
type OptAksiyon =
  | { tip: 'ekle'; kalem: KalemDetay }
  | { tip: 'guncelle'; id: number; veri: Partial<KalemDetay> }
  | { tip: 'sil'; id: number };

// Birleşik not metnini (örn. "Acılı, az ekmek") hazır çipler + serbest nota ayırır.
function notAyikla(not: string | null): { notlar: Set<string>; serbest: string } {
  if (!not) return { notlar: new Set(), serbest: '' };
  const parcalar = not.split(',').map((s) => s.trim()).filter(Boolean);
  const notlar = new Set<string>();
  const serbest: string[] = [];
  for (const p of parcalar) {
    if (NOT_SECENEK.includes(p)) notlar.add(p);
    else serbest.push(p);
  }
  return { notlar, serbest: serbest.join(', ') };
}

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

// Ürün ızgarası: sepet/hesap state'i değişince GEREKSİZ yere render olmasın diye
// memoize. onEkle stabil (useCallback) ve urunler referansı sabit olduğundan
// dokunuşta tüm kartlar yeniden render edilmez → optimistik güncelleme anında boyanır.
const UrunIzgara = memo(function UrunIzgara({
  urunler,
  adetler,
  onEkle,
}: {
  urunler: Urun[];
  adetler: Record<string, number>; // urunId → sepetteki toplam adet
  onEkle: (u: Urun) => void;
}) {
  return (
    <div className="grid grid-cols-3 content-start gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {urunler.map((u) => {
        const adet = adetler[u.id] ?? 0; // bu üründen sepette kaç tane var
        const sepette = adet > 0;
        return (
        <button
          key={u.id}
          onClick={() => onEkle(u)}
          disabled={!u.available}
          className={`group overflow-hidden rounded-xl border bg-slate-900/50 text-left transition-transform active:scale-[0.97] ${
            sepette
              ? 'border-amber-400 ring-2 ring-amber-400/40'
              : 'border-slate-800'
          } ${u.available ? 'hover:border-slate-600' : 'opacity-50'}`}
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
            {/* Sepette ekli adet — net görünür rozet (ör. "4") */}
            {sepette && (
              <span className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-black tabular-nums text-slate-900 shadow-md">
                {adet}
              </span>
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
        );
      })}
    </div>
  );
});

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

  // Adisyon kapanınca (tamamı ödendi) salona dön — snapshot'ta masayı BOŞ işaretle
  // ki dönüşte eski dolu hali görünmesin (taze veri arkada teyit eder).
  const donSalonaBos = useCallback(() => {
    if (detay.masaId != null) snapshotMasaGuncelle(detay.masaId, null);
    router.push('/adisyon');
  }, [detay.masaId, router]);
  const [aktifKat, setAktifKat] = useState<string>(gruplar[0]?.key ?? '');
  const [secili, setSecili] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [bolYontem, setBolYontem] = useState<BolYontem>('esit');
  const [kisiSayisi, setKisiSayisi] = useState(2);
  const [odenenPay, setOdenenPay] = useState(1);
  const [serbestTutar, setSerbestTutar] = useState('');
  const [arac, setArac] = useState<OdemeArac>('nakit'); // seçili ödeme aracı
  const [islem, setIslem] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Mobilde Hesap, alttan açılan modal (bottom-sheet). Masaüstünde yan panel
  // her zaman görünür; bu durum yalnızca <md ekranlarda etkili.
  const [hesapAcik, setHesapAcik] = useState(false);

  // Düzenle popover'ı: dokunulan SEPET KALEMİ + adet/porsiyon/not seçimi
  const [duzenle, setDuzenle] = useState<KalemDetay | null>(null);
  const [pAdet, setPAdet] = useState(1);
  const [pYarim, setPYarim] = useState(false);
  const [pIkram, setPIkram] = useState(false);
  const [pNotlar, setPNotlar] = useState<Set<string>>(new Set());
  const [pSerbest, setPSerbest] = useState('');

  // İndirim modalı: tip + değer girişi
  const [indTip, setIndTip] = useState<'yuzde' | 'tutar'>('yuzde');
  const [indDeger, setIndDeger] = useState('');

  const aktifGrup = gruplar.find((g) => g.key === aktifKat) ?? gruplar[0];

  // urunId → ürün (düzenlemede portionable / temel fiyat bilgisi için)
  const urunMap = useMemo(() => {
    const m = new Map<string, Urun>();
    for (const g of gruplar) for (const u of g.urunler) m.set(u.id, u);
    return m;
  }, [gruplar]);

  // Optimistik kalemler: ürün eklenince hesaba ANINDA düşer, kayıt arka planda
  // gider (useOptimistic). router.refresh ile gerçek veri gelince sorunsuz eşleşir.
  const [optimistikKalemler, optimistikUygula] = useOptimistic(
    detay.kalemler,
    (state: KalemDetay[], a: OptAksiyon) => {
      switch (a.tip) {
        case 'ekle':
          return [...state, a.kalem];
        case 'guncelle':
          return state.map((k) => (k.id === a.id ? { ...k, ...a.veri } : k));
        case 'sil':
          return state.filter((k) => k.id !== a.id);
      }
    }
  );
  const [, baslat] = useTransition();

  // hizliEkle'nin kimliğini sabit tutabilmek için sepeti ref'ten okuruz (yoksa
  // her sepet değişiminde callback kimliği değişir, ürün ızgarası memo'su bozulur).
  // Ref'leri effect'te senkronlarız; handler'lar effect'ten sonra çalışır → güncel.
  const kalemlerRef = useRef(optimistikKalemler);
  const adisyonIdRef = useRef(adisyonId);
  useEffect(() => {
    kalemlerRef.current = optimistikKalemler;
    adisyonIdRef.current = adisyonId;
  });

  // Tutar bazlı ödemeler (eşit/serbest/tam) KALAN'dan ANINDA düşsün; refresh
  // gelince detay.tahsilatToplam'a yansıyıp bu optimistik değer 0'a sıfırlanır.
  const [optEkstraOdenen, ekstraOdenenEkle] = useOptimistic(
    0,
    (s: number, miktar: number) => s + miktar
  );

  // İptal edilen kalem, alttaki "İptaller" listesinde de ANINDA görünsün
  // (yoksa refresh'e kadar gecikip "geriden geliyor" hissi verir).
  const [optIptaller, iptalEkle] = useOptimistic(
    detay.iptaller,
    (s: IptalKaydi[], yeni: IptalKaydi) => [...s, yeni]
  );

  // İndirim de sepete ANINDA yansısın: server'a yazılırken optimistik tip/değer
  // üstte kalsın, refresh ile detay güncellenince base'e döner (gecikme hissi yok).
  const [optIndirimDurum, indirimDurumAyarla] = useOptimistic(
    { tip: detay.indirimTip, deger: detay.indirimDeger },
    (_s, yeni: { tip: 'yuzde' | 'tutar' | null; deger: number }) => yeni
  );

  // Optimistik toplam / KALAN (anında güncellensin). İkram toplama girmez;
  // indirim toplamdan düşer (yüzdeyse optimistik toplam üstünden anlık kayar).
  const optToplam = optimistikKalemler
    .filter((k) => !k.ikram)
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const optIndirim = optIndirimDurum.tip
    ? optIndirimDurum.tip === 'yuzde'
      ? Math.min((optToplam * optIndirimDurum.deger) / 100, optToplam)
      : Math.min(optIndirimDurum.deger, optToplam)
    : 0;
  const optKalemOdenen = optimistikKalemler
    .filter((k) => k.durum === 'odendi' && !k.ikram)
    .reduce((s, k) => s + k.birimFiyat * k.adet, 0);
  const optKalan =
    optToplam - optIndirim - optKalemOdenen - detay.odenenTutar - optEkstraOdenen;
  const kalemAdet = optimistikKalemler.reduce((s, k) => s + k.adet, 0);

  // Menü kartlarında "sepette kaç tane" rozeti için: urunId → toplam adet.
  // Sadece sepet değişince yeniden hesaplanır (modal vb. ızgarayı render etmesin).
  const urunAdetleri = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of optimistikKalemler) m[k.urunId] = (m[k.urunId] ?? 0) + k.adet;
    return m;
  }, [optimistikKalemler]);

  // ← Salon'a dönmeden ÖNCE: bu masanın güncel tutarını salon snapshot'ına yaz
  // ki dönüşte eski tutar "flash"ı olmasın; masa da kısa parlar (dolu ise).
  const salonOzetiYaz = useCallback(() => {
    if (detay.masaId == null) return; // gel-al → salonda masa yok
    const ozet: AdisyonOzet | null =
      adisyonId != null
        ? {
            id: adisyonId,
            acilis: detay.acilis ?? new Date().toISOString(),
            toplam: optToplam,
            kalan: Math.max(0, optKalan),
            kalemSayisi: kalemAdet,
            kismiOdeme:
              (detay.tahsilatToplam > 0 || optEkstraOdenen > 0) &&
              optKalan > 0.001,
          }
        : null;
    snapshotMasaGuncelle(detay.masaId, ozet);
  }, [
    detay.masaId,
    detay.acilis,
    detay.tahsilatToplam,
    adisyonId,
    optToplam,
    optKalan,
    kalemAdet,
    optEkstraOdenen,
  ]);

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

  const ensureAdisyon = useCallback(async (): Promise<number> => {
    if (adisyonIdRef.current) return adisyonIdRef.current;
    const res = await fetch('/api/adisyon/ac', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ masaId: detay.masaId }),
    });
    const j = await res.json();
    adisyonIdRef.current = j.adisyonId;
    setAdisyonId(j.adisyonId);
    return j.adisyonId as number;
  }, [detay.masaId]);

  // TÜM kalem mutasyonlarını (ekle/güncelle/sil) tek bir FIFO kuyruğa alır.
  // Neden: sunucu sade satırı "adet + 1" ile atomik birleştirir; istekler
  // kullanıcı sırasıyla gitmezse yarış olur. Klasik hata: 5 hızlı dokunuştan
  // sonra adet 4'e düşürülür ama HÂLÂ uçuşta olan ekleme istekleri sunucuda
  // adedi tekrar artırıp düşürmeyi ezer ("4'e düşüremiyorum"). Hepsini aynı
  // kuyruğa alınca düşürme, eklemelerden SONRA gider ve son söz kullanıcınındır.
  // Optimistik UI yine ANINDA güncellenir; ağ sırası arkada korunur.
  const ekleKuyrukRef = useRef<Promise<void>>(Promise.resolve());
  // Bir mutasyonu kuyruğun sonuna ekler; önceki bitmeden başlamaz.
  const kuyrukla = useCallback((fn: () => Promise<void>): Promise<void> => {
    const p = ekleKuyrukRef.current.catch(() => {}).then(fn);
    ekleKuyrukRef.current = p.catch(() => {});
    return p;
  }, []);

  // Ürüne dokun → ANINDA sepete (optimistik). Aynı sade ürüne tekrar dokunulursa
  // yeni satır yerine adet artar; gerçek adet artışını sunucu atomik yapar.
  const hizliEkle = useCallback((urun: Urun) => {
    if (!urun.available) return;
    setHata(null);
    // Sade satır = yarımsız/notsuz/ikramsız/açık/kendi. Optimistikte id'si ne
    // olursa olsun (henüz kaydedilmemiş geçici satır dahil) eşleştir.
    const mevcut = kalemlerRef.current.find(
      (k) =>
        k.urunId === urun.id &&
        !k.yarim &&
        !k.ikram &&
        !k.not &&
        k.durum === 'acik' &&
        !k.kaynakMasa
    );

    baslat(async () => {
      const geciciId = -Date.now();
      // Optimistik: varsa adedi artır, yoksa yeni satır → ekranda tek satır sayar.
      if (mevcut) {
        optimistikUygula({
          tip: 'guncelle',
          id: mevcut.id,
          veri: { adet: mevcut.adet + 1 },
        });
      } else {
        optimistikUygula({
          tip: 'ekle',
          kalem: {
            id: geciciId,
            urunId: urun.id,
            urunAd: urun.name,
            birimFiyat: urun.price,
            adet: 1,
            yarim: false,
            ikram: false,
            durum: 'acik',
            kaynakMasa: null,
            not: null,
          },
        });
      }

      // Ağ çağrısını sıraya al: her zaman create — sunucu aynı sade satırı bulup
      // adedini ATOMİK artırır (sade.adet + 1). Sıralı olduğu için yarış yok.
      let yeniKalemId: number | undefined;
      await kuyrukla(async () => {
        try {
          const aid = await ensureAdisyon();
          const res = await fetch('/api/kalem', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              adisyonId: aid,
              urunId: urun.id,
              urunAd: urun.name,
              birimFiyat: urun.price,
              adet: 1,
              yarim: false,
            }),
          });
          const j = await res.json().catch(() => ({}));
          if (typeof j?.kalemId === 'number') yeniKalemId = j.kalemId;
        } catch {
          /* sessiz geç — refresh gerçeği geri getirir */
        }
      });

      // Gerçek id gelince yeni optimistik satırın geçici id'sini değiştir →
      // refresh beklemeden kalem düzenlenebilir/silinebilir olur.
      if (!mevcut && yeniKalemId !== undefined) {
        optimistikUygula({ tip: 'guncelle', id: geciciId, veri: { id: yeniKalemId } });
      }
      router.refresh();
    });
  }, [ensureAdisyon, kuyrukla, optimistikUygula, baslat, router]);

  // Sepet kalemine dokun → o kalemi düzenle (adet / yarım / not). Optimistik
  // satır (id<0, henüz kaydedilmemiş) ve ödenmiş kalem düzenlenemez.
  function duzenleAc(k: KalemDetay) {
    if (k.durum !== 'acik' || k.id < 0) return;
    setDuzenle(k);
    setPAdet(k.adet);
    setPYarim(k.yarim);
    setPIkram(k.ikram);
    const { notlar, serbest } = notAyikla(k.not);
    setPNotlar(notlar);
    setPSerbest(serbest);
  }

  function duzenleOnayla() {
    const k = duzenle;
    if (!k) return;
    const baz = k.yarim ? k.birimFiyat * 2 : k.birimFiyat; // satırın tam (kilitli) fiyatı
    const notlar = [...pNotlar];
    if (pSerbest.trim()) notlar.push(pSerbest.trim());
    const not = notlar.join(', ') || null;

    setDuzenle(null);
    setHata(null);
    baslat(async () => {
      optimistikUygula({
        tip: 'guncelle',
        id: k.id,
        veri: { adet: pAdet, yarim: pYarim, ikram: pIkram, birimFiyat: pYarim ? baz / 2 : baz, not },
      });
      // Kuyruğa al: uçuşta olan ekleme istekleri bitmeden gitmesin, yoksa
      // sunucu adedi tekrar artırıp bu düşürmeyi ezer ("4'e düşüremiyorum").
      let kapandi = false;
      await kuyrukla(async () => {
        try {
          const r = await fetch('/api/kalem/guncelle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              kalemId: k.id,
              birimFiyat: baz,
              adet: pAdet,
              yarim: pYarim,
              ikram: pIkram,
              not,
            }),
          });
          kapandi = !!(await r.json().catch(() => ({})))?.kapandi;
        } catch {
          /* sessiz geç */
        }
      });
      if (kapandi) donSalonaBos();
      else router.refresh();
    });
  }

  // İndirim modalını mevcut değerle aç
  function indirimAc() {
    setIndTip(optIndirimDurum.tip === 'tutar' ? 'tutar' : 'yuzde');
    setIndDeger(optIndirimDurum.tip ? String(optIndirimDurum.deger) : '');
    setHata(null);
    setModal('indirim');
  }

  // Hesap geneli indirim uygula / kaldır
  function indirimUygula(tip: 'yuzde' | 'tutar' | null, deger: number) {
    if (!adisyonId) return;
    setModal(null);
    setHata(null);
    baslat(async () => {
      // Sepetteki indirim satırı ANINDA güncellensin (kaldırınca tip=null).
      indirimDurumAyarla({ tip, deger: tip ? deger : 0 });
      let kapandi = false;
      try {
        const r = await fetch('/api/adisyon/indirim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adisyonId, tip, deger }),
        });
        kapandi = !!(await r.json().catch(() => ({})))?.kapandi;
      } catch {
        /* sessiz geç */
      }
      if (kapandi) donSalonaBos();
      else router.refresh();
    });
  }

  // Kalemi sil (sepet satırındaki × ve düzenleme popover'ı bunu kullanır).
  // Optimistik (id<0, henüz kaydedilmemiş) ve ödenmiş kalem silinemez.
  function kalemSil(k: KalemDetay) {
    if (k.durum !== 'acik' || k.id < 0) return;
    setHata(null);
    baslat(async () => {
      optimistikUygula({ tip: 'sil', id: k.id });
      iptalEkle({
        id: -Date.now(),
        urunAd: k.urunAd,
        adet: k.adet,
        tutar: k.ikram ? 0 : k.birimFiyat * k.adet,
        zaman: new Date().toISOString(),
      });
      // Kuyruğa al: uçuştaki eklemelerle yarışmasın (sıra korunsun).
      let kapandi = false;
      await kuyrukla(async () => {
        try {
          const r = await fetch('/api/kalem/guncelle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kalemId: k.id, sil: true }),
          });
          kapandi = !!(await r.json().catch(() => ({})))?.kapandi;
        } catch {
          /* sessiz geç */
        }
      });
      if (kapandi) donSalonaBos();
      else router.refresh();
    });
  }

  function duzenleSil() {
    if (!duzenle) return;
    const k = duzenle;
    setDuzenle(null);
    kalemSil(k);
  }

  function notCevir(n: string) {
    setPNotlar((s) => {
      const yeni = new Set(s);
      if (yeni.has(n)) yeni.delete(n);
      else yeni.add(n);
      return yeni;
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

  // Optimistik ödeme: KALAN/kalemler ANINDA güncellenir; ağ + refresh ARKADA
  // çalışır (delay hissi olmaz). Hata olursa transition biter ve optimistik
  // değişiklik kendiliğinden geri alınır, KALAN eski haline döner.
  function odemeIste(
    path: string,
    body: object,
    optimistik: () => void,
    hepKapanir = false
  ) {
    setHata(null);
    setModal(null);
    setSecili(new Set());
    baslat(async () => {
      optimistik();
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
        if (hepKapanir || j?.kapandi) donSalonaBos();
        else router.refresh();
      } catch {
        setHata('Bağlantı hatası');
      }
    });
  }

  const hesabiKapat = () => {
    if (!adisyonId || optKalan <= 0.001) return;
    const kalan = optKalan;
    odemeIste('/api/odeme/tam', { adisyonId, arac }, () => ekstraOdenenEkle(kalan), true);
  };

  const odeKalem = () => {
    if (!adisyonId || secili.size === 0) return;
    const ids = [...secili];
    odemeIste('/api/odeme/kalem', { adisyonId, kalemIds: ids, arac }, () =>
      ids.forEach((id) =>
        optimistikUygula({ tip: 'guncelle', id, veri: { durum: 'odendi' } })
      )
    );
  };

  const odeEsit = () => {
    if (!adisyonId) return;
    const tutar = (optToplam / Math.max(1, kisiSayisi)) * odenenPay;
    odemeIste('/api/odeme/esit', { adisyonId, kisiSayisi, odenenPay, arac }, () =>
      ekstraOdenenEkle(tutar)
    );
  };

  const odeSerbest = () => {
    const tutar = Number(serbestTutar);
    if (!adisyonId || !(tutar > 0)) {
      setHata('Geçerli bir tutar gir');
      return;
    }
    setSerbestTutar('');
    odemeIste('/api/odeme/serbest', { adisyonId, tutar, arac }, () =>
      ekstraOdenenEkle(tutar)
    );
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
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* SOL — Menü */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-slate-800 md:border-b-0 md:border-r">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <Link
            href="/adisyon"
            onClick={salonOzetiYaz}
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

        <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
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

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          <UrunIzgara
            urunler={aktifGrup?.urunler ?? []}
            adetler={urunAdetleri}
            onEkle={hizliEkle}
          />
        </div>

        {/* Mobil: alt özet çubuğu — dokununca Hesap modalını açar */}
        <button
          type="button"
          onClick={() => setHesapAcik(true)}
          className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/80 px-4 py-3 text-left backdrop-blur md:hidden"
        >
          <span className="flex items-center gap-2 text-slate-200">
            <Ikon ad="fis" className="h-5 w-5 text-slate-400" />
            <span className="text-sm font-semibold">
              Hesap{kalemAdet > 0 && ` · ${kalemAdet} ürün`}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Kalan
            </span>
            <span className="text-lg font-extrabold tabular-nums text-emerald-300">
              {para(Math.max(0, optKalan))}
            </span>
          </span>
        </button>
      </div>

      {/* SAĞ — Hesap: mobilde alttan açılan modal, masaüstünde sabit yan panel */}
      <div
        onClick={() => setHesapAcik(false)}
        className={`${
          hesapAcik ? 'flex' : 'hidden'
        } fixed inset-0 z-40 flex-col justify-end bg-black/60 md:static md:z-auto md:flex md:w-96 md:justify-stretch md:bg-transparent`}
      >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] min-h-0 w-full flex-col rounded-t-2xl bg-slate-900 shadow-2xl md:max-h-none md:flex-1 md:rounded-none md:bg-slate-900/40 md:shadow-none">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">Hesap</span>
            {kalemAdet > 0 && (
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-400">
                {kalemAdet} ürün
              </span>
            )}
            {detay.kismiOdeme && (
              <span className="truncate rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/30">
                Kısmi ödeme
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {optimistikKalemler.length > 0 && (
              <button
                onClick={() => setModal('fis')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100"
              >
                <Ikon ad="fis" className="h-4 w-4" />
                Fiş
              </button>
            )}
            {/* Mobil: modalı kapat (masaüstünde panel sabit) */}
            <button
              onClick={() => setHesapAcik(false)}
              aria-label="Hesabı kapat"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
                onDuzenle={duzenleAc}
                onSil={kalemSil}
                gorsel={(id) => urunMap.get(id)?.image}
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
                    onDuzenle={duzenleAc}
                    onSil={kalemSil}
                    gorsel={(id) => urunMap.get(id)?.image}
                  />
                </div>
              ))}
            </div>
          )}

          {/* İptaller — silinen kalemlerin izi (denetim) */}
          {optIptaller.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-400/70">
                İptaller ({optIptaller.length})
              </div>
              <ul className="space-y-0.5">
                {optIptaller.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center gap-2 px-2 text-xs text-slate-500"
                  >
                    <span className="min-w-0 flex-1 truncate line-through">
                      {i.urunAd}
                      {i.adet > 1 && ` ×${i.adet}`}
                    </span>
                    <span className="shrink-0 tabular-nums">{para(i.tutar)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Seçim bandı */}
        {seciliKalemler.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-t border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm">
            <span className="text-slate-200">
              <b className="tabular-nums text-sky-300">{seciliKalemler.length}</b>{' '}
              seçili · <b className="tabular-nums">{para(seciliToplam)}</b>
            </span>
            <button
              onClick={odeKalem}
              disabled={islem}
              className="ml-auto rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              Öde
            </button>
            {/* Kalem taşıma masa hedefi gerektirir — gel-al'da yok */}
            {detay.tip !== 'gelal' && (
              <button
                onClick={() => setModal('kalemTasi')}
                disabled={islem}
                className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <Ikon ad="tasi" className="h-4 w-4" />
                Taşı
              </button>
            )}
          </div>
        )}

        {/* Toplam / KALAN + aksiyonlar */}
        <div className="shrink-0 space-y-2.5 border-t border-slate-800 bg-slate-900/60 px-3 py-3 md:space-y-3 md:px-4 md:py-3.5">
          {/* Özet satırları */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Ara toplam</span>
              <span className="tabular-nums text-slate-300">{para(optToplam)}</span>
            </div>
            {adisyonId && (
              <button
                onClick={indirimAc}
                disabled={islem}
                className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-700 px-2.5 py-1.5 text-sm text-slate-300 transition-colors hover:border-rose-400/50 hover:bg-rose-500/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <Ikon ad="indirim" className="h-4 w-4 text-rose-300/80" />
                  <span>İndirim</span>
                  {optIndirimDurum.tip && (
                    <span className="text-rose-300">
                      {optIndirimDurum.tip === 'yuzde'
                        ? `%${optIndirimDurum.deger}`
                        : para(optIndirimDurum.deger)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums font-semibold text-rose-300">
                  {optIndirim > 0 ? `−${para(optIndirim)}` : 'Ekle +'}
                </span>
              </button>
            )}
            {detay.tahsilatToplam > 0 && (
              <div className="flex items-center justify-between text-sm text-amber-300/90">
                <span>Ödenen</span>
                <span className="tabular-nums">−{para(detay.tahsilatToplam)}</span>
              </div>
            )}
          </div>

          {/* KALAN — kahraman tutar */}
          <div
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${
              optKalan <= 0.001
                ? 'border-slate-700/60 bg-slate-800/40'
                : 'border-emerald-500/25 bg-linear-to-br from-emerald-500/15 to-slate-900/30'
            }`}
          >
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              {optKalan <= 0.001 ? 'Ödendi' : 'Kalan'}
            </span>
            <span
              className={`text-[26px] font-extrabold leading-none tabular-nums ${
                optKalan <= 0.001 ? 'text-slate-400' : 'text-emerald-300'
              }`}
            >
              {para(Math.max(0, optKalan))}
            </span>
          </div>

          {hata && (
            <p className="rounded-lg bg-rose-500/15 px-2 py-1.5 text-center text-xs font-medium text-rose-300 ring-1 ring-rose-500/20">
              {hata}
            </p>
          )}

          {adisyonId && (
            <>
              {/* Ödeme aracı — tüm tahsilat aksiyonları bunu kullanır */}
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Ödeme aracı
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {ODEME_ARACLARI.map((a) => {
                    const aktif = arac === a.key;
                    return (
                      <button
                        key={a.key}
                        onClick={() => setArac(a.key)}
                        aria-pressed={aktif}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-2 transition-all ${
                          aktif
                            ? 'border-sky-400 bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/60'
                            : 'border-slate-700/70 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        <Ikon ad={a.key as IkonAd} className="h-5 w-5" />
                        <span className="text-[11px] font-medium leading-none">
                          {ARAC_KISA[a.key] ?? a.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aksiyonlar — Hesabı Kapat birincil, Böl/Masa ikincil */}
              <div className="space-y-2">
                <button
                  onClick={hesabiKapat}
                  disabled={islem || optKalan <= 0.001}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  <Ikon ad="kapat" className="h-4.5 w-4.5" />
                  Hesabı Kapat
                </button>
                {/* Gel-al'da masa taşı/birleştir yok → Böl tek başına tam genişlik */}
                <div
                  className={`grid gap-2 ${
                    detay.tip === 'gelal' ? 'grid-cols-1' : 'grid-cols-2'
                  }`}
                >
                  <button
                    onClick={() => {
                      setHata(null);
                      setModal('bol');
                    }}
                    disabled={islem}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Ikon ad="bol" className="h-4.5 w-4.5" />
                    Böl
                  </button>
                  {detay.tip !== 'gelal' && (
                    <button
                      onClick={() => {
                        setHata(null);
                        setModal('masa');
                      }}
                      disabled={islem}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Ikon ad="masa" className="h-4.5 w-4.5" />
                      Masa
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
      </div>

      {/* MODAL: Böl */}
      {modal === 'bol' && (
        <ModalKabuk baslik="Hesabı Böl" onClose={() => setModal(null)}>
          <div className="mb-3 flex gap-1">
            {(['esit', 'serbest'] as BolYontem[]).map((y) => (
              <button
                key={y}
                onClick={() => setBolYontem(y)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  bolYontem === y
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {y === 'esit' ? 'Eşit böl' : 'Serbest tutar'}
              </button>
            ))}
          </div>

          {/* Ürün bazlı bölme: ayrı bir mod değil — hesaptan ürünleri seçince
              çıkan "Öde" bandı zaten bunu yapar. Buradan hatırlatıyoruz. */}
          <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">
            Belirli ürünleri ayrı tahsil etmek için bu pencereyi kapat, hesaptan
            ürünleri seçip <b className="text-slate-200">Öde</b>’ye bas.
          </p>

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

      {/* POPOVER: Sepet kalemini düzenle — adet + porsiyon + not + sil */}
      {duzenle && (() => {
        const baz = duzenle.yarim ? duzenle.birimFiyat * 2 : duzenle.birimFiyat;
        const urun = urunMap.get(duzenle.urunId);
        const portionable = urun?.portionable ?? duzenle.yarim;
        return (
        <ModalKabuk
          baslik={duzenle.urunAd}
          onClose={() => setDuzenle(null)}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 ring-1 ring-slate-700/60">
              {urun?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urun.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Ikon ad="yemek" className="h-6 w-6 text-slate-600" />
              )}
            </div>
            <div className="text-sm text-amber-300">
              {pIkram ? (
                <span className="text-emerald-300">İkram (ücretsiz)</span>
              ) : (
                <>
                  {para(pYarim ? baz / 2 : baz)}
                  {pYarim && (
                    <span className="ml-1 text-xs text-slate-500">(yarım)</span>
                  )}
                </>
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
          {portionable && (
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
                ½ Yarım ({para(baz / 2)})
              </button>
            </div>
          )}

          {/* İkram — ücretsiz; toplama girmez ama fişte/ekranda görünür */}
          <button
            onClick={() => setPIkram((v) => !v)}
            className={`mt-3 flex w-full items-center justify-between rounded-lg py-2 px-3 text-sm font-semibold ${
              pIkram
                ? 'border-2 border-emerald-400 bg-emerald-400/10 text-emerald-200'
                : 'border border-slate-700 text-slate-300'
            }`}
          >
            <span>🎁 İkram (ücretsiz)</span>
            <span>{pIkram ? 'Açık ✓' : 'Kapalı'}</span>
          </button>

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
            onClick={duzenleOnayla}
            disabled={islem}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Kaydet · {pIkram ? 'İkram' : para((pYarim ? baz / 2 : baz) * pAdet)}
          </button>
          <button
            onClick={duzenleSil}
            disabled={islem}
            className="mt-2 w-full rounded-xl border border-rose-500/40 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Kalemi sil
          </button>
        </ModalKabuk>
        );
      })()}

      {/* MODAL: İndirim (hesap geneli — % veya ₺) */}
      {modal === 'indirim' && (() => {
        const deger = Number(indDeger) || 0;
        const onizleme =
          indTip === 'yuzde'
            ? Math.min((optToplam * deger) / 100, optToplam)
            : Math.min(deger, optToplam);
        const gecersiz = !(deger > 0) || (indTip === 'yuzde' && deger > 100);
        return (
        <ModalKabuk baslik="İndirim" onClose={() => setModal(null)}>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {(['yuzde', 'tutar'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setIndTip(t)}
                className={`rounded-lg py-2 text-sm font-semibold ${
                  indTip === t
                    ? 'bg-slate-100 text-slate-900'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {t === 'yuzde' ? '% Yüzde' : '₺ Tutar'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              autoFocus
              value={indDeger}
              onChange={(e) => setIndDeger(e.target.value)}
              placeholder={indTip === 'yuzde' ? 'Örn. 10' : 'Tutar (₺)'}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 tabular-nums outline-none focus:border-amber-400"
            />
            <span className="text-lg font-bold text-slate-400">
              {indTip === 'yuzde' ? '%' : '₺'}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2 text-sm">
            <span className="text-slate-400">
              Ara toplam {para(optToplam)} · indirim
            </span>
            <b className="tabular-nums text-rose-300">-{para(onizleme)}</b>
          </div>

          <button
            onClick={() => indirimUygula(indTip, deger)}
            disabled={islem || gecersiz}
            className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Uygula
          </button>
          {optIndirimDurum.tip && (
            <button
              onClick={() => indirimUygula(null, 0)}
              disabled={islem}
              className="mt-2 w-full rounded-xl border border-rose-500/40 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              İndirimi kaldır
            </button>
          )}
        </ModalKabuk>
        );
      })()}

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
  onDuzenle,
  onSil,
  gorsel,
}: {
  kalemler: KalemDetay[];
  secili: Set<number>;
  onToggle: (id: number) => void;
  onDuzenle: (k: KalemDetay) => void;
  onSil: (k: KalemDetay) => void;
  gorsel: (urunId: string) => string | undefined;
}) {
  return (
    <ul className="space-y-1">
      {kalemler.map((k) => {
        const odendi = k.durum === 'odendi';
        const resim = gorsel(k.urunId);
        return (
          <li
            key={k.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
              odendi ? 'opacity-50' : 'hover:bg-slate-800/50'
            }`}
          >
            {odendi ? (
              <span className="w-4 shrink-0 text-center text-[10px] text-emerald-400">
                ✓
              </span>
            ) : k.ikram ? (
              // İkram ücretsiz — ödemeye seçilemez
              <span className="w-4 shrink-0 text-center text-[11px]">🎁</span>
            ) : (
              <input
                type="checkbox"
                checked={secili.has(k.id)}
                onChange={() => onToggle(k.id)}
                className="h-4 w-4 shrink-0 accent-emerald-500"
              />
            )}
            {/* Küçük ürün görseli */}
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-slate-800 ring-1 ring-slate-700/60">
              {resim ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resim}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-600">
                  <Ikon ad="yemek" className="h-4 w-4" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDuzenle(k)}
              disabled={odendi}
              className="flex min-w-0 flex-1 flex-col text-left enabled:cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span className={`truncate ${odendi ? 'line-through' : ''}`}>
                  {k.urunAd}
                </span>
                {k.yarim && (
                  <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300">
                    ½
                  </span>
                )}
                {k.ikram && (
                  <span className="shrink-0 rounded bg-emerald-500/20 px-1 text-[10px] font-bold text-emerald-300">
                    İkram
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
            </button>
            <span
              className={`shrink-0 tabular-nums ${
                k.ikram ? 'text-emerald-300' : 'text-slate-200'
              }`}
            >
              {k.ikram ? '₺0' : para(k.birimFiyat * k.adet)}
            </span>
            {!odendi && (
              <button
                type="button"
                onClick={() => onSil(k)}
                aria-label="Kalemi sil"
                title="Kalemi sil"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
              >
                ✕
              </button>
            )}
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
