'use client';

import React, { useMemo, useSyncExternalStore } from 'react';
import type { AdisyonDetay, KalemDetay } from '@/lib/adisyon';
import { ISTASYON_SIRA, ISTASYONLAR, istasyonBul, mutfagaGider } from '@/lib/mutfak';

// Mutfak (sipariş) fişi — 80mm termal yazıcı. Hesap fişinden AYRI: fiyat YOK,
// sadece adet + ürün + pişirme tercihleri büyük puntoyla. Kalemler istasyona
// göre bölünür (lahmacun → Fırın, kebap → Izgara); her istasyon kendi fişini alır
// → ızgara ustası ile fırıncı aynı anda, karışmadan hazırlar.

const PAPER_WIDTH = '72mm';
const CONTENT_WIDTH = '64mm';
const RECEIPT_ID = 'adisyon-mutfak-fisi';
const MONO = "Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";

const Divider = ({ kalin }: { kalin?: boolean }) => (
  <div style={{ borderTop: kalin ? '2px solid #000' : '1px dashed #000', margin: '6px 0' }} />
);

// Tek kalem satırı — büyük adet kutusu + ürün adı + alt satırlarda tercihler.
function KalemSatiri({ k }: { k: KalemDetay }) {
  const notlar = (k.not ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div style={{ marginBottom: '9px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '19px', fontWeight: 800, minWidth: '30px' }}>{k.adet}×</span>
        <span
          style={{
            fontSize: '15px',
            fontWeight: 800,
            textTransform: 'uppercase',
            lineHeight: 1.15,
            overflowWrap: 'break-word',
            minWidth: 0,
          }}
        >
          {k.urunAd}
          {k.yarim && <span style={{ fontWeight: 600, fontSize: '0.8em' }}> (YARIM)</span>}
        </span>
      </div>
      {notlar.map((n, i) => (
        <div key={i} style={{ fontSize: '12.5px', fontWeight: 700, margin: '1px 0 0 36px' }}>
          » {n}
        </div>
      ))}
      {k.kaynakMasa && (
        <div style={{ fontSize: '11px', fontWeight: 400, margin: '1px 0 0 36px' }}>
          ({k.kaynakMasa}&apos;ten)
        </div>
      )}
    </div>
  );
}

export function MutfakFisi({
  detay,
  kategoriBul,
}: {
  detay: AdisyonDetay;
  // urunId → menü kategorisi (kebap/lahmacun…). İstasyon yönlendirmesi buradan.
  kategoriBul: (urunId: string) => string | undefined;
}) {
  // Tarih sadece client'ta — hydration farkı olmasın (AdisyonFis ile aynı desen).
  const getDateSnapshot = useMemo(() => {
    let cached: Date | null = null;
    return () => (cached ??= new Date());
  }, []);
  const printDate = useSyncExternalStore(() => () => {}, getDateSnapshot, () => null);
  const tarih = printDate ? printDate.toLocaleDateString('tr-TR') : '';
  const saat = printDate
    ? printDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '';

  // Kalemleri istasyona göre grupla — sadece mutfağa giden kategoriler (içecek/tatlı hariç).
  const istasyonGruplari = useMemo(() => {
    const m = new Map<string, KalemDetay[]>();
    for (const k of detay.kalemler) {
      const kat = kategoriBul(k.urunId);
      if (!mutfagaGider(kat)) continue;
      const ist = istasyonBul(kat);
      if (!ist) continue;
      const arr = m.get(ist.key) ?? [];
      arr.push(k);
      m.set(ist.key, arr);
    }
    // Tanımlı sırayla (izgara, fırın, ocak) döndür.
    return ISTASYON_SIRA.filter((key) => m.has(key)).map((key) => ({
      istasyon: ISTASYONLAR[key],
      kalemler: m.get(key)!,
    }));
  }, [detay.kalemler, kategoriBul]);

  const bos = istasyonGruplari.length === 0;

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: ${PAPER_WIDTH} !important; }
          body * { visibility: hidden !important; }
          #${RECEIPT_ID}, #${RECEIPT_ID} * { visibility: visible !important; }
          #${RECEIPT_ID} {
            position: fixed !important; top: 0 !important; left: 0 !important;
            width: ${PAPER_WIDTH} !important; max-width: ${PAPER_WIDTH} !important;
            margin: 0 !important; padding: 0 !important; border: none !important;
            box-shadow: none !important; background: #fff !important; overflow: hidden !important;
            box-sizing: border-box !important;
          }
          @page { size: 72mm auto; margin: 0; }
        }
      `}</style>

      <div
        id={RECEIPT_ID}
        style={{
          width: PAPER_WIDTH,
          maxWidth: PAPER_WIDTH,
          backgroundColor: '#fff',
          color: '#000',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: MONO,
          textRendering: 'geometricPrecision',
          WebkitFontSmoothing: 'none',
        }}
      >
        <div
          style={{
            width: CONTENT_WIDTH,
            maxWidth: CONTENT_WIDTH,
            margin: '0 auto',
            padding: '3mm 0',
            boxSizing: 'border-box',
            lineHeight: 1.3,
          }}
        >
          {bos ? (
            <div style={{ textAlign: 'center', fontSize: '13px', padding: '10px 0' }}>
              Mutfağa gidecek ürün yok.
            </div>
          ) : (
            istasyonGruplari.map(({ istasyon, kalemler }, idx) => (
              <div key={istasyon.key}>
                {idx > 0 && <Divider kalin />}

                {/* İstasyon başlığı — siyah şerit, net görünür */}
                <div
                  style={{
                    background: '#000',
                    color: '#fff',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    padding: '4px 0',
                    margin: '2px 0 6px',
                  }}
                >
                  MUTFAK · {istasyon.ad.toUpperCase()}
                </div>

                {/* Masa + saat */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: '13px',
                    fontWeight: 700,
                    marginBottom: '2px',
                  }}
                >
                  <span>
                    {detay.tip === 'gelal' ? 'Gel-Al' : 'Masa'}: {detay.masaAd}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{saat}</span>
                </div>
                {detay.adisyonId != null && (
                  <div style={{ fontSize: '11px', marginBottom: '2px' }}>
                    Adisyon #{detay.adisyonId} · {tarih}
                  </div>
                )}

                <Divider />

                {kalemler.map((k) => (
                  <KalemSatiri key={k.id} k={k} />
                ))}
              </div>
            ))
          )}

          <Divider kalin />
          <div style={{ textAlign: 'center', fontSize: '11px' }}>
            Mutfak fişi · hesap değildir
          </div>
        </div>
      </div>
    </>
  );
}
