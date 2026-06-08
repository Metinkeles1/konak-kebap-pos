# Konak Kebap — Adisyon Sistemi Kurulum Rehberi (SETUP.md)

> Tüm cihazlardan (telefon, tablet, kasa PC) erişilen, internet üzerinden çalışan,
> anlık senkron bir masa/adisyon takip sistemi.
> Telefondan sipariş gir → kasada **anında** belir. Kasada hesabı kapat → her cihazda anında masa boşalsın.

---

## İçindekiler
0. Mimari Kararlar · 1. Menü kaynağı (paket API) · 2. Teknoloji Yığını · 3. Kroki ·
4. Kurulum · 5. Veritabanı Şeması · 6. İlk Veri · 7. Bağlantılar · 8. Anlık Senkron ·
**8B. OPERASYON SENARYOLARI (taşıma/birleştirme/bölme/kısmi ödeme — sistemin kalbi)** ·
9. Ekran Akışı · 10. Gün Sonu · 11. Güvenlik · 12. Vercel · 13. İleride · 14. Yapım Sırası

---

## 0. Mimari Kararlar (Neden böyle?)

| Konu | Karar | Sebep |
|------|-------|-------|
| Tip | İnternete bağlı bulut sistemi | Her cihazdan eriş, anlık senkron |
| Framework | **Next.js (App Router)** | Zaten biliyorsun, Vercel ile birebir |
| Veritabanı | **Neon (PostgreSQL)** | Adisyon ilişkisel yapı, zaten kullandın, ücretsiz |
| Anlık senkron | **Pusher (WebSocket)** | Zaten kullandın, Vercel'le sorunsuz, ücretsiz katman yeter |
| **Menü kaynağı** | **Mevcut paket sistemin API'si** (take-away-system) | Menü tek yerde yönetilsin, çift kayıt olmasın |
| Dağıtım | **Vercel** (konakkebap.com/adisyon) | Altyapın hazır |
| Ödeme | **YOK** — sadece hesap takibi | İsteğin bu |
| Garson/personel takibi | **YOK** (şimdilik) | İsteğin bu |
| Gün sonu | **23:59** | İsteğin bu |
| Termal yazıcı | Şimdi yok, "kapı" hazır | İleride |

**Kabul edilen tek gerçek:** İnternet kesilirse sistem durur. B planı: telefon hotspot.

**İş bölümü:** Neon → adisyon/ciro verisi. Pusher → anlık haber. Paket API → menü kaynağı.

---

## 1. EN ÖNEMLİ KARAR — Menüyü kopyalama, kaynaktan çek

> **GÜNCELLEME (snapshot kararı — performans):** Menü artık her istekte API'den
> çekilmiyor. `npm run menu:sync` ile **`src/data/menu.json`'a snapshot** alınıp
> projede tutuluyor; runtime'da sıfır network → hızlı + dış API'ye bağımsız.
> Bedeli: paket sistemde fiyat/stok değişince `menu:sync` çalıştırıp yeniden deploy
> etmek gerekir (menü canlı değil, snapshot). Kod: `scripts/menu-sync.ts`,
> `src/lib/menu.ts`. Aşağıdaki "kaynaktan çek" anlatımı tarihsel referanstır.

Paket sistemin (`https://take-away-system.vercel.app/api/products`) menüyü zaten yönetiyor:
fiyat, stok durumu (`available`), görsel, kategori, yarım porsiyon bilgisi (`portionable`) hepsi orada.

**Adisyon sistemi menüyü kendi DB'sinde TUTMAZ.** Her açılışta bu API'den çeker.
Böylece fiyatı tek yerde (paket sistemde) günceller, hem paket hem adisyon aynı menüyü görür.
İki ayrı menü yönetmek hata kaynağıdır.

Adisyon DB'sinde sadece **satılan kalemin kopyası** durur (urunAd + fiyat), menünün kendisi değil.

### API'nin döndürdüğü yapı (gerçek)
\`\`\`json
{
  "id": "k1",
  "name": "Adana Kebap",
  "price": 400,
  "category": "kebap",
  "available": true,
  "image": "https://.../adana-kebap.webp",
  "portionable": true
}
\`\`\`

**Kategoriler (8):** corba, durum, icecek, kebap, kilo, lahmacun, pide, tatli
**Kurallar:**
- \`available: false\` → adisyonda gri/pasif, seçilemez (örn. Yayla Çorbası, Kelle Paça).
- \`portionable: true\` → "Yarım Porsiyon" seçeneği (yarım fiyat) sunulabilir.
- \`image\` yoksa placeholder göster.

### Menü çekme + önbellek
\`src/lib/menu.ts\`:
\`\`\`ts
const MENU_URL = 'https://take-away-system.vercel.app/api/products';

export type Urun = {
  id: string; name: string; price: number; category: string;
  available: boolean; image?: string; portionable: boolean;
};

export async function getMenu(): Promise<Urun[]> {
  // Next.js: 60 sn önbellek — her istekte API'yi yormaz, fiyat değişimi ~1 dk içinde yansır
  const res = await fetch(MENU_URL, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error('Menü alınamadı');
  return res.json();
}

// Kategoriye göre grupla
export function grupla(urunler: Urun[]) {
  const sira = ['corba','durum','kebap','pide','lahmacun','kilo','tatli','icecek'];
  const baslik: Record<string,string> = {
    corba:'Çorbalar', durum:'Dürümler', kebap:'Kebaplar', pide:'Pideler',
    lahmacun:'Lahmacun', kilo:'Kilo', tatli:'Tatlılar', icecek:'İçecekler',
  };
  return sira.map(c => ({
    key: c, baslik: baslik[c],
    urunler: urunler.filter(u => u.category === c),
  })).filter(g => g.urunler.length > 0);
}
\`\`\`

---

## 2. Teknoloji Yığını

- **Next.js 14+ (App Router) + TypeScript**
- **Neon** — serverless Postgres + **Prisma** (ORM)
- **Pusher** — `pusher` (sunucu) + `pusher-js` (istemci)
- **Tailwind CSS** — büyük dokunma alanlı arayüz
- **@dnd-kit** — masa sürükle-bırak (taşıma/birleştirme), dokunmatik + mobil uyumlu, hafif

---

## 3. Salon Görünümü — Veriden Çizilen Canlı Floor-Plan

**Karar:** Krokiyi koda gömme. Salon, her masanın `x/y/en/şekil` alanlarından (Bölüm 5)
**veriden** çizilir. Gerçek krokin gelince kodu değiştirmeden, ekrandaki **Düzenle modunda**
masaları sürükleyip yerleştirirsin; konum DB'ye kaydolur. Bu, "modern POS" (Lightspeed/Square/Adisyo)
yaklaşımıdır: tek bakışta tüm salonun hali görünür.

### Başlangıç yerleşimi (sen Düzenle modunda oturtursun)
\`\`\`
┌─ KONAK KEBAP · SALON ─────────────────  [Düzenle ✎]  [Rapor 📊] ─┐
│  🟢 Boş 18    🔴 Dolu 11    ⏳ Ödeme bekleyen 2                   │
│  Açık hesap toplamı: ₺14.250     ·     Bugünkü ciro: ₺38.900     │
├──────────────────────────────────────────────────────────────────┤
│ [ İç Salon ]  Ön Bahçe   Arka Bahçe   Üst Kat        ← bölge sekme │
│                                                                    │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                │
│   │ İÇ1  │  │ İÇ2  │  │ İÇ3  │  │ İÇ4  │  │ İÇ5  │                │
│   │ boş  │  │₺420  │  │₺1.250│  │ boş  │  │₺180  │                │
│   │      │  │ 14dk │  │ 48dk │  │      │  │⏳KALAN│                │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘                │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                          │
│   │ İÇ6  │  │ İÇ7  │  │ İÇ8  │  │ İÇ9  │        [ KASA ]          │
│   │ boş  │  │₺900  │  │₺2.1k │  │ boş  │                          │
│   │      │  │ 22dk │  │1s05dk│  │      │                          │
│   └──────┘  └──────┘  └──────┘  └──────┘                          │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

### Masa kartı — her şey tek karede
- **Anlık tutar**, **açık süre kronometresi** (14dk · 1s05dk), **kalem sayısı**.
- **Renk dili:** boş = nötr/yeşil · dolu = tutarlı kart · **kısmi ödeme = sarı ⏳ KALAN** ·
  **çok uzun süredir açık (örn. >2 saat) = kırmızı uyarı** (masa unutulmasın).
- **Pusher pulse:** bir masa değişince kart kısa parlar → kasada kimse kaçırmaz.

### Modern kullanışlılık
1. **Sürükle-bırak birleştirme:** İÇ4 kartını İÇ3'ün üstüne sürükle → "Birleştir?" (Bölüm 8B akışı,
   parmakla). Boş masaya sürükle = **taşı**.
2. **Uzun bas / sağ tık menü:** Taşı · Birleştir · Kalem Taşı · Kapat — ekran değiştirmeden.
3. **İki mod, tek ekran (responsive):** Kasa PC / tablet → gerçek floor-plan (x/y konumlu, dokunmatik).
   Telefon (garson) → otomatik **tek kolon liste + bölge sekmesi** (kroki küçük ekranda işkence olur).
4. **Düzenle modu (✎, admin):** masaları sürükleyip gerçek krokine oturt → `x/y` DB'ye kaydolur.

### Teknik
- Konumlama: Tailwind + CSS `transform: translate(x,y)` (ağır canvas/lib yok).
- Sürükle-bırak: **@dnd-kit** (dokunmatik + mobil).
- Kronometre: `adisyon.acilis`'ten client'ta hesaplanır, saniyede bir tick.

**Bölge sekme sırası:** İç Salon → Ön Bahçe → Arka Bahçe → Üst Kat
**Toplam 29 masa** (İç 9 + Ön 5 + Arka 3 + Üst 12). Gerçek kroki gelince Düzenle modunda oturtulur.

---

## 4. Kurulum Adımları (VS Code)

\`\`\`bash
npx create-next-app@latest konak-adisyon --ts --tailwind --app --src-dir
cd konak-adisyon
npm install @prisma/client pusher pusher-js zustand @dnd-kit/core @dnd-kit/sortable
npm install -D prisma tsx
npx prisma init
\`\`\`

\`.env.local\`:
\`\`\`bash
DATABASE_URL="postgresql://...neon..."
PUSHER_APP_ID="..."
NEXT_PUBLIC_PUSHER_KEY="..."
PUSHER_SECRET="..."
NEXT_PUBLIC_PUSHER_CLUSTER="eu"
NEXT_PUBLIC_MENU_URL="https://take-away-system.vercel.app/api/products"
\`\`\`

---

## 5. Veritabanı Şeması (Prisma / Postgres)

> DİKKAT: Burada Urun/UrunGrubu YOK — menü paket API'sinden geliyor.
> DB sadece masa + adisyon + satılan kalem tutar.

\`prisma/schema.prisma\`:
\`\`\`prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Bolge {
  id      Int    @id @default(autoincrement())
  ad      String
  sira    Int
  masalar Masa[]
}

model Masa {
  id         Int       @id @default(autoincrement())
  bolge      Bolge     @relation(fields: [bolgeId], references: [id])
  bolgeId    Int
  ad         String    // "İÇ1", "ÖN3", "ÜST12"
  durum      String    @default("bos") // "bos" | "dolu"
  // --- Kroki konumu: salon ekranda veriden çizilir, koda gömülmez ---
  x          Int       @default(0)      // floor-plan x (px veya grid hücresi)
  y          Int       @default(0)      // floor-plan y
  en         Int       @default(1)      // 1 = tekli, 2 = geniş/birleşik masa
  sekil      String    @default("kare") // "kare" | "yuvarlak" | "dikdortgen"
  adisyonlar Adisyon[]
}

model Adisyon {
  id          Int            @id @default(autoincrement())
  masa        Masa           @relation(fields: [masaId], references: [id])
  masaId      Int
  acilis      DateTime       @default(now())
  kapanis     DateTime?
  durum       String         @default("acik") // "acik" | "kapali"
  toplam      Decimal        @default(0)  // tüm kalemlerin toplamı
  odenenTutar Decimal        @default(0)  // tutar bazlı tahsilatlar (eşit/serbest bölme)
  kalemler    AdisyonKalem[]
  tahsilatlar Tahsilat[]
}

model AdisyonKalem {
  id         Int      @id @default(autoincrement())
  adisyon    Adisyon  @relation(fields: [adisyonId], references: [id])
  adisyonId  Int
  urunId     String   // paket sistemdeki ürün id (örn. "k1")
  urunAd     String   // anlık kopya — menü değişse de geçmiş bozulmaz
  birimFiyat Decimal
  adet       Int      @default(1)
  yarim      Boolean  @default(false) // yarım porsiyon mu
  durum      String   @default("acik") // "acik" | "odendi"  (kalem bazlı bölme için)
  kaynakMasa String?  // birleştirmede geldiği masa adı (örn. "İÇ4") — listede ayrı grup
  not        String?
  zaman      DateTime @default(now())
}

model Tahsilat {
  id        Int      @id @default(autoincrement())
  adisyon   Adisyon  @relation(fields: [adisyonId], references: [id])
  adisyonId Int
  tutar     Decimal
  yontem    String   // "kalem" | "esit" | "serbest"
  detay     String?  // "4 kişiden 1 pay" / "İÇ3 kebap+ayran" gibi açıklama
  zaman     DateTime @default(now())
}
\`\`\`

\`\`\`bash
npx prisma db push
npx prisma generate
\`\`\`

---

## 6. İlk Veri — Sadece Masalar (menü çekiliyor, seed'e gerek yok)

\`prisma/seed.ts\`:
\`\`\`ts
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  if (await db.bolge.count() > 0) return;
  const bolgeler = [
    { ad: 'İç Salon',   sira: 1, onek: 'İÇ',  adet: 9  },
    { ad: 'Ön Bahçe',   sira: 2, onek: 'ÖN',  adet: 5  },
    { ad: 'Arka Bahçe', sira: 3, onek: 'ARK', adet: 3  },
    { ad: 'Üst Kat',    sira: 4, onek: 'ÜST', adet: 12 },
  ];
  const SUTUN = 5;          // satır başına 5 masa
  const ADIM = 120;         // hücre aralığı (px)
  for (const b of bolgeler) {
    const bolge = await db.bolge.create({ data: { ad: b.ad, sira: b.sira } });
    for (let i = 1; i <= b.adet; i++) {
      // başlangıç ızgara konumu — Düzenle modunda gerçek krokine taşınır
      const x = ((i - 1) % SUTUN) * ADIM;
      const y = Math.floor((i - 1) / SUTUN) * ADIM;
      await db.masa.create({ data: { bolgeId: bolge.id, ad: \`\${b.onek}\${i}\`, x, y } });
    }
  }
}
main().finally(() => db.\$disconnect());
\`\`\`
\`\`\`bash
npx tsx prisma/seed.ts
\`\`\`
Toplam **29 masa**: İç 9 + Ön 5 + Arka 3 + Üst 12.

---

## 7. Bağlantılar

\`src/lib/db.ts\`:
\`\`\`ts
import { PrismaClient } from '@prisma/client';
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = db;
\`\`\`

\`src/lib/pusher-server.ts\`:
\`\`\`ts
import Pusher from 'pusher';
export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});
\`\`\`

\`src/lib/pusher-client.ts\`:
\`\`\`ts
import PusherClient from 'pusher-js';
export const pusherClient = new PusherClient(
  process.env.NEXT_PUBLIC_PUSHER_KEY!,
  { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER! }
);
\`\`\`

---

## 8. Anlık Senkron (Pusher)

Kanal: \`salon\`. Olaylar: \`masa-guncellendi\`, \`adisyon-kapandi\`.

**Sunucu** (örn. \`src/app/api/kalem/route.ts\`):
\`\`\`ts
import { db } from '@/lib/db';
import { pusher } from '@/lib/pusher-server';

export async function POST(req: Request) {
  const { adisyonId, urunId, urunAd, birimFiyat, adet, yarim } = await req.json();
  const fiyat = yarim ? Number(birimFiyat) / 2 : Number(birimFiyat);

  await db.adisyonKalem.create({
    data: { adisyonId, urunId, urunAd, birimFiyat: fiyat, adet, yarim: !!yarim },
  });
  const kalemler = await db.adisyonKalem.findMany({ where: { adisyonId } });
  const toplam = kalemler.reduce((s, k) => s + Number(k.birimFiyat) * k.adet, 0);
  const adisyon = await db.adisyon.update({ where: { id: adisyonId }, data: { toplam } });

  await pusher.trigger('salon', 'masa-guncellendi', { masaId: adisyon.masaId, toplam });
  return Response.json({ ok: true });
}
\`\`\`

**İstemci** (\`src/store/useRealtime.ts\`):
\`\`\`ts
'use client';
import { useEffect } from 'react';
import { pusherClient } from '@/lib/pusher-client';

export function useRealtime(onUpdate: () => void) {
  useEffect(() => {
    const ch = pusherClient.subscribe('salon');
    ch.bind('masa-guncellendi', onUpdate);
    ch.bind('adisyon-kapandi', onUpdate);
    return () => { pusherClient.unsubscribe('salon'); };
  }, [onUpdate]);
}
\`\`\`

---

---

## 8B. OPERASYON SENARYOLARI (Sistemin Kalbi)

Bu bölüm masa taşıma, birleştirme, kalem taşıma, hesap bölme ve kısmi ödemeyi tanımlar.
Hepsi `Tahsilat` + kalem `durum` + `kaynakMasa` alanları üzerine kurulur.

### Temel İlke — Kalan Tutar Hesabı
```
toplam        = tüm kalemlerin (birimFiyat * adet) toplamı
kalemOdenen   = durum='odendi' olan kalemlerin toplamı   (kalem bazlı bölme)
tutarOdenen   = adisyon.odenenTutar                       (eşit/serbest bölme)
KALAN         = toplam - kalemOdenen - tutarOdenen
```
**KALAN = 0 olunca adisyon otomatik `kapali`, masa `bos`.**
Kısmi ödemede masa AÇIK kalır, ekranda KALAN gösterilir (senin isteğin).

---

### 1) Masa Taşıma (komple)  —  İÇ3 → ÜST5
Müşteri komple başka masaya geçti.
```ts
// POST /api/masa/tasi  { adisyonId, hedefMasaId }
// 1. Hedef masa boş mu? (dolu ise → "birleştir mi?" sor)
// 2. adisyon.masaId = hedefMasaId
// 3. eski masa.durum = 'bos', hedef masa.durum = 'dolu'
// 4. pusher: 'masa-guncellendi' (her iki masa)
```
Kalemler aynen taşınır, hiçbir şey değişmez. Tek tık.

---

### 2) Masa Birleştirme  —  İÇ4'ü İÇ3'e kat
İki masa aslında tek grup. İÇ4'ün TÜM kalemleri İÇ3'e aktarılır.
**Kalemler birleşmez** (senin isteğin): her aktarılan kaleme `kaynakMasa="İÇ4"` yazılır,
listede ayrı grup başlığı altında görünür.
```ts
// POST /api/masa/birlestir  { kaynakAdisyonId, hedefAdisyonId }
// 1. kaynak adisyonun kalemlerini hedef adisyona taşı:
//    kalem.adisyonId = hedefAdisyonId; kalem.kaynakMasa = kaynakMasaAdi
// 2. kaynak adisyon: toplam=0, durum='kapali' (boş kapanış, ciroya yazılmaz!)
//    -> rapor sorgusunda toplam=0 olanları veya birleştirilmişleri hariç tut
// 3. kaynak masa.durum='bos'
// 4. hedef adisyon toplamını yeniden hesapla
// 5. pusher: her iki masa
```
Ekranda hedef masa şöyle görünür:
```
İÇ3 (kendi):   Adana Kebap x2,  Ayran x2
İÇ4'ten:       Lahmacun x3,     Ayran x3   ← ayrı grup, birleşmez
```

---

### 3) Kalem Taşıma (parçalı aktarma)  —  seçili kalemler
Yanlış masaya girilen / başka masaya ait kalemleri taşı.
```ts
// POST /api/kalem/tasi  { kalemIds: number[], hedefAdisyonId }
// (hedef masa boşsa önce yeni adisyon aç)
// 1. seçili kalemlerin adisyonId = hedefAdisyonId
// 2. kaynakMasa etiketi opsiyonel (istenirse korunur)
// 3. iki adisyonun toplamını yeniden hesapla
// 4. kaynak adisyonda kalem kalmadıysa: durum='kapali', masa='bos'
// 5. pusher: her iki masa
```
Arayüz: adisyon ekranında kalemlerin yanında seçim kutusu → "Taşı" → hedef masa seç.

---

### 4) Hesap Bölme — 3 Yöntem

#### 4a) Kalem Bazında ("kim ne yediyse")
Seçili kalemler ödenmiş işaretlenir, KALAN düşer.
```ts
// POST /api/odeme/kalem  { adisyonId, kalemIds: number[] }
// 1. seçili kalemler durum='odendi'
// 2. Tahsilat kaydı: { tutar: seçili kalemler toplamı, yontem:'kalem', detay }
// 3. KALAN=0 ise adisyon kapanır
// 4. pusher
```

#### 4b) Eşit Bölme ("4 kişiyiz")
Toplam kişi sayısına bölünür; her ödemede 1 pay düşülür.
```ts
// POST /api/odeme/esit  { adisyonId, kisiSayisi, odenenPay }
// pay = toplam / kisiSayisi
// odenenTutar += pay * odenenPay
// Tahsilat: { tutar: pay*odenenPay, yontem:'esit', detay:`${kisiSayisi} kişiden ${odenenPay} pay` }
// KALAN=0 ise kapanır
```
> Eşit/serbest bölmede kalemler tek tek işaretlenmez, adisyon.odenenTutar üzerinden gider.

#### 4c) Serbest Tutar ("500 TL al")
Girilen miktar tahsil edilir.
```ts
// POST /api/odeme/serbest  { adisyonId, tutar }
// odenenTutar += tutar
// Tahsilat: { tutar, yontem:'serbest' }
// KALAN=0 ise kapanır
```

---

### 5) Kısmi Hesap Alma (biri erken kalktı)
Yukarıdaki 3 yöntemden herhangi biriyle bir kısmı tahsil edilir.
**Masa açık kalır, ekranda KALAN görünür** (senin isteğin).
Kalan sıfırlanınca masa otomatik boşalır. Hiçbir ekstra mekanizma gerekmez —
Tahsilat kayıtları + KALAN hesabı bunu doğal olarak yapar.

---

### Kalan Hesabı — Yardımcı Fonksiyon
`src/lib/hesap.ts`:
```ts
import { db } from './db';

export async function hesapla(adisyonId: number) {
  const a = await db.adisyon.findUnique({
    where: { id: adisyonId }, include: { kalemler: true },
  });
  if (!a) throw new Error('Adisyon yok');

  const toplam = a.kalemler.reduce((s,k)=> s + Number(k.birimFiyat)*k.adet, 0);
  const kalemOdenen = a.kalemler
    .filter(k=>k.durum==='odendi')
    .reduce((s,k)=> s + Number(k.birimFiyat)*k.adet, 0);
  const kalan = toplam - kalemOdenen - Number(a.odenenTutar);

  return { toplam, kalemOdenen, tutarOdenen: Number(a.odenenTutar), kalan };
}

// Her ödeme/taşıma sonrası: kalan<=0 ise kapat
export async function kapatKontrol(adisyonId: number, masaId: number) {
  const { kalan } = await hesapla(adisyonId);
  if (kalan <= 0.001) {
    await db.adisyon.update({ where:{id:adisyonId}, data:{ durum:'kapali', kapanis:new Date() }});
    await db.masa.update({ where:{id:masaId}, data:{ durum:'bos' }});
    return true;
  }
  return false;
}
```

---

### Eşzamanlılık Notu (önemli — çoklu cihaz)
Aynı masaya iki cihaz aynı anda işlem yaparsa (biri ödeme alırken diğeri kalem ekler)
veri bozulabilir. Bu yüzden ödeme/taşıma/birleştirme işlemlerini **tek transaction** içinde yap:
```ts
await db.$transaction(async (tx) => {
  // kalem güncelle / tahsilat ekle / toplam yeniden hesapla / kapatKontrol
});
```
Pusher zaten herkesi anında günceller, ama gerçek koruma transaction'da. Kısa işlemler
olduğu için performans sorunu olmaz.

---

### Rapor Notu (önemli)
Birleştirmede kaynak adisyon `toplam=0` ile kapanır. Ciro raporunda **çift sayımı önle**:
ciroyu `Tahsilat` kayıtlarından hesapla (gerçek tahsil edilen para), adisyon.toplam'dan değil.
Böylece bölme/birleştirme ciroyu bozmaz:
```ts
const ciro = await db.tahsilat.aggregate({
  _sum: { tutar: true },
  where: { zaman: { gte: bugun, lt: yarin } },
});
```

---

## 9. Ekran Akışı

1. **Salon floor-plan** (\`/adisyon\`): Masalar veriden (`x/y`) çizilir, bölge sekmeli. Üstte özet
   (boş/dolu/ödeme bekleyen + açık hesap + günlük ciro). Kartta tutar + süre + KALAN. Sürükle-bırak
   ile taşı/birleştir, uzun bas ile aksiyon menüsü. **Düzenle modu** ile masa konumları ayarlanır.
   Telefonda otomatik tek kolon listeye düşer. (Detay: Bölüm 3.)
2. **Adisyon ekranı** (\`/adisyon/masa/[id]\`): Solda menü (API'den, kategori sekmeli), sağda hesap.
   - Ürüne dokun → ekle. \`portionable\` ise yarım seçeneği. \`available:false\` ise pasif.
3. **Hesabı Kapat (tam)**: Kalan tutarın tamamı tek seferde tahsil edilir → bir
   `Tahsilat` kaydı, adisyon `kapali`, masa `boş`. (Onaylı.)
4. **Kısmi / Bölünmüş kapatma**: Bölüm 8B'deki yöntemlerle parça parça tahsil → masa
   KALAN bitene dek açık kalır.
5. **Raporlar** (`/adisyon/rapor`): Günlük ciro `Tahsilat` toplamından — gün **23:59'da**
   kapanır (00:00–23:59 arası tek gün). Çok satanlar.

---

## 10. Gün Sonu Mantığı (23:59)

Gün = takvim günü (00:00–23:59). Ciro **adisyon.toplam'dan DEĞİL, Tahsilat'tan** hesaplanır
(bölme/birleştirme ciroyu bozmasın diye — bkz. Bölüm 8B Rapor Notu):
```ts
// O günün başı 00:00, ertesi gün 00:00
const bugun = new Date(); bugun.setHours(0,0,0,0);
const yarin = new Date(bugun); yarin.setDate(yarin.getDate()+1);

const ciro = await db.tahsilat.aggregate({
  _sum: { tutar: true },
  where: { zaman: { gte: bugun, lt: yarin } },
});
```
Tahsilat ne zaman alındıysa o güne yazılır. 23:59'dan sonra alınan tahsilat ertesi güne düşer.
(İstersen gün başlangıcını 06:00'ya çekeriz: `bugun.setHours(6,0,0,0)` + saat<6 ise bir gün geri.)

---

## 11. Güvenlik / Giriş

- Sistem internette açık → **giriş şart** (herkes girmesin).
- En basiti: ortak PIN/şifre + cookie. (Garson takibi olmadığı için kullanıcı sistemi gerekmez.)
- \`/adisyon/*\` ve \`/api/*\` rotalarını middleware ile koru.
- Sadece \`NEXT_PUBLIC_*\` değişkenleri istemciye gider; \`PUSHER_SECRET\` ve \`DATABASE_URL\` asla.

---

## 12. Vercel'e Yükleme

\`\`\`bash
npm run build
\`\`\`
- GitHub push → Vercel otomatik deploy.
- Vercel → Environment Variables: tüm \`.env.local\` değişkenlerini ekle.
- \`konakkebap.com/adisyon\` yönlendirmesi.
- Telefon/kasa: tarayıcıdan aç, "ana ekrana ekle".

---

## 13. İleride (Bugün kurma, "kapı" hazır)

### a) Ciro → Paket Sisteme Gönderme
- Madem menüyü paket sistemden çekiyorsun, salon cirosunu da oraya raporlayabilirsin.
  Paket sistemde bir \`POST /api/sales\` endpoint'i açarsan, gün sonu salon cirosu oraya gider
  → tek panelde toplam ciro (paket + salon). \`src/lib/api-bridge.ts\` bu iş için.

### b) Termal Yazıcı (ESC/POS)
- \`src/lib/printer.ts\` → \`printFis(adisyon)\` taslak. Kasa PC'ye USB yazıcı + QZ Tray.

### c) Mutfak Ekranı
- Pusher kurulu. Yeni kalem → \`mutfak\` kanalı → mutfak ekranında anlık liste.

---

## 14. Yapım Sırası (operasyon senaryoları öncelikli)

**Aşama 1 — Temel**
1. [ ] create-next-app + Tailwind + Prisma + Neon.
2. [ ] Şema (Bölüm 5) + seed → 29 masa.
3. [ ] Menü çekme (`src/lib/menu.ts`) → 8 kategori görünsün.
4. [ ] Salon floor-plan + API: masaları `x/y`'den çiz, boş/dolu+tutar, üst özet bandı.
5. [ ] Masa kartı: süre kronometresi + KALAN + renk dili (boş/dolu/kısmi/uzun süre).
6. [ ] Düzenle modu (@dnd-kit): masaları sürükle-yerleştir → `x/y` DB'ye kaydet.
7. [ ] Adisyon aç, menüden ekle, yarım porsiyon, KALAN göster.

**Aşama 2 — Operasyon senaryoları (SİSTEMİN KALBİ, Bölüm 8B)**
8. [ ] `src/lib/hesap.ts` → kalan hesabı + kapatKontrol.
9. [ ] Kalem seçimi UI (her kalemde kutu).
10. [ ] Masa taşıma (komple — sürükle-bırak boş masaya).
11. [ ] Kalem taşıma (parçalı aktarma).
12. [ ] Masa birleştirme (`kaynakMasa` ile ayrı grup — sürükle-bırak dolu masaya).
13. [ ] Hesap bölme — kalem bazında.
14. [ ] Hesap bölme — eşit.
15. [ ] Hesap bölme — serbest tutar.
16. [ ] Kısmi ödeme akışı (masa açık kalır, KALAN düşer).

**Aşama 3 — Anlık + Kapanış**
17. [ ] Pusher → her operasyon sonrası senkron (telefon↔kasa testi + kart pulse).
18. [ ] Tam kapatma (kalanı tek seferde tahsil).
19. [ ] Raporlar — ciro `Tahsilat`'tan (gün sonu, Europe/Istanbul).
20. [ ] Giriş/güvenlik.
21. [ ] Vercel deploy.

**Aşama 4 — Sonra**
22. [ ] Ciro→paket sistem gönderimi, termal yazıcı, mutfak ekranı.

---

## Notlar / Açık Konular

- Menü API'si CORS açık ve herkese okunur durumda (test ettim, çalışıyor). İleride
  yazma işlemleri (ciro gönderme) için paket sistemde bir gizli anahtar/token kullan.
- \`portionable\` ürünlerde "yarım = yarım fiyat" varsayımı koydum; gerçekte yarım fiyatı
  farklıysa söyle, mantığı değiştiririm.
- Kroki gelince Bölüm 3'teki yerleşimi gerçeğine göre güncelleriz.
