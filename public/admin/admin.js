"use strict";
/* Yonetim sekmesi (yalnizca yonetici): kullanicilar, tum belgeler ve API anahtarlari. Yetki kontrolu SUNUCUDADIR. */
(function () {
  const { el } = App;
  const ROLE_TR = { admin: "yönetici", user: "kullanıcı" };
  const STATUS_TR = { uploaded: "yüklendi", chunked: "parçalandı", indexed: "hazır", failed: "hata" };

  async function load() {
    if (!App.user || App.user.role !== "admin") return;
    try {
      const [users, docs, tokens] = await Promise.all([App.request("/admin/users"), App.request("/admin/documents"),
        App.request("/admin/tokens")]);
      const ub = document.querySelector("#admin-users tbody");
      ub.replaceChildren();
      for (const u of users) {
        const del = u.id === App.user.id ? "" :
          el("button", { type: "button", class: "danger", onclick: () => removeUser(u) }, "Sil");
        const email = u.email_verified ? u.email : u.email + " (doğrulanmadı)";
        ub.append(el("tr", {}, el("td", {}, u.full_name || "—"), el("td", {}, email), el("td", {}, el("span", { class: "badge role-" + u.role }, ROLE_TR[u.role] || u.role)), el("td", {}, App.fmtDate(u.created_at)), el("td", {}, del)));
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
        const end = el("td", t.expired ? { class: "expired" } : {}, App.fmtDate(t.expires_at) + (t.expired ? " · süresi doldu" : ""));
        tb.append(el("tr", {},
          el("td", {}, t.owner_email),
          el("td", {}, t.name),
          el("td", {}, el("code", {}, t.prefix + "…")),
          el("td", {}, App.fmtDate(t.created_at)),
          el("td", {}, t.last_used_at ? App.fmtDate(t.last_used_at) : "hiç"),
          end,
          el("td", {}, el("button", { type: "button", class: "danger", onclick: () => revokeToken(t) }, "İptal et"))));
      }
      document.getElementById("admin-tokens").closest(".table-wrap").hidden = tokens.length === 0;
      document.getElementById("admin-tokens-empty").hidden = tokens.length > 0;
    } catch (e) { App.show(e.message, true); }
  }

  async function revokeToken(t) {
    if (!confirm(t.owner_email + " kullanıcısının “" + t.name + "” anahtarı iptal edilsin mi? Sahibine e-postayla bildirilir.")) return;
    try { const out = await App.request("/admin/tokens/" + t.id, { method: "DELETE" }); App.show(out.detail); }
    catch (e) { App.show(e.message, true); }
    load();
  }

  async function removeUser(u) {
    if (!confirm((u.full_name ? u.full_name + " <" + u.email + ">" : u.email) + " ve tüm verisi (belgeler, sohbetler) kalıcı olarak silinsin mi?")) return;
    try { await App.request("/admin/users/" + u.id, { method: "DELETE" }); App.show("Kullanıcı silindi"); }
    catch (e) { App.show(e.message, true); }
    load();
  }

  App.tabs.admin = { onShow: load };
})();
