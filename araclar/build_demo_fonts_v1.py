#!/usr/bin/env python3
"""Montserrat'ı (OFL) indirir, Türkçe alt kümesine subset eder, data-URI olarak gömer.

Neden böyle:
- Sunum kimliği Montserrat; sistemde kurulu değil, pptx içindeki .fntdata obfüske (çevrilemez).
- Google Fonts css2 endpoint'i UA'YA GÖRE FARKLI çıktı verir (ölçüldü): tarayıcı UA'sı →
  unicode-range'e bölünmüş woff2 parçaları (brotli'siz AÇILAMAZ bile); UA'sız istek → ağırlık
  başına TEK TTF. Bu yüzden UA başlığı BİLEREK gönderilmez ve her indirilen dosyada sfnt
  imzası (00 01 00 00) assert edilir.
- woff2 bonus (brotli varsa), TTF garanti (bu makinede test edildi: 738→22,7 KB).

kullanım:  python scripts/build_demo_fonts_v1.py
çıktı:     demo/fonts.css   (yalnız data: URI — dış referans sıfır)
"""
import base64
import io
import os
import re
import urllib.request

from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS = [400, 600, 700, 800]   # CSS'te 700 yaygın; sette yoksa 800'e yuvarlanır (kalınlaşır)
CSS2 = ("https://fonts.googleapis.com/css2?family=Montserrat:wght@"
        + ";".join(str(w) for w in WEIGHTS) + "&display=swap")
# Türkçe + temel Latin + rakam/işaret + ₺
TEXT = ("ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZabcçdefgğhıijklmnoöpqrsştuüvwxyz"
        "0123456789₺€.,:;!?%()[]{}<>+-–—=/\\'\"«»·×→↓⇄ &@#_|")


def fetch(url):
    req = urllib.request.Request(url)          # UA başlığı BİLEREK yok
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    os.chdir(ROOT)
    css = fetch(CSS2).decode()
    faces = re.findall(r"font-weight:\s*(\d+);[^}]*?url\((https://[^)]+)\)", css, re.S)
    got = {int(w): u for w, u in faces}
    missing = [w for w in WEIGHTS if w not in got]
    if missing:
        raise SystemExit(f"[fonts] css2 cevabında eksik ağırlık: {missing}\n{css[:400]}")

    try:
        import brotli  # noqa: F401
        flavor, ext, fmt = "woff2", "woff2", "woff2"
    except ImportError:
        flavor, ext, fmt = None, "ttf", "truetype"
        print("[fonts] brotli yok → TTF subset (garanti yol)")

    out = ["/* Montserrat (SIL OFL) — Google Fonts'tan indirilip Türkçe alt kümesine",
           "   subset edildi; tamamı data-URI, dış istek SIFIR. Üretici:",
           "   scripts/build_demo_fonts_v1.py */"]
    for w in WEIGHTS:
        raw = fetch(got[w])
        if raw[:4] != b"\x00\x01\x00\x00":
            raise SystemExit(f"[fonts] {w}: sfnt imzası yok (ilk 4 bayt {raw[:4]!r}) — "
                             f"css2 UA'lı cevap vermiş olabilir, gömme güvensiz")
        opts = subset.Options()
        opts.flavor = flavor
        f = subset.load_font(io.BytesIO(raw), opts)
        s = subset.Subsetter(opts)
        s.populate(text=TEXT)
        s.subset(f)
        b = io.BytesIO()
        f.save(b)
        data = base64.b64encode(b.getvalue()).decode()
        out.append(
            f"@font-face{{font-family:'Montserrat';font-style:normal;font-weight:{w};"
            f"font-display:swap;src:url(data:font/{ext};base64,{data}) format('{fmt}');}}")
        print(f"[fonts] {w}: {len(raw)/1024:.0f} KB → subset {len(b.getvalue())/1024:.1f} KB")

    with open("demo/fonts.css", "w") as f:
        f.write("\n".join(out) + "\n")
    sz = os.path.getsize("demo/fonts.css")
    print(f"[fonts] yazıldı demo/fonts.css ({sz/1024:.0f} KB)")
    assert "http" not in "".join(out[3:]), "dış referans sızdı"


if __name__ == "__main__":
    main()
