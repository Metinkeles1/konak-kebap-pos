# Konak Kebap — Adisyon Sistemi

Masa/adisyon takip sistemi. Next.js 16 (App Router) + Prisma/Neon (Postgres) + Pusher + Tailwind.
Menü, paket sistemin açık API'sinden çekilir; DB sadece masa + adisyon + kalem + tahsilat tutar.

Tam tasarım dokümanı: [`docs/SETUP.md`](docs/SETUP.md).

## Hızlı Başlangıç

1. **Ortam değişkenleri**
   - `.env` içine Neon bağlantı string'ini koy:
     ```
     DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
     ```
   - `.env.local` zaten hazır (menü URL'i dolu). Anlık senkron için Pusher anahtarlarını doldur
     (boş bırakırsan sistem yine çalışır; senkron olmaz, "Yenile" ile güncellenir).

2. **Veritabanını hazırla** (tablolar + 29 masa)
   ```bash
   npm run db:push
   npm run db:seed
   ```

3. **Çalıştır**
   ```bash
   npm run dev
   ```
   Aç: http://localhost:3000 → otomatik `/adisyon` (salon).

## Ne Hazır (Aşama 1)

- **Salon floor-plan** (`/adisyon`): masalar veriden (`x/y`) çizilir, bölge sekmeli, üst özet bandı
  (boş/dolu/ödeme bekleyen + açık hesap + günlük ciro).
- **Masa kartı**: anlık tutar/KALAN, açık süre kronometresi, renk dili (boş/dolu/kısmi/uzun süre),
  Pusher ile güncelleme parıltısı.
- **Düzenle modu** (✎): masaları sürükle-yerleştir → konum DB'ye kaydolur (tablet/kasa).
- **Adisyon ekranı** (`/adisyon/masa/[id]`): menüden ekle, yarım porsiyon (½), canlı KALAN.

## Sırada (docs/SETUP.md)

- **Aşama 2:** taşıma/birleştirme, hesap bölme (kalem/eşit/serbest), kısmi ödeme.
- **Aşama 3:** tam kapatma, gün sonu rapor (ciro `Tahsilat`'tan, Europe/Istanbul), giriş, deploy.

## Faydalı Komutlar

| Komut | İş |
|-------|-----|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Production build |
| `npm run db:push` | Şemayı Neon'a uygula |
| `npm run db:seed` | 29 masayı ekle |
| `npm run db:studio` | Prisma Studio (veriyi görsel incele) |

## Notlar

- **Prisma v6'ya sabit** (bilerek): create-next-app v7 kuruyor; v7'nin yeni ESM generator'ı
  klasik `@prisma/client` kalıbından farklı (output path zorunlu). v6 rehberle uyumlu.
- Para alanları `Decimal`; API katmanında `number`'a çevrilip gönderilir.
