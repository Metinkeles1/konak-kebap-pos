// Konak Kebap marka ikonu — tek kaynak.
// Hem favicon (app/icon.tsx) hem de iOS/Android ana ekran ikonu (app/apple-icon.tsx)
// bu çizimi next/og ImageResponse ile PNG'ye render eder. Satori (ImageResponse) sadece
// inline stil + flexbox destekler; o yüzden her şey px ve inline.
//
// Motif: kömür/ateş zemininde şiş kebap (et + biber + et + domates).
// İçerik merkezde tutulur → Android "maskable" güvenli alanına sığar.

const CHUNKS = [
  'linear-gradient(135deg, #b5551f, #7a3415)', // et
  'linear-gradient(135deg, #4f9a3f, #2f6b2a)', // yeşil biber
  'linear-gradient(135deg, #c2632a, #82390f)', // et
  'linear-gradient(135deg, #e0552e, #a32a18)', // domates / soğan
];

export function KebabArt({ size }: { size: number }) {
  const chunkW = size * 0.3;
  const chunkH = size * 0.15;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 38%, #d4452a 0%, #8c1f12 42%, #1a1a1a 100%)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size * 0.6,
          height: size * 0.78,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(-26deg)',
        }}
      >
        {/* şiş (metal çubuk) — çubuğun uçları parçaların dışına taşar */}
        <div
          style={{
            position: 'absolute',
            width: size * 0.05,
            height: size * 0.72,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #6b7280, #e5e7eb 45%, #9ca3af)',
          }}
        />
        {/* parçalar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: size * 0.022,
          }}
        >
          {CHUNKS.map((bg, i) => (
            <div
              key={i}
              style={{
                width: chunkW,
                height: chunkH,
                borderRadius: size * 0.06,
                background: bg,
                border: `${Math.max(1, size * 0.006)}px solid rgba(0,0,0,0.25)`,
                display: 'flex',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
