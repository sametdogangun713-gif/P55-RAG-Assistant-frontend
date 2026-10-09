"use strict";
/* Hesabim sekmesi: hesap bilgileri, ad soyad, parola degistirme, API anahtarlari, hesabi silme.
   Parola ve yetki kontrolu SUNUCUDADIR (backend: app/services/account.py); burada yalnizca form ve mesajlar var.
   GUVENLIK: sunucudan gelen metinler textContent ile yazilir. */
(function () {
  const $ = (id) => document.getElementById(id);
  const { el } = App;

  function fill() {
    const u = App.user;
    if (!u) return;
    $("acc-email").textContent = u.email + (u.email_verified ? " · doğrulandı" : " · doğrulanmadı");
    $("acc-role").textContent = u.role === "admin" ? "yönetici" : "kullanıcı";
    $("acc-created").textContent = App.fmtDate(u.created_at);
    $("acc-name").value = u.full_name || "";
  }

  // Ortak kalip: dugmeyi mesgul yap, istegi at, sonucu bildir
  async function submit(button, work) {
    App.setBusy(button, true);
    try { await work(); } catch (e) { App.show(e.message, true); }
    App.setBusy(button, false);
  }

  $("name-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submit($("btn-name"), async () => {
      App.user = await App.request("/auth/me", { method: "PATCH", json: { full_name: $("acc-name").value.trim() } });
      App.showUser();                                // ust bardaki ad ve bas harf de degissin
      fill();
      App.show("Adın güncellendi");
    });
  });

  $("password-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const current = $("acc-pw-current"), next = $("acc-pw-new"), again = $("acc-pw-new2");
    if (next.value !== again.value) { App.show("Yeni parolalar birbirini tutmuyor", true); again.focus(); return; }
    submit($("btn-password"), async () => {
      const out = await App.request("/auth/change-password", { method: "POST",
        json: { current_password: current.value, new_password: next.value } });
      current.value = next.value = again.value = "";
      App.show(out.detail);
    });
  });

  // --- API anahtarlari: 3. parti uygulamalar "Authorization: Bearer bsa_..." ile baglanir (backend: services/api_tokens.py)
  async function loadTokens() {
    try {
      const list = await App.request("/auth/tokens");
      const body = document.querySelector("#tokens-table tbody");
      body.replaceChildren();
      for (const t of list) {
        const end = el("td", t.expired ? { class: "expired" } : {}, App.fmtDate(t.expires_at) + (t.expired ? " · süresi doldu" : ""));
        body.append(el("tr", {},
          el("td", {}, t.name),
          el("td", {}, el("code", {}, t.prefix + "…")),
          el("td", {}, App.fmtDate(t.created_at)),
          el("td", {}, t.last_used_at ? App.fmtDate(t.last_used_at) : "hiç"),
          end,
          el("td", {}, el("button", { type: "button", class: "danger", onclick: () => removeToken(t) }, "Sil"))));
      }
      $("tokens-table").closest(".table-wrap").hidden = list.length === 0;
      $("tokens-empty").hidden = list.length > 0;
    } catch (e) { App.show(e.message, true); }
  }

  function hideNewToken() {                          // anahtar ekranda kalmasin: sekme degisince silinir
    $("token-value").textContent = "";
    $("token-new").hidden = true;
  }

  async function removeToken(t) {
    if (!confirm("“" + t.name + "” anahtarı silinsin mi? Bu anahtarı kullanan uygulamalar artık bağlanamaz.")) return;
    try { const out = await App.request("/auth/tokens/" + t.id, { method: "DELETE" }); App.show(out.detail); }
    catch (e) { App.show(e.message, true); }
    loadTokens();
  }

  $("token-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    submit($("btn-token"), async () => {
      const out = await App.request("/auth/tokens", { method: "POST",
        json: { name: $("token-name").value.trim(), expires_in_days: Number($("token-days").value) } });
      $("token-name").value = "";
      $("token-value").textContent = out.token;      // anahtarin TEK gosterimi; hicbir yere kaydedilmez
      $("token-new").hidden = false;
      $("btn-token-copy").focus();
      App.show("API anahtarı oluşturuldu");
      loadTokens();
    });
  });

  $("btn-token-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("token-value").textContent);
      App.show("Anahtar panoya kopyalandı");
    } catch (e) {                                    // pano izni yoksa metni sec: kullanici Ctrl+C ile kopyalar
      getSelection().selectAllChildren($("token-value"));
      App.show("Kopyalanamadı: anahtar seçildi, Ctrl+C ile kopyala", true);
    }
  });

  $("delete-account-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!confirm("Hesabın ve tüm verilerin (belgeler, dosyalar, sohbetler) kalıcı olarak silinecek. Emin misin?")) return;
    submit($("btn-delete-account"), async () => {
      const out = await App.request("/auth/me", { method: "DELETE", json: { password: $("acc-del-password").value } });
      $("acc-del-password").value = "";
      App.logout();                                  // oturum anahtari artik gecersiz: ana sayfaya don
      App.show(out.detail);
    });
  });

  App.tabs.account = { onShow() { fill(); loadTokens(); }, onHide: hideNewToken };
})();
