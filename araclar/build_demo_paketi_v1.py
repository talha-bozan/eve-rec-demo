#!/usr/bin/env python3
"""Teslim paketini (dist/demo_paketi + zip) demo/ kaynağından DETERMİNİSTİK kurar.

Neden var: paket daha önce elle kopyalanıyordu ve iki kez bayatladı (sabah paketinde eski
araclar/, OKU_BENI'de eski sayılar). Bu script tek doğruluk kaynağından kurar ve sha256 ile
kaynak==paket kanıtı basar.

kullanım:  python scripts/build_demo_paketi_v1.py
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "dist", "demo_paketi")
ARAC = ["build_demo_thumbs_v1.py", "build_demo_fonts_v1.py", "build_demo_items_v1.py",
        "build_demo_users_v1.py", "build_demo_singlefile_v1.py", "build_demo_paketi_v1.py"]
DEMO_FILES = ["index.html", "style.css", "app.js", "fonts.css", ".nojekyll"]
DATA_FILES = ["items.json", "similar.json", "fbt.json", "users.json", "thumbs.json",
              "vitrin.json"]

# Bu liste app.js'in fetch ettiği listeyle AYNI olmalı. Ayrı ayrı bakımı yapılan iki
# hardcoded liste sessizce ayrışır: vitrin.json eklendiğinde bu liste güncellenmedi ve
# paketteki pages/ sürümü eksik dosya yüzünden hiç açılmıyordu. Kapı aşağıda.


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def main():
    os.chdir(ROOT)
    os.makedirs(os.path.join(P, "pages", "data"), exist_ok=True)
    os.makedirs(os.path.join(P, "araclar"), exist_ok=True)

    shutil.copy2("dist/EVE_demo_tek_dosya.html", P)
    for f in DEMO_FILES:
        shutil.copy2(os.path.join("demo", f), os.path.join(P, "pages", f))
    _js = open(os.path.join(ROOT, "demo", "app.js"), encoding="utf-8").read()
    _eksik = [f for f in DATA_FILES if f'"{f}"' not in _js]
    _fazla = [f for f in re.findall(r'"(\w+\.json)"', _js.split("function loadAll")[1][:400])
              if f not in DATA_FILES]
    if _eksik or _fazla:
        raise SystemExit(f"[paket] REDDEDİLDİ: app.js'in yüklediği dosyalarla DATA_FILES "
                         f"ayrışmış — app.js'te olmayan {_eksik}, listede olmayan {_fazla}")

    for f in DATA_FILES:
        shutil.copy2(os.path.join("demo", "data", f), os.path.join(P, "pages", "data", f))
    for f in ARAC:
        shutil.copy2(os.path.join("scripts", f), os.path.join(P, "araclar", f))

    # kaynak == paket kanıtı (README pakete bilerek girmez — politika)
    bad = []
    for f in DEMO_FILES:
        if sha(os.path.join("demo", f)) != sha(os.path.join(P, "pages", f)):
            bad.append(f)
    for f in DATA_FILES:
        if sha(os.path.join("demo", "data", f)) != sha(os.path.join(P, "pages", "data", f)):
            bad.append("data/" + f)
    if sha("dist/EVE_demo_tek_dosya.html") != sha(os.path.join(P, "EVE_demo_tek_dosya.html")):
        bad.append("EVE_demo_tek_dosya.html")
    if bad:
        raise SystemExit(f"[paket] senkron bozuk: {bad}")

    zpath = "dist/EVE_demo_paketi_2026-07-30.zip"
    if os.path.exists(zpath):
        os.remove(zpath)
    subprocess.run(["zip", "-q", "-r", os.path.basename(zpath), "demo_paketi"],
                   cwd="dist", check=True)
    print(f"[paket] {len(DEMO_FILES)+len(DATA_FILES)+len(ARAC)+2} dosya senkron · "
          f"zip {os.path.getsize(zpath)/1e6:.1f} MB · kaynak==paket sha256 doğrulandı")


if __name__ == "__main__":
    main()
