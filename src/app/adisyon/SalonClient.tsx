'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
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
import type { MasaOzet, SalonOzet } from '@/lib/types';
import { MasaKart } from '@/components/MasaKart';
import { KasaKart } from '@/components/KasaKart';
import { HIZA_ESIK, hizalaMerkez, masaBoyut, sekilBilgi } from '@/lib/kroki';
import { para } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import {
  OLAY_ADISYON_KAPANDI,
  OLAY_MASA,
  pusherClient,
  SALON_KANAL,
} from '@/lib/pusher-client';

type MasaPatch = Partial<Pick<MasaOzet, 'x' | 'y' | 'sekil' | 'en'>>;
type Onay = { tip: 'tasi' | 'birlestir'; src: MasaOzet; tgt: MasaOzet };

const SEKILLER: { key: MasaOzet['sekil']; label: string }[] = [
  { key: 'kare', label: '◻ Kare' },
  { key: 'yuvarlak', label: '◯ Yuvarlak' },
  { key: 'dikdortgen', label: '▭ Dikdörtgen' },
];

export function SalonClient({ initial }: { initial: SalonOzet }) {
  const [data, setData] = useState<SalonOzet>(initial);
  const [aktifId, setAktifId] = useState<number>(initial.bolgeler[0]?.id ?? 0);
  const [duzenle, setDuzenle] = useState(false);
  const [vurgu, setVurgu] = useState<Set<number>>(new Set());
  const [bekleyenId, setBekleyenId] = useState<number | null>(null);
  const [seciliMasaId, setSeciliMasaId] = useState<number | null>(null);
  const [kilavuz, setKilavuz] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  const [onay, setOnay] = useState<Onay | null>(null);
  const surukleRef = useRef(false);
  const router = useRouter();
  const now = useNow(20000);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/salon', { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch {
      /* sessiz geç */
    }
  }, []);

  // Anlık senkron (Pusher kuruluysa)
  useEffect(() => {
    const pc = pusherClient;
    if (!pc) return;
    const ch = pc.subscribe(SALON_KANAL);
    const onMasa = (p: { masaId?: number }) => {
      const mid = p?.masaId;
      if (typeof mid === 'number') {
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
      }
      refetch();
    };
    ch.bind(OLAY_MASA, onMasa);
    ch.bind(OLAY_ADISYON_KAPANDI, onMasa);
    return () => {
      ch.unbind_all();
      pc.unsubscribe(SALON_KANAL);
    };
  }, [refetch]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const aktif = data.bolgeler.find((b) => b.id === aktifId) ?? data.bolgeler[0];
  const masalar = useMemo(() => aktif?.masalar ?? [], [aktif]);
  const seciliMasa =
    masalar.find((m) => m.id === seciliMasaId && m.tip === 'masa') ?? null;
  const seciliBilgi = sekilBilgi(seciliMasa?.sekil ?? 'kare');

  const masaTikla = useCallback(
    async (m: MasaOzet) => {
      if (m.tip !== 'masa') return;
      setBekleyenId(m.id);
      if (m.durum === 'bos') {
        try {
          await fetch('/api/adisyon/ac', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ masaId: m.id }),
          });
        } catch {
          /* yine de detaya geç */
        }
      }
      router.push(`/adisyon/masa/${m.id}`);
    },
    [router]
  );

  // Tıkla-aç ama sürükleme bittiyse açma (drag-merge ile çakışmasın)
  const acMasa = useCallback(
    (m: MasaOzet) => {
      if (surukleRef.current) return;
      masaTikla(m);
    },
    [masaTikla]
  );

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ---- Düzenle modu: sürükle = taşı (snap + canlı kılavuz) ----
  const onDuzenleMove = useCallback(
    (e: DragMoveEvent) => {
      const id = Number(e.active.id);
      const m = masalar.find((mm) => mm.id === id);
      if (!m) return;
      const b = masaBoyut(m);
      const cx = m.x + e.delta.x + b.w / 2;
      const cy = m.y + e.delta.y + b.h / 2;
      let gx: number | null = null;
      let gy: number | null = null;
      for (const mm of masalar) {
        if (mm.id === id) continue;
        const ob = masaBoyut(mm);
        const ocx = mm.x + ob.w / 2;
        const ocy = mm.y + ob.h / 2;
        if (gx === null && Math.abs(cx - ocx) <= HIZA_ESIK) gx = ocx;
        if (gy === null && Math.abs(cy - ocy) <= HIZA_ESIK) gy = ocy;
      }
      setKilavuz({ x: gx, y: gy });
    },
    [masalar]
  );

  const onDuzenleEnd = useCallback(
    (e: DragEndEvent) => {
      setKilavuz({ x: null, y: null });
      const id = Number(e.active.id);
      const m = masalar.find((mm) => mm.id === id);
      if (!m) return;
      const b = masaBoyut(m);
      const digerleri = masalar
        .filter((mm) => mm.id !== id)
        .map((mm) => ({ x: mm.x, y: mm.y, ...masaBoyut(mm) }));
      const { x, y } = hizalaMerkez(m.x + e.delta.x, m.y + e.delta.y, b, digerleri);
      setSeciliMasaId(id);
      guncelleMasa(id, { x, y });
    },
    [masalar, guncelleMasa]
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
    const { tip, src, tgt } = onay;
    setOnay(null);
    try {
      if (tip === 'tasi' && src.adisyon) {
        await fetch('/api/masa/tasi', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adisyonId: src.adisyon.id, hedefMasaId: tgt.id }),
        });
      } else if (tip === 'birlestir' && src.adisyon && tgt.adisyon) {
        await fetch('/api/masa/birlestir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kaynakAdisyonId: src.adisyon.id,
            hedefAdisyonId: tgt.adisyon.id,
          }),
        });
      }
    } catch {
      /* yut */
    }
    refetch();
  }, [onay, refetch]);

  const { w, h } = useMemo(() => {
    let mw = 0;
    let mh = 0;
    for (const m of masalar) {
      const b = masaBoyut(m);
      mw = Math.max(mw, m.x + b.w);
      mh = Math.max(mh, m.y + b.h);
    }
    return { w: mw + 48, h: Math.max(mh + 56, 380) };
  }, [masalar]);

  const toggleDuzenle = () => {
    setDuzenle((v) => !v);
    setSeciliMasaId(null);
  };

  const o = data.ozet;

  return (
    <div className="flex flex-1 flex-col">
      {/* Üst bar */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-black tracking-tight text-amber-400">
            KONAK KEBAP
          </span>
          <span className="text-sm font-medium text-slate-400">· Salon</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Yenile
          </button>
          <button
            onClick={toggleDuzenle}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              duzenle
                ? 'bg-sky-400 text-slate-900'
                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {duzenle ? '✓ Bitir' : '✎ Krokiyi Düzenle'}
          </button>
        </div>
      </header>

      {/* Özet bandı */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-800 bg-slate-900/30 px-4 py-2 text-sm">
        <span className="text-emerald-400">🟢 Boş {o.bos}</span>
        <span className="text-rose-300">🔴 Dolu {o.dolu}</span>
        <span className="text-amber-300">⏳ Ödeme bekleyen {o.odemeBekleyen}</span>
        <span className="ml-auto text-slate-400">
          Açık hesap:{' '}
          <b className="tabular-nums text-slate-100">{para(o.acikHesapToplam)}</b>
        </span>
        <span className="text-slate-400">
          Bugünkü ciro:{' '}
          <b className="tabular-nums text-emerald-300">{para(o.gunlukCiro)}</b>
        </span>
      </div>

      {/* Bölge sekmeleri */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
        {data.bolgeler.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setAktifId(b.id);
              setSeciliMasaId(null);
            }}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              b.id === aktifId
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {b.ad}
          </button>
        ))}
      </div>

      {data.bolgeler.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-400">
          Masa bulunamadı. Veritabanını hazırla:{' '}
          <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5">
            npm run db:push &amp;&amp; npm run db:seed
          </code>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {/* Telefon: tek/iki kolon liste */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
            {masalar.map((m) =>
              m.tip !== 'masa' ? (
                <div key={m.id} className="h-26">
                  <KasaKart masa={m} />
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

          {/* Tablet/Kasa: blueprint floor-plan */}
          <div className="hidden md:block">
            <div
              onClick={() => duzenle && setSeciliMasaId(null)}
              className={`kroki-oda kroki-zemin relative mx-auto ${
                duzenle ? 'kroki-duzenle' : ''
              }`}
              style={{ width: w, height: h }}
            >
              <span className="pointer-events-none absolute left-4 top-2.5 z-0 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/35">
                {aktif?.ad}
              </span>
              <GirisKapi />

              {/* Canlı hizalama kılavuzları (düzenle) */}
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

              {duzenle ? (
                <DndContext
                  sensors={sensors}
                  onDragMove={onDuzenleMove}
                  onDragEnd={onDuzenleEnd}
                >
                  {masalar.map((m) => (
                    <SuruklenebilirMasa
                      key={m.id}
                      masa={m}
                      now={now}
                      vurgulu={vurgu.has(m.id)}
                      secili={seciliMasaId === m.id}
                      onSelect={() => setSeciliMasaId(m.id)}
                    />
                  ))}
                </DndContext>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={pointerWithin}
                  onDragStart={onSalonStart}
                  onDragEnd={onSalonEnd}
                >
                  {masalar.map((m) => {
                    if (m.tip !== 'masa') {
                      const b = masaBoyut(m);
                      return (
                        <div
                          key={m.id}
                          className="absolute"
                          style={{ left: m.x, top: m.y, width: b.w, height: b.h }}
                        >
                          <KasaKart masa={m} />
                        </div>
                      );
                    }
                    return (
                      <SalonMasa
                        key={m.id}
                        masa={m}
                        now={now}
                        vurgulu={vurgu.has(m.id)}
                        bekleyen={bekleyenId === m.id}
                        onAc={acMasa}
                      />
                    );
                  })}
                </DndContext>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Düzenle modu — kayan araç çubuğu */}
      {duzenle && (
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-sky-400/25 bg-slate-900/90 px-3 py-2 shadow-2xl backdrop-blur">
          {seciliMasa ? (
            <>
              <span className="text-sm font-bold text-sky-200">{seciliMasa.ad}</span>
              <div className="flex gap-1">
                {SEKILLER.map((s) => {
                  const aktif =
                    s.key === 'dikdortgen'
                      ? seciliBilgi.dikdortgen
                      : seciliMasa.sekil === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => guncelleMasa(seciliMasa.id, { sekil: s.key })}
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
              {seciliBilgi.dikdortgen && (
                <>
                  <button
                    onClick={() =>
                      guncelleMasa(seciliMasa.id, {
                        sekil: seciliBilgi.dikey ? 'dikdortgen' : 'dikdortgen-d',
                      })
                    }
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      seciliBilgi.dikey
                        ? 'bg-sky-400 text-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    ⟳ Döndür
                  </button>
                  <button
                    onClick={() =>
                      guncelleMasa(seciliMasa.id, { en: seciliMasa.en >= 2 ? 1 : 2 })
                    }
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      seciliMasa.en >= 2
                        ? 'bg-amber-400 text-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    ↔ Geniş
                  </button>
                </>
              )}
            </>
          ) : (
            <span className="text-sm text-slate-400">
              Masa seç → şeklini değiştir · sürükle → taşı (gride/komşuya oturur)
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

      {/* Taşı / Birleştir onayı */}
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
              {onay.tip === 'tasi' ? 'Masayı Taşı' : 'Masaları Birleştir'}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {onay.tip === 'tasi' ? (
                <>
                  <b className="text-slate-100">{onay.src.ad}</b> adisyonu boş{' '}
                  <b className="text-slate-100">{onay.tgt.ad}</b> masasına taşınsın
                  mı?
                </>
              ) : (
                <>
                  <b className="text-slate-100">{onay.src.ad}</b>,{' '}
                  <b className="text-slate-100">{onay.tgt.ad}</b> masasına
                  birleştirilsin mi? ({onay.src.ad} kapanır, kalemleri {onay.tgt.ad}
                  ’e taşınır.)
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
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
              >
                {onay.tip === 'tasi' ? 'Taşı' : 'Birleştir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Oda kapısı + GİRİŞ (dekoratif, alt kenar ortası)
function GirisKapi() {
  return (
    <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-0 flex -translate-x-1/2 flex-col items-center">
      <div
        style={{
          width: 42,
          height: 42,
          borderTop: '1.5px solid rgba(125,211,252,0.4)',
          borderLeft: '1.5px solid rgba(125,211,252,0.4)',
          borderTopLeftRadius: '100%',
        }}
      />
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.35em] text-sky-300/45">
        GİRİŞ
      </span>
    </div>
  );
}

// Düzenle modu: konum sürükleme + şekil seçimi
function SuruklenebilirMasa({
  masa,
  now,
  vurgulu,
  secili,
  onSelect,
}: {
  masa: MasaOzet;
  now: number;
  vurgulu?: boolean;
  secili?: boolean;
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
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 50 : secili ? 30 : undefined,
        touchAction: 'none',
        cursor: 'grab',
        opacity: isDragging ? 0.92 : 1,
      }}
    >
      {masa.tip !== 'masa' ? (
        <KasaKart masa={masa} />
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
  onAc,
}: {
  masa: MasaOzet;
  now: number;
  vurgulu?: boolean;
  bekleyen?: boolean;
  onAc: (m: MasaOzet) => void;
}) {
  const drag = useDraggable({ id: `d${masa.id}`, data: { masa } });
  const drop = useDroppable({ id: `o${masa.id}`, data: { masa } });
  const b = masaBoyut(masa);
  const ref = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const hedef = drop.isOver && !!drop.active && drop.active.id !== `d${masa.id}`;

  return (
    <div
      ref={ref}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onAc(masa)}
      className="absolute"
      style={{
        left: masa.x,
        top: masa.y,
        width: b.w,
        height: b.h,
        transform: drag.transform
          ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
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
