"use strict";
/* Yonetim sekmesi (yalnizca yonetici): kullanicilar ve tum belgeler. Yetki kontrolu SUNUCUDADIR. */
(function () {
  const { el } = P55;
  const ROLE_TR = { admin: "yönetici", user: "kullanıcı" };
  const STATUS_TR = { uploaded: "yüklendi", chunked: "parçalandı", indexed: "hazır", failed: "hata" };

  async function load() {
    if (!P55.user || P55.user.role !== "admin") return;
    try {
      const [users, docs] = await Promise.all([P55.request("/admin/users"), P55.request("/admin/documents")]);
      const ub = document.querySelector("#admin-users tbody");
      ub.replaceChildren();
      for (const u of users) {
        const del = u.id === P55.user.id ? "" :
          el("button", { type: "button", class: "danger", onclick: () => removeUser(u) }, "Sil");
        ub.append(el("tr", {}, el("td", {}, u.email), el("td", {}, el("span", { class: "badge role-" + u.role }, ROLE_TR[u.role] || u.role)), el("td", {}, P55.fmtDate(u.created_at)), el("td", {}, del)));
      }
      const db = document.querySelector("#admin-docs tbody");
      db.replaceChildren();
      for (const d of docs) {
        db.append(el("tr", {}, el("td", {}, d.filename), el("td", {}, d.owner_email), el("td", {}, el("span", { class: "badge " + d.status }, STATUS_TR[d.status] || d.status)), el("td", {}, d.chunk_count)));
      }
    } catch (e) { P55.show(e.message, true); }
  }

  async function removeUser(u) {
    if (!confirm(u.email + " ve tüm verisi (belgeler, sohbetler) kalıcı olarak silinsin mi?")) return;
    try { await P55.request("/admin/users/" + u.id, { method: "DELETE" }); P55.show("Kullanıcı silindi"); }
    catch (e) { P55.show(e.message, true); }
    load();
  }

  P55.tabs.admin = { onShow: load };
})();
