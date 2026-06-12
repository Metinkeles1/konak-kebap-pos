'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import type { BolgeOzet, GelalOzet, MasaOzet, MasaTip, SalonOzet } from '@/lib/types';
import { MasaKart } from '@/components/MasaKart';
import { SabitEleman } from '@/components/SabitEleman';
import { Yukleniyor } from '@/components/Yukleniyor';
import {
  HIZA_ESIK,
  hizalaMerkez,
  masaBoyut,
  odaBoyut,
  sekilBilgi,
  yonCevir,
} from '@/lib/kroki';
import { gecenSure, para } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { snapshotOku, snapshotYaz, vurguOku } from '@/lib/salon-snapshot';
import {
  OLAY_ADISYON_KAPANDI,
  OLAY_MASA,
  pusherClient,
  SALON_KANAL,
} from '@/lib/pusher-client';

type MasaPatch = Partial<Pick<MasaOzet, 'x' | 'y' | 'sekil' | 'en' | 'ad' | 'kapasite'>>;
type Onay =
  | { tip: 'tasi'; src: MasaOzet; tgt: MasaOzet }
  | { tip: 'birlestir'; src: MasaOzet; tgt: MasaOzet }
  | { tip: 'ode'; masa: MasaOzet }
  | { tip: 'sil'; masa: MasaOzet };
type HedefMod = { tip: 'tasi' | 'birlestir'; src: MasaOzet };
type Menu = { masa: MasaOzet; x: number; y: number };
// Görünüm: bir kat'ı bütün (tüm bölgeler yan yana) ya da tek bölge göster.
type Gorunum = { tip: 'kat'; kat: string } | { tip: 'bolge'; id: number };

const SEKILLER: { key: MasaOzet['sekil']; label: string }[] = [
  { key: 'kare', label: '◻ Kare' },
  { key: 'yuvarlak', label: '◯ Yuvarlak' },
  { key: 'dikdortgen', label: '▭ Dikdörtgen' },
];

// Düzenle modunda eklenebilen masa + sabit elemanlar.
const EKLENEBILIR: { tip: MasaTip; label: string }[] = [
  { tip: 'masa', label: '🍽 Masa' },
  { tip: 'kasa', label: '💳 Kasa' },
  { tip: 'tezgah', label: '▭ Tezgah' },
  { tip: 'ocak', label: '🔥 Ocak' },
  { tip: 'merdiven', label: '🪜 Merdiven' },
  { tip: 'kapi', label: '🚪 Kapı' },
  { tip: 'gecit', label: '↔ Geçit' },
];

const BOS_SALON: SalonOzet = {
  bolgeler: [],
  gelaller: [],
  ozet: {
    bos: 0,
    dolu: 0,
    odemeBekleyen: 0,
    acikHesapToplam: 0,
    gunlukCiro: 0,
    gunIptal: 0,
    gunIkram: 0,
    gunIndirim: 0,
  },
};

// İlk açılışta seçili görünüm: ilk kat çok bölgeli → bütün; değilse tek bölge.
function varsayilanGorunum(d: SalonOzet): Gorunum {
  const b0 = [...d.bolgeler].sort((a, b) => a.sira - b.sira)[0];
  if (!b0) return { tip: 'kat', kat: 'Alt Kat' };
  const kacBolge = d.bolgeler.filter((b) => b.kat === b0.kat).length;
  return kacBolge > 1 ? { tip: 'kat', kat: b0.kat } : { tip: 'bolge', id: b0.id };
}

export function SalonClient({ initial }: { initial: SalonOzet | null }) {
  const baslangic = initial ?? BOS_SALON;
  const [data, setData] = useState<SalonOzet>(baslangic);
  // Gerçek veri (SSR / snapshot / fetch) eline geçti mi — yoksa loader göster.
  const [hazir, setHazir] = useState(initial != null);
  // Arka planda taze veri çekiliyor mu — snapshot eski tutarları gösterirken
  // "donmuş gibi" hissini önlemek için üstte ince çubuk gösteririz.
  const [yenileniyor, setYenileniyor] = useState(false);
  // Bu mount'ta en az bir kez taze veri geldi mi — çubuk yalnız dönüş sonrası
  // (snapshot↔taze arası) görünsün; sonraki canlı yenilemelerde sessiz kalsın.
  const [taze, setTaze] = useState(false);
  const varsayilanKuruldu = useRef(initial != null);
  const [gorunum, setGorunum] = useState<Gorunum>(() => varsayilanGorunum(baslangic));
  const [gelalModu, setGelalModu] = useState(false); // Gel-Al sekmesi aktif mi
  const [gelalBekleyen, setGelalBekleyen] = useState(false); // "Yeni Gel-Al" oluşturuluyor
  const [duzenle, setDuzenle] = useState(false);
  const [vurgu, setVurgu] = useState<Set<number>>(new Set());
  const [bekleyenId, setBekleyenId] = useState<number | null>(null);
  const [seciliMasaId, setSeciliMasaId] = useState<number | null>(null);
  const [kilavuz, setKilavuz] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [onay, setOnay] = useState<Onay | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [hedefMod, setHedefMod] = useState<HedefMod | null>(null);
  const [ekleAcik, setEkleAcik] = useState(false);
  const [olcek, setOlcek] = useState(1);
  const surukleRef = useRef(false);
  const kapsayiciRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const now = useNow(20000);

  const refetch = useCallback(async () => {
    setYenileniyor(true);
    try {
      const res = await fetch('/api/salon', { cache: 'no-store' });
      if (res.ok) {
        setData(await res.json());
        setHazir(true);
        setTaze(true);
      }
    } catch {
      /* sessiz geç */
    } finally {
      setYenileniyor(false);
    }
  }, []);

  // Bir masayı kısa süre parlat — Pusher güncellemesi veya salona dönüş vurgusu.
  const vurgula = useCallback((mid: number) => {
    setVurgu((s) => new Set(s).add(mid));
    setTimeout(
      () =>
        setVurgu((s) => {
          const n = new Set(s);
          n.delete(mid);
          return n;
        }),
      1200
    );
  }, []);

  // Mount: önce son anlık görüntüyü (varsa) boya → ekran ANINDA dolar; sonra
  // arkada taze veriyi çek. SSR beklemediğimiz için masa↔salon geçişi anlık.
  // sessionStorage yalnız tarayıcıda var; bu yüzden okuma mount sonrası (effect)
  // yapılır — useState init'te yapsaydık SSR loader'ı ile hidrasyon uyumsuzluğu
  // olurdu. Tek seferlik bilinçli senkron; cascading-render uyarısı kapalı.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!initial) {
      const snap = snapshotOku();
      if (snap) {
        setData(snap);
        setHazir(true);
      }
    }
    // Masa ekranından güncellenmiş bir masa ile döndüysek o masayı parlat.
    const v = vurguOku();
    if (v != null) vurgula(v);
    refetch();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // İlk gerçek veri geldiğinde (boş başladıysak) varsayılan görünümü kur.
  useEffect(() => {
    if (!varsayilanKuruldu.current && data.bolgeler.length > 0) {
      setGorunum(varsayilanGorunum(data));
      varsayilanKuruldu.current = true;
    }
  }, [data]);

  // Anlık görüntüyü sakla — bir sonraki dönüşte anında göstermek için.
  useEffect(() => {
    if (hazir && data.bolgeler.length > 0) snapshotYaz(data);
  }, [data, hazir]);

  // Yeni gel-al (paket) adisyonu aç → doğrudan sipariş ekranına geç.
  const yeniGelal = useCallback(async () => {
    if (gelalBekleyen) return;
    setGelalBekleyen(true);
    try {
      const res = await fetch('/api/adisyon/gelal', { method: 'POST' });
      if (!res.ok) return;
      const { adisyonId } = await res.json();
      router.push(`/adisyon/gelal/${adisyonId}`);
    } catch {
      /* yut */
    } finally {
      setGelalBekleyen(false);
    }
  }, [router, gelalBekleyen]);

  // Anlık senkron (Pusher kuruluysa)
  useEffect(() => {
    const pc = pusherClient;
    if (!pc) return;
    const ch = pc.subscribe(SALON_KANAL);
    const onMasa = (p: { masaId?: number }) => {
      if (typeof p?.masaId === 'number') vurgula(p.masaId);
      refetch();
    };
    ch.bind(OLAY_MASA, onMasa);
    ch.bind(OLAY_ADISYON_KAPANDI, onMasa);
    return () => {
      ch.unbind_all();
      pc.unsubscribe(SALON_KANAL);
    };
  }, [refetch, vurgula]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  // Katlar (sıralı, benzersiz) — sekme grupları.
  const katlar = useMemo(() => {
    const sirali = [...data.bolgeler].sort((a, b) => a.sira - b.sira);
    return [...new Set(sirali.map((b) => b.kat))];
  }, [data.bolgeler]);

  // Sekme listesi: çok bölgeli kat için ÖNCE "🗺 <kat>" (bütün) sekmesi, sonra
  // o kat'ın her bölgesi ayrı; tek bölgeli kat için sadece bölge sekmesi.
  const sekmeler = useMemo(() => {
    const out: {
      key: string;
      label: string;
      butun?: boolean;
      gorunum: Gorunum;
    }[] = [];
    for (const kat of katlar) {
      const bols = data.bolgeler
        .filter((b) => b.kat === kat)
        .sort((a, b) => a.sira - b.sira);
      if (bols.length > 1) {
        out.push({ key: `kat:${kat}`, label: `🗺 ${kat}`, butun: true, gorunum: { tip: 'kat', kat } });
        for (const b of bols)
          out.push({ key: `bolge:${b.id}`, label: b.ad, gorunum: { tip: 'bolge', id: b.id } });
      } else if (bols[0]) {
        out.push({ key: `bolge:${bols[0].id}`, label: bols[0].ad, gorunum: { tip: 'bolge', id: bols[0].id } });
      }
    }
    return out;
  }, [katlar, data.bolgeler]);

  const sekmeAktif = useCallback(
    (g: Gorunum) =>
      g.tip === 'kat'
        ? gorunum.tip === 'kat' && gorunum.kat === g.kat
        : gorunum.tip === 'bolge' && gorunum.id === g.id,
    [gorunum]
  );

  // Görünümdeki bölgeler: bütün → kat'ın tüm bölgeleri; tek → o bölge.
  const gosterilenBolgeler = useMemo(() => {
    if (gorunum.tip === 'kat')
      return data.bolgeler
        .filter((b) => b.kat === gorunum.kat)
        .sort((a, b) => a.sira - b.sira);
    const b = data.bolgeler.find((bb) => bb.id === gorunum.id);
    return b ? [b] : [];
  }, [gorunum, data.bolgeler]);

  // Oda yerleşimi. Her oda çerçevesi İÇERİĞİNİ sarar (boş kenar payı kalmaz).
  // Tek bölge: tek çerçeve, sol-üstte (ekranı doldurur).
  // Bütün: dengeli paket — en büyük oda solda ve dikeyde ortalı, kalanlar sağda
  // alt alta; kısa kolon dikeyde ortalanır → büyük oda "güzel ortalı" durur.
  const yerlesim = useMemo(() => {
    type Yer = { bolge: BolgeOzet; x: number; y: number; w: number; h: number };
    const sonuc: Yer[] = [];
    const olc = (b: BolgeOzet) => odaBoyut({ odaW: 0, odaH: 0 }, b.masalar);

    if (gorunum.tip === 'bolge') {
      const b = gosterilenBolgeler[0];
      if (b) {
        const s = olc(b);
        sonuc.push({ bolge: b, x: 0, y: 0, w: s.w, h: s.h });
      }
      return sonuc;
    }

    const odalar = gosterilenBolgeler.map((b) => ({ bolge: b, ...olc(b) }));
    if (odalar.length === 0) return sonuc;
    if (odalar.length === 1) {
      const o = odalar[0];
      sonuc.push({ bolge: o.bolge, x: 0, y: 0, w: o.w, h: o.h });
      return sonuc;
    }

    const GAP = 48;
    const alanaGore = [...odalar].sort((a, b) => b.w * b.h - a.w * a.h);
    const sol = alanaGore[0];
    const sag = alanaGore.slice(1).sort((a, b) => a.bolge.sira - b.bolge.sira);

    const solH = sol.h;
    const sagH = sag.reduce((t, o) => t + o.h, 0) + GAP * (sag.length - 1);
    const toplamH = Math.max(solH, sagH);

    sonuc.push({
      bolge: sol.bolge,
      x: 0,
      y: Math.round((toplamH - solH) / 2),
      w: sol.w,
      h: sol.h,
    });

    const sagX = sol.w + GAP;
    let yy = Math.round((toplamH - sagH) / 2);
    for (const o of sag) {
      sonuc.push({ bolge: o.bolge, x: sagX, y: yy, w: o.w, h: o.h });
      yy += o.h + GAP;
    }
    return sonuc;
  }, [gorunum, gosterilenBolgeler]);

  // Seçim / özet / mobil liste için görünümdeki tüm masalar (düz liste).
  const masalar = useMemo(
    () => gosterilenBolgeler.flatMap((b) => b.masalar),
    [gosterilenBolgeler]
  );
  const seciliEleman = masalar.find((m) => m.id === seciliMasaId) ?? null;

  // "Ekle": seçili eleman varsa onun bölgesine, yoksa görünümün ilk bölgesine.
  const ekleHedefBolge = useMemo(() => {
    if (seciliMasaId != null) {
      const b = gosterilenBolgeler.find((bb) =>
        bb.masalar.some((m) => m.id === seciliMasaId)
      );
      if (b) return b;
    }
    return gosterilenBolgeler[0];
  }, [seciliMasaId, gosterilenBolgeler]);
  const seciliMasa = seciliEleman?.tip === 'masa' ? seciliEleman : null;
  const seciliBilgi = sekilBilgi(seciliMasa?.sekil ?? 'kare');

  const masaTikla = useCallback(
    (m: MasaOzet) => {
      if (m.tip !== 'masa') return;
      // Boş masa burada açılmaz; adisyon ilk ürün eklenince oluşur (detayda
      // ensureAdisyon). Böylece "ürün eklemeden masa dolu görünmesi" engellenir.
      setBekleyenId(m.id);
      router.push(`/adisyon/masa/${m.id}`);
    },
    [router]
  );

  // Tıkla-aç ama sürükleme bittiyse açma (drag-merge ile çakışmasın).
  // Hedef seçme modunda (menüden "Taşı/Birleştir") tıklanan masa hedef olur.
  const acMasa = useCallback(
    (m: MasaOzet) => {
      if (surukleRef.current) return;
      if (hedefMod) {
        const src = hedefMod.src;
        if (m.id !== src.id && m.tip === 'masa') {
          if (hedefMod.tip === 'tasi' && m.durum === 'bos') {
            setOnay({ tip: 'tasi', src, tgt: m });
          } else if (hedefMod.tip === 'birlestir' && m.adisyon) {
            setOnay({ tip: 'birlestir', src, tgt: m });
          }
        }
        setHedefMod(null);
        return;
      }
      masaTikla(m);
    },
    [masaTikla, hedefMod]
  );

  // Sağ-tık / uzun-bas → masa için hızlı aksiyon menüsü (sayfa değiştirmeden).
  const masaMenu = useCallback((m: MasaOzet, e: ReactMouseEvent) => {
    if (m.tip !== 'masa') return;
    e.preventDefault();
    setMenu({ masa: m, x: e.clientX, y: e.clientY });
  }, []);

  const guncelleMasa = useCallback((id: number, patch: MasaPatch) => {
    setData((d) => ({
      ...d,
      bolgeler: d.bolgeler.map((b) => ({
        ...b,
        masalar: b.masalar.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),
    }));
    fetch('/api/masa/konum', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    }).catch(() => {});
  }, []);

  // Düzenle modu: bölgeye yeni masa/eleman ekle (eklenince seç → konumlandır).
  const ekle = useCallback(
    async (tip: MasaTip) => {
      if (!ekleHedefBolge) return;
      setEkleAcik(false);
      const offset = (ekleHedefBolge.masalar.length % 6) * 28;
      try {
        const res = await fetch('/api/masa/ekle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bolgeId: ekleHedefBolge.id,
            tip,
            x: 40 + offset,
            y: 40 + offset,
          }),
        });
        if (!res.ok) return;
        const { id } = await res.json();
        await refetch();
        setSeciliMasaId(id);
      } catch {
        /* yut */
      }
    },
    [ekleHedefBolge, refetch]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Bir masanın bağlı olduğu oda yerleşimini bul (hizalama hep aynı oda içinde).
  const masaOda = useCallback(
    (id: number) => yerlesim.find((o) => o.bolge.masalar.some((m) => m.id === id)),
    [yerlesim]
  );

  // ---- Düzenle modu: sürükle = taşı (snap + canlı kılavuz) ----
  // Hizalama yalnız aynı oda içindeki komşulara; kılavuz çizgisi kat krokisi
  // (canvas) koordinatında çizilir → oda offset + masanın yerel merkezi.
  const onDuzenleMove = useCallback(
    (e: DragMoveEvent) => {
      const id = Number(e.active.id);
      const oda = masaOda(id);
      const m = oda?.bolge.masalar.find((mm) => mm.id === id);
      if (!oda || !m) return;
      const b = masaBoyut(m);
      const cx = m.x + e.delta.x / olcek + b.w / 2;
      const cy = m.y + e.delta.y / olcek + b.h / 2;
      let gx: number | null = null;
      let gy: number | null = null;
      for (const mm of oda.bolge.masalar) {
        if (mm.id === id) continue;
        const ob = masaBoyut(mm);
        const ocx = mm.x + ob.w / 2;
        const ocy = mm.y + ob.h / 2;
        if (gx === null && Math.abs(cx - ocx) <= HIZA_ESIK) gx = ocx;
        if (gy === null && Math.abs(cy - ocy) <= HIZA_ESIK) gy = ocy;
      }
      setKilavuz({
        x: gx === null ? null : oda.x + gx,
        y: gy === null ? null : oda.y + gy,
      });
    },
    [masaOda, olcek]
  );

  const onDuzenleEnd = useCallback(
    (e: DragEndEvent) => {
      setKilavuz({ x: null, y: null });
      const id = Number(e.active.id);
      const oda = masaOda(id);
      const m = oda?.bolge.masalar.find((mm) => mm.id === id);
      if (!oda || !m) return;
      const b = masaBoyut(m);
      const digerleri = oda.bolge.masalar
        .filter((mm) => mm.id !== id)
        .map((mm) => ({ x: mm.x, y: mm.y, ...masaBoyut(mm) }));
      const { x, y } = hizalaMerkez(
        m.x + e.delta.x / olcek,
        m.y + e.delta.y / olcek,
        b,
        digerleri
      );
      setSeciliMasaId(id);
      guncelleMasa(id, { x, y });
    },
    [masaOda, guncelleMasa, olcek]
  );

  // ---- Normal mod: bir masayı diğerine sürükle = taşı/birleştir ----
  const onSalonStart = useCallback(() => {
    surukleRef.current = true;
  }, []);

  const onSalonEnd = useCallback((e: DragEndEvent) => {
    setTimeout(() => {
      surukleRef.current = false;
    }, 0);
    const src = e.active?.data?.current?.masa as MasaOzet | undefined;
    const tgt = e.over?.data?.current?.masa as MasaOzet | undefined;
    if (!src || !tgt || src.id === tgt.id) return;
    if (src.tip !== 'masa' || tgt.tip !== 'masa') return;
    if (!src.adisyon) return; // boş masadan taşınacak/birleşecek şey yok
    if (tgt.durum === 'bos') setOnay({ tip: 'tasi', src, tgt });
    else if (tgt.adisyon) setOnay({ tip: 'birlestir', src, tgt });
  }, []);

  const onayUygula = useCallback(async () => {
    if (!onay) return;
    const o = onay;
    setOnay(null);
    try {
      if (o.tip === 'tasi' && o.src.adisyon) {
        await fetch('/api/masa/tasi', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adisyonId: o.src.adisyon.id, hedefMasaId: o.tgt.id }),
        });
      } else if (o.tip === 'birlestir' && o.src.adisyon && o.tgt.adisyon) {
        await fetch('/api/masa/birlestir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kaynakAdisyonId: o.src.adisyon.id,
            hedefAdisyonId: o.tgt.adisyon.id,
          }),
        });
      } else if (o.tip === 'ode' && o.masa.adisyon) {
        await fetch('/api/odeme/tam', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adisyonId: o.masa.adisyon.id, arac: 'nakit' }),
        });
      } else if (o.tip === 'sil') {
        const res = await fetch('/api/masa/sil', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: o.masa.id }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          alert(j?.error ?? 'Silinemedi.');
        } else if (seciliMasaId === o.masa.id) {
          setSeciliMasaId(null);
        }
      }
    } catch {
      /* yut */
    }
    refetch();
  }, [onay, refetch, seciliMasaId]);

  // Kat krokisinin toplam ölçüsü = tüm oda çerçevelerinin sınır kutusu.
  const { w, h } = useMemo(() => {
    let mw = 0;
    let mh = 0;
    for (const o of yerlesim) {
      mw = Math.max(mw, o.x + o.w);
      mh = Math.max(mh, o.y + o.h);
    }
    return { w: mw + 48, h: Math.max(mh + 56, 380) };
  }, [yerlesim]);

  // Krokiyi kapsayıcı alana otomatik sığdır (zoom). Boş alanı doldurur; büyük
  // ekranda büyür, küçük ekranda küçülür. Ölçek sürükleme matematiğine de yansır.
  useEffect(() => {
    const el = kapsayiciRef.current;
    if (!el) return;
    const hesapla = () => {
      const cw = el.clientWidth - 24; // p-3 payı
      const ch = el.clientHeight - 24;
      if (cw <= 0 || ch <= 0) return;
      const k = Math.min(cw / w, ch / h);
      setOlcek(Math.max(0.45, Math.min(k, 2.4)));
    };
    hesapla();
    const ro = new ResizeObserver(hesapla);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  const toggleDuzenle = () => {
    setDuzenle((v) => !v);
    setSeciliMasaId(null);
  };

  const o = data.ozet;

  // Henüz hiçbir veri yok (oturumda ilk açılış) → markalı loader.
  if (!hazir) return <Yukleniyor mesaj="Salon yükleniyor…" />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Arka planda tazelenirken üstte kayan ince çubuk — snapshot eski tutar
          gösterirken "donmuş" hissini önler (mobil + masaüstü ortak). */}
      {yenileniyor && !taze && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-amber-400/15">
          <div className="animate-yukleme-cubuk h-full w-1/4 rounded-full bg-amber-400" />
        </div>
      )}
      {/* Üst bar — mobil (garson) sade; md+ (kasa/tablet) tüm yönetim aksiyonları */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-black tracking-tight text-amber-400 sm:text-lg">
            KONAK KEBAP
          </span>
          <span className="hidden text-sm font-medium text-slate-400 sm:inline">
            · Salon
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Geçmiş / Gün Sonu / Krokiyi Düzenle: yönetim — yalnız md+ (kasa) */}
          <Link
            href="/adisyon/gecmis"
            className="hidden rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 md:inline-flex"
          >
            🧾 Geçmiş
          </Link>
          <Link
            href="/adisyon/rapor"
            className="hidden rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 md:inline-flex"
          >
            📊 Gün Sonu
          </Link>
          <button
            onClick={refetch}
            aria-label="Yenile"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            <span className="md:hidden">⟳</span>
            <span className="hidden md:inline">Yenile</span>
          </button>
          <button
            onClick={toggleDuzenle}
            className={`hidden rounded-lg px-3 py-1.5 text-sm font-medium transition-colors md:inline-flex ${
              duzenle
                ? 'bg-sky-400 text-slate-900'
                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {duzenle ? '✓ Bitir' : '✎ Krokiyi Düzenle'}
          </button>
        </div>
      </header>

      {/* Özet bandı — mobilde sadece operasyonel sayım (garson); para/yönetim md+ */}
      <div className="no-scrollbar flex items-center gap-x-4 gap-y-1 overflow-x-auto border-b border-slate-800 bg-slate-900/30 px-3 py-2 text-sm md:flex-wrap md:gap-x-5 md:px-4">
        <span className="shrink-0 whitespace-nowrap text-emerald-400">
          🟢 Boş {o.bos}
        </span>
        <span className="shrink-0 whitespace-nowrap text-rose-300">
          🔴 Dolu {o.dolu}
        </span>
        <span className="shrink-0 whitespace-nowrap text-amber-300">
          ⏳ Ödeme bekleyen {o.odemeBekleyen}
        </span>
        {(o.gunIptal > 0 || o.gunIkram > 0 || o.gunIndirim > 0) && (
          <span
            className="hidden shrink-0 whitespace-nowrap text-slate-500 md:inline"
            title="Bugün: iptal · ikram · indirim"
          >
            İptal <b className="tabular-nums text-rose-300/90">{para(o.gunIptal)}</b>
            {' · '}İkram{' '}
            <b className="tabular-nums text-emerald-300/80">{para(o.gunIkram)}</b>
            {' · '}İndirim{' '}
            <b className="tabular-nums text-rose-300/90">{para(o.gunIndirim)}</b>
          </span>
        )}
        <span className="hidden shrink-0 whitespace-nowrap text-slate-400 md:ml-auto md:inline">
          Açık hesap:{' '}
          <b className="tabular-nums text-slate-100">{para(o.acikHesapToplam)}</b>
        </span>
        <span className="hidden shrink-0 whitespace-nowrap text-slate-400 md:inline">
          Bugünkü ciro:{' '}
          <b className="tabular-nums text-emerald-300">{para(o.gunlukCiro)}</b>
        </span>
      </div>

      {/* Sekmeler: her kat için "🗺 <kat>" (bütün) + bölgeler ayrı + Gel-Al */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
        {sekmeler.map((s) => {
          const aktif = !gelalModu && sekmeAktif(s.gorunum);
          return (
            <button
              key={s.key}
              onClick={() => {
                setGorunum(s.gorunum);
                setGelalModu(false);
                setSeciliMasaId(null);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                aktif
                  ? s.butun
                    ? 'bg-sky-400 text-slate-900'
                    : 'bg-slate-100 text-slate-900'
                  : s.butun
                    ? 'text-sky-300 hover:bg-sky-400/10'
                    : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {s.label}
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-700" />
        {/* Gel-Al (paket) — masaya bağlı olmayan siparişler */}
        <button
          onClick={() => {
            setGelalModu(true);
            setSeciliMasaId(null);
          }}
          className={`ml-1 flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            gelalModu
              ? 'bg-amber-400 text-slate-900'
              : 'text-amber-300 hover:bg-amber-400/10'
          }`}
        >
          📦 Gel-Al
          {data.gelaller.length > 0 && (
            <span
              className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                gelalModu ? 'bg-slate-900/20 text-slate-900' : 'bg-amber-400/20'
              }`}
            >
              {data.gelaller.length}
            </span>
          )}
        </button>
      </div>

      {/* Hedef seçme bandı (menüden Taşı/Birleştir) */}
      {hedefMod && (
        <div className="flex items-center justify-between gap-3 border-b border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          <span>
            <b>{hedefMod.src.ad}</b> →{' '}
            {hedefMod.tip === 'tasi'
              ? 'taşınacak BOŞ masayı seç'
              : 'birleştirilecek DOLU masayı seç'}
          </span>
          <button
            onClick={() => setHedefMod(null)}
            className="rounded-lg border border-emerald-300/40 px-3 py-1 text-xs font-medium hover:bg-emerald-500/20"
          >
            Vazgeç
          </button>
        </div>
      )}

      {gelalModu ? (
        <GelalPanel
          gelaller={data.gelaller}
          now={now}
          bekleyen={gelalBekleyen}
          onYeni={yeniGelal}
          onAc={(id) => router.push(`/adisyon/gelal/${id}`)}
        />
      ) : data.bolgeler.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
          Masa bulunamadı. Veritabanını hazırla:{' '}
          <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5">
            npm run db:push &amp;&amp; npm run db:seed
          </code>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {/* Telefon: bölgeye göre gruplanmış liste (tek/iki kolon) */}
          <div className="pb-safe h-full min-h-0 overflow-auto p-4 md:hidden">
            {gosterilenBolgeler.map((b) => (
              <div key={b.id} className="mb-5 last:mb-0">
                {gosterilenBolgeler.length > 1 && (
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/60">
                    {b.ad}
                    <span className="text-slate-500">· {b.masalar.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {b.masalar.map((m) =>
                    m.tip !== 'masa' ? (
                      <div key={m.id} className="h-26">
                        <SabitEleman masa={m} />
                      </div>
                    ) : (
                      <button
                        key={m.id}
                        onClick={() => masaTikla(m)}
                        className="h-26 text-left"
                      >
                        <MasaKart
                          masa={m}
                          now={now}
                          vurgulu={vurgu.has(m.id)}
                          bekleyen={bekleyenId === m.id}
                        />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Tablet/Kasa: tek-ekran blueprint — kat'taki bölgeler komşu odalar
              olarak yan yana çizilir; alana otomatik sığar (zoom). */}
          <div
            ref={kapsayiciRef}
            className="hidden h-full min-h-0 overflow-auto p-3 md:flex md:items-center md:justify-center"
          >
            <div
              className="relative shrink-0"
              style={{ width: w * olcek, height: h * olcek }}
            >
              <div
                className="absolute left-0 top-0"
                style={{
                  width: w,
                  height: h,
                  transform: `scale(${olcek})`,
                  transformOrigin: 'top left',
                }}
              >
                {/* Canlı hizalama kılavuzları (düzenle) — canvas koordinatında */}
                {duzenle && kilavuz.x !== null && (
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-sky-400"
                    style={{ left: kilavuz.x, boxShadow: '0 0 8px rgba(56,189,248,0.9)' }}
                  />
                )}
                {duzenle && kilavuz.y !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-30 h-px bg-sky-400"
                    style={{ top: kilavuz.y, boxShadow: '0 0 8px rgba(56,189,248,0.9)' }}
                  />
                )}

                <DndContext
                  id={duzenle ? 'salon-duzenle' : 'salon'}
                  sensors={sensors}
                  {...(duzenle
                    ? { onDragMove: onDuzenleMove, onDragEnd: onDuzenleEnd }
                    : {
                        collisionDetection: pointerWithin,
                        onDragStart: onSalonStart,
                        onDragEnd: onSalonEnd,
                      })}
                >
                  {yerlesim.map((oda) => (
                    <div
                      key={oda.bolge.id}
                      onClick={() => duzenle && setSeciliMasaId(null)}
                      className={`kroki-oda kroki-zemin absolute ${
                        duzenle ? 'kroki-duzenle' : ''
                      }`}
                      style={{ left: oda.x, top: oda.y, width: oda.w, height: oda.h }}
                    >
                      <span className="pointer-events-none absolute left-4 top-2.5 z-0 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/35">
                        {oda.bolge.ad}
                      </span>

                      {oda.bolge.masalar.map((m) =>
                        duzenle ? (
                          <SuruklenebilirMasa
                            key={m.id}
                            masa={m}
                            now={now}
                            vurgulu={vurgu.has(m.id)}
                            secili={seciliMasaId === m.id}
                            olcek={olcek}
                            onSelect={() => setSeciliMasaId(m.id)}
                          />
                        ) : m.tip !== 'masa' ? (
                          (() => {
                            const b = masaBoyut(m);
                            return (
                              <div
                                key={m.id}
                                className="absolute"
                                style={{ left: m.x, top: m.y, width: b.w, height: b.h }}
                              >
                                <SabitEleman masa={m} />
                              </div>
                            );
                          })()
                        ) : (
                          <SalonMasa
                            key={m.id}
                            masa={m}
                            now={now}
                            vurgulu={vurgu.has(m.id)}
                            bekleyen={bekleyenId === m.id}
                            hedef={
                              hedefMod?.tip === 'tasi'
                                ? m.durum === 'bos' && m.id !== hedefMod.src.id
                                : hedefMod?.tip === 'birlestir'
                                  ? !!m.adisyon && m.id !== hedefMod.src.id
                                  : false
                            }
                            olcek={olcek}
                            onAc={acMasa}
                            onMenu={masaMenu}
                          />
                        )
                      )}
                    </div>
                  ))}
                </DndContext>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle modu — kayan araç çubuğu */}
      {duzenle && (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-sky-400/25 bg-slate-900/90 px-3 py-2 shadow-2xl backdrop-blur">
          {/* Ekle paleti */}
          <div className="relative">
            <button
              onClick={() => setEkleAcik((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                ekleAcik
                  ? 'bg-sky-400 text-slate-900'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              ＋ Ekle
            </button>
            {ekleAcik && (
              <div className="absolute bottom-full left-0 mb-2 grid w-44 grid-cols-1 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                {EKLENEBILIR.map((e) => (
                  <button
                    key={e.tip}
                    onClick={() => ekle(e.tip)}
                    className="rounded-lg px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="h-6 w-px bg-slate-700" />

          {seciliEleman ? (
            <>
              <input
                key={seciliEleman.id}
                defaultValue={seciliEleman.ad}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== seciliEleman.ad) guncelleMasa(seciliEleman.id, { ad: v });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-24 rounded-lg bg-slate-800 px-2 py-1.5 text-xs font-bold text-sky-100 outline-none focus:ring-1 focus:ring-sky-400"
              />

              {seciliMasa && (
                <div className="flex gap-1">
                  {SEKILLER.map((s) => {
                    const aktif =
                      s.key === 'dikdortgen'
                        ? seciliBilgi.dikdortgen
                        : s.key === 'yuvarlak'
                          ? seciliBilgi.yuvarlak
                          : !seciliBilgi.dikdortgen && !seciliBilgi.yuvarlak;
                    return (
                      <button
                        key={s.key}
                        onClick={() =>
                          guncelleMasa(seciliMasa.id, {
                            // Şekil değişirken mevcut yönü koru (dikeyse '-d').
                            sekil: seciliBilgi.dikey ? `${s.key}-d` : s.key,
                          })
                        }
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          aktif
                            ? 'bg-sky-400 text-slate-900'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Döndür: her masa şekli + sabit eleman için yön çevirir
                  (sandalyeler üst/alt ↔ sol/sağ). */}
              <button
                onClick={() =>
                  guncelleMasa(seciliEleman.id, {
                    sekil: yonCevir(seciliEleman.sekil),
                  })
                }
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  sekilBilgi(seciliEleman.sekil).dikey
                    ? 'bg-sky-400 text-slate-900'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ⟳ Döndür
              </button>

              {/* Genişlet: yalnız dikdörtgen masa + sabit elemanlarda anlamlı */}
              {(seciliEleman.tip !== 'masa' || seciliBilgi.dikdortgen) && (
                <button
                  onClick={() =>
                    guncelleMasa(seciliEleman.id, { en: seciliEleman.en >= 2 ? 1 : 2 })
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    seciliEleman.en >= 2
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  ↔ Geniş
                </button>
              )}

              {/* Kapasite — yalnız masa */}
              {seciliMasa && (
                <div className="flex items-center gap-1 rounded-lg bg-slate-800 px-1.5 py-1 text-xs text-slate-200">
                  <button
                    onClick={() =>
                      guncelleMasa(seciliMasa.id, {
                        kapasite: Math.max(1, seciliMasa.kapasite - 1),
                      })
                    }
                    className="px-1.5 font-bold text-slate-300 hover:text-white"
                  >
                    −
                  </button>
                  <span className="tabular-nums">{seciliMasa.kapasite}👤</span>
                  <button
                    onClick={() =>
                      guncelleMasa(seciliMasa.id, {
                        kapasite: Math.min(20, seciliMasa.kapasite + 1),
                      })
                    }
                    className="px-1.5 font-bold text-slate-300 hover:text-white"
                  >
                    +
                  </button>
                </div>
              )}

              <button
                onClick={() => setOnay({ tip: 'sil', masa: seciliEleman })}
                className="rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
              >
                🗑 Sil
              </button>
            </>
          ) : (
            <span className="text-sm text-slate-400">
              Ekle ile masa/eleman koy · seç → ad·şekil·kapasite · sürükle → taşı
            </span>
          )}
          <button
            onClick={toggleDuzenle}
            className="ml-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
          >
            ✓ Bitir
          </button>
        </div>
      )}

      {/* Hızlı aksiyon menüsü (sağ-tık / uzun-bas) */}
      {menu && (
        <div className="fixed inset-0 z-40" onClick={() => setMenu(null)}>
          <div
            className="absolute w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl"
            style={{
              left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 200),
              top: Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 220),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-800 px-3 py-1.5 text-xs font-bold text-sky-200">
              {menu.masa.ad}
              {menu.masa.adisyon && (
                <span className="ml-1 font-normal text-slate-400">
                  · {para(menu.masa.adisyon.kalan)}
                </span>
              )}
            </div>
            {[
              {
                label: menu.masa.adisyon ? '📂 Adisyonu Aç' : '➕ Adisyon Aç',
                run: () => masaTikla(menu.masa),
                goster: true,
              },
              {
                label: '💵 Tümünü Öde (Nakit)',
                run: () => setOnay({ tip: 'ode', masa: menu.masa }),
                goster: !!menu.masa.adisyon,
              },
              {
                label: '➡ Taşı…',
                run: () => setHedefMod({ tip: 'tasi', src: menu.masa }),
                goster: !!menu.masa.adisyon,
              },
              {
                label: '🔗 Birleştir…',
                run: () => setHedefMod({ tip: 'birlestir', src: menu.masa }),
                goster: !!menu.masa.adisyon,
              },
            ]
              .filter((a) => a.goster)
              .map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    setMenu(null);
                    a.run();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                >
                  {a.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Onay kutusu — taşı / birleştir / öde / sil */}
      {onay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOnay(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">
              {onay.tip === 'tasi'
                ? 'Masayı Taşı'
                : onay.tip === 'birlestir'
                  ? 'Masaları Birleştir'
                  : onay.tip === 'ode'
                    ? 'Hesabı Kapat'
                    : 'Sil'}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {onay.tip === 'tasi' ? (
                <>
                  <b className="text-slate-100">{onay.src.ad}</b> adisyonu boş{' '}
                  <b className="text-slate-100">{onay.tgt.ad}</b> masasına taşınsın
                  mı?
                </>
              ) : onay.tip === 'birlestir' ? (
                <>
                  <b className="text-slate-100">{onay.src.ad}</b>,{' '}
                  <b className="text-slate-100">{onay.tgt.ad}</b> masasına
                  birleştirilsin mi? ({onay.src.ad} kapanır, kalemleri {onay.tgt.ad}
                  ’e taşınır.)
                </>
              ) : onay.tip === 'ode' ? (
                <>
                  <b className="text-slate-100">{onay.masa.ad}</b> hesabının kalanı{' '}
                  <b className="text-emerald-300">{para(onay.masa.adisyon?.kalan ?? 0)}</b>{' '}
                  nakit olarak tahsil edilip adisyon kapatılsın mı?
                </>
              ) : (
                <>
                  <b className="text-slate-100">{onay.masa.ad}</b> krokiden silinsin
                  mi? (Adisyon geçmişi olan masa silinemez.)
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOnay(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Vazgeç
              </button>
              <button
                onClick={onayUygula}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-slate-900 ${
                  onay.tip === 'sil'
                    ? 'bg-rose-400 hover:bg-rose-300'
                    : 'bg-emerald-500 hover:bg-emerald-400'
                }`}
              >
                {onay.tip === 'tasi'
                  ? 'Taşı'
                  : onay.tip === 'birlestir'
                    ? 'Birleştir'
                    : onay.tip === 'ode'
                      ? 'Öde & Kapat'
                      : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Gel-Al sekmesi: aktif paket siparişlerini kart olarak listeler + yeni aç.
function GelalPanel({
  gelaller,
  now,
  bekleyen,
  onYeni,
  onAc,
}: {
  gelaller: GelalOzet[];
  now: number;
  bekleyen: boolean;
  onYeni: () => void;
  onAc: (id: number) => void;
}) {
  return (
    <div className="pb-safe min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">
          {gelaller.length > 0
            ? `${gelaller.length} açık paket siparişi`
            : 'Açık paket siparişi yok'}
        </span>
        <button
          onClick={onYeni}
          disabled={bekleyen}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition-colors hover:bg-amber-300 disabled:opacity-60"
        >
          ＋ Yeni Gel-Al
        </button>
      </div>

      {gelaller.length === 0 ? (
        <button
          onClick={onYeni}
          disabled={bekleyen}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 transition-colors hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-60"
        >
          <span className="text-3xl">📦</span>
          <span className="text-sm font-medium">İlk paket siparişini başlat</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {gelaller.map((g) => (
            <button
              key={g.id}
              onClick={() => onAc(g.id)}
              className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-linear-to-br from-amber-500/10 to-slate-900/40 p-3 text-left transition-transform hover:scale-[1.03] hover:border-amber-400/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-amber-200">{g.etiket}</span>
                {g.kismiOdeme && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Kısmi
                  </span>
                )}
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-emerald-300">
                {para(g.kalan)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{g.kalemSayisi} ürün</span>
                <span>{gecenSure(g.acilis, now)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Düzenle modu: konum sürükleme + şekil seçimi
function SuruklenebilirMasa({
  masa,
  now,
  vurgulu,
  secili,
  olcek,
  onSelect,
}: {
  masa: MasaOzet;
  now: number;
  vurgulu?: boolean;
  secili?: boolean;
  olcek: number;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: masa.id });
  const b = masaBoyut(masa);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={isDragging ? 'kroki-kaldir' : ''}
      style={{
        position: 'absolute',
        left: masa.x,
        top: masa.y,
        width: b.w,
        height: b.h,
        transform: transform
          ? `translate3d(${transform.x / olcek}px, ${transform.y / olcek}px, 0)`
          : undefined,
        zIndex: isDragging ? 50 : secili ? 30 : undefined,
        touchAction: 'none',
        cursor: 'grab',
        opacity: isDragging ? 0.92 : 1,
      }}
    >
      {masa.tip !== 'masa' ? (
        <SabitEleman masa={masa} />
      ) : (
        <MasaKart masa={masa} now={now} vurgulu={vurgulu} secili={secili} />
      )}
    </div>
  );
}

// Normal mod: tıkla-aç + başka masaya sürükle-bırak (taşı/birleştir)
function SalonMasa({
  masa,
  now,
  vurgulu,
  bekleyen,
  hedef: hedefAday,
  olcek,
  onAc,
  onMenu,
}: {
  masa: MasaOzet;
  now: number;
  vurgulu?: boolean;
  bekleyen?: boolean;
  hedef?: boolean; // hedef-seçme modunda geçerli aday mı (menüden Taşı/Birleştir)
  olcek: number;
  onAc: (m: MasaOzet) => void;
  onMenu: (m: MasaOzet, e: ReactMouseEvent) => void;
}) {
  const drag = useDraggable({ id: `d${masa.id}`, data: { masa } });
  const drop = useDroppable({ id: `o${masa.id}`, data: { masa } });
  const b = masaBoyut(masa);
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const hedef =
    (drop.isOver && !!drop.active && drop.active.id !== `d${masa.id}`) ||
    !!hedefAday;

  return (
    <div
      ref={ref}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onAc(masa)}
      onContextMenu={(e) => onMenu(masa, e)}
      className="absolute"
      style={{
        left: masa.x,
        top: masa.y,
        width: b.w,
        height: b.h,
        transform: drag.transform
          ? `translate3d(${drag.transform.x / olcek}px, ${drag.transform.y / olcek}px, 0)`
          : undefined,
        zIndex: drag.isDragging ? 50 : hedef ? 20 : undefined,
        touchAction: 'none',
        cursor: 'pointer',
        opacity: drag.isDragging ? 0.9 : 1,
      }}
    >
      <div
        className={`h-full w-full rounded-2xl transition-transform ${
          hedef
            ? 'scale-105 ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0a111e]'
            : 'hover:scale-[1.05]'
        }`}
      >
        <MasaKart masa={masa} now={now} vurgulu={vurgulu} bekleyen={bekleyen} />
      </div>
    </div>
  );
}
