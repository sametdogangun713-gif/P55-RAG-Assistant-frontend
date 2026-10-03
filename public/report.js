"use strict";
/* Rapor sekmesi: ozet kartlari, kalite dagilimi, en cok kullanilan kaynaklar, gunluk soru sayisi, CSV. */
(function () {
  const { el } = P55;
  const STATUS_LABEL = {
    answered: "Kaynaklı yanıt", no_context: "İlgili bölüm bulunamadı", no_info: "Yeterli bilgi yok",
    unverified: "Doğrulanamadı", unknown: "Bilinmiyor",
  };
  const pct = (v) => (v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%");
  const num = (v) => (v === null || v === undefined ? "—" : String(v));

  function stat(label, value) {
    return el("div", { class: "stat" }, el("div", { class: "stat-value" }, value), el("div", { class: "stat-label" }, label));
  }

  function barRow(label, value, max, valueText) {
    const w = max > 0 ? Math.round((value / max) * 100) : 0;
    const bar = el("div", { class: "bar", role: "img", "aria-label": label + ": " + valueText }, el("span", { style: "width:" + w + "%" }));
    return el("div", { class: "bar-row" }, el("div", { class: "label", title: label }, label), bar, el("div", {}, valueText));
  }

  function render(r) {
    const body = document.getElementById("report-body");
    body.replaceChildren();
    const p = r.period, t = r.totals;

    const cards = el("div", { class: "stats" },
      stat("Soru (dönem)", num(p.questions)),
      stat("Kaynağa dayalı yanıt oranı", pct(p.grounded_rate)),
      stat("Yanıtsız kalan oranı", pct(p.no_answer_rate)),
      stat("Ort. yanıt süresi", p.avg_latency_ms === null ? "—" : Math.round(p.avg_latency_ms) + " ms"),
      stat("Belge (hazır / toplam)", t.indexed_documents + " / " + t.documents),
      stat("Parça", num(t.chunks)),
      stat("Sohbet", num(t.conversations)));
    if (t.users !== null) cards.append(stat("Kullanıcı", num(t.users)));
    body.append(cards);

    body.append(el("h3", {}, "Yanıt kalitesi"));
    const maxStatus = Math.max(1, ...Object.values(p.by_status));
    for (const [k, v] of Object.entries(p.by_status)) {
      if (k === "unknown" && v === 0) continue;
      body.append(barRow(STATUS_LABEL[k] || k, v, maxStatus, String(v)));
    }
    if (p.answers === 0) body.append(el("p", {}, "Bu dönemde yanıt yok; oranlar hesaplanamadı (—)."));

    body.append(el("h3", {}, "En çok kaynak gösterilen belgeler"));
    if (!r.top_sources.length) body.append(el("p", {}, "Bu dönemde kaynak gösterilen belge yok."));
    const maxSrc = Math.max(1, ...r.top_sources.map(s => s.answers));
    for (const s of r.top_sources) body.append(barRow(s.filename, s.answers, maxSrc, s.answers + " yanıt"));

    body.append(el("h3", {}, "Günlük soru sayısı"));
    const total = r.daily.reduce((a, d) => a + d.questions, 0);
    const maxDay = Math.max(1, ...r.daily.map(d => d.questions));
    const chart = el("div", { class: "vchart", role: "img", "aria-label": "Son " + r.days + " günde toplam " + total + " soru" });
    for (const d of r.daily) {
      chart.append(el("div", { class: "vbar" + (d.questions === 0 ? " zero" : ""), style: "height:" + Math.round((d.questions / maxDay) * 100) + "%",
        title: d.date + ": " + d.questions + " soru" }));
    }
    body.append(chart, el("div", { class: "axis" }, el("span", {}, r.from), el("span", {}, "en yüksek: " + maxDay), el("span", {}, r.to)));
  }

  function params() {
    const days = document.getElementById("report-days").value;
    const scopeBox = document.getElementById("report-scope-box");
    const scope = scopeBox.hidden ? "me" : document.getElementById("report-scope").value;
    return "days=" + encodeURIComponent(days) + "&scope=" + encodeURIComponent(scope);
  }

  async function load() {
    document.getElementById("report-scope-box").hidden = !(P55.user && P55.user.role === "admin");
    try { render(await P55.request("/reports/usage?" + params())); P55.show(""); }
    catch (e) { P55.show(e.message, true); }
  }

  async function downloadCsv() {
    try {
      const text = await P55.request("/reports/usage.csv?" + params());     // Authorization basligi gerektigi icin fetch ile
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      const a = el("a", { href: url, download: "kullanim-raporu.csv" });
      document.body.append(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { P55.show(e.message, true); }
  }

  document.getElementById("report-form").addEventListener("submit", (ev) => { ev.preventDefault(); load(); });
  document.getElementById("report-csv").addEventListener("click", downloadCsv);
  P55.tabs.report = { onShow: load };
})();
