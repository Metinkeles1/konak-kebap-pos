import json, re, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3007"
report = {"steps": [], "samples": [], "console": []}

def log(msg):
    report["steps"].append(msg)
    print("STEP:", msg, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 414, "height": 896})  # mobil
    page = ctx.new_page()
    page.on("console", lambda m: report["console"].append(f"{m.type}: {m.text}"))

    page.goto(f"{BASE}/adisyon")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)

    # Mobil Liste görünümüne geç (sade buton ızgarası)
    try:
        page.get_by_role("button", name=re.compile("Liste")).first.click()
        page.wait_for_timeout(500)
    except Exception as e:
        log(f"Liste butonu yok: {e}")

    # Boş masa = kart metninde 'kişi' geçen (tutar yok). İlk boş masayı seç.
    masa_butonlar = page.locator("button", has_text=re.compile("kişi"))
    n = masa_butonlar.count()
    log(f"Boş masa adayı: {n}")
    if n == 0:
        page.screenshot(path="scripts/_t_no_empty.png", full_page=True)
        print(json.dumps(report, ensure_ascii=False)); browser.close(); raise SystemExit("boş masa yok")

    hedef = masa_butonlar.first
    hedef_metin = hedef.inner_text().strip().replace("\n", " ")
    # Masa adı = ilk satır (kapasite rozeti '4 👤' olabilir, sonra ad)
    log(f"Seçilen masa kartı metni: {hedef_metin!r}")
    hedef.click()

    page.wait_for_url(re.compile(r"/adisyon/masa/\d+"))
    masa_id = int(re.search(r"/masa/(\d+)", page.url).group(1))
    report["masaId"] = masa_id
    log(f"Masa açıldı, masaId={masa_id}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    # Ürün ekle: 2 Lahmacun + 2 (ilk kebap). Önce ürün adlarını bul.
    # Lahmacun sekmesi/ürünü
    def urun_tikla(ad_regex, kez):
        btn = page.locator("button", has_text=re.compile(ad_regex, re.I)).first
        btn.wait_for(state="visible", timeout=5000)
        for _ in range(kez):
            btn.click()
            page.wait_for_timeout(120)  # hızlı ardışık dokunuş

    # Kategori sekmelerinde gezinerek lahmacun ve kebap bul
    t0 = time.time()
    try:
        urun_tikla("Lahmacun", 2)
        log("2 lahmacun eklendi")
    except Exception as e:
        log(f"Lahmacun bulunamadı: {e}")

    # Kebap kategorisine geç (sekme), sonra ekle
    try:
        page.get_by_role("button", name=re.compile("Kebap", re.I)).first.click()
        page.wait_for_timeout(300)
    except Exception:
        pass
    try:
        # 'Kebap' içeren ilk ÜRÜN (sekme değil) — fiyatı olan kart
        kebap = page.locator("button", has_text=re.compile("Kebap", re.I))
        # fiyat (₺) içeren olanı seç
        secildi = False
        for i in range(kebap.count()):
            txt = kebap.nth(i).inner_text()
            if "₺" in txt or re.search(r"\d", txt):
                for _ in range(2):
                    kebap.nth(i).click(); page.wait_for_timeout(120)
                secildi = True
                log(f"2 kebap eklendi: {txt.strip()[:40]!r}")
                break
        if not secildi:
            log("kebap ürünü bulunamadı")
    except Exception as e:
        log(f"Kebap ekleme hatası: {e}")

    # Hesap toplamını oku (mobil alt çubukta 'Kalan')
    page.wait_for_timeout(300)
    try:
        kalan_metin = page.locator("text=Kalan").first
        log("masa ekranı kalan civarı: " + page.locator("body").inner_text()[:0])
    except Exception:
        pass

    # SALONA DÖN
    page.get_by_role("link", name=re.compile("Salon")).first.click()
    page.wait_for_url(re.compile(r"/adisyon$"))
    tdon = time.time()
    log(f"Salona dönüldü (ekleme→dönüş {tdon-t0:.2f}s)")

    # Liste görünümüne geç ki kartı okuyabilelim
    try:
        page.get_by_role("button", name=re.compile("Liste")).first.click()
    except Exception:
        pass

    # Hedef masanın kartını bul: metni masa adını içeren ve artık tutar(₺) gösteren.
    # Masa adını hedef_metin'den çıkar (rakam+👤 ve 'kişi' temizle)
    ad = re.sub(r"\d+\s*👤", "", hedef_metin)
    ad = re.sub(r"\d+\s*kişi", "", ad, flags=re.I).strip()
    log(f"Hedef masa adı tahmini: {ad!r}")

    # ~2.6 sn boyunca sık ölç: kartta görünen tutar sabit mi yoksa tırmanıyor mu?
    son = None
    for i in range(26):
        try:
            kart = page.locator("button", has_text=ad).first
            txt = kart.inner_text().strip().replace("\n", " ")
        except Exception:
            txt = "(okunamadı)"
        ts = round((time.time() - tdon) * 1000)
        if txt != son:
            report["samples"].append({"t_ms": ts, "kart": txt})
            print(f"  t+{ts}ms: {txt}", flush=True)
            son = txt
        page.wait_for_timeout(100)

    page.screenshot(path="scripts/_t_salon_son.png", full_page=True)
    browser.close()

print("REPORT_JSON_START")
print(json.dumps(report, ensure_ascii=False, indent=2))
print("REPORT_JSON_END")
