// POS için çizgi-stil (line) ikon seti — emoji yerine net, profesyonel görünüm.
// currentColor kullanır; renk/boyut className ile gelir. viewBox 24×24.

export type IkonAd =
  | 'nakit'
  | 'kart'
  | 'yemek'
  | 'havale'
  | 'fis'
  | 'indirim'
  | 'kapat'
  | 'bol'
  | 'masa'
  | 'tasi'
  | 'duzenle'
  | 'cop';

export function Ikon({
  ad,
  className = 'h-5 w-5',
}: {
  ad: IkonAd;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {YOLLAR[ad]}
    </svg>
  );
}

const YOLLAR: Record<IkonAd, React.ReactNode> = {
  // Banknot
  nakit: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M5.5 12h.01M18.5 12h.01" />
    </>
  ),
  // Kredi kartı
  kart: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h3.5" />
    </>
  ),
  // Çatal-bıçak (yemek kartı)
  yemek: (
    <>
      <path d="M6 3v4.2M9 3v4.2" />
      <path d="M7.5 7.2V21" />
      <path d="M6 7.2h3" />
      <path d="M16.5 13.5V3c2.4.7 3.6 3 3.6 5.6 0 2.5-1.3 4.6-3.6 4.9z" />
      <path d="M16.5 13.5V21" />
    </>
  ),
  // Banka (havale)
  havale: (
    <>
      <path d="M12 3 3.5 7.8h17z" />
      <path d="M4 11.4h16" />
      <path d="M5.6 11.4v7.4M9.8 11.4v7.4M14.2 11.4v7.4M18.4 11.4v7.4" />
      <path d="M3.5 21h17" />
    </>
  ),
  // Fiş / makbuz
  fis: (
    <>
      <path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  // Fiyat etiketi (indirim)
  indirim: (
    <>
      <path d="M3.6 12.7 11 5.3a2 2 0 0 1 1.4-.6h6a1.4 1.4 0 0 1 1.4 1.4v6a2 2 0 0 1-.6 1.4l-7.4 7.4a1.5 1.5 0 0 1-2.1 0l-6.5-6.5a1.5 1.5 0 0 1 0-2.1z" />
      <path d="M16.2 8.2h.01" />
    </>
  ),
  // Onay (hesabı kapat)
  kapat: <path d="M20 6.5 9.2 17.5 4 12.3" />,
  // Bölme (tek çizgi ikiye ayrılır)
  bol: (
    <>
      <path d="M12 3v5.5" />
      <path d="M12 8.5 6.5 14v7" />
      <path d="M12 8.5 17.5 14v7" />
    </>
  ),
  // Masa
  masa: (
    <>
      <rect x="3" y="5" width="18" height="4" rx="1" />
      <path d="M6 9v10M18 9v10" />
    </>
  ),
  // Taşı (4 yön)
  tasi: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  // Düzenle (kalem)
  duzenle: (
    <>
      <path d="M16.5 4.5l3 3L8 19l-3.7.7.7-3.7z" />
      <path d="M14 7l3 3" />
    </>
  ),
  // Sil (çöp kutusu)
  cop: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l1 12.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
};
