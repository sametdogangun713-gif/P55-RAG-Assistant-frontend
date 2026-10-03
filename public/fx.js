"use strict";
/* Gorsel efekt katmani (Hafta 14, "mimari bosluk" temasi). Uygulamanin isleyisine KARISMAZ: bu dosya hic
   yuklenmese ya da hata verse de giris, yukleme, sohbet... aynen calisir (asamali iyilestirme).
   Dis kutuphane (GSAP / Three.js / Lenis) bilerek kullanilmadi: sunucu internetsiz calisabilmeli ve her satir
   aciklanabilmeli. Isletim sisteminde "hareketi azalt" aciksa surekli animasyonlar ve ozel imlec kapanir.
   GUVENLIK: metinler yalnizca textContent / createElement ile yazilir (innerHTML yok). */
(function () {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Ortak girdi: fare konumu ekranin ortasina gore -1..1 araliginda, kaydirma piksel cinsinden
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (ev) => {
    pointer.x = (ev.clientX / innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  /* 1) Kelime kelime "maskeli" acilis. Her kelime tasmasi gizli bir kutuya (.w) konur; ic kisim asagidan
        yukari kayar (CSS). Ogeler gorunur olunca .is-in eklenir, gorunmez olunca kaldirilir; boylece sekme
        her acildiginda baslik yeniden "acilir". */
  function splitWords() {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.classList.toggle("is-in", e.isIntersecting);
    }, { threshold: 0.15 });
    document.querySelectorAll("[data-split]").forEach((el) => {
      const lines = el.querySelectorAll(".line");
      let i = 0;
      for (const target of lines.length ? lines : [el]) {
        const words = target.textContent.trim().split(/\s+/);
        target.replaceChildren();
        words.forEach((word, k) => {
          const inner = document.createElement("span");
          inner.textContent = word;
          inner.style.setProperty("--i", i++);              // gecikme sirasi (CSS: --i * 55ms)
          const box = document.createElement("span");
          box.className = "w";
          box.append(inner);
          target.append(box, k < words.length - 1 ? " " : "");
        });
      }
      el.classList.add("split");
      io.observe(el);
    });
  }

  /* 2) Tel kafes isik heykeli (canvas 2B). Heykel 3B noktalardan (x, y, z) ve aralarindaki kenarlardan olusur.
        Her karede noktalar Y ve X eksenleri etrafinda dondurulur, sonra perspektifle ekrana izdusurulur:
        ekran_x = x * D / (D + z)  ->  uzaktaki nokta (z buyuk) merkeze yaklasir, yani kuculur. */
  function sculpture() {
    const canvas = document.getElementById("sculpture");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const light = document.getElementById("fx-light");
    const depth = document.getElementById("fx-depth");

    // Uzakligin karesi "maxD2"den kucuk olan nokta ciftleri birer kenardir
    const edgesOf = (pts, maxD2) => {
      const out = [];
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
        const d2 = (pts[a][0] - pts[b][0]) ** 2 + (pts[a][1] - pts[b][1]) ** 2 + (pts[a][2] - pts[b][2]) ** 2;
        if (d2 < maxD2) out.push([a, b]);
      }
      return out;
    };
    // Ikosahedron: (0, ±1, ±phi) ve dongusel permutasyonlari; kenar uzunlugu 2 (uzaklik^2 = 4)
    const PHI = (1 + Math.sqrt(5)) / 2;
    let ico = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) ico.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
    const icoEdges = edgesOf(ico, 4.01);
    ico = ico.map((p) => p.map((c) => c / Math.hypot(...p)));          // birim kureye oturt (yaricap 1)
    // Icte ters yone donen kucuk oktahedron (komsu koseler arasi uzaklik^2 = 2 * 0.5^2 = 0.5)
    const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((p) => p.map((c) => c * 0.5));
    const octEdges = edgesOf(oct, 0.6);
    // Tavandan sarkan lineer neon tupler: cember uzerinde, farkli boylarda
    const tubes = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = 1.75 + (i % 3) * 0.12;
      const bottom = -0.4 + ((i * 7) % 5) * 0.34;                      // sabit ama duzensiz gorunen boylar
      tubes.push({ top: [Math.cos(a) * r, -3.2, Math.sin(a) * r], bottom: [Math.cos(a) * r, bottom, Math.sin(a) * r], flicker: 0 });
    }

    // Renkler CSS degiskenlerinden okunur; tema degisince yeniden okunur
    let colors;
    const rgb = (value) => {
      let hex = value.trim().replace("#", "");
      if (hex.length === 3) hex = hex.replace(/./g, "$&$&");
      const n = parseInt(hex, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(",");
    };
    function readColors() {
      const cs = getComputedStyle(root);
      colors = { ink: rgb(cs.getPropertyValue("--ink")), accent: rgb(cs.getPropertyValue("--accent")),
        ice: rgb(cs.getPropertyValue("--ice")), dark: root.dataset.theme !== "light" };
    }

    let w = 0, h = 0, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);                          // 2'den fazlasi gozle fark edilmez, yalnizca yorar
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (!running) draw(performance.now());
    }

    const smooth = { x: 0, y: 0 };
    const start = performance.now();

    function draw(now) {
      const t = (now - start) / 1000;
      smooth.x = lerp(smooth.x, pointer.x, 0.05);                         // fareyi gecikmeli izle: agir, zarif hareket
      smooth.y = lerp(smooth.y, pointer.y, 0.05);
      const L = light ? light.value / 100 : 0.7;                          // isik yogunlugu 0..1
      const D = 6.4 - (depth ? depth.value / 100 : 0.5) * 3.6;            // kamera uzakligi: kucukse perspektif guclu
      const narrow = innerWidth <= 900;
      const cx = narrow ? w / 2 : w * 0.68, cy = narrow ? 150 : h * 0.45;          // genis ekranda baslik solda, heykel sagda
      const scale = narrow ? Math.min(w * 0.3, 125) : clamp(h * 0.27, 140, 270);
      const ay = (reduced.matches ? 0.6 : t * 0.16) + smooth.x * 0.7;
      const ax = -0.22 + smooth.y * 0.35 + Math.min(scrollY, 900) * 0.0012;

      const project = (p, rotY) => {
        const sy = Math.sin(rotY), cyR = Math.cos(rotY), sx = Math.sin(ax), cx2 = Math.cos(ax);
        const x = p[0] * cyR - p[2] * sy;
        let z = p[0] * sy + p[2] * cyR;                                    // Y ekseni etrafinda donus
        const y = p[1] * cx2 - z * sx;
        z = p[1] * sx + z * cx2;                                            // X ekseni etrafinda donus
        const k = D / (D + z);                                              // perspektif katsayisi
        return [cx + x * scale * k, cy + y * scale * k, z, k];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = colors.dark ? "lighter" : "source-over";   // koyuda isiklar ust uste toplanir (parlama)
      ctx.lineCap = "round";

      // Kenar: once genis ve soluk (hale), sonra ince ve parlak (tup cekirdegi)
      const edge = (a, b, color, strength) => {
        const near = clamp(0.62 - (a[2] + b[2]) * 0.22, 0.12, 1);          // yakindaki kenar daha parlak
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = "rgba(" + color + "," + (near * strength * L * (colors.dark ? 0.14 : 0.06)) + ")";
        ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = "rgba(" + color + "," + (near * strength * (0.35 + 0.65 * L)) + ")";
        ctx.lineWidth = 1.1; ctx.stroke();
      };

      for (const tube of tubes) {                                           // neon tupler, ara sira titrer
        if (!reduced.matches && tube.flicker <= 0 && Math.random() < 0.003) tube.flicker = 8 + Math.random() * 16;
        let s = 0.75;
        if (tube.flicker > 0) { tube.flicker--; s = Math.random() < 0.5 ? 0.12 : 0.9; }
        edge(project(tube.top, ay * 0.4), project(tube.bottom, ay * 0.4), colors.ice, s);
      }
      const icoP = ico.map((p) => project(p, ay));
      for (const [a, b] of icoEdges) edge(icoP[a], icoP[b], colors.ink, 0.9);
      const octP = oct.map((p) => project(p, -ay * 1.7));
      for (const [a, b] of octEdges) edge(octP[a], octP[b], colors.accent, 1);
      for (const p of icoP) {                                               // koselerde pirinc isik noktalari
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.8 * p[3], 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + colors.accent + "," + (0.4 + 0.6 * L) + ")"; ctx.fill();
      }
    }

    // Dongu yalnizca heykel ekrandaysa ve sekme gorunurse calisir (pil / islemci tasarrufu)
    let running = false, visible = true, raf = 0;
    const loop = (now) => { draw(now); raf = running ? requestAnimationFrame(loop) : 0; };
    function setRunning() {
      const should = visible && !document.hidden && !reduced.matches;
      if (should && !running) { running = true; raf = requestAnimationFrame(loop); }
      if (!should && running) { running = false; cancelAnimationFrame(raf); }
    }

    readColors();
    new MutationObserver(() => { readColors(); if (!running) draw(performance.now()); })
      .observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(); }).observe(canvas);
    document.addEventListener("visibilitychange", setRunning);
    reduced.addEventListener("change", () => { setRunning(); draw(performance.now()); });

    // Mekan ve isik paneli: kaydiricilar heykeli ve arka plandaki isik cubuklarini (--light) etkiler
    for (const input of [light, depth]) {
      if (!input) continue;
      const out = document.getElementById(input.id + "-out");
      const apply = () => {
        if (out) out.textContent = input.value;
        if (input === light) root.style.setProperty("--light", String(input.value / 100));
        if (!running) draw(performance.now());
      };
      input.addEventListener("input", apply);
      apply();
    }
  }

  /* 3) Ozel imlec, miknatisli dugmeler, kartlarda 3B egim. Yalnizca fare kullanan cihazlarda (dokunmatikte yok). */
  function pointerFx() {
    if (!finePointer.matches || reduced.matches) return;
    const dot = document.createElement("div"), ring = document.createElement("div");
    dot.className = "cursor-dot"; ring.className = "cursor-ring";
    dot.setAttribute("aria-hidden", "true"); ring.setAttribute("aria-hidden", "true");
    document.body.append(dot, ring);
    root.classList.add("has-cursor");
    const coordX = document.getElementById("coord-x"), coordY = document.getElementById("coord-y");

    let mx = -100, my = -100, rx = -100, ry = -100, raf = 0, magnet = null, tilted = null;
    const follow = () => {                                                  // halka noktayi gecikmeli izler
      rx = lerp(rx, mx, 0.2); ry = lerp(ry, my, 0.2);
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      raf = Math.abs(rx - mx) + Math.abs(ry - my) > 0.2 ? requestAnimationFrame(follow) : 0;
    };
    const release = (el) => { if (el) el.style.translate = ""; };

    addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      mx = ev.clientX; my = ev.clientY;
      root.classList.add("cursor-on");
      if (!raf) raf = requestAnimationFrame(follow);
      if (coordX) { coordX.textContent = String(Math.round(mx)).padStart(4, "0"); coordY.textContent = String(Math.round(my)).padStart(4, "0"); }

      const t = ev.target instanceof Element ? ev.target : null;
      root.classList.toggle("cursor-text", !!(t && t.closest("input:not([type=range]), textarea")));
      ring.classList.toggle("is-hover", !!(t && t.closest("a, button, label, select, summary, input[type=range]")));

      // Miknatis: dugme, imlece dogru merkezden uzakligin bir kismi kadar kayar
      const m = t && t.closest("[data-magnetic]");
      if (magnet !== m) { release(magnet); magnet = m; }
      if (m && !m.disabled) {
        const r = m.getBoundingClientRect();
        m.style.translate = ((mx - r.left - r.width / 2) * 0.22).toFixed(1) + "px " + ((my - r.top - r.height / 2) * 0.3).toFixed(1) + "px";
      }

      // Egim: kart, imlecin oldugu koseye dogru en fazla ~5 derece yatar
      const card = t && t.closest(".stat, .result, .feature");
      if (tilted !== card) { if (tilted) tilted.style.transform = ""; tilted = card; }
      if (card) {
        const r = card.getBoundingClientRect();
        const px = (mx - r.left) / r.width - 0.5, py = (my - r.top) / r.height - 0.5;
        card.style.transform = "perspective(800px) rotateX(" + (-py * 5).toFixed(2) + "deg) rotateY(" + (px * 5).toFixed(2) + "deg)";
      }
    }, { passive: true });
    root.addEventListener("mouseleave", () => { root.classList.remove("cursor-on"); release(magnet); magnet = null; });
    addEventListener("pointerdown", () => ring.classList.add("is-down"));
    addEventListener("pointerup", () => ring.classList.remove("is-down"));
  }

  /* 4) Paralaks: kaydirma miktari CSS degiskenine (--sy) yazilir; katmanlar farkli hizla akar (style.css). */
  function scrollFx() {
    if (reduced.matches) return;
    let queued = false;
    const update = () => { queued = false; root.style.setProperty("--sy", String(Math.round(scrollY))); };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* 5) Alt bilgideki dunya saatleri (tarayicinin saat dilimi veritabanindan; sunucuya istek yok). */
  function clocks() {
    const items = [...document.querySelectorAll("time[data-tz]")].map((el) => {
      try { return { el, fmt: new Intl.DateTimeFormat("tr-TR", { timeZone: el.dataset.tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }) }; }
      catch (e) { return null; }                                            // bilinmeyen saat dilimi: o saat bos kalir
    }).filter(Boolean);
    const tick = () => { const now = new Date(); for (const it of items) it.el.textContent = it.fmt.format(now); };
    tick();
    setInterval(tick, 1000);
  }

  // Her parca ayri denenir: biri hata verirse digerleri (ve uygulama) calismaya devam eder
  for (const part of [splitWords, sculpture, pointerFx, scrollFx, clocks]) {
    try { part(); } catch (e) { console.warn("Görsel efekt devre dışı:", part.name, e); }
  }
})();
