#!/usr/bin/env python3
"""demo/data/items.json üreticisi — bu dosyanın daha önce ÜRETİCİSİ YOKTU.

Üç ayrı denetim aynı boşluğu işaret etti: items.json elle/satır içi üretilmişti, kökeni kodla
bağlı değildi ve taksonomi değişince yenilenmesinin bir yolu yoktu. Artık var.

kullanım:  python scripts/build_demo_items_v1.py [--master data/item_master_demo3_v2.parquet]
çıktı:     demo/data/items.json   şema: {"fields":["code","name","brand","cat3","price"],
                                         "items":[[...], ...]}  (app.js:243,308 bu sırayı bekler)
"""
import argparse
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--master", default="data/item_master_demo3_v2.parquet")
    p.add_argument("--out", default="demo/data/items.json")
    a = p.parse_args()
    os.chdir(ROOT)

    m = pd.read_parquet(a.master).sort_values("item_idx").reset_index(drop=True)
    assert len(m) == 13722 and (m["item_idx"] == range(len(m))).all(), "master bozuk"

    items = []
    for _, r in m.iterrows():
        price = None if pd.isna(r["price"]) else round(float(r["price"]), 2)
        items.append([str(r["product_code"]), str(r["name"]) if pd.notna(r["name"]) else "",
                      str(r["brand"]) if pd.notna(r["brand"]) else "",
                      str(r["cat3"]) if pd.notna(r["cat3"]) else "", price])

    payload = {"fields": ["code", "name", "brand", "cat3", "price"], "items": items}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[items] {a.out}: {len(items):,} ürün ({os.path.getsize(a.out)/1e6:.2f} MB) "
          f"— kaynak {a.master}")


if __name__ == "__main__":
    main()
