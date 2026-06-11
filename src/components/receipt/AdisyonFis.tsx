'use client';

import React, { useMemo, useSyncExternalStore } from 'react';
import type { AdisyonDetay, KalemDetay } from '@/lib/adisyon';
import { para } from '@/lib/format';

// Termal hesap fişi — 80mm yazıcı (basılabilir ~72mm). Paket fişiyle aynı iskelet,
// içerik adisyona göre (masa + kalemler + KALAN). Baskı: window.print() + @media print.

const PAPER_WIDTH = '72mm';
const CONTENT_WIDTH = '64mm'; // yazıcı marjini düşülmüş güvenli alan
const FONT_NORMAL = '13px';
const FONT_XSMALL = '11px';
const FONT_LARGE = '16px';
const RECEIPT_ID = 'adisyon-hesap-fisi';
const MONO = "Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace";

const Divider = ({ dashed }: { dashed?: boolean }) => (
  <div
    style={{
      borderTop: dashed ? '1px dashed #000' : '1px solid #000',
      margin: '5px 0',
    }}
  />
);

const Row = ({
  left,
  right,
  bold,
  large,
}: {
  left: string;
  right: string;
  bold?: boolean;
  large?: boolean;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      columnGap: '4px',
      alignItems: 'baseline',
      fontWeight: bold ? 700 : 400,
      fontSize: large ? FONT_LARGE : FONT_NORMAL,
      marginBottom: '2px',
      width: '100%',
    }}
  >
    <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      {left}
    </span>
    <span style={{ whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
      {right}
    </span>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: FONT_XSMALL,
      fontWeight: 700,
      letterSpacing: '1px',
      marginBottom: '3px',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

function KalemSatiri({ k }: { k: KalemDetay }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 9mm 18mm',
        columnGap: '2mm',
        alignItems: 'start',
        fontSize: FONT_NORMAL,
        marginBottom: '3px',
      }}
    >
      <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'break-word', lineHeight: 1.25, fontWeight: 700 }}>
        {k.urunAd}
        {k.yarim && <span style={{ fontWeight: 400, fontSize: '0.85em' }}> (Yarım)</span>}
        {k.ikram && <span style={{ fontWeight: 400, fontSize: '0.85em' }}> (İkram)</span>}
      </span>
      <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>x{k.adet}</span>
      <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
        {k.ikram ? 'İkram' : para(k.birimFiyat * k.adet)}
      </span>
    </div>
  );
}

export function AdisyonFis({ detay }: { detay: AdisyonDetay }) {
  // Tarih sadece client'ta — SSR/CSR farkı (hydration) olmasın (referans deseni).
  const getDateSnapshot = useMemo(() => {
    let cached: Date | null = null;
    return () => (cached ??= new Date());
  }, []);
  const printDate = useSyncExternalStore(
    () => () => {},
    getDateSnapshot,
    () => null
  );
  const tarih = printDate ? printDate.toLocaleDateString('tr-TR') : '';
  const saat = printDate
    ? printDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '';

  // Kalemleri kaynakMasa'ya göre grupla (kendi + birleştirmeden gelenler)
  const { kendi, ekGruplar } = useMemo(() => {
    const kendi: KalemDetay[] = [];
    const m = new Map<string, KalemDetay[]>();
    for (const k of detay.kalemler) {
      if (!k.kaynakMasa) kendi.push(k);
      else {
        const arr = m.get(k.kaynakMasa) ?? [];
        arr.push(k);
        m.set(k.kaynakMasa, arr);
      }
    }
    return { kendi, ekGruplar: [...m.entries()] };
  }, [detay.kalemler]);

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
            fontSize: FONT_NORMAL,
            lineHeight: 1.35,
          }}
        >
          {/* Başlık */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '1px' }}>KONAK KEBAP</div>
            <div style={{ fontSize: FONT_NORMAL, marginTop: '2px' }}>Hesap Fişi</div>
          </div>

          <Divider />

          {/* Masa + adisyon no + tarih */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: FONT_NORMAL,
              marginBottom: '2px',
            }}
          >
            <span style={{ fontWeight: 700 }}>
              {detay.tip === 'gelal' ? 'Gel-Al' : 'Masa'}: {detay.masaAd}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {tarih} {saat}
            </span>
          </div>
          {detay.adisyonId != null && (
            <div style={{ fontSize: FONT_XSMALL }}>Adisyon No: #{detay.adisyonId}</div>
          )}

          <Divider dashed />

          {/* Kalem başlığı */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 9mm 18mm',
              columnGap: '2mm',
              fontSize: FONT_XSMALL,
              fontWeight: 700,
              borderBottom: '1px solid #000',
              paddingBottom: '3px',
              marginBottom: '4px',
            }}
          >
            <span>ÜRÜN</span>
            <span style={{ textAlign: 'center' }}>AD</span>
            <span style={{ textAlign: 'right' }}>TUTAR</span>
          </div>

          {/* Kendi kalemleri */}
          {kendi.map((k) => (
            <KalemSatiri key={k.id} k={k} />
          ))}

          {/* Birleştirmeden gelenler — ayrı grup */}
          {ekGruplar.map(([kaynak, ks]) => (
            <div key={kaynak} style={{ marginTop: '3px' }}>
              <div style={{ fontSize: FONT_XSMALL, fontWeight: 700, margin: '2px 0' }}>
                {kaynak}&apos;TEN
              </div>
              {ks.map((k) => (
                <KalemSatiri key={k.id} k={k} />
              ))}
            </div>
          ))}

          <Divider />

          {/* Toplam / İndirim / Ödenen / KALAN */}
          <Row left="Ara Toplam" right={para(detay.toplam)} />
          {detay.indirim > 0 && (
            <Row
              left={`İndirim${
                detay.indirimTip === 'yuzde' ? ` (%${detay.indirimDeger})` : ''
              }`}
              right={`-${para(detay.indirim)}`}
            />
          )}
          {detay.tahsilatToplam > 0 && (
            <Row left="Ödenen" right={`-${para(detay.tahsilatToplam)}`} />
          )}

          <div style={{ borderTop: '2px solid #000', marginTop: '4px', paddingTop: '4px' }}>
            {detay.tahsilatToplam > 0 ? (
              <Row left="KALAN" right={para(detay.kalan)} bold large />
            ) : (
              <Row left="TOPLAM" right={para(detay.kalan)} bold large />
            )}
          </div>

          <Divider dashed />

          {/* Alt bilgi */}
          <div style={{ textAlign: 'center', fontSize: FONT_NORMAL, marginTop: '2px' }}>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>Afiyet olsun!</div>
            <div style={{ fontSize: FONT_XSMALL }}>
              Bu bir hesap fişidir, mali değeri yoktur.
            </div>
            <div style={{ marginTop: '4px', fontSize: FONT_XSMALL }}>
              {tarih} {saat}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
