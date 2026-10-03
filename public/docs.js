"use strict";
/* Belgelerim ve Arama sekmeleri */
(function () {
  const { el } = P55;
  const STATUS_TR = { uploaded: "yüklendi", chunked: "indeksleniyor", indexed: "hazır", failed: "hata" };

  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function ext(name) { const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1, i + 5) : "?"; }

  // Liste gelene kadar yanip sonen gri satirlar (iskelet) gosterilir; bos tablo "belge yok" sanilmasin.
  function skeleton(body, cols) {
    body.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const tr = el("tr", { class: "skeleton", "aria-hidden": "true" });
      for (let c = 0; c < cols; c++) tr.append(el("td", {}, el("span", {})));
      body.append(tr);
    }
  }

  // Yukleme siniri sunucudan (.env) okunur; arayuzde sabit yazilirsa ayar degisince yalan soyler.
  // uploadMode: "direct" = dosya backend'e gider (yerel), "storage" = once Supabase Storage'a (bulut)
  let maxUploadBytes = null;
  let uploadMode = "direct";
  async function loadLimits() {
    if (maxUploadBytes !== null) return;
    try {
      const l = await P55.request("/documents/limits");
      maxUploadBytes = l.max_upload_mb * 1048576;
      uploadMode = l.upload_mode || "direct";
      document.getElementById("upload-hint").textContent = "TXT, PDF veya DOCX (en fazla " + l.max_upload_mb + " MB)";
    } catch (e) { /* sinir okunamazsa sunucu yine de denetler */ }
  }

  let allDocs = [];                                   // sunucudan gelen son liste; suzme/siralama bunun ustunde

  async function loadDocs() {
    loadLimits();
    const body = document.querySelector("#docs-table tbody");
    if (!body.children.length) skeleton(body, 6);
    try { allDocs = await P55.request("/documents"); } catch (e) { body.replaceChildren(); P55.show(e.message, true); return; }
    renderDocs();
  }

  // Siralama olcutleri: her biri iki belgeyi karsilastiran bir fonksiyon (Array.sort icin)
  const SORTS = {
    new: (a, b) => b.id - a.id,
    old: (a, b) => a.id - b.id,
    name: (a, b) => a.filename.localeCompare(b.filename, "tr"),
    size: (a, b) => b.size_bytes - a.size_bytes,
    chunks: (a, b) => b.chunk_count - a.chunk_count,
  };

  // Turkce harf duyarsiz arama: "YÖNET", "yonet", "Yönet" hepsi "yonetmelik.pdf"i bulur
  const fold = (t) => t.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c]);

  function renderDocs() {
    const body = document.querySelector("#docs-table tbody");
    const raw = document.getElementById("docs-filter").value.trim(), q = fold(raw);
    const sort = SORTS[document.getElementById("docs-sort").value] || SORTS.new;
    const docs = allDocs.filter(d => !q || fold(d.filename).includes(q)).sort(sort);
    body.replaceChildren();
    const empty = document.getElementById("docs-empty");
    empty.hidden = docs.length > 0;
    empty.textContent = allDocs.length ? "“" + raw + "” adında belge yok." : "Henüz belge yüklemedin. Yukarıdaki alana bir dosya bırakarak başla.";
    const chunks = allDocs.reduce((s, d) => s + (d.chunk_count || 0), 0);
    const bytes = allDocs.reduce((s, d) => s + (d.size_bytes || 0), 0);
    document.getElementById("docs-summary").textContent = allDocs.length
      ? (q ? docs.length + " / " : "") + allDocs.length + " belge · " + chunks + " parça · " + fmtSize(bytes) : "";
    for (const d of docs) {
      const status = el("span", { class: "badge " + d.status }, STATUS_TR[d.status] || d.status);
      const actions = el("span", {});
      // Hata olduysa ya da embedding modeli degistiyse (eski vektorler yeni modelle aranamaz) belge yeniden indekslenir
      if (d.chunk_count > 0) {
        const resume = d.status === "chunked";             // yarida kalmis (sekme kapandi, ag koptu): kaldigi yerden
        actions.append(el("button", { type: "button", class: "secondary",
          "aria-label": (resume ? "İndekslemeye devam et: " : "Yeniden indeksle: ") + d.filename,
          title: resume ? "Kalan parçaları indeksle" : "Parçaları yeniden vektörleştir",
          onclick: (ev) => reindex(d, ev.currentTarget) }, resume ? "Devam et" : "Yeniden indeksle"), " ");
      }
      actions.append(el("button", { type: "button", class: "danger", "aria-label": "Sil: " + d.filename, onclick: () => removeDoc(d) }, "Sil"));
      const row = el("tr", {},
        el("td", {}, el("div", { class: "file-cell" }, el("span", { class: "ext" }, ext(d.filename)), d.filename),
          d.error ? el("div", { class: "meta" }, d.error) : ""),
        el("td", {}, status),
        el("td", {}, d.chunk_count),
        el("td", {}, fmtSize(d.size_bytes)),
        el("td", {}, P55.fmtDate(d.uploaded_at)),
        el("td", {}, actions));
      body.append(row);
    }
  }

  async function reindex(d, btn) {
    P55.setBusy(btn, true);
    P55.show(d.filename + " indeksleniyor…", "info");
    try {
      let out = await P55.request("/documents/" + d.id + "/reindex", { method: "POST" });
      out = await finishIndexing(out, (x) => P55.show(d.filename + " indeksleniyor " + pctText(x), "info"));
      P55.show("İndekslendi: " + d.filename);
    } catch (e) { P55.show(e.message, true); }
    P55.setBusy(btn, false);
    loadDocs();
  }

  // "%40 (800 / 2000 parça)"
  function pctText(d) {
    const pct = d.total_chunks ? Math.floor((d.indexed_chunks / d.total_chunks) * 100) : 0;
    return "%" + pct + " (" + d.indexed_chunks + " / " + d.total_chunks + " parça)";
  }

  // Buyuk belge: sunucu her istekte bir sure butcesi kadar (Vercel'de 60 sn) indeksler ve belge "chunked" kalir.
  // Bitene kadar /index-next tekrar cagrilir; her yanitta indexed_chunks / total_chunks ile ilerleme gosterilir.
  // Uc yanit ust uste ilerleme olmazsa durulur (sonsuz donguye girmesin; "Devam et" ile surdurulebilir).
  async function finishIndexing(d, onStep) {
    let last = -1, stalled = 0;
    while (d.status === "chunked") {
      if (onStep) onStep(d);
      if (d.indexed_chunks <= last && ++stalled >= 3) throw new Error("İndeksleme ilerlemiyor; daha sonra “Devam et” ile sürdürebilirsin.");
      if (d.indexed_chunks > last) stalled = 0;
      last = d.indexed_chunks;
      d = await P55.request("/documents/" + d.id + "/index-next", { method: "POST" });
    }
    return d;
  }

  async function removeDoc(d) {
    if (!confirm(d.filename + " silinsin mi?")) return;
    try { await P55.request("/documents/" + d.id, { method: "DELETE" }); P55.show("Silindi"); }
    catch (e) { P55.show(e.message, true); }
    loadDocs();
  }

  function bindUpload() {
    const input = document.getElementById("file");
    const zone = document.getElementById("dropzone");
    const nameBox = document.getElementById("file-name");
    const btn = document.getElementById("upload-btn");
    const progress = document.getElementById("upload-progress");
    const bar = progress.querySelector("span");
    const status = document.getElementById("upload-status");

    // Dosya secilmemisse "Yukle" pasiftir; secilince aktiflesir ve bir kez parlar (.ready animasyonu, style.css).
    const showName = () => {
      const f = input.files[0];
      nameBox.textContent = f ? "Seçilen: " + f.name + " · " + fmtSize(f.size) : "";
      const tooBig = !!(f && maxUploadBytes && f.size > maxUploadBytes);
      zone.classList.toggle("has-file", !!f && !tooBig);
      zone.classList.toggle("too-big", tooBig);
      btn.disabled = !f || tooBig;
      btn.classList.remove("ready");
      if (tooBig) P55.show("Dosya çok büyük (" + fmtSize(f.size) + "). En fazla " + fmtSize(maxUploadBytes) + " yüklenebilir.", true);
      else if (f) { void btn.offsetWidth; btn.classList.add("ready"); }   // offsetWidth okumak animasyonu bastan baslatir
    };
    input.addEventListener("change", showName);

    // Ilerleme cubugu: once gercek yuzde (dosya gidiyor), sonra belirsiz akis (sunucu ayristirip vektorlestiriyor)
    const setProgress = (ratio) => {
      progress.hidden = false;
      if (ratio < 1) {
        const pct = Math.round(ratio * 100);
        progress.classList.remove("indeterminate");
        progress.setAttribute("aria-valuenow", String(pct));
        bar.style.width = pct + "%";
        status.textContent = "Gönderiliyor %" + pct;
      } else {
        progress.classList.add("indeterminate");
        progress.removeAttribute("aria-valuenow");
        bar.style.width = "";
        status.textContent = "İndeksleniyor…";
      }
    };
    // Indeksleme suruyorsa (buyuk belge) cubuk gercek yuzdeyi gosterir: indekslenen / toplam parca
    const showIndexing = (d) => {
      progress.hidden = false;
      progress.classList.remove("indeterminate");
      const pct = d.total_chunks ? Math.floor((d.indexed_chunks / d.total_chunks) * 100) : 0;
      progress.setAttribute("aria-valuenow", String(pct));
      bar.style.width = pct + "%";
      status.textContent = "İndeksleniyor " + pctText(d);
    };
    const resetProgress = () => {
      progress.hidden = true;
      progress.classList.remove("indeterminate");
      bar.style.width = "0%";
      status.textContent = "";
    };

    // Surukle-birak: birakilan dosya gizli <input type=file>'a aktarilir, form ayni yoldan gonderilir.
    ["dragenter", "dragover"].forEach(t => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "dragend", "drop"].forEach(t => zone.addEventListener(t, () => zone.classList.remove("drag")));
    zone.addEventListener("drop", (ev) => {
      ev.preventDefault();
      if (!ev.dataTransfer.files.length) return;
      const dt = new DataTransfer();
      dt.items.add(ev.dataTransfer.files[0]);
      input.files = dt.files;
      showName();
    });

    document.getElementById("upload-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!input.files.length) { P55.show("Önce bir dosya seç ya da alana sürükle.", true); return; }
      // Sinirdan buyuk dosyayi dakikalarca gonderip sonra hata almak yerine hemen uyar
      if (maxUploadBytes && input.files[0].size > maxUploadBytes) {
        P55.show("Dosya çok büyük (" + fmtSize(input.files[0].size) + "). En fazla " + fmtSize(maxUploadBytes) + " yüklenebilir.", true);
        return;
      }
      P55.setBusy(btn, true);
      setProgress(0);
      P55.show("Yükleniyor ve indeksleniyor...", "info");
      let uploaded = false;
      try {
        let d = await uploadFile(input.files[0], setProgress);
        if (d.status === "chunked") {
          P55.show("Büyük belge: parça parça indeksleniyor. Bu sekmeyi kapatma; kapatırsan “Devam et” ile sürdürebilirsin.", "info");
          d = await finishIndexing(d, showIndexing);
        }
        P55.show(d.status === "indexed" ? "Belge hazır: " + d.filename : "Belge yüklendi (durum: " + d.status + ")", d.status === "failed");
        uploaded = true;
      } catch (e) { P55.show(e.message, true); }
      resetProgress();
      P55.setBusy(btn, false);
      if (uploaded) input.value = "";
      showName();                                   // basarisizsa dosya secili kalir, dugme aktif kalir (tekrar denenebilir)
      loadDocs();
    });
  }

  // Bulutta (Vercel) bir istek en fazla 4,5 MB olabilir. Bu yuzden dosya 3 adimda gider:
  // 1) backend'den tek kullanimlik yukleme adresi al, 2) dosyayi o adrese (Supabase) dogrudan gonder,
  // 3) backend'e "yukledim" de: backend dosyayi depodan okuyup ayristirir ve indeksler.
  async function uploadFile(file, onProgress) {
    if (uploadMode === "storage") {
      const t = await P55.request("/documents/upload-url", { method: "POST",
        json: { filename: file.name, size_bytes: file.size } });
      await P55.send(t.upload_url, file, onProgress, { method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
      return P55.request("/documents/complete", { method: "POST",
        json: { path: t.path, filename: file.name, mime_type: file.type || null } });
    }
    const fd = new FormData();
    fd.append("file", file);
    return P55.upload("/documents", fd, onProgress);
  }

  function bindSearch() {
    document.getElementById("search-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const out = document.getElementById("search-results");
      const btn = ev.target.querySelector("button");
      P55.setBusy(btn, true);
      out.replaceChildren();
      try {
        const res = await P55.request("/search", { method: "POST", json: { query: document.getElementById("query").value, top_k: 5 } });
        P55.show("");
        if (!res.results.length) out.append(el("p", { class: "empty" }, "Sonuç yok. Belge yüklediysen \"Belgelerim\" sekmesinde durumunun \"hazır\" olduğunu kontrol et."));
        for (const r of res.results) {
          const where = r.filename + (r.page_no ? " · sayfa " + r.page_no : "");
          const w = Math.max(0, Math.min(100, Math.round(r.score * 100)));
          const score = el("span", { class: "score", title: "Benzerlik puanı" },
            el("i", {}, el("b", { style: "width:" + w + "%" })), "benzerlik " + r.score.toFixed(3));
          out.append(el("div", { class: "result" }, el("div", { class: "meta" }, el("span", {}, where), score), el("p", {}, r.content)));
        }
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });
  }

  P55.tabs.docs = { onShow: loadDocs };
  P55.tabs.search = {};
  bindUpload();
  bindSearch();
  document.getElementById("docs-filter").addEventListener("input", renderDocs);    // her tus vurusunda suz
  document.getElementById("docs-sort").addEventListener("change", renderDocs);
})();
