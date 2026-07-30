#!/usr/bin/env python3
"""demo/ klasörünü ÇİFT TIKLANABİLİR tek bir .html dosyasına gömer (v2 — görselli).

Neden gerekli: `demo/index.html` doğrudan (file://) açıldığında ÇALIŞMAZ — tarayıcı
`fetch("data/items.json")` çağrısını CORS nedeniyle engeller. Sunucusuz açılabilmesi için
verinin sayfanın içinde olması şart.

v2 değişiklikleri (denetim bulgularıyla):
- 5 veri dosyası (thumbs.json dahil, ~13 MB) → JS nesne literali yerine
  `<script type="application/json">` + TEMBEL JSON.parse (literal parse'ı telefonda 1-3 sn
  ana iş parçacığını bloklar; JSON.parse ~1,6× hızlı ve loader ekranında bir kez koşar).
  esc('</'→'<\\/') JSON-güvenli: "\\/" geçerli kaçıştır (kanıtlandı).
- TÜM yerel css linkleri gömülür (fonts.css eklendi; tek-link regex'i sızdırırdı).
- Dış-referans taraması artık ASSERT (önceki sürüm yalnız print ediyordu).
- Kimlik kapısı: thumbs.codes_sha256 == sha256(items kodları) — thumbs başka bir master
  uzayından gelirse build DURUR (yanlış ürüne yanlış fotoğraf sessizce gidemez).

kullanım:  python scripts/build_demo_singlefile_v1.py
çıktı:     dist/EVE_demo_tek_dosya.html
"""
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "demo")
OUT = os.path.join(ROOT, "dist", "EVE_demo_tek_dosya.html")
FILES = ["items.json", "similar.json", "fbt.json", "users.json", "thumbs.json",
         "vitrin.json"]
MAX_MB = 25


def esc(s):
    """`</script>` dizisi gömülü JSON'da geçerse sayfayı erkenden kapatır.
    `<\\/` JSON string'i içinde geçerli kaçıştır → JSON.parse aynen `</` üretir."""
    return s.replace("</", "<\\/")


def main():
    html = open(os.path.join(DEMO, "index.html"), encoding="utf-8").read()
    js = open(os.path.join(DEMO, "app.js"), encoding="utf-8").read()

    data, total = {}, 0
    for f in FILES:
        p = os.path.join(DEMO, "data", f)
        raw = open(p, encoding="utf-8").read()
        json.loads(raw)                      # bozuksa burada patlasın
        data["data/" + f] = raw
        total += os.path.getsize(p)

    # ---- kimlik kapısı: thumbs, items ile aynı ürün uzayından mı ----------------
    items = json.loads(data["data/items.json"])
    thumbs = json.loads(data["data/thumbs.json"])
    codes = [str(r[0]) for r in items["items"]]
    want = hashlib.sha256("\n".join(codes).encode()).hexdigest()
    assert thumbs.get("codes_sha256") == want, (
        f"KİMLİK UYUŞMAZLIĞI: thumbs.codes_sha256 {thumbs.get('codes_sha256', '?')[:16]}… != "
        f"items {want[:16]}… — thumbs.json başka bir master uzayından; yeniden üret")
    nn = sum(1 for t in thumbs["thumbs"] if t)
    print(f"  kimlik kapısı: codes_sha256 eşleşti · thumbs non-null {nn:,}")

    # ---- veri: JSON metni olarak göm + tembel parse'lı fetch gölgesi ------------
    blob = "{" + ",".join(f'"{k}":{v}' for k, v in data.items()) + "}"
    shim = (
        '<script type="application/json" id="eve-data">' + esc(blob) + "</script>\n"
        "<script>\n"
        "(function(){var raw=null,cache={},of=window.fetch;\n"
        "window.fetch=function(u){var k=String(u);\n"
        " if(k.slice(0,5)==='data/'){return Promise.resolve({ok:true,status:200,\n"
        "  json:function(){return new Promise(function(res){\n"
        "   if(raw===null){raw=JSON.parse(document.getElementById('eve-data').textContent);}\n"
        "   if(!(k in cache)){cache[k]=raw[k];}\n"
        "   res(cache[k]);});}});}\n"
        " return of?of.apply(this,arguments):Promise.reject(new Error('fetch yok'));};})();\n"
        "</script>\n"
    )

    # ---- TÜM yerel css linkleri satır içine (fonts.css + style.css + gelecektekiler)
    def inline_css(m):
        href = m.group(1)
        css = open(os.path.join(DEMO, href), encoding="utf-8").read()
        return "<style>\n" + css + "\n</style>"
    html, n_css = re.subn(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>',
                          inline_css, html)
    assert n_css >= 2, f"beklenen >=2 css linki, bulunan {n_css}"

    html = re.sub(r'<script[^>]*src=["\']app\.js["\'][^>]*>\s*</script>',
                  lambda m: shim + "<script>\n" + js + "\n</script>", html, count=1)
    assert "eve-data" in html, "veri gömülmedi"

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(html)

    out = open(OUT, encoding="utf-8").read()
    ext = re.findall(r'(?:src|href)=["\'](?!#|data:)([^"\']+)["\']', out)
    assert not ext, f"DIŞ REFERANS KALDI: {ext}"      # önceki sürüm yalnız print ediyordu
    mb = os.path.getsize(OUT) / 1e6
    print(f"  gömülen veri : {total/1e6:.2f} MB ({len(FILES)} dosya)")
    print(f"  çıktı        : {os.path.relpath(OUT, ROOT)}  {mb:.2f} MB")
    print(f"  dış referans : YOK (assert)")
    assert mb <= MAX_MB, f"bütçe aşıldı: {mb:.1f} MB > {MAX_MB} MB — thumbs --size 128 ile küçült"


if __name__ == "__main__":
    main()
