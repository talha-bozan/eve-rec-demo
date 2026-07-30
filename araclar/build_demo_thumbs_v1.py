#!/usr/bin/env python3
"""Demo ürün görselleri — kırpılmış, doğrulanmış, kimlik-sözleşmeli thumbnail üreticisi.

Neden böyle:
- Ürün, 1200×1200 karenin medyan %17'sini kaplıyor (ölçüldü). Kırpmadan küçültülürse 52px
  yuvada ürün ~13px kalır — görsel ekleme işi görünürde çalışıp fiilen işe yaramazdı.
- Görseller sira9 uzayının item_idx'iyle indirildi; demo verisi v2 master'dan üretiliyor.
  İki üretici arasında kimlik sözleşmesi yoktu — bugün hizalılar ama bunu koruyan şey
  tesadüfi tarihçeydi. Bu script köprüyü KURAR ve çıktıya gömer: build/{çalışma}-zamanı
  kapıları uyuşmazlıkta gürültüyle ölür, sessizce yanlış fotoğraf göstermez.
- ⛔ status=="cached" filtresi YOK (ok=4587/cached=40 — o filtre 40 görsel gömerdi).

kullanım:  python scripts/build_demo_thumbs_v1.py [--size 192]
çıktı:     demo/data/thumbs.json
           {size, format, n, codes_sha256, probes:[[idx,code]×32], thumbs:[null|b64 ×13722]}
"""
import argparse
import base64
import hashlib
import io
import json
import os
import random

import numpy as np
import pandas as pd
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHITE_T = 245        # bu eşiğin altında en az bir kanal → ürün pikseli
MIN_BBOX = 0.02      # bbox bundan küçükse kırpma atlanır (beyaz-ürün çökmesi kapısı;
                     # ölçüldü: 200 örnekte 0 aday, min %2,75 — kemer-askı)


def crop_white(im):
    a = np.asarray(im)
    mask = a.min(axis=2) < WHITE_T
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return im, False
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    if (w * h) / (a.shape[0] * a.shape[1]) < MIN_BBOX:
        return im, False
    pad = int(0.06 * max(w, h))
    box = (max(0, x0 - pad), max(0, y0 - pad),
           min(a.shape[1], x1 + pad + 1), min(a.shape[0], y1 + pad + 1))
    crop = im.crop(box)
    side = max(crop.size)
    sq = Image.new("RGB", (side, side), (255, 255, 255))
    sq.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return sq, True


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--size", type=int, default=192)
    p.add_argument("--quality", type=int, default=70)
    p.add_argument("--master", default="data/item_master_demo3_v2.parquet",
                   help="demo verisinin üretildiği master — kimlik köprüsünün sağ ayağı")
    p.add_argument("--sira9", default="data/sira9_item_master.parquet",
                   help="görsellerin indirildiği uzay — köprünün sol ayağı")
    p.add_argument("--manifest", default="data/cbf/image_manifest.parquet")
    p.add_argument("--out", default="demo/data/thumbs.json")
    a = p.parse_args()
    os.chdir(ROOT)

    v2 = pd.read_parquet(a.master).sort_values("item_idx").reset_index(drop=True)
    s9 = pd.read_parquet(a.sira9).sort_values("item_idx").reset_index(drop=True)
    man = pd.read_parquet(a.manifest)

    # ---- kimlik köprüsü: manifest idx (sira9 uzayı) -> product_code -> v2 idx ----------
    n = len(v2)
    assert n == 13722 and (v2["item_idx"].to_numpy() == np.arange(n)).all()
    mism = int((v2["product_code"].astype(str) != s9["product_code"].astype(str)).sum())
    print(f"[thumbs] kimlik köprüsü: v2↔sira9 product_code uyuşmazlığı = {mism}")
    if mism:
        raise SystemExit("[thumbs] REDDEDİLDİ: iki master'ın item_idx uzayları ayrışmış — "
                         "manifest idx'leri artık doğrudan kullanılamaz, köprü tablosu şart")

    # dosya-diskte-var kapısı (status filtresi BİLEREK yok)
    exists = man["path"].apply(os.path.exists)
    if not exists.all():
        raise SystemExit(f"[thumbs] REDDEDİLDİ: {(~exists).sum()} manifest satırının dosyası yok")
    print(f"[thumbs] manifest: {len(man):,} satır, hepsi diskte")

    thumbs = [None] * n
    sizes = []
    skipped_crop = 0
    for _, r in man.iterrows():
        i = int(r["item_idx"])
        im = Image.open(r["path"]).convert("RGB")
        im, cropped = crop_white(im)
        if not cropped:
            skipped_crop += 1
        im.thumbnail((a.size, a.size), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, "WEBP", quality=a.quality, method=6)
        raw = b.getvalue()
        # bozuk-üretim kapısı: her thumb geri açılabilir olmalı
        Image.open(io.BytesIO(raw)).verify()
        thumbs[i] = base64.b64encode(raw).decode("ascii")
        sizes.append(len(raw))

    nn = sum(1 for t in thumbs if t)
    assert nn == len(man), f"non-null {nn} != manifest {len(man)}"
    sizes = np.array(sizes)
    total_b64 = sum(len(t) for t in thumbs if t)
    print(f"[thumbs] {nn:,} görsel · kırpma atlanan {skipped_crop} · "
          f"ort {sizes.mean()/1024:.2f} KB · p95 {np.percentile(sizes,95)/1024:.2f} KB · "
          f"b64 toplam {total_b64/1e6:.1f} MB")
    if total_b64 > 15e6 and a.size > 128:
        raise SystemExit(f"[thumbs] bütçe kapısı: {total_b64/1e6:.1f} MB > 15 MB — "
                         f"--size 128 ile yeniden koş")

    codes = v2["product_code"].astype(str).tolist()
    codes_sha = hashlib.sha256("\n".join(codes).encode()).hexdigest()
    rng = random.Random(42)
    probes = [[i, codes[i]] for i in sorted(rng.sample(range(n), 32))]

    payload = {"size": a.size, "format": "webp", "n": n,
               "codes_sha256": codes_sha, "probes": probes, "thumbs": thumbs}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[thumbs] yazıldı {a.out}  ({os.path.getsize(a.out)/1e6:.1f} MB) · "
          f"codes_sha256 {codes_sha[:16]}…")


if __name__ == "__main__":
    main()
