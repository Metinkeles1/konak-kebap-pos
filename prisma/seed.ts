import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Bölgeler + masa sayıları (docs/SETUP.md §6). Toplam 29 masa.
// kat: salon ekranında üst sekme grubu — alt kattaki bölgeler tek krokide yan
// yana çizilir. Oda konumları sonra `npm run kroki:yerlesim` ile ayarlanır.
const BOLGELER = [
  { ad: 'İç Salon', sira: 1, onek: 'İÇ', adet: 9, kasa: true, kat: 'Alt Kat' },
  { ad: 'Ön Bahçe', sira: 2, onek: 'ÖN', adet: 5, kat: 'Alt Kat' },
  { ad: 'Arka Bahçe', sira: 3, onek: 'ARK', adet: 3, kat: 'Alt Kat' },
  { ad: 'Üst Kat', sira: 4, onek: 'ÜST', adet: 12, kat: 'Üst Kat' },
];

const SUTUN = 5; // satır başına 5 masa
const ADIM = 130; // hücre aralığı (px)

async function main() {
  if ((await db.bolge.count()) > 0) {
    console.log('Bölgeler zaten var, seed atlandı.');
    return;
  }

  for (const b of BOLGELER) {
    const bolge = await db.bolge.create({
      data: { ad: b.ad, sira: b.sira, kat: b.kat },
    });
    for (let i = 1; i <= b.adet; i++) {
      // başlangıç ızgara konumu — Düzenle modunda gerçek krokine taşınır
      const x = ((i - 1) % SUTUN) * ADIM;
      const y = Math.floor((i - 1) / SUTUN) * ADIM;
      await db.masa.create({
        data: { bolgeId: bolge.id, ad: `${b.onek}${i}`, x, y },
      });
    }
    // Her bölgenin kendi kasası/mobilyası — krokide sürüklenip yerleştirilir.
    if (b.kasa) {
      await db.masa.create({
        data: { bolgeId: bolge.id, ad: 'KASA', tip: 'kasa', x: 0, y: 0 },
      });
    }
    console.log(`${b.ad}: ${b.adet} masa eklendi.`);
  }

  const toplam = await db.masa.count();
  console.log(`✔ Toplam ${toplam} masa hazır.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
