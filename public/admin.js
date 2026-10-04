"use strict";
/* Yonetim sekmesi (yalnizca yonetici): kullanicilar, tum belgeler ve API anahtarlari. Yetki kontrolu SUNUCUDADIR. */
(function () {
  const { el } = P55;
  const ROLE_TR = { admin: "yönetici", user: "kullanıcı" };
  const STATUS_TR = { uploaded: "yüklendi", chunked: "parçalandı", indexed: "hazır", failed: "hata" };

  async function load() {
    if (!P55.user || P55.user.role !== "admin") return;
    try {
      const [users, docs, tokens] = await Promise.all([P55.request("/admin/users"), P55.request("/admin/documents"),
        P55.request("/admin/tokens")]);
      const ub = document.querySelector("#admin-users tbody");
      ub.replaceChildren();
      for (const u of users) {
        const del = u.id === P55.user.id ? "" :
          el("button", { type: "button", class: "danger", onclick: () => removeUser(u) }, "Sil");
        const email = u.email_verified ? u.email : u.email + " (doğrulanmadı)";
        ub.append(el("tr", {}, el("td", {}, u.full_name || "—"), el("td", {}, email), el("td", {}, el("span", { class: "badge role-" + u.role }, ROLE_TR[u.role] || u.role)), el("td", {}, P55.fmtDate(u.created_at)), el("td", {}, del)));
      }
      const db = document.querySelector("#admin-docs tbody");
      db.replaceChildren();
      for (const d of docs) {
        db.append(el("tr", {}, el("td", {}, d.filename), el("td", {}, d.owner_email), el("td", {}, el("span", { class: "badge " + d.status }, STATUS_TR[d.status] || d.status)), el("td", {}, d.chunk_count)));
      }
      // API anahtarlari: yonetici anahtarin kendisini GOREMEZ (sunucu yalnizca ilk 12 karakteri dondurur), iptal edebilir
      const tb = document.querySelector("#admin-tokens tbody");
      tb.replaceChildren();
      for (const t of tokens) {
        const end = el("td", t.expired ? { class: "expired" } : {}, P55.fmtDate(t.expires_at) + (t.expired ? " · süresi doldu" : ""));
        tb.append(el("tr", {},
          el("td", {}, t.owner_email),
          el("td", {}, t.name),
          el("td", {}, el("code", {}, t.prefix + "…")),
          el("td", {}, P55.fmtDate(t.created_at)),
          el("td", {}, t.last_used_at ? P55.fmtDate(t.last_used_at) : "hiç"),
          end,
          el("td", {}, el("button", { type: "button", class: "danger", onclick: () => revokeToken(t) }, "İptal et"))));
      }
      document.getElementById("admin-tokens").closest(".table-wrap").hidden = tokens.length === 0;
      document.getElementById("admin-tokens-empty").hidden = tokens.length > 0;
    } catch (e) { P55.show(e.message, true); }
  }

  async function revokeToken(t) {
    if (!confirm(t.owner_email + " kullanıcısının “" + t.name + "” anahtarı iptal edilsin mi? Sahibine e-postayla bildirilir.")) return;
    try { const out = await P55.request("/admin/tokens/" + t.id, { method: "DELETE" }); P55.show(out.detail); }
    catch (e) { P55.show(e.message, true); }
    load();
  }

  async function removeUser(u) {
    if (!confirm((u.full_name ? u.full_name + " <" + u.email + ">" : u.email) + " ve tüm verisi (belgeler, sohbetler) kalıcı olarak silinsin mi?")) return;
    try { await P55.request("/admin/users/" + u.id, { method: "DELETE" }); P55.show("Kullanıcı silindi"); }
    catch (e) { P55.show(e.message, true); }
    load();
  }

  P55.tabs.admin = { onShow: load };
})();
