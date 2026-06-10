import { PrismaClient } from '@prisma/client';

// Test/işlem verisini sıfırlar: Tahsilat + AdisyonKalem + Adisyon silinir,
// tüm masalar "boş"a döner. Bölge/Masa yapısı ve kroki konumları KORUNUR.
//
// Çalıştır:  node --env-file=.env --import tsx scripts/reset-test-data.ts

const db = new PrismaClient();

async function main() {
  // FK sırası: önce yaprak tablolar, sonra Adisyon.
  const tahsilat = await db.tahsilat.deleteMany();
  const kalem = await db.adisyonKalem.deleteMany();
  const adisyon = await db.adisyon.deleteMany();

  // Açık kalmış masaları boşalt (kasa/mobilya zaten dolu olmaz ama dert değil).
  const masa = await db.masa.updateMany({
    where: { durum: { not: 'bos' } },
    data: { durum: 'bos' },
  });

  console.log('✔ İşlem verisi sıfırlandı:');
  console.log(`  • Tahsilat:      ${tahsilat.count} silindi`);
  console.log(`  • AdisyonKalem:  ${kalem.count} silindi`);
  console.log(`  • Adisyon:       ${adisyon.count} silindi`);
  console.log(`  • Masa:          ${masa.count} masa "boş"a döndürüldü`);

  const masaSayisi = await db.masa.count();
  console.log(`Yapı korundu: ${masaSayisi} masa yerinde.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
