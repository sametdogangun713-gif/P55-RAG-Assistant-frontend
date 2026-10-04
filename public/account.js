"use strict";
/* Hesabim sekmesi: hesap bilgileri, ad soyad, parola degistirme, API anahtarlari, hesabi silme.
   Parola ve yetki kontrolu SUNUCUDADIR (backend: app/services/account.py); burada yalnizca form ve mesajlar var.
   GUVENLIK: sunucudan gelen metinler textContent ile yazilir. */
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = P55;

  function fill() {
    const u = P55.user;
    if (!u) return;
    $("acc-email").textContent = u.email + (u.email_verified ? " · doğrulandı" : " · doğrulanmadı");
    $("acc-role").textContent = u.role === "admin" ? "yönetici" : "kullanıcı";
    $("acc-created").textContent = P55.fmtDate(u.created_at);
    $("acc-name").value = u.full_name || "";
  }

  // Ortak kalip: dugmeyi mesgul yap, istegi at, sonucu bildir
  async function submit(button, work) {
    P55.setBusy(button, true);
    try { await work(); } catch (e) { P55.show(e.message, true); }
    P55.setBusy(button, false);
  }

  $("name-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submit($("btn-name"), async () => {
      P55.user = await P55.request("/auth/me", { method: "PATCH", json: { full_name: $("acc-name").value.trim() } });
      P55.showUser();                                // ust bardaki ad ve bas harf de degissin
      fill();
      P55.show("Adın güncellendi");
    });
  });

  $("password-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const current = $("acc-pw-current"), next = $("acc-pw-new"), again = $("acc-pw-new2");
    if (next.value !== again.value) { P55.show("Yeni parolalar birbirini tutmuyor", true); again.focus(); return; }
    submit($("btn-password"), async () => {
      const out = await P55.request("/auth/change-password", { method: "POST",
        json: { current_password: current.value, new_password: next.value } });
      current.value = next.value = again.value = "";
      P55.show(out.detail);
    });
  });

  // --- API anahtarlari: 3. parti uygulamalar "Authorization: Bearer p55_..." ile baglanir (backend: services/api_tokens.py)
  async function loadTokens() {
    try {
      const list = await P55.request("/auth/tokens");
      const body = document.querySelector("#tokens-table tbody");
      body.replaceChildren();
      for (const t of list) {
        const end = el("td", t.expired ? { class: "expired" } : {}, P55.fmtDate(t.expires_at) + (t.expired ? " · süresi doldu" : ""));
        body.append(el("tr", {},
          el("td", {}, t.name),
          el("td", {}, el("code", {}, t.prefix + "…")),
          el("td", {}, P55.fmtDate(t.created_at)),
          el("td", {}, t.last_used_at ? P55.fmtDate(t.last_used_at) : "hiç"),
          end,
          el("td", {}, el("button", { type: "button", class: "danger", onclick: () => removeToken(t) }, "Sil"))));
      }
      $("tokens-table").closest(".table-wrap").hidden = list.length === 0;
      $("tokens-empty").hidden = list.length > 0;
    } catch (e) { P55.show(e.message, true); }
  }

  function hideNewToken() {                          // anahtar ekranda kalmasin: sekme degisince silinir
    $("token-value").textContent = "";
    $("token-new").hidden = true;
  }

  async function removeToken(t) {
    if (!confirm("“" + t.name + "” anahtarı silinsin mi? Bu anahtarı kullanan uygulamalar artık bağlanamaz.")) return;
    try { const out = await P55.request("/auth/tokens/" + t.id, { method: "DELETE" }); P55.show(out.detail); }
    catch (e) { P55.show(e.message, true); }
    loadTokens();
  }

  $("token-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submit($("btn-token"), async () => {
      const out = await P55.request("/auth/tokens", { method: "POST",
        json: { name: $("token-name").value.trim(), expires_in_days: Number($("token-days").value) } });
      $("token-name").value = "";
      $("token-value").textContent = out.token;      // anahtarin TEK gosterimi; hicbir yere kaydedilmez
      $("token-new").hidden = false;
      $("btn-token-copy").focus();
      P55.show("API anahtarı oluşturuldu");
      loadTokens();
    });
  });

  $("btn-token-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("token-value").textContent);
      P55.show("Anahtar panoya kopyalandı");
    } catch (e) {                                    // pano izni yoksa metni sec: kullanici Ctrl+C ile kopyalar
      getSelection().selectAllChildren($("token-value"));
      P55.show("Kopyalanamadı: anahtar seçildi, Ctrl+C ile kopyala", true);
    }
  });

  $("delete-account-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!confirm("Hesabın ve tüm verilerin (belgeler, dosyalar, sohbetler) kalıcı olarak silinecek. Emin misin?")) return;
    submit($("btn-delete-account"), async () => {
      const out = await P55.request("/auth/me", { method: "DELETE", json: { password: $("acc-del-password").value } });
      $("acc-del-password").value = "";
      P55.logout();                                  // oturum anahtari artik gecersiz: ana sayfaya don
      P55.show(out.detail);
    });
  });

  P55.tabs.account = { onShow() { fill(); loadTokens(); }, onHide: hideNewToken };
})();
