import { PrismaClient } from '@prisma/client';

// Bölgeleri kata ata. GÜVENLİ: yalnız Bolge.kat kolonunu yazar — masalara,
// sabit elemanlara, adisyonlara, kroki konumlarına HİÇ dokunmaz.
//
// "kat" salon ekranındaki üst sekme grubudur: aynı kata düşen bölgeler
// "🗺 <kat>" (bütün) sekmesinde tek krokide yan yana çizilir. Oda çerçevelerinin
// ekrandaki konumu/boyutu OTOMATİK hesaplanır (içeriği sarar, dengeli paketlenir),
// o yüzden burada konum vermeye gerek yok.
//
// Çalıştır:  npm run kat:ata

const db = new PrismaClient();

const KAT: Record<string, string> = {
  'İç Salon': 'Alt Kat',
  'Ön Bahçe': 'Alt Kat',
  'Arka Bahçe': 'Alt Kat',
  'Üst Kat': 'Üst Kat',
};

async function main() {
  for (const [bolgeAd, kat] of Object.entries(KAT)) {
    const r = await db.bolge.updateMany({ where: { ad: bolgeAd }, data: { kat } });
    if (r.count === 0) console.warn(`⚠ Bölge bulunamadı: ${bolgeAd}`);
    else console.log(`✔ ${bolgeAd} → ${kat}`);
  }
  console.log('Bitti — sadece kat ataması yapıldı, masa düzenine dokunulmadı.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
