"use strict";
/* Çekirdek: API istemcisi, giriş/kayıt, sekmeler. Diger dosyalar (docs.js ...) P55.tabs'a kendini kaydeder.
   GUVENLIK: Sunucudan gelen metinler asla innerHTML ile yazilmaz; textContent kullanilir (XSS onlemi). */
const P55 = {
  // Backend ayri bir adreste calisir (config.js). Sondaki "/" atilir: P55.api + "/auth/me"
  api: ((window.P55_CONFIG && window.P55_CONFIG.apiBase) || "").replace(/\/$/, ""),
  token: sessionStorage.getItem("p55_token"),   // sessionStorage: sekme kapaninca silinir
  user: null,
  tabs: {},

  el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  },

  // Bildirim (sag altta). Basari mesajlari 4 sn sonra kendiliginden kapanir; hatalar kullanici okusun diye 8 sn kalir.
  // kind: true/"err" = hata, "info" = bilgi (bekleme mesaji, kendiliginden kapanmaz), aksi halde basari.
  // Giris penceresi acikken mesaj pencerenin icine yazilir: <dialog> en ust katmanda oldugu icin
  // sag alttaki kutu onun arkasinda kalir ve gorunmezdi.
  show(text, kind) {
    const dialog = document.getElementById("auth-dialog");
    const box = dialog && dialog.open ? document.getElementById("auth-msg") : document.getElementById("msg");
    clearTimeout(P55._msgTimer);
    if (!text) { box.className = ""; return; }
    box.textContent = text;
    box.className = kind === true || kind === "err" ? "err" : kind === "info" ? "info" : "ok";
    if (box.className !== "info") P55._msgTimer = setTimeout(() => { box.className = ""; }, box.className === "err" ? 8000 : 4000);
  },

  // Sunucu tarihleri UTC'dir ("2026-10-02 17:05:00"); kullanicinin yerel saatine cevrilir.
  fmtDate(s) {
    if (!s) return "";
    const d = new Date(s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z"));
    if (isNaN(d)) return s.slice(0, 16).replace("T", " ");
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  },

  errorText(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join("; ");
    return "Beklenmeyen bir hata oluştu";
  },

  async request(path, options) {
    const opts = Object.assign({}, options);
    const asBlob = !!opts.blob;                       // dosya indirme: baytlar oldugu gibi (CSV'deki BOM korunur)
    delete opts.blob;
    opts.headers = Object.assign({}, opts.headers);
    if (P55.token) opts.headers["Authorization"] = "Bearer " + P55.token;
    if (opts.json !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    let res;
    try {
      res = await fetch(P55.api + path, opts);
    } catch (e) {
      throw new Error("Sunucuya ulaşılamadı");
    }
    if (res.status === 401 && P55.token) {          // oturum bitti
      P55.logout("Oturum süresi doldu, tekrar giriş yapın");
      throw new Error("Oturum süresi doldu");
    }
    if (res.ok && asBlob) return res.blob();         // res.text() UTF-8 BOM'unu siler -> Excel Turkce karakteri bozar
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const err = new Error(P55.errorText(data && data.detail));
      err.status = res.status;                      // or. girişte 403 = e-posta doğrulanmamış
      throw err;
    }
    return data;
  },

  // Dosya gonderimi, ilerleme yuzdesiyle. fetch() gonderilen baytlari bildirmedigi icin XMLHttpRequest
  // kullanilir: xhr.upload.onprogress tarayicidan sunucuya giden her parcada cagrilir.
  // onProgress(oran): 0..1 arasi; 1 olunca dosya gitmistir, sunucu artik ayristirip vektorlestiriyordur.
  // opts.auth: true ise oturum token'i eklenir. Supabase'e giden istekte EKLENMEZ: token'imiz yalnizca
  // kendi backend'imize gider (imzali yukleme adresi zaten kendi tek kullanimlik anahtarini tasir).
  send(url, body, onProgress, opts) {
    const o = Object.assign({ method: "POST", headers: {}, auth: false }, opts);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(o.method, url);
      if (o.auth && P55.token) xhr.setRequestHeader("Authorization", "Bearer " + P55.token);
      for (const [k, v] of Object.entries(o.headers)) xhr.setRequestHeader(k, v);
      xhr.responseType = "json";
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total); };
      xhr.onerror = () => reject(new Error("Sunucuya ulaşılamadı"));
      xhr.onload = () => {
        if (o.auth && xhr.status === 401 && P55.token) {
          P55.logout("Oturum süresi doldu, tekrar giriş yapın");
          return reject(new Error("Oturum süresi doldu"));
        }
        const data = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(P55.errorText(data && (data.detail || data.message))));
      };
      xhr.send(body);
    });
  },

  // Kendi backend'imize dosya (multipart form) gonderir.
  upload(path, formData, onProgress) {
    return P55.send(P55.api + path, formData, onProgress, { auth: true });
  },

  setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle("busy", busy);         // CSS donen bir gosterge cizer
  },

  async afterLogin(token) {
    P55.token = token;
    sessionStorage.setItem("p55_token", token);
    P55.user = await P55.request("/auth/me");
    P55.closeAuth();
    P55.setLoggedIn(true);
    P55.showUser();
    P55.applyRole();
    P55.setTab("docs");
  },

  // Ust bardaki kullanici kutusu: ad (yoksa e-posta) ve bas harf. Hesabim'da ad degisince de cagrilir.
  showUser() {
    const name = P55.user.full_name || P55.user.email;        // eski hesaplarda ad bos olabilir
    document.getElementById("whoami").textContent = name + (P55.user.role === "admin" ? " (yönetici)" : "");
    document.getElementById("whoami").title = P55.user.email;
    document.getElementById("avatar").textContent = (name || "?").charAt(0).toLocaleUpperCase("tr-TR");
  },

  applyRole() {
    const isAdmin = P55.user && P55.user.role === "admin";
    document.querySelectorAll("[data-admin-only]").forEach(e => { e.hidden = !isAdmin; });
  },

  logout(message) {
    P55.token = null;
    P55.user = null;
    sessionStorage.removeItem("p55_token");
    P55.hideTabs();
    P55.setLoggedIn(false);
    P55.applyRole();
    if (message) P55.openAuth("login");             // oturum dolduysa giris penceresi kendiliginden acilir
    P55.show(message || "", !!message);
  },

  // Giris yapilmamis: ana sayfa + ust menu + "Giris yap"; giris yapilmis: uygulama + kullanici kutusu.
  setLoggedIn(on) {
    document.getElementById("home-view").hidden = on;
    document.getElementById("site-nav").hidden = on;
    document.getElementById("header-login").hidden = on;
    document.getElementById("header-register").hidden = on;
    document.getElementById("app-view").hidden = !on;
    document.getElementById("userbox").hidden = !on;
    if (on) scrollTo(0, 0);
  },

  /* ---- Giris penceresi: "Giris", "Kayit", "E-posta dogrulama", "Sifremi unuttum", "Yeni parola" panelleri ---- */
  setAuthPanel(name) {
    document.querySelectorAll(".auth-panel").forEach(p => { p.hidden = p.id !== "auth-panel-" + name; });
    const dialog = document.getElementById("auth-dialog");
    dialog.setAttribute("aria-labelledby", { login: "auth-title", register: "register-title", verify: "verify-title",
                                              forgot: "forgot-title", reset: "reset-title" }[name]);
    P55.show("");
    const first = document.querySelector("#auth-panel-" + name + " input");
    if (first && dialog.open) first.focus();
  },

  openAuth(panel) {
    const dialog = document.getElementById("auth-dialog");
    if (!dialog.open) dialog.showModal();             // modal: arka plan etkisiz, Esc ile kapanir
    P55.setAuthPanel(panel || "login");
  },

  closeAuth() {
    const dialog = document.getElementById("auth-dialog");
    if (dialog.open) dialog.close();
  },

  // Dogrulama paneline gec: hangi e-postanin dogrulanacagi saklanir (kod ve "yeniden gonder" ona gider).
  verifyEmail: "",
  goVerify(address) {
    P55.verifyEmail = address;
    document.getElementById("verify-email-text").textContent = address;
    document.getElementById("verify-code").value = "";
    P55.openAuth("verify");
  },

  // Gorunmez olan sekmelere haber ver (or. Hesabim yeni API anahtarini ekrandan siler). except: acik kalan sekme
  hideTabs(except) {
    for (const [n, t] of Object.entries(P55.tabs)) if (n !== except && t.onHide) t.onHide();
  },

  setTab(name) {
    document.querySelectorAll("#tabs button").forEach(b => {
      const selected = b.dataset.tab === name;
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;               // klavyede sekme listesine tek duraktan girilir, oklarla gezilir
    });
    document.querySelectorAll(".tab").forEach(t => { t.hidden = t.id !== "tab-" + name; });
    P55.hideTabs(name);
    const tab = P55.tabs[name];
    if (tab && tab.onShow) tab.onShow();
  },

  /* Tema: kullanici sectiyse <html data-theme="light|dark">, secmediyse isletim sisteminin ayari (CSS
     prefers-color-scheme). Dugme o an GORUNEN temanin tersine gecer ve secimi hatirlar. */
  osDark: matchMedia("(prefers-color-scheme: dark)"),
  isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : P55.osDark.matches;
  },
  syncThemeButton() {
    const btn = document.getElementById("theme-toggle");
    const label = P55.isDark() ? "Açık temaya geç" : "Koyu temaya geç";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  },
  toggleTheme() {
    const root = document.documentElement;
    root.dataset.theme = P55.isDark() ? "light" : "dark";
    try { localStorage.setItem("p55_theme", root.dataset.theme); } catch (e) { /* gizli pencere: tema yalnizca bu oturumda */ }
    P55.syncThemeButton();
  },

  async start() {
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const creds = () => ({ email: email.value, password: password.value });

    document.getElementById("auth-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("btn-login");
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/login", { method: "POST", json: creds() });
        password.value = "";
        P55.show("");
        await P55.afterLogin(out.access_token);
      } catch (e) {
        if (e.status === 403) {                     // parola dogru ama e-posta dogrulanmamis -> kodu girsin
          P55.goVerify(email.value.trim());
          P55.show(e.message, "info");
        } else P55.show(e.message, true);
      }
      P55.setBusy(btn, false);
    });

    // Kayit: ad soyad + e-posta + parola (iki kez). Sunucu e-postaya 6 haneli kod gonderir -> dogrulama paneli.
    document.getElementById("register-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("btn-register");
      const regPw = document.getElementById("reg-password");
      const regPw2 = document.getElementById("reg-password2");
      if (regPw.value !== regPw2.value) {           // yazim hatasiyla bilinmeyen bir parola belirlenmesin
        P55.show("Parolalar birbirini tutmuyor", true);
        regPw2.focus();
        return;
      }
      const body = { full_name: document.getElementById("reg-name").value.trim(),
                     email: document.getElementById("reg-email").value.trim(), password: regPw.value };
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/register", { method: "POST", json: body });
        regPw.value = regPw2.value = "";
        if (out.verification_required) {
          P55.goVerify(out.email);
          P55.show(out.detail, "info");
        } else {                                    // dogrulama kapaliysa (SMTP'siz deneme) dogrudan girise
          email.value = out.email;
          P55.setAuthPanel("login");
          P55.show(out.detail);
        }
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    // E-posta dogrulama: dogru kod girilince sunucu oturum anahtari doner, kullanici dogrudan iceri girer.
    document.getElementById("verify-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("btn-verify");
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/verify-email", { method: "POST",
          json: { email: P55.verifyEmail, code: document.getElementById("verify-code").value.trim() } });
        password.value = "";
        await P55.afterLogin(out.access_token);
        P55.show("E-postan doğrulandı, hoş geldin " + (out.user.full_name || "") + "!");
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    document.getElementById("btn-resend").addEventListener("click", async () => {
      const btn = document.getElementById("btn-resend");
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/resend-verification", { method: "POST", json: { email: P55.verifyEmail } });
        P55.show(out.detail, "info");
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    // Giris penceresini acan/kapatan dugmeler. data-open-auth="register" kayit panelini, bos/"login" girisi acar.
    document.querySelectorAll("[data-open-auth]").forEach(b => b.addEventListener("click", () => P55.openAuth(b.dataset.openAuth || "login")));
    document.querySelectorAll("[data-auth-panel]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.authPanel === "forgot" && email.value) document.getElementById("forgot-email").value = email.value;
      P55.setAuthPanel(b.dataset.authPanel);
    }));
    const dialog = document.getElementById("auth-dialog");
    document.getElementById("auth-close").addEventListener("click", P55.closeAuth);
    dialog.addEventListener("click", (ev) => { if (ev.target === dialog) P55.closeAuth(); });   // karartilmis arka plana tiklama

    // Sifremi unuttum -> kod iste. Sunucu e-posta kayitli olsun olmasin ayni yaniti verir.
    let resetEmail = "";
    document.getElementById("forgot-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("btn-forgot");
      resetEmail = document.getElementById("forgot-email").value.trim();
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/forgot-password", { method: "POST", json: { email: resetEmail } });
        document.getElementById("reset-email-text").textContent = resetEmail;
        document.getElementById("reset-code").value = "";
        P55.setAuthPanel("reset");
        P55.show(out.detail, "info");
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    // Kod + yeni parola -> parolayi degistir, giris paneline e-posta dolu olarak don
    document.getElementById("reset-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = document.getElementById("btn-reset");
      const newPw = document.getElementById("reset-password");
      P55.setBusy(btn, true);
      try {
        const out = await P55.request("/auth/reset-password", { method: "POST",
          json: { email: resetEmail, code: document.getElementById("reset-code").value, new_password: newPw.value } });
        newPw.value = "";
        email.value = resetEmail;
        P55.setAuthPanel("login");
        P55.show(out.detail);
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    document.getElementById("logout").addEventListener("click", () => P55.logout());
    document.getElementById("theme-toggle").addEventListener("click", P55.toggleTheme);
    P55.osDark.addEventListener("change", P55.syncThemeButton);     // sistem temasi degisirse dugme yazisi da degissin
    P55.syncThemeButton();

    // "Goster/Gizle": her dugme aria-controls ile bagli oldugu parola kutusunu degistirir (giris ve kayit)
    document.querySelectorAll("[data-pw-toggle]").forEach(t => t.addEventListener("click", () => {
      const input = document.getElementById(t.getAttribute("aria-controls"));
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      t.textContent = show ? "Gizle" : "Göster";
      t.setAttribute("aria-pressed", String(show));
    }));

    const tabButtons = () => [...document.querySelectorAll("#tabs button")].filter(b => !b.hidden);
    document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => P55.setTab(b.dataset.tab)));
    document.getElementById("tabs").addEventListener("keydown", (ev) => {      // sol/sag ok, Home, End
      const list = tabButtons();
      const i = list.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 }[ev.key];
      if (next === undefined) return;
      ev.preventDefault();
      const target = list[(next + list.length) % list.length];
      target.focus();
      P55.setTab(target.dataset.tab);
    });

    if (P55.token) {
      try { await P55.afterLogin(P55.token); } catch (e) { P55.logout(); }
    }
  },
};
