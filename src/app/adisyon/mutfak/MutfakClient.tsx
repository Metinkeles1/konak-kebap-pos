'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useNow } from '@/lib/useNow';
import { ISTASYONLAR, ISTASYON_SIRA } from '@/lib/mutfak';
import type { MutfakKalem, MutfakSiparis } from '@/lib/mutfak-siparis';
import {
  MUTFAK_KANAL,
  OLAY_MUTFAK,
  OLAY_MUTFAK_IPTAL,
  pusherClient,
} from '@/lib/pusher-client';

// Servis hedef süresi (dk): geçilince kart "geç" (kırmızı). 8 dk = uyarı (sarı).
const SERVIS_DK = 15;
const UYARI_DK = 8;
// Hazır olup garson almayınca "soğuyor" uyarısı (dk).
const HAZIR_ESIK_DK = 4;
const KIOSK_KEY = 'mutfak-kiosk-istasyon';
const BUYUK_KEY = 'mutfak-buyuk-mod';

type Baglanti = 'canli' | 'kopuk' | 'manuel';
type Sira = 'bekleme' | 'servis';
type Gorunum = 'masa' | 'sutun' | 'toplu';

const IST_RENK: Record<string, { metin: string; nokta: string }> = {
  izgara: { metin: 'text-orange-300', nokta: 'bg-orange-400' },
  firin: { metin: 'text-fuchsia-300', nokta: 'bg-fuchsia-400' },
  ocak: { metin: 'text-sky-300', nokta: 'bg-sky-400' },
};

function cipRenk(t: string): string {
  if (/ac[ıi]/i.test(t)) return 'bg-rose-500/10 text-rose-300';
  if (/(pi[şs]|orta|çıtır|az pi)/i.test(t)) return 'bg-amber-500/10 text-amber-300';
  return 'bg-slate-800 text-slate-300';
}

const dkHesap = (now: number, iso: string) => Math.floor((now - new Date(iso).getTime()) / 60000);

export function MutfakClient({ initial }: { initial: MutfakSiparis[] }) {
  const now = useNow(15000);
  const [siparisler, setSiparisler] = useState<MutfakSiparis[]>(initial);
  const [fIstasyon, setFIstasyon] = useState<string>('all');
  const [sira, setSira] = useState<Sira>('bekleme');
  const [gorunum, setGorunum] = useState<Gorunum>('masa');
  const [kiosk, setKiosk] = useState<string | null>(null);
  const [buyuk, setBuyuk] = useState(false);
  const [baglanti, setBaglanti] = useState<Baglanti>('manuel');
  const [yeniSet, setYeniSet] = useState<Set<number>>(new Set());
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [iptalUyari, setIptalUyari] = useState<string | null>(null);

  const gorulenRef = useRef<Set<number>>(new Set(initial.map((s) => s.adisyonId)));
  const ilkYuklemeRef = useRef(true);

  // --- ses ---
  const actxRef = useRef<AudioContext | null>(null);
  const sesAc = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actxRef.current ??= new AC();
      if (actxRef.current.state === 'suspended') void actxRef.current.resume();
    } catch {
      /* ses yoksa sessiz geç */
    }
  }, []);
  const beep = useCallback((t: number, f: number, dur: number, vol: number, type: OscillatorType) => {
    const ctx = actxRef.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }, []);
  // Yeni sipariş: uzun, dikkat çekici yükselen 3'lü zil ×3.
  const calYeni = useCallback(() => {
    const ctx = actxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const notalar = [784, 988, 1319];
    for (let tekrar = 0; tekrar < 3; tekrar++) {
      const base = t0 + tekrar * 0.85;
      notalar.forEach((f, i) => {
        beep(base + i * 0.16, f, 0.22, 0.26, 'triangle');
        beep(base + i * 0.16, f * 2, 0.22, 0.06, 'sine');
      });
    }
  }, [beep]);
  // İptal: alçak, inen ikaz (farklı, dikkat çeker).
  const calIkaz = useCallback(() => {
    const ctx = actxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    [440, 330, 220].forEach((f, i) => beep(t0 + i * 0.18, f, 0.26, 0.3, 'sawtooth'));
  }, [beep]);

  useEffect(() => {
    const ac = () => sesAc();
    document.addEventListener('pointerdown', ac, { once: true });
    return () => document.removeEventListener('pointerdown', ac);
  }, [sesAc]);

  // Kiosk + büyük mod tercihini localStorage'dan oku (mount sonrası — salon deseni).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const k = localStorage.getItem(KIOSK_KEY);
    if (k && ISTASYONLAR[k]) {
      setKiosk(k);
      setFIstasyon(k);
    }
    if (localStorage.getItem(BUYUK_KEY) === '1') setBuyuk(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const bildirimBeklet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bildir = useCallback((mesaj: string) => {
    setBildirim(mesaj);
    if (bildirimBeklet.current) clearTimeout(bildirimBeklet.current);
    bildirimBeklet.current = setTimeout(() => setBildirim(null), 2800);
  }, []);

  const iptalBeklet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iptalUyar = useCallback(
    (mesaj: string) => {
      setIptalUyari(mesaj);
      calIkaz();
      if (iptalBeklet.current) clearTimeout(iptalBeklet.current);
      iptalBeklet.current = setTimeout(() => setIptalUyari(null), 7000);
    },
    [calIkaz]
  );

  // --- veri çekme + yeni sipariş tespiti ---
  const cekiyorRef = useRef(false);
  const refetch = useCallback(async () => {
    if (cekiyorRef.current) return;
    cekiyorRef.current = true;
    try {
      const r = await fetch('/api/mutfak', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { siparisler: MutfakSiparis[] };
      const gelen = j.siparisler ?? [];
      const yeniGelenler = gelen.filter((s) => !gorulenRef.current.has(s.adisyonId));
      if (!ilkYuklemeRef.current && yeniGelenler.length > 0) {
        calYeni();
        const ad = yeniGelenler[0].masaAd;
        bildir(yeniGelenler.length > 1 ? `${yeniGelenler.length} yeni sipariş` : `Yeni sipariş — ${ad}`);
        setYeniSet((prev) => {
          const n = new Set(prev);
          yeniGelenler.forEach((s) => n.add(s.adisyonId));
          return n;
        });
        yeniGelenler.forEach((s) => {
          window.setTimeout(() => {
            setYeniSet((prev) => {
              const n = new Set(prev);
              n.delete(s.adisyonId);
              return n;
            });
          }, 30000);
        });
      }
      gelen.forEach((s) => gorulenRef.current.add(s.adisyonId));
      ilkYuklemeRef.current = false;
      setSiparisler(gelen);
    } finally {
      cekiyorRef.current = false;
    }
  }, [calYeni, bildir]);

  const bekletRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchGecikmeli = useCallback(() => {
    if (bekletRef.current) clearTimeout(bekletRef.current);
    bekletRef.current = setTimeout(() => {
      bekletRef.current = null;
      void refetch();
    }, 300);
  }, [refetch]);

  // Pusher canlı senkron + bağlantı durumu + iptal uyarısı.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pc = pusherClient;
    if (!pc) {
      setBaglanti('manuel');
      return;
    }
    const durum = () =>
      setBaglanti(pc.connection.state === 'connected' ? 'canli' : 'kopuk');
    pc.connection.bind('state_change', durum);
    durum();
    const ch = pc.subscribe(MUTFAK_KANAL);
    const onM = () => refetchGecikmeli();
    const onIptal = (p: { masaAd?: string; urunAd?: string; adet?: number; tur?: string }) => {
      const ad = p?.masaAd ?? 'Masa';
      const urun = p?.urunAd ?? 'ürün';
      iptalUyar(
        p?.tur === 'azalt'
          ? `${ad} · ${urun} azaltıldı (−${p?.adet ?? 1})`
          : `${ad} · ${urun} İPTAL${p?.adet ? ` ×${p.adet}` : ''}`
      );
    };
    ch.bind(OLAY_MUTFAK, onM);
    ch.bind(OLAY_MUTFAK_IPTAL, onIptal);
    return () => {
      pc.connection.unbind('state_change', durum);
      ch.unbind_all();
      pc.unsubscribe(MUTFAK_KANAL);
      if (bekletRef.current) clearTimeout(bekletRef.current);
    };
  }, [refetchGecikmeli, iptalUyar]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => void refetch(), 20000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(t);
    };
  }, [refetch]);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const al = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* desteklenmiyorsa atla */
      }
    };
    void al();
    const onVis = () => {
      if (document.visibilityState === 'visible') void al();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  // --- aksiyonlar ---
  const durumGonder = useCallback(
    async (kalemIds: number[], durum: string, hazirBildir: boolean, s: MutfakSiparis) => {
      try {
        await fetch('/api/mutfak/durum', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kalemIds,
            durum,
            hazirBildir,
            masaAd: s.masaAd,
            adisyonId: s.adisyonId,
          }),
        });
      } catch {
        void refetch();
      }
    },
    [refetch]
  );

  // Optimistik kalem durumu + soğuma zaman damgası.
  const yerelKalem = (id: number, durum: string) => (k: MutfakKalem) =>
    k.id === id
      ? { ...k, durum, hazirZaman: durum === 'hazir' ? new Date().toISOString() : durum === 'bekliyor' ? null : k.hazirZaman }
      : k;

  const kalemCevir = (s: MutfakSiparis, kalem: MutfakKalem) => {
    const yeni = kalem.durum === 'hazir' ? 'bekliyor' : 'hazir';
    const hepHazir =
      yeni === 'hazir' && s.kalemler.every((k) => (k.id === kalem.id ? true : k.durum === 'hazir'));
    setSiparisler((prev) =>
      prev.map((o) =>
        o.adisyonId === s.adisyonId ? { ...o, kalemler: o.kalemler.map(yerelKalem(kalem.id, yeni)) } : o
      )
    );
    if (hepHazir) bildir(`${s.masaAd} hazır — garsona bildirildi`);
    void durumGonder([kalem.id], yeni, hepHazir, s);
  };

  const siparisHazir = (s: MutfakSiparis) => {
    const zaman = new Date().toISOString();
    setSiparisler((prev) =>
      prev.map((o) =>
        o.adisyonId === s.adisyonId
          ? { ...o, kalemler: o.kalemler.map((k) => ({ ...k, durum: 'hazir', hazirZaman: k.hazirZaman ?? zaman })) }
          : o
      )
    );
    bildir(`${s.masaAd} hazır — garsona bildirildi`);
    void durumGonder(s.kalemler.map((k) => k.id), 'hazir', true, s);
  };

  const siparisAlindi = (s: MutfakSiparis) => {
    setSiparisler((prev) => prev.filter((o) => o.adisyonId !== s.adisyonId));
    void durumGonder(s.kalemler.map((k) => k.id), 'alindi', false, s);
  };

  const kioskAyarla = (sta: string | null) => {
    if (sta) {
      localStorage.setItem(KIOSK_KEY, sta);
      setKiosk(sta);
      setFIstasyon(sta);
    } else {
      localStorage.removeItem(KIOSK_KEY);
      setKiosk(null);
      setFIstasyon('all');
    }
  };

  const buyukCevir = () => {
    setBuyuk((v) => {
      const yeni = !v;
      localStorage.setItem(BUYUK_KEY, yeni ? '1' : '0');
      return yeni;
    });
  };

  // --- türetilmiş görünüm verisi ---
  const istasyonGecerli = useCallback(
    (kat: string) => fIstasyon === 'all' || kat === fIstasyon,
    [fIstasyon]
  );

  const siraliFiltre = useCallback(
    (list: MutfakSiparis[]) => {
      const c = [...list];
      c.sort((a, b) =>
        sira === 'bekleme'
          ? dkHesap(now, b.acilis) - dkHesap(now, a.acilis)
          : SERVIS_DK - dkHesap(now, a.acilis) - (SERVIS_DK - dkHesap(now, b.acilis))
      );
      return c;
    },
    [sira, now]
  );

  // Masa görünümü: istasyon filtreli sipariş kartları.
  const gorunenSiparisler = useMemo(() => {
    const list = siparisler
      .map((s) => ({ ...s, kalemler: s.kalemler.filter((k) => istasyonGecerli(k.istasyon)) }))
      .filter((s) => s.kalemler.length > 0);
    return siraliFiltre(list);
  }, [siparisler, istasyonGecerli, siraliFiltre]);

  // Sütun görünümü: her istasyon ayrı kolon.
  const sutunlar = useMemo(() => {
    const aktif = ISTASYON_SIRA.filter((st) => istasyonGecerli(st));
    return aktif.map((st) => ({
      istasyon: ISTASYONLAR[st],
      siparisler: siraliFiltre(
        siparisler
          .map((s) => ({ ...s, kalemler: s.kalemler.filter((k) => k.istasyon === st) }))
          .filter((s) => s.kalemler.length > 0)
      ),
    }));
  }, [siparisler, istasyonGecerli, siraliFiltre]);

  const ozet = useMemo(() => {
    const m = new Map<string, { istasyon: string; ad: string; adet: number }>();
    for (const s of siparisler)
      for (const k of s.kalemler) {
        if (k.durum === 'hazir' || !istasyonGecerli(k.istasyon)) continue;
        const key = k.istasyon + '|' + k.urunAd;
        const v = m.get(key) ?? { istasyon: k.istasyon, ad: k.urunAd, adet: 0 };
        v.adet += k.adet;
        m.set(key, v);
      }
    return [...m.values()].sort((a, b) => b.adet - a.adet);
  }, [siparisler, istasyonGecerli]);

  const topluListe = useMemo(() => {
    const m = new Map<
      string,
      { ad: string; istasyon: string; adet: number; cipler: Map<string, number>; masalar: string[] }
    >();
    for (const s of siparisler)
      for (const k of s.kalemler) {
        if (k.durum === 'hazir' || !istasyonGecerli(k.istasyon)) continue;
        const v =
          m.get(k.urunAd) ??
          { ad: k.urunAd, istasyon: k.istasyon, adet: 0, cipler: new Map<string, number>(), masalar: [] };
        v.adet += k.adet;
        v.masalar.push(`${s.masaAd} ·${k.adet}`);
        k.cipler.forEach((c) => v.cipler.set(c, (v.cipler.get(c) ?? 0) + k.adet));
        m.set(k.urunAd, v);
      }
    return [...m.values()].sort((a, b) => b.adet - a.adet);
  }, [siparisler, istasyonGecerli]);

  const acikSayi = siparisler.length;

  const pillCls = (sec: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      sec ? 'border-slate-100 bg-slate-100 text-slate-900' : 'border-slate-700 text-slate-300 hover:border-slate-500'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>{`
        @keyframes mk-pulse { 50% { opacity:.4 } }
        @keyframes mk-new { 50% { box-shadow:0 0 0 1px rgba(96,165,250,.8),0 0 34px -6px rgba(96,165,250,.9) } }
        @keyframes mk-alert { 0%,100% { opacity:1 } 50% { opacity:.55 } }
        .mk-new { animation: mk-new 1.4s ease-in-out 4; }
        .mk-dot { animation: mk-pulse 1.4s infinite; }
        .mk-alert { animation: mk-alert 1s ease-in-out infinite; }
      `}</style>

      {/* ÜST BAR */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/85 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/adisyon"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            ← Salon
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-linear-to-br from-amber-500 to-orange-600 text-xl shadow-lg shadow-orange-900/40">
              🔥
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight">Mutfak Ekranı</h1>
              <div className="text-xs text-slate-500">{acikSayi} açık sipariş</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={buyukCevir}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                buyuk ? 'border-amber-400 text-amber-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
              title="Uzaktan okuma için büyüt"
            >
              🔍 Büyük
            </button>
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                baglanti === 'canli'
                  ? 'border-emerald-500/30 text-emerald-300'
                  : baglanti === 'kopuk'
                    ? 'border-rose-500/40 text-rose-300'
                    : 'border-slate-700 text-slate-400'
              }`}
            >
              <i
                className={`h-2 w-2 rounded-full ${
                  baglanti === 'canli'
                    ? 'mk-dot bg-emerald-400'
                    : baglanti === 'kopuk'
                      ? 'bg-rose-400'
                      : 'bg-slate-500'
                }`}
              />
              {baglanti === 'canli' ? 'Canlı' : baglanti === 'kopuk' ? 'Bağlantı koptu' : 'Otomatik'}
            </span>
          </div>
        </div>

        {/* ARAÇ ÇUBUĞU */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          {!kiosk && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">İstasyon</span>
              <div className="flex flex-wrap gap-1.5">
                {(['all', ...ISTASYON_SIRA] as string[]).map((s) => (
                  <button key={s} onClick={() => setFIstasyon(s)} className={pillCls(fIstasyon === s)}>
                    {s === 'all' ? 'Tümü' : ISTASYONLAR[s].ad}
                  </button>
                ))}
              </div>
              {fIstasyon !== 'all' && (
                <button
                  onClick={() => kioskAyarla(fIstasyon)}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-400 hover:border-amber-500/50 hover:text-amber-300"
                >
                  🔒 Bu istasyona kilitle
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sırala</span>
            <div className="flex gap-1.5">
              {([['bekleme', 'Bekleyen önce'], ['servis', 'Servis yakını']] as const).map(([k, ad]) => (
                <button key={k} onClick={() => setSira(k)} className={pillCls(sira === k)}>
                  {ad}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto inline-flex gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1">
            {([['masa', 'Masa'], ['sutun', 'Sütun'], ['toplu', 'Toplu']] as const).map(([k, ad]) => (
              <button
                key={k}
                onClick={() => setGorunum(k)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  gorunum === k ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ad}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* İPTAL UYARISI */}
      {iptalUyari && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-rose-500/50 bg-rose-500/15 px-5 py-3.5 sm:mx-6">
          <span className="mk-alert text-xl">⚠</span>
          <span className="text-sm font-extrabold text-rose-200">{iptalUyari}</span>
          <button onClick={() => setIptalUyari(null)} className="ml-auto text-xs font-bold text-rose-300/70 hover:text-rose-200">
            kapat
          </button>
        </div>
      )}

      {/* KIOSK BANDI */}
      {kiosk && (
        <div className="mx-4 mt-4 flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-linear-to-r from-amber-500/10 to-orange-600/5 px-5 py-3.5 sm:mx-6">
          <span className="text-2xl">{ISTASYONLAR[kiosk]?.ikon}</span>
          <div>
            <div className="text-lg font-extrabold">{ISTASYONLAR[kiosk]?.ad.toUpperCase()} İSTASYONU</div>
            <div className="text-xs text-slate-400">Bu ekran yalnızca bu istasyonun işlerini gösterir.</div>
          </div>
          <button
            onClick={() => kioskAyarla(null)}
            className="ml-auto rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold hover:bg-slate-700"
          >
            Kilidi aç
          </button>
        </div>
      )}

      {/* BÜYÜTÜLEBİLİR İÇERİK (özet + tahta) */}
      <div style={buyuk ? { zoom: 1.18 } : undefined}>
        {/* ÖZET ŞERİDİ */}
        <div className="no-scrollbar flex items-center gap-5 overflow-x-auto px-4 pt-5 sm:px-6">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">Hazırlanacak</span>
          {ozet.length === 0 ? (
            <span className="text-sm text-slate-500">Bekleyen ürün yok</span>
          ) : (
            ozet.map((o, i) => (
              <div key={o.istasyon + o.ad} className="flex shrink-0 items-center gap-2.5">
                {i > 0 && <span className="h-6 w-px bg-slate-800" />}
                <span className={`h-1.5 w-1.5 rounded-full ${IST_RENK[o.istasyon]?.nokta ?? 'bg-slate-400'}`} />
                <span className="text-xl font-extrabold tabular-nums">{o.adet}</span>
                <span className="text-[13px] text-slate-400">{o.ad}</span>
              </div>
            ))
          )}
        </div>

        {/* TAHTA */}
        <main className="px-4 pb-20 pt-4 sm:px-6">
          {gorunum === 'masa' &&
            (gorunenSiparisler.length === 0 ? (
              <Bos />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {gorunenSiparisler.map((s) => (
                  <SiparisKart
                    key={s.adisyonId}
                    s={s}
                    now={now}
                    yeni={yeniSet.has(s.adisyonId)}
                    onKalem={kalemCevir}
                    onHazir={siparisHazir}
                    onAlindi={siparisAlindi}
                  />
                ))}
              </div>
            ))}

          {gorunum === 'sutun' &&
            (sutunlar.every((c) => c.siparisler.length === 0) ? (
              <Bos />
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {sutunlar.map((c) => (
                  <div key={c.istasyon.key} className="flex w-80 shrink-0 flex-col gap-3">
                    <div className="sticky top-0 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 backdrop-blur">
                      <span className="text-lg">{c.istasyon.ikon}</span>
                      <span className="font-extrabold">{c.istasyon.ad}</span>
                      <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-400">
                        {c.siparisler.length}
                      </span>
                    </div>
                    {c.siparisler.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-xs text-slate-600">
                        boş
                      </div>
                    ) : (
                      c.siparisler.map((s) => (
                        <SiparisKart
                          key={s.adisyonId}
                          s={s}
                          now={now}
                          yeni={yeniSet.has(s.adisyonId)}
                          onKalem={kalemCevir}
                          onHazir={siparisHazir}
                          onAlindi={siparisAlindi}
                        />
                      ))
                    )}
                  </div>
                ))}
              </div>
            ))}

          {gorunum === 'toplu' &&
            (topluListe.length === 0 ? (
              <Bos />
            ) : (
              <div>
                <p className="mb-4 max-w-3xl text-[13px] text-slate-500">
                  Usta görünümü — aynı ürün tüm masalardan toplanır, tek seferde hazırlanır.
                </p>
                <div className="flex max-w-3xl flex-col gap-3">
                  {topluListe.map((r) => (
                    <div
                      key={r.ad}
                      className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5"
                    >
                      <div className={`w-16 text-center text-3xl font-extrabold tabular-nums ${IST_RENK[r.istasyon]?.metin}`}>
                        {r.adet}
                      </div>
                      <div className="min-w-40 flex-1">
                        <div className="text-lg font-extrabold">{r.ad}</div>
                        {r.cipler.size > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {[...r.cipler.entries()].map(([t, n]) => (
                              <span key={t} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${cipRenk(t)}`}>
                                {n}× {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.masalar.map((m, i) => (
                            <span key={i} className="rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </main>
      </div>

      {/* BİLDİRİM (toast) */}
      <div
        className={`pointer-events-none fixed bottom-7 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3.5 text-sm font-semibold shadow-2xl transition-all ${
          bildirim ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-base">🔔</span>
        {bildirim}
      </div>
    </div>
  );
}

function Bos() {
  return <div className="py-24 text-center text-slate-500">Bu görünümde sipariş yok 🍽️</div>;
}

function SiparisKart({
  s,
  now,
  yeni,
  onKalem,
  onHazir,
  onAlindi,
}: {
  s: MutfakSiparis;
  now: number;
  yeni: boolean;
  onKalem: (s: MutfakSiparis, k: MutfakKalem) => void;
  onHazir: (s: MutfakSiparis) => void;
  onAlindi: (s: MutfakSiparis) => void;
}) {
  const dk = dkHesap(now, s.acilis);
  const hepHazir = s.kalemler.every((k) => k.durum === 'hazir');
  const durum = hepHazir ? 'hazir' : dk >= SERVIS_DK ? 'late' : dk >= UYARI_DK ? 'warn' : 'ok';
  const normal = s.kalemler.filter((k) => !k.ek);
  const ekler = s.kalemler.filter((k) => k.ek);

  // Soğuma sayacı: en son hazır olan kalemden bu yana geçen süre.
  const hazirZamanlar = s.kalemler.map((k) => k.hazirZaman).filter((z): z is string => !!z);
  const hazirDk =
    hepHazir && hazirZamanlar.length > 0
      ? dkHesap(now, hazirZamanlar.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)))
      : null;
  const soguyor = hazirDk !== null && hazirDk >= HAZIR_ESIK_DK;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-slate-900 ${
        yeni
          ? 'mk-new border-blue-400/60'
          : durum === 'hazir'
            ? soguyor
              ? 'border-rose-500/50'
              : 'border-emerald-500/40'
            : durum === 'late'
              ? 'border-rose-500/40'
              : 'border-slate-800'
      }`}
    >
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        <span className="text-lg font-extrabold">{s.masaAd}</span>
        {s.tip === 'gelal' && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">PAKET</span>
        )}
        {yeni && (
          <span className="rounded bg-blue-400 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-slate-950">YENİ</span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${
            durum === 'late'
              ? 'bg-rose-500/10 text-rose-300'
              : durum === 'warn'
                ? 'text-amber-300'
                : durum === 'hazir'
                  ? 'text-emerald-300'
                  : 'text-slate-400'
          }`}
        >
          <i
            className={`h-1.5 w-1.5 rounded-full ${
              durum === 'late'
                ? 'mk-dot bg-rose-400'
                : durum === 'warn'
                  ? 'bg-amber-400'
                  : durum === 'hazir'
                    ? 'bg-emerald-400'
                    : 'bg-slate-500'
            }`}
          />
          {dk} dk
        </span>
      </div>

      <div className="px-5">
        {normal.map((k) => (
          <KalemSatiri key={k.id} k={k} onTik={() => onKalem(s, k)} />
        ))}
        {ekler.length > 0 && (
          <>
            <div className="mt-3 border-t border-dashed border-slate-700 pt-3 text-[10.5px] font-extrabold uppercase tracking-wide text-amber-300">
              ＋ Ek sipariş
            </div>
            {ekler.map((k) => (
              <KalemSatiri key={k.id} k={k} onTik={() => onKalem(s, k)} ek />
            ))}
          </>
        )}
      </div>

      {hepHazir ? (
        <div className="mt-4 flex items-center gap-3 px-5 pb-5 pt-1">
          <span className={`flex flex-1 items-center gap-2 text-[13px] font-bold ${soguyor ? 'text-rose-300' : 'text-emerald-300'}`}>
            <i className={`mk-dot h-2 w-2 rounded-full ${soguyor ? 'bg-rose-400' : 'bg-emerald-400'}`} />
            {soguyor ? `Soğuyor · ${hazirDk} dk` : hazirDk !== null ? `Hazır · ${hazirDk} dk` : 'Hazır · garson bekliyor'}
          </span>
          <button
            onClick={() => onAlindi(s)}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-emerald-950 hover:brightness-105"
          >
            Alındı
          </button>
        </div>
      ) : (
        <div className="mt-4 px-5 pb-5 pt-1">
          <button
            onClick={() => onHazir(s)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-100 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            ✓ Hazır · garsona bildir
          </button>
        </div>
      )}
    </div>
  );
}

function KalemSatiri({ k, onTik, ek }: { k: MutfakKalem; onTik: () => void; ek?: boolean }) {
  const hazir = k.durum === 'hazir';
  return (
    <button
      onClick={onTik}
      className={`flex w-full items-start gap-3 py-3.5 text-left ${ek ? '' : 'border-t border-slate-800 first:border-t-0'} ${
        hazir ? 'opacity-40' : ''
      }`}
    >
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 text-sm ${
          hazir ? 'border-emerald-400 bg-emerald-400 text-emerald-950' : 'border-slate-600 text-transparent'
        }`}
      >
        ✓
      </span>
      <span className="min-w-7 text-xl font-extrabold tabular-nums">{k.adet}×</span>
      <span className="min-w-0 flex-1">
        <span className={`text-[15px] font-bold leading-tight ${hazir ? 'line-through' : ''}`}>
          {k.urunAd}
          {k.yarim && (
            <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-[11px] font-bold text-amber-300">
              YARIM
            </span>
          )}
          {k.ikram && (
            <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 align-middle text-[11px] font-bold text-emerald-300">
              İKRAM
            </span>
          )}
        </span>
        {k.cipler.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {k.cipler.map((c) => (
              <span key={c} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${cipRenk(c)}`}>
                {c}
              </span>
            ))}
          </span>
        )}
        {k.ozelNot && (
          <span className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[12px] font-extrabold text-rose-200">
            ⚠ {k.ozelNot}
          </span>
        )}
      </span>
    </button>
  );
}
