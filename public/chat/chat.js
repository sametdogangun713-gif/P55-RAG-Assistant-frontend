"use strict";
/* Sohbet sekmesi: konusma listesi, mesajlar, kaynaklar. Sunucu metni yalnizca textContent ile yazilir. */
(function () {
  const { el } = App;
  let currentId = null;
  const NOTES = {
    no_context: "Belgelerinde bu soruyla ilgili bir bölüm bulunamadı.",
    no_info: "Belgelerinde yeterli bilgi yok.",
    unverified: "Bu yanıt kaynaklarla doğrulanamadı; dikkatli ol.",
    general: "Bu yanıt belgelerinden değil, modelin genel bilgisidir. Önemli konularda doğrula.",
  };

  function sourcesBlock(sources) {
    const box = el("div", { class: "sources" });
    for (const s of sources || []) {
      const label = "[" + s.n + "] " + s.filename + (s.page_no ? " · sayfa " + s.page_no : "") + " · benzerlik " + Number(s.score).toFixed(2);
      box.append(el("details", {}, el("summary", {}, label), el("p", {}, s.excerpt || "")));
    }
    return box;
  }

  function bubble(m) {
    const general = m.role === "assistant" && m.status === "general";     // belge disi genel sohbet
    const warn = m.role === "assistant" && m.status && m.status !== "answered" && !general;
    const b = el("div", { class: "bubble " + m.role + (warn ? " warn" : "") + (general ? " general" : "") }, m.content);
    if ((warn || general) && NOTES[m.status]) b.append(el("div", { class: "note" }, NOTES[m.status]));
    if (m.sources && m.sources.length) b.append(sourcesBlock(m.sources));
    return b;
  }

  // Bos sohbet ekrani: kullaniciya ne yapacagini soyler.
  function emptyState() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);
    return el("div", { class: "chat-empty" }, el("div", {}, svg,
      el("strong", {}, "Belgelerine bir soru sor"),
      el("span", {}, "Yanıtlar yüklediğin belgelerden, [1] [2] gibi kaynak numaralarıyla gelir. Belgede olmayan sorulara genel bilgiyle, etiketli yanıt verilir.")));
  }

  function resetThread() { document.getElementById("chat-thread").replaceChildren(emptyState()); }

  function scrollDown() {
    const t = document.getElementById("chat-thread");
    t.scrollTop = t.scrollHeight;
  }

  async function loadList() {
    const ul = document.getElementById("chat-list");
    let list;
    try { list = await App.request("/conversations"); } catch (e) { App.show(e.message, true); return; }
    ul.replaceChildren();
    if (!list.length) ul.append(el("li", { class: "chat-side-empty" }, "Henüz sohbet yok. İlk sorunu yaz ya da “Yeni sohbet”e bas."));
    for (const c of list) {
      const li = el("li", { class: c.id === currentId ? "active" : "" },
        el("button", { type: "button", class: "conv", title: c.title, onclick: () => openConv(c.id) }, c.title),
        el("button", { type: "button", class: "icon-mini ren", "aria-label": "Yeniden adlandır: " + c.title, title: "Yeniden adlandır", onclick: () => renameConv(li, c) }, "✎"),
        el("button", { type: "button", class: "danger del", "aria-label": "Sohbeti sil: " + c.title, onclick: () => removeConv(c) }, "×"));
      ul.append(li);
    }
  }

  // Yeniden adlandirma: satirdaki ad yerine bir metin kutusu acilir. Enter kaydeder, Esc ya da odagi kaybetmek vazgecer.
  function renameConv(li, c) {
    const input = el("input", { type: "text", class: "conv-edit", maxlength: "80", "aria-label": "Sohbetin yeni adı" });
    input.value = c.title;
    li.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const title = input.value.trim();
      if (save && title && title !== c.title) {
        try { await App.request("/conversations/" + c.id, { method: "PATCH", json: { title } }); App.show("Sohbet adı değişti"); }
        catch (e) { App.show(e.message, true); }
      }
      loadList();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(false));
  }

  async function openConv(id) {
    currentId = id;
    const thread = document.getElementById("chat-thread");
    thread.replaceChildren();
    try {
      const msgs = await App.request("/conversations/" + id + "/messages");
      if (!msgs.length) resetThread();
      for (const m of msgs) thread.append(bubble(m));
    } catch (e) { App.show(e.message, true); }
    scrollDown();
    loadList();
  }

  async function removeConv(c) {
    if (!confirm("“" + c.title + "” sohbeti silinsin mi?")) return;
    try { await App.request("/conversations/" + c.id, { method: "DELETE" }); } catch (e) { App.show(e.message, true); }
    if (currentId === c.id) { currentId = null; resetThread(); }
    loadList();
  }

  async function newConv() {
    const c = await App.request("/conversations", { method: "POST", json: {} });
    currentId = c.id;
    resetThread();
    await loadList();
    return c;
  }

  function bindForm() {
    document.getElementById("chat-new").addEventListener("click", () => newConv().catch(e => App.show(e.message, true)));
    // Enter gonderir, Shift+Enter yeni satir. (Turkce klavyede harf birlestirme sirasinda gonderme: isComposing)
    document.getElementById("chat-input").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        document.getElementById("chat-form").requestSubmit();
      }
    });
    document.getElementById("chat-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const input = document.getElementById("chat-input");
      const text = input.value.trim();
      if (!text) return;
      const btn = ev.target.querySelector("button");
      App.setBusy(btn, true);
      const thread = document.getElementById("chat-thread");
      try {
        if (currentId === null) await newConv();
        const empty = thread.querySelector(".chat-empty");
        if (empty) empty.remove();
        thread.append(bubble({ role: "user", content: text }));
        const waiting = el("div", { class: "bubble assistant", "aria-label": "Yanıtlanıyor" },
          el("span", { class: "typing" }, el("i", {}), el("i", {}), el("i", {})));
        thread.append(waiting);
        scrollDown();
        try {
          const out = await App.request("/conversations/" + currentId + "/messages", { method: "POST", json: { content: text } });
          waiting.replaceWith(bubble(out.assistant_message));
          input.value = "";
          App.show("");
        } catch (e) {
          waiting.remove();
          thread.lastElementChild && thread.lastElementChild.classList.contains("user") && thread.lastElementChild.remove();
          if (!thread.children.length) resetThread();
          App.show(e.message, true);        // soru metni kutuda kalir, tekrar gonderilebilir
        }
        scrollDown();
        loadList();
      } catch (e) { App.show(e.message, true); }
      App.setBusy(btn, false);
    });
  }

  App.tabs.chat = { onShow() { if (currentId === null) resetThread(); loadList(); } };
  bindForm();
})();
