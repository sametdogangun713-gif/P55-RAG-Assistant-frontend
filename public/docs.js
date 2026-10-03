"use strict";
/* Belgelerim ve Arama sekmeleri */
(function () {
  const { el } = P55;
  const STATUS_TR = { uploaded: "yüklendi", chunked: "parçalandı", indexed: "hazır", failed: "hata" };

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

  async function loadDocs() {
    loadLimits();
    const body = document.querySelector("#docs-table tbody");
    if (!body.children.length) skeleton(body, 6);
    let docs;
    try { docs = await P55.request("/documents"); } catch (e) { body.replaceChildren(); P55.show(e.message, true); return; }
    body.replaceChildren();
    document.getElementById("docs-empty").hidden = docs.length > 0;
    for (const d of docs) {
      const status = el("span", { class: "badge " + d.status }, STATUS_TR[d.status] || d.status);
      const actions = el("span", {});
      if (d.status === "failed" && d.chunk_count > 0) {
        actions.append(el("button", { type: "button", class: "secondary", onclick: () => reindex(d.id) }, "Yeniden indeksle"), " ");
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

  async function reindex(id) {
    try { await P55.request("/documents/" + id + "/reindex", { method: "POST" }); P55.show("Yeniden indekslendi"); }
    catch (e) { P55.show(e.message, true); }
    loadDocs();
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
        const d = await uploadFile(input.files[0], setProgress);
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
})();
