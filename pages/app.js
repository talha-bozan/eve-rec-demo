/* ============================================================
   Ürün Öneri Sistemleri — demo
   Saf JavaScript. Harici kütüphane yok, derleme adımı yok, ağ isteği yok.

   VERİ SÖZLEŞMESİ (kritik):
     items.items[i]  ->  item_idx = i  (dizideki sıra = ürün numarası)
     similar.neigh[i]/w[i] -> item_idx i'nin komşuları
     fbt.anchors[k] / v3[k] / cap2[k] -> pozisyona göre paralel diziler

   VİTRİN SÖZLEŞMESİ (kritik):
     Demo bir ÜRÜN VİTRİNİ: müşteri kabul edilebilir sonuçları inceleyebilmeli.
     - Sistem 2 tek liste gösterir (çeşit sınırı uygulanmış sürüm); sürüm
       karşılaştırması ve "sorunlu örnek" turu kaldırıldı.
     - Yakın-kopya yığılması olan ürünler ARAMA HAVUZUNDAN düşürülür
       (demo/data/vitrin.json, build zamanında hesaplanır). Komşu/öneri
       listeleri filtrelenmez — bir ürün başkasının komşusu olarak görünebilir.
     Ölçü tanımı: yakın kopya = AYNI MARKA VE ad-kelime Jaccard >= 0.6
     (scripts/build_fbt_pairs_v2.py -> near_dup_adj ile birebir aynı).
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- durum ---------------- */
  var ITEMS = [];          // ham satırlar; ITEMS[i] === item_idx i
  var F = {};              // alan adı -> sütun indeksi
  var SIM = null;          // { neigh, w }
  var FBT = null;          // { anchors, v3, cap2 }
  var USERS = [];          // [{cust, hist, recs}]

  var HAY = [];            // arama için katlanmış metin, item_idx ile hizalı
  var BRAND = [];          // ham marka metni, item_idx ile hizalı
  var ALL_IDX = [];        // [0..n-1]
  var FBT_POS = new Map(); // item_idx -> anchors dizisindeki pozisyon k
  var CODE2IDX = new Map();// ürün kodu -> item_idx
  var VITRIN = null;       // build zamanında hesaplanan vitrin filtresi
  var SIM_GIZLI = new Set(), FBT_GIZLI = new Set();
  var SIM_HAVUZ = [], FBT_HAVUZ = [];   // aranabilir/rastgele havuzlar

  var DATA_DIR = "data/";

  /* ---------------- yardımcılar ---------------- */

  // Türkçe'ye duyarlı katlama: "İ/I/ı" -> "i", "Ş" -> "s" ...  (SADECE arama için)
  var FOLD_MAP = {
    "İ": "i", "I": "i", "ı": "i", "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g",
    "Ü": "u", "ü": "u", "Ö": "o", "ö": "o", "Ç": "c", "ç": "c",
    "Â": "a", "â": "a", "Î": "i", "î": "i", "Û": "u", "û": "u"
  };
  function fold(s) {
    var out = "", i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      out += FOLD_MAP[ch] || ch;
    }
    return out.toLowerCase();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num(v, dec) {
    try {
      return v.toLocaleString("tr-TR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    } catch (e) {
      return v.toFixed(dec);
    }
  }

  function money(v) {
    if (v == null || isNaN(v)) return null;
    return num(v, 2) + " ₺";
  }

  function upper(s) {
    try { return s.toLocaleUpperCase("tr"); } catch (e) { return s.toUpperCase(); }
  }


  /* Tek renkli satır içi SVG ikonlar (emoji yerine — kurumsal kimlik). */
  var ICONS = {
    warn:   '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 22 20H2Z"/><path d="M12 10v4.4"/><circle cx="12" cy="17.4" r=".4" fill="currentColor" stroke="none"/></svg>',
    shield: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5.4c0 4.6-3.2 8-8 9.6-4.8-1.6-8-5-8-9.6V6Z"/><path d="m8.6 12 2.3 2.3 4.5-4.6"/></svg>',
    box:    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8 12 3.8 20.5 8v8L12 20.2 3.5 16Z"/><path d="M3.5 8 12 12.2 20.5 8M12 12.2V20"/></svg>',
    person: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.6 20c1.5-3.2 4.2-4.8 7.4-4.8s5.9 1.6 7.4 4.8"/></svg>',
    receipt:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12V20l-2.4-1.6L13.2 20l-2.4-1.6L8.4 20 6 18.4Z"/><path d="M9 8h6M9 11.5h6M9 15h3.6"/></svg>',
    spark:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.8 9.6 20 12l-6.2 2.4L12 20.5 10.2 14.4 4 12l6.2-2.4Z"/></svg>',
    search: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15.2 15.2 4.6 4.6"/></svg>',
    cart:   '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2.2l2 10.6h9.6L20 8.2H7"/><circle cx="9.6" cy="19" r="1.4"/><circle cx="16.6" cy="19" r="1.4"/></svg>',
    check:  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.6 4.4 4.4L19 7.4"/></svg>'
  };

  var THUMBS = null;       // item_idx-hizalı base64 dizisi (thumbs.json)

  function thumbHtml(idx, extraClass) {
    var cls = extraClass ? " " + extraClass : "";
    if (THUMBS && THUMBS.thumbs[idx]) {
      return '<span class="thumb' + cls + '" aria-hidden="true">' +
        '<img src="data:image/webp;base64,' + THUMBS.thumbs[idx] + '" alt="" ' +
        'onerror="this.parentNode.classList.add(&quot;thumb--ph&quot;);this.remove()"></span>';
    }
    var r = ITEMS[idx];
    var label = r && r[F.cat3] ? esc(r[F.cat3]) : "";
    return '<span class="thumb thumb--ph' + cls + '" aria-hidden="true"><span>' + label + "</span></span>";
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function $(sel, root) { return (root || document).querySelector(sel); }

  /* Yakın-kopya ölçüsü artık build zamanında hesaplanıyor
     (scripts/build_demo_vitrin_v1.py -> demo/data/vitrin.json).
     İstemci yalnız hazır listeyi okur; ölçüt tanımı orada tek yerde durur. */

  /* ---------------- yükleme ---------------- */

  function loadAll() {
    var files = ["items.json", "similar.json", "fbt.json", "users.json", "thumbs.json",
                 "vitrin.json"];
    var done = 0;
    var bar = $("#loader-bar");
    bar.style.width = "6%";

    function step(json) {
      done++;
      bar.style.width = Math.round(6 + (done / files.length) * 92) + "%";
      return json;
    }

    return Promise.all(files.map(function (f) {
      return fetch(DATA_DIR + f).then(function (r) {
        if (!r.ok) throw new Error(f + " okunamadı (HTTP " + r.status + ")");
        return r.json();
      }).then(step);
    }));
  }

  function buildIndex(items, similar, fbt, users, vitrin) {
    // alan sırasını dosyanın kendisinden oku
    items.fields.forEach(function (name, i) { F[name] = i; });
    ITEMS = items.items;
    SIM = similar;
    FBT = fbt;
    USERS = users.users;

    var n = ITEMS.length, i, r;
    HAY = new Array(n);
    BRAND = new Array(n);
    ALL_IDX = new Array(n);

    for (i = 0; i < n; i++) {
      r = ITEMS[i];
      ALL_IDX[i] = i;
      HAY[i] = fold(r[F.name] + " " + (r[F.brand] || "") + " " + (r[F.cat3] || "") + " " + r[F.code]);
      // yakın-kopya için ham marka (boş marka da bir grup; Python tarafı da öyle)
      BRAND[i] = r[F.brand] == null ? "" : String(r[F.brand]);
      CODE2IDX.set(String(r[F.code]), i);
    }

    // anchors[k] -> k
    for (i = 0; i < FBT.anchors.length; i++) FBT_POS.set(FBT.anchors[i], i);

    /* VİTRİN FİLTRESİ — yalnız ARAMA + RASTGELE havuzunu daraltır.
       Komşu/öneri listeleri filtrelenmez: bir ürün başkasının komşusu olarak
       görünmeye devam eder. Katalog ve artefaktlar değişmez. */
    VITRIN = vitrin || { sim_gizli: [], fbt_gizli: [] };
    SIM_GIZLI = new Set(VITRIN.sim_gizli || []);
    FBT_GIZLI = new Set(VITRIN.fbt_gizli || []);
    SIM_HAVUZ = ALL_IDX.filter(function (i) { return !SIM_GIZLI.has(i); });
    FBT_HAVUZ = FBT.anchors.filter(function (i) { return !FBT_GIZLI.has(i); });
  }

  /* ---------------- arama ---------------- */

  var MIN_Q = 2;

  // Havuzun TAMAMINI tarar, sonra alaka sırasına dizer.
  // (Tarama erken kesilirse sıralama yalnızca düşük item_idx'leri görür.)
  function searchItems(q, pool, limit) {
    var f = fold(q).trim();
    if (f.length < MIN_Q) return [];
    var toks = f.split(/\s+/);
    var hits = [], i, idx, hay, ok, t, k, pos;
    var exact = q.trim();

    for (i = 0; i < pool.length; i++) {
      idx = pool[i];
      hay = HAY[idx];
      ok = true;
      for (t = 0; t < toks.length; t++) {
        if (hay.indexOf(toks[t]) === -1) { ok = false; break; }
      }
      if (!ok) continue;

      // alaka puanı: kod tam eşleşme > adın başında > erken geçiyor > kısa ad
      pos = fold(ITEMS[idx][F.name]).indexOf(toks[0]);
      k = 0;
      if (String(ITEMS[idx][F.code]) === exact) k = 1000;
      else if (pos === 0) k = 500;
      else if (pos > 0) k = 200 - Math.min(pos, 100);
      if (THUMBS && THUMBS.thumbs[idx]) k += 0.005;   // yalnız TAM eşitliği kırar (adım 0.01)
      hits.push([k - ITEMS[idx][F.name].length * 0.01, idx]);
    }

    hits.sort(function (a, b) { return b[0] - a[0]; });
    return hits.slice(0, limit).map(function (h) { return h[1]; });
  }

  function searchUsers(q, limit) {
    var f = q.trim();
    if (!f) return [];
    var hits = [], i, c, at;
    for (i = 0; i < USERS.length; i++) {
      c = USERS[i].cust;
      at = c.indexOf(f);
      if (at !== -1) hits.push([at === 0 ? 1 : 0, i]);
    }
    hits.sort(function (a, b) { return b[0] - a[0]; });
    return hits.slice(0, limit).map(function (h) { return h[1]; });
  }

  /* ---------------- görsel parçalar ---------------- */

  // Tarih olmadan geçmiş yanıltıcı: 1025 gün önceki alım "az önce aldım" gibi okunuyordu.
  function agoText(d) {
    if (d < 30) return d + " gün önce";
    if (d < 365) return Math.round(d / 30) + " ay önce";
    var y = d / 365;
    return (y < 2 ? "1 yıldan fazla" : Math.floor(y) + " yıl") + " önce";
  }

  function metaLine(idx) {
    var r = ITEMS[idx];
    var bits = [];
    if (r[F.brand]) bits.push('<span>' + esc(r[F.brand]) + '</span>');
    if (r[F.cat3]) bits.push('<span>' + esc(r[F.cat3]) + '</span>');
    if (!bits.length) bits.push('<span>Marka bilgisi yok</span>');
    return bits.join('<span class="dot">·</span>');
  }

  function priceLine(idx) {
    var p = money(ITEMS[idx][F.price]);
    return p ? '<span class="price">' + esc(p) + '</span>'
             : '<span class="price price--none">Fiyat bilgisi yok</span>';
  }

  // opts: {rank, score, dup, hero, tag, cut}
  function card(idx, opts) {
    opts = opts || {};
    var r = ITEMS[idx];
    var h = "";

    h += '<article class="' + (opts.hero ? "hero" : "pcard")
      +  (opts.cut ? " pcard--cut" : "") + '">';
    if (opts.rank) h += '<span class="rank">' + opts.rank + "</span>";
    h += thumbHtml(idx, opts.hero ? "" : "");
    h += '<div class="pbody">';
    if (opts.tag) h += '<span class="hero-tag">' + esc(opts.tag) + "</span>";
    h += '<div class="pname">' + esc(r[F.name]) + "</div>";
    h += '<div class="pmeta">' + metaLine(idx) + "</div>";
    h += '<div class="pfoot">' + priceLine(idx) + '<span class="code">Kod ' + esc(r[F.code]) + "</span></div>";

    if (opts.score != null) {
      var pct = Math.round(opts.score * 100);
      h += '<div class="score">'
        +  '<div class="score-top"><span>Benzerlik</span><span class="score-val">%' + pct + "</span></div>"
        +  '<div class="bar"><span style="width:' + Math.max(2, Math.min(100, pct)) + '%"></span></div>'
        +  "</div>";
    }
    if (opts.cut) {
      h += '<div class="cut-flag">' + ICONS.shield + ' Kurala takıldı — önerilen listede yok</div>';
    }
    h += "</div></article>";
    return h;
  }

  function emptyState(icon, text) {
    var svg = (ICONS[icon] || ICONS.box).replace('class="icon"', 'class="icon e-icon"');
    return '<div class="empty-state">' + svg + "<p>" + esc(text) + "</p></div>";
  }

  /* ---------------- SİSTEM 1 — benzer ürünler ---------------- */

  /* Sistem 1 — RecomEve üç modalitesi + sevk edilen hibrit.
     Modalite listeleri YALNIZ kapsam içi 4.804 üründe var (v4'ün is_cbf kümesi);
     gerisinde metin-kNN yedeği çalışıyor ve modalite ayrımı yok. */
  var MOD_ADI = {
    identification: ["Ürün tanımı", "Ürünün kimlik metni (marka, tip, hacim)"],
    description:    ["Ürün açıklaması", "Ürünün uzun tanıtım metni"],
    caption:        ["Görsel başlığı", "Ürün fotoğrafından üretilmiş metin"]
  };

  function modKapsamda(idx) {
    return !!(SIM.kapsam && SIM.kapsam[idx] && SIM.mod &&
              SIM.mod.identification && SIM.mod.identification[idx]);
  }

  function modKolon(idx, m) {
    var satir = SIM.mod[m][idx] || [], ag = (SIM.mod_w[m] || {})[idx] || [];
    var o = (SIM.mod_olcum || {})[m] || {};
    var h = '<div class="mod-col"><div class="mod-head"><strong>' + esc(MOD_ADI[m][0]) + "</strong>"
          + '<span class="mod-sub">' + esc(MOD_ADI[m][1]) + "</span>";
    if (o.hr_kapsanan) {
      h += '<span class="mod-metric">İsabet <b>%' + num(o.hr_kapsanan * 100, 2)
        +  "</b> <span>kapsanan müşterilerde</span></span>";
    }
    h += "</div>";
    if (!satir.length) {
      h += emptyState("search", "Liste yok.");
    } else {
      h += '<div class="rec-list">';
      satir.forEach(function (j, i) { h += card(j, { rank: i + 1, score: ag[i] }); });
      h += "</div>";
    }
    return h + "</div>";
  }

  function renderSim(idx) {
    var out = $("#out-sim");
    var neigh = SIM.neigh[idx] || [];
    var w = SIM.w[idx] || [];
    var h = "";

    h += '<div class="block"><div class="sec-label">Seçilen ürün</div>'
      +  card(idx, { hero: true, tag: "İncelenen ürün" }) + "</div>";

    if (modKapsamda(idx)) {
      h += '<div class="block"><div class="sec-label">Üç ayrı metin, üç ayrı benzerlik</div>'
        +  '<p class="search-note" style="margin-top:-4px;margin-bottom:14px">'
        +  "Aynı ürün üç farklı metinden ayrı ayrı değerlendirilir; her biri farklı bir liste "
        +  "üretir. Aşağıdaki isabet oranları bu ürünlerin kapsandığı müşterilerde ölçüldü.</p>"
        +  '<div class="mod-grid">';
      ["identification", "description", "caption"].forEach(function (m) {
        h += modKolon(idx, m);
      });
      h += "</div></div>";
    }

    h += '<div class="block"><div class="sec-label">'
      +  (modKapsamda(idx) ? "Bugün yayında olan liste" : "Bu ürüne en çok benzeyen ürünler")
      +  "</div>";
    if (!modKapsamda(idx)) {
      h += '<p class="search-note" style="margin-top:-4px;margin-bottom:12px">'
        +  "Bu ürün üç metinli değerlendirmenin kapsamı dışında; liste ürün adı benzerliğinden "
        +  "üretiliyor.</p>";
    }
    if (!neigh.length) {
      h += emptyState("search", "Bu ürün için benzer ürün hesaplanmamış.");
    } else {
      h += '<div class="rec-grid">';
      neigh.forEach(function (j, i) { h += card(j, { rank: i + 1, score: w[i] }); });
      h += "</div>";
    }
    h += "</div>";

    out.innerHTML = h;
  }

  /* ---------------- SİSTEM 2 — birlikte alınanlar ---------------- */
  /* Tek liste gösterilir: çeşit sınırı uygulanmış sürüm. Sürüm karşılaştırması ve
     "sorunlu örnek" turu kaldırıldı — demo müşteriye gösterilen bir ürün vitrini,
     teknik ödünleşim tartışması belgelerde duruyor. */

  function renderFbt(idx) {
    var out = $("#out-fbt");
    var k = FBT_POS.get(idx);
    var h = "";

    h += '<div class="block"><div class="sec-label">Seçilen ürün</div>'
      +  card(idx, { hero: true, tag: "Sepetteki ürün" }) + "</div>";

    if (k === undefined) {
      out.innerHTML = h + '<div class="block">'
        + emptyState("box", "Bu ürün birlikte alınan ürün tablosunda yer almıyor.") + "</div>";
      return;
    }

    var liste = FBT.cap2[k] || [];
    h += '<div class="block"><div class="sec-label">Yanında satılan ürünler</div>';
    if (!liste.length) {
      h += emptyState("box", "Bu ürün için öneri bulunmuyor.");
    } else {
      h += '<div class="rec-grid">';
      liste.forEach(function (j, i) { h += card(j, { rank: i + 1 }); });
      h += "</div>";
    }
    h += "</div>";

    h += '<div class="callout"><h3>Bu liste nasıl kuruluyor?</h3>'
      +  "<p>Aynı fişte birlikte satılan ürünlerden öğrenilir. <b>1. sistemden farkı:</b> "
      +  "orada aynı ojenin başka tonlarını göstermek doğrudur — müşteriye alternatif sunar. "
      +  "Burada ise oje alan müşteriye aseton, pamuk, tırnak bakım ürünü gerekir; müşteri "
      +  "zaten bir oje almıştır. Bu yüzden listede aynı ürünün çeşitlerinden en fazla ikisi "
      +  "kalır, boşalan yerlere farklı ürünler girer.</p></div>";

    out.innerHTML = h;
  }

  // Tablo geneli özet — sayılar veriden hesaplanır, sabit yazılmaz.
  function renderFbtStats() {
    var el = $("#fbt-stats");
    if (!el || !FBT) return;
    var n = FBT.anchors.length, top = 0, mark = 0;
    for (var i = 0; i < n; i++) {
      var r = FBT.cap2[i] || [];
      top += r.length;
      var b = Object.create(null), c = 0;
      for (var j = 0; j < r.length; j++) {
        var m = BRAND[r[j]];
        if (!b[m]) { b[m] = 1; c++; }
      }
      mark += c;
    }
    function tile(v, lab) {
      return '<div class="tile"><b>' + v + "</b><span>" + esc(lab) + "</span></div>";
    }
    el.innerHTML =
      tile(num(n, 0), "üründe yanında satılan ürün önerisi var") +
      tile(num(top / n, 1), "liste başına ortalama ürün") +
      tile(num(mark / n, 1), "liste başına ortalama farklı marka");
  }


  /* ---------------- SİSTEM 3 — kişiye özel ---------------- */

  function renderUser(ui) {
    var u = USERS[ui];
    var out = $("#out-usr");
    var ruled = u.recs_shipped || [];
    var hasRuled = ruled.length > 0;
    var rawSet = {}, ruledSet = {};
    u.recs.forEach(function (j) { rawSet[j] = 1; });
    ruled.forEach(function (j) { ruledSet[j] = 1; });
    var h = "";

    h += '<div class="cust-head">'
      +  '<div class="cust-av" aria-hidden="true">' + ICONS.person + '</div>'
      +  "<div><div class=\"cust-id\">Müşteri " + esc(u.cust) + "</div>"
      +  '<div class="cust-sub">' + (u.hist_total || u.hist.length) + " geçmiş ürün" + ((u.hist_total && u.hist_total > u.hist.length) ? " (son " + u.hist.length + "'i gösteriliyor)" : "") + " · ham " + u.recs.length
      +  (hasRuled ? " · kurallı " + ruled.length : "") + " öneri</div></div>"
      +  "</div>";

    /* Geçmiş ARTIK ÜSTTE, yatay şerit. Üç dar sütun "her alanı ince bir çizgi gibi"
       gösteriyordu; geçmiş karşılaştırmaya girmeyen bir bağlam olduğu için akıştan
       çıkarıldı ve karşılaştırılan iki liste iki katı genişliğe kavuştu. */
    h += '<div class="hist-strip-wrap"><div class="flow-head">'
      +  "<h3>" + ICONS.receipt + " Geçmişte aldıkları</h3>"
      +  "<p>Müşterinin daha önce satın aldığı ürünler — en yeniden eskiye.</p></div>";
    h += '<div class="hist-strip">';
    u.hist.forEach(function (row) {
      // row = [item_idx, gun, kaç_gün_önce]  (eski biçim: düz sayı)
      var j = (typeof row === "number") ? row : row[0];
      var ago = (typeof row === "number") ? null : row[2];
      h += '<div class="hist-card">' + thumbHtml(j, "t56")
        +  '<div class="hist-name">' + esc(ITEMS[j][F.name]) + "</div>"
        +  '<div class="hist-meta">' + esc(ITEMS[j][F.brand] || "")
        +  (ago === null ? "" : '<span class="dot">·</span><span class="ago">' + agoText(ago) + "</span>")
        +  "</div></div>";
    });
    h += "</div></div>";

    h += '<div class="flow' + (hasRuled ? " flow--two" : "") + '">';

    // ham tahmin
    h += '<div class="flow-col"><div class="flow-head">'
      +  "<h3>" + ICONS.spark + " Modelin ham tahmini</h3>"
      +  "<p>Sırada alma ihtimali en yüksek 10 ürün — hiçbir iş kuralı uygulanmadan.</p></div>";
    h += '<div class="rec-list">';
    u.recs.forEach(function (j, i) {
      h += card(j, { rank: i + 1, cut: hasRuled && !ruledSet[j] });
    });
    h += "</div></div>";

    if (hasRuled) {
      // ok
      h += '<div class="flow-arrow" aria-hidden="true"><span class="a-h">→</span><span class="a-v">↓</span></div>';

      // kurallı liste
      h += '<div class="flow-col flow-col--next"><div class="flow-head">'
        +  "<h3>" + ICONS.shield + " Önerilen liste <span class=\"chip chip--good\">Aday</span></h3>"
        +  "<p>Mağaza kuralları uygulanmış liste: müşterinin <b>daha önce aldığı hiçbir "
        +  "kategoriden</b> öneri çıkmaz (süre hesabı yok); aynı ürün hattının başka boy/tonu "
        +  "önerilmez; cinsiyet profiline aykırı ürün gösterilmez.</p></div>";
      h += '<div class="rec-list">';
      ruled.forEach(function (j, i) {
        h += card(j, { rank: i + 1, tag: rawSet[j] ? null : "kural sonrası listeye girdi" });
      });
      h += "</div></div>";
    }

    h += "</div>";

    // Keşif rafı — müşterinin HİÇ almadığı kategorilerden. Ana listede kategori yasağı
    // yalnız 3 aile için kalıcı; geri kalanı pencereli olduğu için liste ağırlıkla tanıdık
    // kategorilerden geliyor (ölçüldü: bir müşteride 15 önerinin 14'ü geçmiş kategorilerden).
    // Bu raf o boşluğu kapatır: süre/pencere hesabı yok, geçmişteki her kategori elenmiş.
    var ke = u.recs_kesif || [];
    if (ke.length) {
      h += '<div class="block"><div class="sec-label">Hiç denemediği kategoriler</div>'
        +  '<p class="search-note" style="margin-top:-4px;margin-bottom:12px">'
        +  'Müşterinin bugüne kadar hiç almadığı kategorilerden seçildi — süre hesabı yok, '
        +  'geçmişte alınan her kategori elendi.</p>'
        +  '<div class="rec-grid">';
      ke.forEach(function (j, i) { h += card(j, { rank: i + 1 }); });
      h += "</div></div>";
    }

    // İkmal rafı — kalıcı yasağın karşılığı. Keşif listesi geçmişte alınan kategoriyi
    // göstermez; "yine lazım olabilir" talebi bu ayrı rafta karşılanır.
    var ik = u.recs_ikmal || [];
    if (ik.length) {
      h += '<div class="block"><div class="sec-label">Yine lazım olabilir</div>'
        +  '<p class="search-note" style="margin-top:-4px;margin-bottom:12px">'
        +  'Önerilen liste, müşterinin daha önce aldığı şampuan / diş macunu / duş jelini '
        +  'göstermez. O talep kaybolmaz — bu ayrı rafta karşılanır.</p>'
        +  '<div class="rec-grid">';
      ik.forEach(function (j, i) { h += card(j, { rank: i + 1 }); });
      h += "</div></div>";
    }

    out.innerHTML = h;
  }

  /* ---------------- arama bileşeni ---------------- */

  function makeSearch(key, opts) {
    var root = document.querySelector('[data-search="' + key + '"]');
    var input = $(".search-input", root);
    var list = $(".suggest", root);
    var clear = $(".search-clear", root);
    var current = [];
    var active = -1;

    function setActiveDesc() {
      if (active >= 0 && list.children[active] && list.children[active].id) {
        input.setAttribute("aria-activedescendant", list.children[active].id);
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function close() {
      list.hidden = true;
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      active = -1;
      setActiveDesc();
    }

    function paint() {
      Array.prototype.forEach.call(list.children, function (li, i) {
        li.setAttribute("aria-selected", i === active ? "true" : "false");
      });
      setActiveDesc();
    }

    function note(msg) {
      current = [];
      list.innerHTML = '<li class="s-empty" role="presentation">' + esc(msg) + "</li>";
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      setActiveDesc();
    }

    function open(ids) {
      current = ids;
      if (!ids.length) {
        list.innerHTML = '<li class="s-empty" role="presentation">Sonuç bulunamadı.</li>';
      } else {
        list.innerHTML = ids.map(function (id, i) {
          return '<li role="option" id="' + key + "-opt-" + i + '" aria-selected="false">'
            + opts.row(id) + "</li>";
        }).join("");
        Array.prototype.forEach.call(list.children, function (li, i) {
          li.addEventListener("mousedown", function (e) {
            e.preventDefault();
            choose(current[i]);
          });
        });
      }
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      setActiveDesc();
    }

    function choose(id) {
      input.value = opts.label(id);
      clear.hidden = !input.value;
      close();
      opts.pick(id);
    }

    var minLen = opts.minLen || 1;

    var run = debounce(function () {
      var q = input.value;
      clear.hidden = !q;
      if (!q.trim()) { close(); return; }
      if (q.trim().length < minLen) {
        note("Aramak için en az " + minLen + " karakter yazın…");
        return;
      }
      open(opts.find(q));
    }, 150);

    input.addEventListener("input", run);
    input.addEventListener("focus", function () {
      if (input.value.trim() && list.innerHTML) { list.hidden = false; }
    });
    input.addEventListener("blur", function () { setTimeout(close, 120); });

    input.addEventListener("keydown", function (e) {
      if (list.hidden || !current.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault(); active = (active + 1) % current.length; paint();
        list.children[active].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); active = (active - 1 + current.length) % current.length; paint();
        list.children[active].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault(); choose(current[active >= 0 ? active : 0]);
      } else if (e.key === "Escape") {
        close();
      }
    });

    clear.addEventListener("click", function () {
      input.value = ""; clear.hidden = true; close(); input.focus();
    });

    return {
      set: function (id) {
        input.value = opts.label(id);
        clear.hidden = false;
        close();
        opts.pick(id);
      }
    };
  }

  var _sugCount = 0;
  function itemRow(idx) {
    var r = ITEMS[idx];
    // ilk 8 gorunur satirda kucuk foto: her tusta 40 webp decode etmemek icin sinirli
    var t = (_sugCount++ % 40) < 8 ? thumbHtml(idx, "t28") : "";
    return t + '<span class="s-name">' + esc(r[F.name]) + "</span>"
      + '<span class="s-meta">' + esc(r[F.brand] || "—") + "</span>";
  }
  function itemLabel(idx) { return ITEMS[idx][F.name]; }

  /* ---------------- sekmeler ---------------- */

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));

    function select(name, focus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-panel") === name;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        document.getElementById("panel-" + t.getAttribute("data-panel")).hidden = !on;
        if (on && focus) t.focus();
      });
    }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t.getAttribute("data-panel")); });
      t.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length].getAttribute("data-panel"), true);
      });
    });

    return select;
  }

  /* ---------------- başlat ---------------- */

  function start() {
    var selectTab = initTabs();

    // SİSTEM 1
    var simSearch = makeSearch("sim", {
      minLen: MIN_Q,
      find: function (q) { return searchItems(q, SIM_HAVUZ, 40); },
      row: itemRow, label: itemLabel, pick: renderSim
    });
    $('[data-random="sim"]').addEventListener("click", function () {
      simSearch.set(randOf(SIM_HAVUZ));
    });

    // SİSTEM 2 — sadece tabloda yer alan ürünler aranabilir
    var fbtSearch = makeSearch("fbt", {
      minLen: MIN_Q,
      find: function (q) { return searchItems(q, FBT_HAVUZ, 40); },
      row: itemRow, label: itemLabel, pick: renderFbt
    });
    $('[data-random="fbt"]').addEventListener("click", function () {
      fbtSearch.set(randOf(FBT_HAVUZ));
    });

    // SİSTEM 3
    var usrSearch = makeSearch("usr", {
      minLen: 1,
      find: function (q) { return searchUsers(q, 40); },
      row: function (ui) {
        return '<span class="s-name">Müşteri ' + esc(USERS[ui].cust) + "</span>"
          + '<span class="s-meta">' + (USERS[ui].hist_total || USERS[ui].hist.length) + " ürün</span>";
      },
      label: function (ui) { return USERS[ui].cust; },
      pick: renderUser
    });
    $('[data-random="usr"]').addEventListener("click", function () {
      usrSearch.set(Math.floor(Math.random() * USERS.length));
    });

    // açılış: 2. ve 3. sekmede boş durum, 1. sekmede dolu bir örnek
    $("#out-fbt").innerHTML = emptyState("cart", "Yukarıdan bir ürün arayın veya “Rastgele ürün”e basın.");
    $("#out-usr").innerHTML = emptyState("person", "Yukarıdan bir müşteri numarası arayın veya “Rastgele müşteri”ye basın.");

    // açılış örneği: fotoğraflı + 10/10 fotoğraflı komşulu bir çapa (ilk izlenim;
    // önceki örnek 1029165'in fotoğrafı ve fotoğraflı komşusu yoktu — ölçüldü)
    var demo = CODE2IDX.get("1000298");
    if (demo !== undefined) simSearch.set(demo);
    else $("#out-sim").innerHTML = emptyState("spark", "Yukarıdan bir ürün arayın veya “Rastgele ürün”e basın.");

    selectTab("sim");

    document.getElementById("loader").hidden = true;
    document.getElementById("app").hidden = false;

    // tablo geneli özet: ilk boyamayı bekletmesin
    setTimeout(function () {
      try {
        renderFbtStats();
      } catch (e) { /* özet şeridi kritik değil */ }
    }, 0);
  }

  // phase: "load" (veri indirilemedi) | "init" (sayfa kurulamadı)
  function fail(err, phase) {
    document.getElementById("loader").hidden = true;
    document.getElementById("fatal").hidden = false;
    var msg = (err && err.message) ? err.message : "Bilinmeyen hata";
    if (phase === "init") {
      $("#fatal-title").textContent = "Sayfa açılamadı";
      $("#fatal-msg").textContent = msg;
    } else {
      $("#fatal-msg").textContent = msg +
        "\n\nSayfa dosyadan (file://) açıldıysa tarayıcı veri dosyalarını okuyamaz. " +
        "Lütfen bir web sunucusu üzerinden açın.";
    }
  }

  loadAll().then(function (res) {
    // veri geldi; buradan sonraki hatalar "indirilemedi" değildir
    try {
      buildIndex(res[0], res[1], res[2], res[3], res[5]);
      THUMBS = res[4];
      // Kimlik sözleşmesi: thumbs, items ile AYNI ürün uzayından mı? 32 sonda kodu
      // karşılaştırılır — uyuşmazlık sessiz yanlış-fotoğraf yerine gürültülü hata verir.
      if (!THUMBS || !THUMBS.thumbs || THUMBS.thumbs.length !== ITEMS.length) {
        throw new Error("thumbs.json ürün sayısı items ile uyuşmuyor");
      }
      for (var pi = 0; pi < THUMBS.probes.length; pi++) {
        var pr = THUMBS.probes[pi];
        if (String(ITEMS[pr[0]][F.code]) !== String(pr[1])) {
          throw new Error("thumbs/items kimlik uyuşmazlığı: idx " + pr[0]);
        }
      }
      start();
    } catch (e) {
      fail(e, "init");
    }
  }, function (e) {
    fail(e, "load");
  });
})();
