"use strict";
/* Hesabim sekmesi: hesap bilgileri, ad soyad, parola degistirme, hesabi silme.
   Parola ve yetki kontrolu SUNUCUDADIR (backend: app/services/account.py); burada yalnizca form ve mesajlar var.
   GUVENLIK: sunucudan gelen metinler textContent ile yazilir. */
(function () {
  const $ = (id) => document.getElementById(id);

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

  P55.tabs.account = { onShow: fill };
})();
