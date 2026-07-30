#!/usr/bin/env python3
"""System#3 demo verisi (demo/data/users.json) — ŞAMPİYON modelden, yeniden üretilebilir.

Neden var: bu dosya daha önce satır içi `python -c` ile üretilmişti; depoda üreteci yoktu,
provenance'ı diskten kanıtlanamıyordu ve `cust` alanı hiçbir indeks uzayıyla eşleşmiyordu.
Artık üretici burada, girdileri kayıt altında.

İki liste birlikte yazılır:
  recs         = ŞAMPİYON ham çıktısı (ft90 + 0.8·z(log1p(pop90)) harmanı, top-60 tablosunun
                 ilk 10'u). Bu tablo export aşamasında ZATEN daha önce alınanları ve exclude
                 listesini maskeliyor (build_demo3_recs_v1.py:4) — script bunu ölçerek doğrular.
                 cat3 kapağı ve varyant kapağı UYGULANMAZ; onlar ayrı bir filtre katmanı.
  recs_shipped = sevk edilen filtreli tablonun ilk 10'u (cap 3), filtre tartışması için.

kullanım:  python scripts/build_demo_users_v1.py
çıktı:     demo/data/users.json  (+ içine gömülü `_prov` bloğu)
"""
import argparse
import collections
import hashlib
import json
import os
import pickle
import random

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Varsayılanlar; hepsi CLI'dan geçilebilir. Bir denetim bunları modül sabiti olarak yakaladı:
# "adım 7 hiçbir şey yapmaz — yeni CANDIDATE dosyasını bu scripte vermenin hiçbir yolu yok".
CHAMP = "inference/recs_top60_sasrec_FULL_ft90pop90_v20space.parquet"
SHIPPED = "inference/recs_topk_sasrec_DEMO3_FILTERED_v20space.parquet"
SEQ = "data/processed_data_v20_gtc_clean/user_sequences_days.pkl"
ITEMS = "demo/data/items.json"
OUT = "demo/data/users.json"


def log(m):
    print(m, flush=True)


def sha256_head(path, nbytes=64 << 20):
    """Tam dosya 600 MB+; ilk 64 MB'ın özeti kimlik için yeterli ve hızlı."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read(nbytes))
    return h.hexdigest()[:16]


def topk_for_users(path, wanted, k):
    """user_idx -> rank'e göre sıralı ilk k item_idx. Satır grubu grubu tarar."""
    f = pq.ParquetFile(path)
    want = np.array(sorted(wanted), dtype=np.int64)
    acc = collections.defaultdict(list)
    for rg in range(f.metadata.num_row_groups):
        t = f.read_row_group(rg, columns=["user_idx", "item_idx", "rank"])
        ui = t.column("user_idx").to_numpy()
        m = np.isin(ui, want)
        if not m.any():
            continue
        for u, i, r in zip(ui[m], t.column("item_idx").to_numpy()[m],
                           t.column("rank").to_numpy()[m]):
            acc[int(u)].append((int(r), int(i)))
    return {u: [i for _, i in sorted(v)][:k] for u, v in acc.items()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--n_users", type=int, default=400)
    p.add_argument("--k", type=int, default=10)
    p.add_argument("--min_hist", type=int, default=10)
    p.add_argument("--seed", type=int, default=20260730,
                   help="TEST seed'lerinden (42 / 4242) kasten AYRI: bu sadece demo vitrini "
                        "için müşteri seçimi, hiçbir ölçüme girmiyor")
    p.add_argument("--hist_show", type=int, default=40)
    p.add_argument("--champ", default=CHAMP, help="ham şampiyon tablosu")
    p.add_argument("--shipped", default=SHIPPED,
                   help="kurallı tablo (recs_shipped alanına girer) — aday tablo da verilebilir")
    p.add_argument("--items", default=ITEMS)
    p.add_argument("--kesif", default="inference/CANDIDATE_demo3_kesif.parquet",
                   help="3. raf: gecmiste HIC alinmamis kategorilerden oneriler (blanket)")
    p.add_argument("--k_kesif", type=int, default=5)
    p.add_argument("--exclude", default="inference/exclude_items_final.csv",
                   help="ikmal rafinda satilamaz urunler elenir")
    p.add_argument("--k_ikmal", type=int, default=3)
    p.add_argument("--txn", default="/home/talha/Desktop/EVE-RECOMMEND-ENGINE/processed_data_v20_fullnpz/train_transactions_full.npz")
    p.add_argument("--t_prime", type=int, default=20185)
    p.add_argument("--out", default=OUT)
    a = p.parse_args()

    os.chdir(ROOT)
    items = json.load(open(a.items, encoding="utf-8"))["items"]
    cat3 = {i: r[3] for i, r in enumerate(items)}
    n_items = len(items)

    # ⛔ Geçmiş kaynağı FİLTRENİN kullandığı işlem tablosu olmalı. Önceki sürüm
    # gtc_clean dizilerini okuyordu; o anlık görüntü T*=19932'de bitiyor ve T'=20185'e
    # kadarki ~273 günü HİÇ göstermiyordu. 422795'te tam o boşlukta kalan ESSENCE
    # MASKARA yüzünden müşteri "erkek" görünüp yanlış teşhise sebep oldu.
    log(f"[1/5] geçmiş okunuyor (filtre ile AYNI kaynak): {a.txn}")
    z = np.load(a.txn)
    tu, ti, td = z["user"], z["item"], z["day"]
    pre = td < a.t_prime
    tu, ti, td = tu[pre], ti[pre], td[pre]
    order = np.lexsort((td, tu))
    tu, ti, td = tu[order], ti[order], td[order]
    bounds = np.searchsorted(tu, np.arange(int(tu.max()) + 2))
    seq = {}
    for uu in np.unique(tu):
        s_, e_ = bounds[uu], bounds[uu + 1]
        seq[int(uu)] = {"items": ti[s_:e_].tolist(), "days": td[s_:e_].tolist()}
    cand = [u for u, s in seq.items() if len(s["items"]) >= a.min_hist]
    log(f"      {len(seq):,} kullanıcı · >= {a.min_hist} geçmişi olan: {len(cand):,}")

    rng = random.Random(a.seed)
    rng.shuffle(cand)
    pool = cand[: a.n_users * 3]          # ikinci tabloda düşen olursa yedek

    log(f"[2/5] şampiyon tablo taranıyor: {a.champ}")
    champ = topk_for_users(a.champ, pool, a.k)
    log(f"[3/5] kurallı tablo taranıyor: {a.shipped}")
    ship = topk_for_users(a.shipped, pool, a.k)
    # ---- ikmal rafi: REPLENISH_v1.md kazanan skorlayicisi -------------------------
    #   skor = (o urunu kac kez aldi) / log1p(son alimdan bu yana gecen gun + 1)
    # Aday havuzu MUSTERININ KENDI gecmisi; satilamaz urunler elenir.
    kesif = {}
    if a.kesif and os.path.exists(a.kesif):
        log(f"[3b/5] keşif rafı taranıyor: {a.kesif}")
        kesif = topk_for_users(a.kesif, pool, a.k_kesif)
    log("[3c/5] ikmal rafı hesaplanıyor (sıklık / log1p(gecikme))")
    excl = set(pd.read_csv(a.exclude)["item_idx"].astype(int).tolist())
    ikmal = {}
    for u in pool:
        cnt, last = {}, {}
        for it, dy in zip(seq[u]["items"], seq[u]["days"]):
            it = int(it)
            if it in excl or not (0 <= it < n_items):
                continue
            cnt[it] = cnt.get(it, 0) + 1
            last[it] = max(last.get(it, -1), int(dy))
        if not cnt:
            continue
        sc = sorted(cnt, key=lambda it: -(cnt[it] / np.log1p(a.t_prime - last[it] + 1)))
        ikmal[u] = sc[: a.k_ikmal]

    # Kapı: HER İKİ tablo da tam k öneri vermeli. Önceki sürüm yalnız şampiyona bakıyordu;
    # kurallı tabloda kısalan listeler sessizce demoya giriyordu (denetim bulgusu).
    chosen = [u for u in pool
              if len(champ.get(u, [])) == a.k and len(ship.get(u, [])) == a.k][: a.n_users]
    if len(chosen) < a.n_users:
        raise SystemExit(f"[users] sadece {len(chosen)} kullanıcı {a.k} öneriye sahip; "
                         f"{a.n_users} isteniyordu — havuzu büyüt")

    out = []
    for u in chosen:
        its = seq[u]["items"]; dys = seq[u]["days"]
        seen, hist = set(), []
        for k in range(len(its) - 1, -1, -1):          # en yeniden geriye, tekrarsız
            it = int(its[k])
            if not (0 <= it < n_items) or it in seen:
                continue
            seen.add(it)
            hist.append([it, int(dys[k]), a.t_prime - int(dys[k])])   # [idx, gun, kac_gun_once]
            if len(hist) >= a.hist_show:
                break
        n_hist_total = len(set(int(x) for x in its if 0 <= int(x) < n_items))
        out.append({"cust": str(u), "hist": hist, "hist_total": n_hist_total,
                    "recs": champ[u], "recs_shipped": ship.get(u, []),
                    "recs_ikmal": ikmal.get(u, []), "recs_kesif": kesif.get(u, [])})

    # ---- DOĞRULAMA: süreci değil, üretilen tensörü/veriyi ölç -------------------
    hist_full = {u: set(int(x) for x in seq[u]["items"]) for u in chosen}
    # NOT: hist satirlari artik [item_idx, gun, kac_gun_once] ucllusu
    repeat_champ = sum(1 for r in out if set(r["recs"]) & hist_full[int(r["cust"])])
    repeat_ship = sum(1 for r in out if set(r["recs_shipped"]) & hist_full[int(r["cust"])])

    def cap_dist(key):
        c = collections.Counter()
        for r in out:
            if not r[key]:
                continue
            c[max(collections.Counter(cat3[i] for i in r[key]).values())] += 1
        return dict(sorted(c.items()))

    log("[4/5] doğrulama")
    log(f"      şampiyon    : daha önce alınanı öneren kullanıcı = {repeat_champ}/{len(out)}")
    log(f"      sevk edilen : daha önce alınanı öneren kullanıcı = {repeat_ship}/{len(out)}")
    log(f"      şampiyon    aynı cat3'ten en fazla N ürün dağılımı: {cap_dist('recs')}")
    log(f"      sevk edilen aynı cat3'ten en fazla N ürün dağılımı: {cap_dist('recs_shipped')}")

    if repeat_champ:
        raise SystemExit(f"[users] REDDEDİLDİ: şampiyon tablo {repeat_champ} kullanıcıda daha önce "
                         f"alınan ürünü öneriyor. build_demo3_recs_v1.py:4 bu tablonun "
                         f"seen-masked olduğunu söylüyor — iddia ile veri çelişiyor, yazmıyorum.")
    if len(set(r["cust"] for r in out)) != len(out):
        raise SystemExit("[users] REDDEDİLDİ: yinelenen cust")
    if any(len(r["recs"]) != a.k for r in out):
        raise SystemExit("[users] REDDEDİLDİ: eksik şampiyon listesi")
    if any(len(r["recs_shipped"]) != a.k for r in out):
        raise SystemExit("[users] REDDEDİLDİ: eksik kurallı liste")

    prov = {
        "uretici": "scripts/build_demo_users_v1.py",
        "recs_kaynak": a.champ,
        "recs_aciklama": "SASRec şampiyon: ft90 recency finetune + 0.8*z(log1p(pop90)); "
                         "top-60 tablosunun ilk 10'u; cat3/varyant kapağı UYGULANMADI",
        "recs_shipped_kaynak": a.shipped,
        "recs_shipped_aciklama": "iş kuralları katmanı uygulanmış tablo",
        "items_kaynak": a.items,
        "kesif_kaynak": a.kesif,
        "kesif_aciklama": "3. raf: musterinin gecmiste HIC almadigi kategorilerden oneriler "
                          "(rule3_mode=blanket; pencere/sure hesabi YOK)",
        "ikmal_yontem": "REPLENISH_v1 kazanan skorlayici: siklik / log1p(gecikme), "
                        "aday havuzu = musterinin kendi gecmisi, satilamazlar elenmis",
        "hist_kaynak": SEQ,
        "cust_alani": "user_idx (v18 user_encoder) — müşteri kodu eşlemesi depoda yok",
        "seed": a.seed, "n_users": len(out), "k": a.k,
        "kaynak_ozet": {a.champ: sha256_head(a.champ), a.shipped: sha256_head(a.shipped)},
        "olcum": {
            "sampiyon_daha_once_alinani_oneren": repeat_champ,
            "sevk_daha_once_alinani_oneren": repeat_ship,
            "sampiyon_cat3_kap_dagilimi": cap_dist("recs"),
            "sevk_cat3_kap_dagilimi": cap_dist("recs_shipped"),
        },
    }

    log(f"[5/5] yazılıyor: {a.out}")
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"_prov": prov, "users": out}, f, ensure_ascii=False, separators=(",", ":"))
    log(f"      {os.path.getsize(a.out)/1e6:.2f} MB · {len(out)} kullanıcı")


if __name__ == "__main__":
    main()
