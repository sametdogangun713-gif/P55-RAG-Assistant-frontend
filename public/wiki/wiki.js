"use strict";
/* Belgelerim -> "Vikipedi'den ekle": 3. parti API'den (Vikipedi) makale arar ve secileni belge olarak ekletir.
   Tarayici Vikipedi'ye DOGRUDAN gitmez: istek backend'e gider (GET /wikipedia/search, POST /wikipedia/import).
   Boylece CORS ve User-Agent kurallari tek yerde (backend) kalir, metin aynen dosya yuklemesi gibi indekslenir. */
(function () {
  const { el } = App;
  const list = document.getElementById("wiki-results");

  function renderResults(results, lang) {
    list.replaceChildren();
    if (!results.length) { list.append(el("li", { class: "empty" }, "Sonuç yok. Başka bir kelime dene.")); return; }
    for (const r of results) {
      const add = el("button", { type: "button", class: "secondary" }, "Belge olarak ekle");
      add.addEventListener("click", () => importArticle(r.title, lang, add));
      // Baslik ve ozet sunucudan gelir: el() metni textContent ile yazar (innerHTML yok -> XSS yok)
      list.append(el("li", { class: "wiki-item" },
        el("div", {}, el("strong", {}, r.title), el("p", {}, r.snippet)), add));
    }
  }

  async function importArticle(title, lang, btn) {
    App.setBusy(btn, true);
    App.show("“" + title + "” Vikipedi'den alınıyor ve indeksleniyor…", "info");
    try {
      let d = await App.request("/wikipedia/import", { method: "POST", json: { title, lang } });
      if (d.status === "chunked") d = await App.docs.finishIndexing(d);
      App.show(d.status === "indexed" ? "Belge hazır: " + d.filename : "Belge eklendi (durum: " + d.status + ")",
        d.status === "failed");
      btn.textContent = "Eklendi";
    } catch (e) { App.show(e.message, true); btn.disabled = false; }
    btn.classList.remove("busy");
    App.docs.reload();
  }

  document.getElementById("wiki-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById("wiki-btn");
    const q = document.getElementById("wiki-query").value.trim();
    const lang = document.getElementById("wiki-lang").value;
    if (!q) return;
    App.setBusy(btn, true);
    try {
      const res = await App.request("/wikipedia/search?" + new URLSearchParams({ q, lang, limit: 5 }));
      App.show("");
      renderResults(res.results, lang);
    } catch (e) { App.show(e.message, true); }
    App.setBusy(btn, false);
  });
})();
