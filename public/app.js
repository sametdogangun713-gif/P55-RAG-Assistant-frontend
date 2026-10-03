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
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error(P55.errorText(data && data.detail));
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
    document.getElementById("whoami").textContent = P55.user.email + (P55.user.role === "admin" ? " (yönetici)" : "");
    document.getElementById("avatar").textContent = (P55.user.email || "?").charAt(0).toUpperCase();
    P55.applyRole();
    P55.setTab("docs");
  },

  applyRole() {
    const isAdmin = P55.user && P55.user.role === "admin";
    document.querySelectorAll("[data-admin-only]").forEach(e => { e.hidden = !isAdmin; });
  },

  logout(message) {
    P55.token = null;
    P55.user = null;
    sessionStorage.removeItem("p55_token");
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
    document.getElementById("app-view").hidden = !on;
    document.getElementById("userbox").hidden = !on;
    if (on) scrollTo(0, 0);
  },

  /* ---- Giris penceresi: giris/kayit, "Sifremi unuttum", "Yeni parola" panelleri ---- */
  setAuthPanel(name) {
    document.querySelectorAll(".auth-panel").forEach(p => { p.hidden = p.id !== "auth-panel-" + name; });
    const dialog = document.getElementById("auth-dialog");
    dialog.setAttribute("aria-labelledby", { login: "auth-title", forgot: "forgot-title", reset: "reset-title" }[name]);
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

  setTab(name) {
    document.querySelectorAll("#tabs button").forEach(b => {
      const selected = b.dataset.tab === name;
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;               // klavyede sekme listesine tek duraktan girilir, oklarla gezilir
    });
    document.querySelectorAll(".tab").forEach(t => { t.hidden = t.id !== "tab-" + name; });
    P55.moveIndicator();
    const tab = P55.tabs[name];
    if (tab && tab.onShow) tab.onShow();
  },

  // Secili menu ogesinin arkasindaki gosterge ogeye kayarak gider (CSS transition).
  // Masaustunde menu dikeydir (yukari-asagi kayar), dar ekranda yataydir (saga-sola kayar).
  moveIndicator() {
    const btn = document.querySelector('#tabs button[aria-selected="true"]');
    const bar = document.getElementById("tab-indicator");
    if (!btn || !bar || btn.hidden) return;
    const vertical = getComputedStyle(document.getElementById("tabs")).flexDirection === "column";
    if (vertical) {
      bar.style.width = "";
      bar.style.height = btn.offsetHeight + "px";
      bar.style.transform = "translateY(" + btn.offsetTop + "px)";
    } else {
      bar.style.height = "";
      bar.style.width = btn.offsetWidth + "px";
      bar.style.transform = "translateX(" + btn.offsetLeft + "px)";
    }
  },

  toggleTheme() {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";   // varsayilan: koyu (siyah)
    try { localStorage.setItem("p55_theme", root.dataset.theme); } catch (e) { /* gizli pencere: tema yalnizca bu oturumda */ }
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
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    document.getElementById("btn-register").addEventListener("click", async () => {
      const btn = document.getElementById("btn-register");
      P55.setBusy(btn, true);
      try {
        await P55.request("/auth/register", { method: "POST", json: creds() });
        P55.show("Kayıt başarılı, şimdi giriş yapabilirsin.");
      } catch (e) { P55.show(e.message, true); }
      P55.setBusy(btn, false);
    });

    // Giris penceresini acan/kapatan dugmeler
    document.querySelectorAll("[data-open-auth]").forEach(b => b.addEventListener("click", () => P55.openAuth("login")));
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

    const pwToggle = document.getElementById("pw-toggle");
    pwToggle.addEventListener("click", () => {
      const show = password.type === "password";
      password.type = show ? "text" : "password";
      pwToggle.textContent = show ? "Gizle" : "Göster";
      pwToggle.setAttribute("aria-pressed", String(show));
    });

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
    window.addEventListener("resize", P55.moveIndicator);

    if (P55.token) {
      try { await P55.afterLogin(P55.token); } catch (e) { P55.logout(); }
    }
  },
};
