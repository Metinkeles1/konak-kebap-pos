import { PrismaClient } from '@prisma/client';

// El çizimi krokilere göre İç Salon + Ön Bahçe yerleşimi (masa x/y/şekil + sabit
// elemanlar). Tekrar çalıştırılabilir: sabit elemanlar her seferinde silinip
// yeniden kurulur, masalar ada göre güncellenir. Konak Kebap kroki temizliği.
//
// Çalıştır:  npm run kroki:yerlesim
//
// Koordinatlar grid'e (20px) oturur; merkez-hizalama Düzenle modunda ince ayara
// açıktır. Şekil kodlaması: 'dikdortgen' = yatay, 'dikdortgen-d' = dikey.

const db = new PrismaClient();

type Masa = { ad: string; x: number; y: number; sekil: string; en?: number };
type Sabit = Masa & { tip: string };

type Yerlesim = { masalar: Masa[]; sabitler: Sabit[] };

const LAYOUT: Record<string, Yerlesim> = {
  // ── İç Salon ───────────────────────────────────────────────────────────
  // Üst sıra: 4 dikey dikdörtgen · sağ: 1 uzun dikey · sol: 2 yatay · orta: 2 kare
  // Alt: merdiven (üst kat) + geçit (arka bahçe) + tezgah (boydan boya) + ocak
  'İç Salon': {
    masalar: [
      { ad: 'İÇ1', x: 180, y: 70, sekil: 'dikdortgen-d' },
      { ad: 'İÇ2', x: 320, y: 70, sekil: 'dikdortgen-d' },
      { ad: 'İÇ3', x: 460, y: 70, sekil: 'dikdortgen-d' },
      { ad: 'İÇ4', x: 600, y: 70, sekil: 'dikdortgen-d' },
      { ad: 'İÇ5', x: 760, y: 70, sekil: 'dikdortgen-d', en: 2 }, // uzun, sağ duvar
      { ad: 'İÇ6', x: 360, y: 280, sekil: 'kare' },
      { ad: 'İÇ7', x: 520, y: 280, sekil: 'kare' },
      { ad: 'İÇ8', x: 40, y: 270, sekil: 'dikdortgen' }, // yatay, sol
      { ad: 'İÇ9', x: 40, y: 400, sekil: 'dikdortgen' },
    ],
    sabitler: [
      { ad: 'ÖN BAHÇE', tip: 'kapi', x: 40, y: 0, sekil: 'dikdortgen' }, // üst duvar
    ],
  },

  // ── Ön Bahçe ───────────────────────────────────────────────────────────
  // Üst: 2 kare · Alt: 1 dikey dikdörtgen + 2 kare · sol duvarda içeri kapısı
  'Ön Bahçe': {
    masalar: [
      { ad: 'ÖN1', x: 140, y: 70, sekil: 'kare' },
      { ad: 'ÖN2', x: 320, y: 70, sekil: 'kare' },
      { ad: 'ÖN3', x: 140, y: 240, sekil: 'dikdortgen-d' },
      { ad: 'ÖN4', x: 300, y: 270, sekil: 'kare' },
      { ad: 'ÖN5', x: 460, y: 270, sekil: 'kare' },
    ],
    sabitler: [
      { ad: 'İÇ SALON', tip: 'kapi', x: 0, y: 320, sekil: 'dikdortgen-d' }, // sol duvar
    ],
  },
};

async function main() {
  for (const [bolgeAd, y] of Object.entries(LAYOUT)) {
    const bolge = await db.bolge.findFirst({ where: { ad: bolgeAd } });
    if (!bolge) {
      console.warn(`⚠ Bölge bulunamadı: ${bolgeAd} — atlandı.`);
      continue;
    }

    // Eski sabit elemanları (kasa/tezgah/... her tip != masa) temizle → tekrar kur
    const silinen = await db.masa.deleteMany({
      where: { bolgeId: bolge.id, NOT: { tip: 'masa' } },
    });

    // Masaları ada göre güncelle
    let guncel = 0;
    for (const m of y.masalar) {
      const r = await db.masa.updateMany({
        where: { bolgeId: bolge.id, ad: m.ad },
        data: { x: m.x, y: m.y, sekil: m.sekil, en: m.en ?? 1 },
      });
      if (r.count === 0) console.warn(`  ⚠ Masa yok: ${m.ad}`);
      else guncel += r.count;
    }

    // Sabit elemanları oluştur
    for (const s of y.sabitler) {
      await db.masa.create({
        data: {
          bolgeId: bolge.id,
          ad: s.ad,
          tip: s.tip,
          x: s.x,
          y: s.y,
          sekil: s.sekil,
          en: s.en ?? 1,
        },
      });
    }

    console.log(
      `✔ ${bolgeAd}: ${guncel} masa konumlandı, ${y.sabitler.length} sabit eklendi (${silinen.count} eski sabit silindi).`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
