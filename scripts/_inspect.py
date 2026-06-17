import re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3007"
out = open("scripts/_inspect.txt", "w", encoding="utf-8")
def w(*a): out.write(" ".join(str(x) for x in a) + "\n")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 414, "height": 896})
    page = ctx.new_page()
    page.goto(f"{BASE}/adisyon")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    w("URL:", page.url)
    w("=== BODY TEXT (ilk 2000) ===")
    w(page.locator("body").inner_text()[:2000])
    w("=== BUTONLAR ===")
    btns = page.locator("button")
    for i in range(min(btns.count(), 60)):
        t = btns.nth(i).inner_text().strip().replace("\n", " | ")
        if t:
            w(f"[{i}] {t[:70]}")
    page.screenshot(path="scripts/_inspect.png", full_page=True)
    browser.close()
out.close()
print("done")
