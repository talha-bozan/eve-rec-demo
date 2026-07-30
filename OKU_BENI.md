# EVE — üç öneri sisteminin çıktıları (30 Temmuz 2026 · v5: müşteri vitrini)

> **v5'te yeni:** demo artık bir **ürün vitrini** — müşteri arama kutusuna yazdığında kabul
> edilebilir sonuçlar görür. Teknik ödünleşimler bu belgede kalır, ekrandan çıktı.
>
> **Sekme 1 — RecomEve'nin üç metni ayrı ayrı:** aynı ürün **ürün tanımı**, **ürün açıklaması**
> ve **ürün fotoğrafından üretilmiş başlık** üzerinden ayrı ayrı değerlendirilir; üçü yan yana
> gösterilir, en altta bugün yayında olan liste durur.
> **Sekme 2 — tek liste:** sürüm karşılaştırması ve "sorunlu örnek" turu kaldırıldı.
> **Sekme 3 — rahat düzen:** geçmiş üstte yatay şeride taşındı, karşılaştırılan iki liste
> iki katı genişliğe kavuştu.
> **Üç sistemde de** listesi neredeyse tamamen aynı ürünün tonlarından oluşan ürünler arama
> havuzundan düşürüldü (S#1: **730** · S#2: **71**). Katalog ve artefaktlar değişmedi.
>
> v4'ten devam eden kurallar (Sekme 3): geçmişte alınan **hiçbir kategoriden** öneri çıkmaz
> (süre hesabı yok) · aynı ürün hattının başka boy/tonu önerilmez · cinsiyet profiline aykırı
> ürün gösterilmez · altta **"yine lazım olabilir"** rafı tekrar talebini karşılar.

Paketin içinde iki sürüm var, ikisi de aynı veriyi gösteriyor:

| ne | nasıl açılır |
|---|---|
| **`EVE_demo_tek_dosya.html`** | **Çift tıkla.** Sunucu gerekmez, internet gerekmez. |
| `pages/` klasörü | GitHub Pages'e / bir web sunucusuna koymak için (5 dosya + `data/` içinde 5 JSON). |

`pages/index.html`'i çift tıklarsan **boş açılır** — tarayıcı `file://` üzerinden `fetch()`'i
engelliyor. Kurcalamak için ya tek dosyayı kullan, ya klasörün içinde:
`python3 -m http.server 8000` çalıştırıp `http://localhost:8000` adresine git.

---

## Sekme 1 — Benzer Ürünler (System#1, RecomEve CBF)

**Ne gösteriyor:** bir ürüne içerik olarak en benzeyen ürünler — **üç ayrı metinden ayrı ayrı**,
altta bugün yayında olan liste.

| modalite | ne demek | isabet HR@10 (kapsanan müşterilerde) | tutulan-ürün recall@10 |
|---|---|---|---|
| **Ürün tanımı** (identification) | ürünün kimlik metni (marka, tip, hacim) | **0,01548** | 0,966 |
| **Ürün açıklaması** (description) | uzun tanıtım metni | 0,01425 | 0,982 |
| **Görsel başlığı** (caption) | ürün fotoğrafından üretilmiş metin | 0,01374 | 0,968 |
| eski metin-tabanı | — | 0,0108 | — |

**Kapsama:** üç modalite de aynı **4.804 üründe** (katalogun %35'i) dolu; kalan 8.918 üründe
metin benzerliği yedeği çalışır ve modalite ayrımı gösterilmez (ekranda açıkça yazar).
Fotoğraf kapsaması bu kümede **%76,8** — modalite komşularının **%87'sinde** görsel var.

**Kaynak:** `embeddings/recomeve/cbf_knn_{identification,description,caption}.npz` (RecomEve'den
kopyalandı, sha256 `similar.json`'ın `_prov` bloğunda) + sevk edilen `content_knn_v4.npz`.
**Üretici:** `scripts/build_demo_similar_v1.py` — üretim kuralı *(100 komşudan satılamazlar ve
ürünün kendisi atılır, kalanın ilk 10'u alınır)* bugünkü listeyi **13.722/13.722 satırda birebir**
yeniden üretir; tutmazsa build durur.

✅ **Kapanan açık:** önceki sürümde *"System#1'in isabet oranının makine çıktısı yok"* yazıyordu.
Bulundu: `val_hr_bridge.csv` + `holdout_metrics.json` yukarıdaki sayıları birebir doğruluyor.
Ölçüm iki sütun veriyor — tabloda **kapsanan müşterilerde** olan gösteriliyor; tüm katalogda
karşılığı 0,01175 (identification).

⚠ Ölçtüğüm çeşitlilik sınırı: **730 üründe** (%5,32) 10 komşunun tamamı aynı ürünün tonu/çeşidi.
Bu ürünler **arama havuzundan düşürüldü**; komşu listelerinde görünmeye devam ederler.

## Sekme 2 — Birlikte Alınanlar (System#2, FBT / EASE)

**Ne gösteriyor:** bir ürünün yanında satılan ürünler — **tek liste**. Sürüm karşılaştırması ve
"sorunlu örnek" turu bu sürümde kaldırıldı; demo bir ürün vitrini.

**Kaynak:** çeşit sınırı uygulanmış liste (cap:2). Sevk edilen ham tablo
`inference/fbt_pairs_v3.parquet` yerinde duruyor, demo verisinden yalnız karşılaştırma bacağı
çıkarıldı (`fbt.json` 1,14 → 0,59 MB; `cap2` birebir korundu).

Ölçülen isabet (honest TEST HR@10) — **karar için, ekranda değil**:

| sürüm | HR@10 | popülerlik tabanına göre | ağır yığılma (≥5 çift) |
|---|---|---|---|
| v3 (sevk edilen ham) | 0,1268 | 4,86× | 2.256 üründe |
| **cap:2 (demoda gösterilen)** | 0,12205 (**−%3,7**) | 4,67× | **71 üründe** |
| cap:1 (üretilmedi) | 0,11185 (−%11,8) | 4,29× | kuralın tam karşılığı |

⚠ Dürüst sınır: cap:2 **ağır** yığılmayı çözüyor (2.256 → 71) ama tek çiftleri çözmüyor —
listelerin %36,7'si tamamen temiz. Kalan **71 çapa arama havuzundan düşürüldü**, böylece
müşteri onlara rastlamıyor.

## Sekme 3 — Kişiye Özel (System#3, SASRec)

**Ne gösteriyor:** üstte **geçmiş** yatay bir şerit (alım tarihleriyle: "6 ay önce"), altında
iki geniş sütun yan yana — solda modelin **ham tahmini**, sağda mağaza kurallarından geçmiş
**önerilen liste**. En altta **"yine lazım olabilir"** rafı.
*(v5'te düzen değişti: geçmiş karşılaştırmaya girmeyen bir bağlam olduğu için akıştan çıkarıldı;
karşılaştırılan iki liste böylece iki katı genişliğe kavuştu.)*
**Kaynak:** ham liste `recs_top60_sasrec_FULL_ft90pop90` (şampiyon; honest TEST HR@10 **0,0426**,
popülerlik tabanı 0,0262 → **1,63×**) · kurallı liste `CANDIDATE_demo3_v4.parquet` ·
ikmal rafı **hesaplanır** (REPLENISH_v1 kazanan skorlayıcısı: sıklık / log1p(gecikme),
aday havuzu müşterinin kendi geçmişi, satılamazlar elenmiş).

**Uygulanan kurallar ve ölçülen düşümleri** (24,49M satırlık tam nüfus tablosunda):

| kural | ne yapar | düşen satır |
|---|---|---|
| kalıcı kategori yasağı | geçmişte şampuan/diş macunu/duş jeli alana o kategori bir daha çıkmaz | **8.616.012** |
| varyant-geçmiş | geçmişte alınan ürünün başka boyu/tonu önerilmez | **1.855.171** |
| cinsiyet uyumsuzluğu | net cinsiyet profilli müşteriye karşı cinsin ürünü gitmez | **72.151** |

**İki raf, net iş bölümü:**

| bölüm | ne içerir | kaynak |
|---|---|---|
| **Önerilen liste** | geçmişteki **hiçbir** kategoriden ürün yok (süre hesabı yok) | `CANDIDATE_demo3_kesif.parquet` — 24,26M satır, 40,9M satır elendi |
| **Yine lazım olabilir** | müşterinin kendi aldığı ürünler | hesaplanır: sıklık / log1p(gecikme) |

Doğrulandı (400 müşteri): önerilen listedeki **4.000 üründen 0'ı** geçmiş kategoriden;
ikmal rafındaki ürünlerin **%99'u** geçmişte var, ana listeyle **çakışma 0**.

⚠ Bedeli açıkça: VAL isabet **−%39,5**. Bu kayıp müşterinin zaten alacağı tekrar ürünlerinden
geliyor ve o talep silinmedi, alttaki rafa taşındı.

Liste doluluğu: ort **14,994** · tam-15 **%99,84** · 10'un altına düşen **%0,038**.

**Bağımsız doğrulama** (`scripts/verify_demo3_v3_v1.py`, ham girdilerden yeniden hesap):
üç ailede ihlal **0** · varyant ihlali **0** · cinsiyet ihlali **0**.

⚠ **Ödünleşim, açıkça:** kalıcı yasağın VAL'de ölçülen bedeli **−%4,4 isabet**. Şampuan
alıcılarının %62,6'sı tekrar aldığı için bu talep silinmedi, "yine lazım olabilir" rafına
taşındı. Cinsiyet filtresinin bedeli **yok** (VAL 0,04515 vs 0,04512).

---

## Yeniden üretmek

```bash
# 1) ürün özellikleri (cinsiyet + kaynak + güven) — tutulan-tohum kapılı
python scripts/build_item_attributes_v1.py

# 2) kurallı aday tablo (üç kural birden)
python scripts/build_demo3_recs_v1.py \
  --master data/item_master_demo3_v2.parquet \
  --stats  data/demo3_category_stats_demo3v2.parquet \
  --perma_ban "ŞAMPUAN,DİŞ MACUNU,DUŞ JELİ" --gender_filter --variant_history_ban \
  --out inference/CANDIDATE_demo3_v4.parquet \
  --drops_out inference/CANDIDATE_demo3_v4_drops.parquet

# 3) bağımsız kapı (pipeline'ın dizilerine değil, ham girdilere karşı)
python scripts/verify_demo3_v3_v1.py --candidate inference/CANDIDATE_demo3_v4.parquet

# 4) System#1 verisi: sevk edilen hibrit + RecomEve üç modalitesi
#    (regresyon kapısı: bugünkü listeyi birebir üretemezse yazmadan durur)
python scripts/build_demo_similar_v1.py

# 5) vitrin filtresi: arama havuzundan düşürülecek ürünler
python scripts/build_demo_vitrin_v1.py

# 6) demo verisi + tek dosya + paket
python scripts/build_demo_users_v1.py --shipped inference/CANDIDATE_demo3_kesif.parquet
python scripts/build_demo_singlefile_v1.py
python scripts/build_demo_paketi_v1.py
```

Görseller/fontlar ayrı üretilir (`build_demo_thumbs_v1.py`, `build_demo_fonts_v1.py`);
hepsi `araclar/` altında da var. `demo/data/users.json` içindeki `_prov` bloğu hangi
tablodan, hangi seed ile üretildiğini ve ölçüm sonuçlarını taşır.

✅ **Kapanan açık:** `similar.json`'ın üreticisi yoktu; artık `build_demo_similar_v1.py` var ve
üretim kuralını her koşuda bugünkü çıktıya karşı doğruluyor. `fbt.json` hâlâ elle üretilmiş bir
anlık görüntü (yalnız `cap2` bacağı taşınıyor; kaynak tablo `inference/fbt_pairs_v3.parquet`).

## Bu paket neyi göstermiyor

- Yayında bir adres **yok** — bu depo hiçbir GitHub deposuna bağlı değil, `demo/` hiç commit
  edilmedi. Üç ayrı link üretilmek istenirse tek sayfanın bölünmesi gerekiyor; bugün URL durumu
  hiç tutulmadığı için `#fbt` gibi bir derin bağlantı bile bir sekmeyi önseçemiyor.
- `scripts/demo3_api_v1.py` (yerel REST API) hâlâ **eski tablolara** bakıyor: System#1 için v3
  (teslim v4 — ürünlerin %99,14'ünde farklı liste), System#2 için v1. Bu paketteki statik demo
  doğru artefaktları gösteriyor, API göstermiyor.
