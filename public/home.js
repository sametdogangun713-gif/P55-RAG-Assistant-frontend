/* Ana sayfa animasyonlari: GSAP 3 + ScrollTrigger + SplitText (public/vendor/). Uygulama ekranlarina dokunmaz.

   Uc parca var:
   1) Basliklar: SplitText metni satirlara boler, her satir bir "maske"nin altindan yukari kayarak gorunur.
   2) Canli ornek (hero): soru harf harf yazilir, belge taranir, ilgili madde fosforlu kalemle isaretlenir,
      yanit kelime kelime gelir ve [1] ile o madde arasina cizgi cekilir. Ucuncu ornekte belgede bilgi yoktur.
   3) "Nasil calisir": genis ekranda bolum sabitlenir (pin); kaydirdikca sahne ilerler (scrub = animasyonun
      zamani kaydirma cubuguna baglidir, geri kaydirinca geri sarar).

   Kurallar:
   - Sayfanin animasyonsuz hali HTML + CSS'tir. GSAP yuklenmezse ya da kullanici "Animasyonlari kapat"a basarsa
     her sey o halde, eksiksiz gorunur. Kapatinca gsap.matchMedia().revert() tum stilleri ve pinleri geri alir.
   - Tercih localStorage'da ("asistan_motion"). Isletim sisteminin "hareketi azalt" ayarina bilerek bakilmaz:
     Windows'ta "Animasyon efektleri" kapali olan bilgisayarlarda ana sayfa hic oynamiyordu; bu yuzden animasyon
     varsayilan olarak acik ve ust barda herkesin gorebildigi bir kapatma dugmesi var.
   - Giris yapinca ana sayfa gizlenir; animasyonlar da durdurulur (islemci bosuna calismasin). */
(function () {
  "use strict";
  const root = document.documentElement;
  const KEY = "asistan_motion";
  const home = document.getElementById("home-view");
  const btn = document.getElementById("motion-toggle");
  const hasGsap = !!(window.gsap && window.ScrollTrigger && window.SplitText);

  function readPref() {
    try { return localStorage.getItem(KEY) === "off" ? "off" : "on"; } catch (e) { return "on"; }
  }
  function syncButton() {
    const on = root.dataset.motion === "on";
    const label = on ? "Animasyonları kapat" : "Animasyonları aç";
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  root.dataset.motion = readPref();
  if (!hasGsap) {                     // kutuphane yuklenemedi: sayfa animasyonsuz, dugmenin bir anlami yok
    root.dataset.motion = "off";
    btn.hidden = true;
    return;
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  syncButton();

  let mm = null;                      // gsap.matchMedia: icinde olusturulan her sey tek revert() ile geri alinir

  function start() {
    if (mm || root.dataset.motion !== "on" || home.hidden) return;
    mm = gsap.matchMedia();
    mm.add({ wide: "(min-width: 1001px)", narrow: "(max-width: 1000px)" }, (c) => {
      heroIntro();
      sectionTitles();
      const undoHow = howItWorks(c.conditions.wide);
      const undoDemo = demo(c);
      return () => { undoHow(); undoDemo(); };   // revert sirasinda calisir: GSAP'in bilmedigi degisiklikleri geri alir
    });
  }
  function stop() {
    if (!mm) return;
    mm.revert();
    mm = null;
    // Kaydirmaya bagli (scrub) zaman cizelgesi geri alininca SVG'de baslangic gizleme stilleri kaliyordu
    // (sahne bos gorunuyordu). SVG'nin HTML'deki halinde satir ici stil ve transform yok; hepsini sil.
    document.querySelectorAll("#how-svg [style], #how-svg [transform]").forEach((el) => {
      el.removeAttribute("style");
      el.removeAttribute("transform");
    });
  }

  btn.addEventListener("click", () => {
    root.dataset.motion = root.dataset.motion === "on" ? "off" : "on";
    try { localStorage.setItem(KEY, root.dataset.motion); } catch (e) { /* gizli pencere: yalnizca bu oturum */ }
    syncButton();
    if (root.dataset.motion === "on") { start(); ScrollTrigger.refresh(); } else { stop(); }
  });

  // Giris/cikis: app.js #home-view'in hidden niteligini degistirir
  new MutationObserver(() => (home.hidden ? stop() : start()))
    .observe(home, { attributes: true, attributeFilter: ["hidden"] });

  /* ---------- 1) Basliklar ---------- */
  // Satir maskesi: her satir kendi kutusunun altindan (yPercent 110) yerine kayar. autoSplit: yazi tipi
  // yuklenince ya da genislik degisince satirlar yeniden bolunur; onSplit'in dondurdugu animasyon da yenilenir.
  function splitLines(el, vars) {
    return SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, stagger: 0.1, ease: "expo.out", ...vars }),
    });
  }

  function heroIntro() {
    splitLines(document.getElementById("hero-title"), { delay: 0.1 });
    gsap.from(".hero-lead, .hero-cta", { y: 16, autoAlpha: 0, duration: 0.8, stagger: 0.1, delay: 0.55, ease: "power2.out" });
    // Ornek kart yukaridan asagi "perde acilir" gibi gorunur (clip-path). Bitis degeri golgeyi de kapsasin diye
    // eksi paylidir; bitince clip-path tamamen kaldirilir.
    gsap.fromTo("#demo", { clipPath: "inset(0% 0% 100% 0%)" },
      { clipPath: "inset(0% -4% -8% 0%)", duration: 1.1, delay: 0.35, ease: "expo.inOut", clearProps: "clipPath" });
  }

  function sectionTitles() {
    home.querySelectorAll("[data-split]:not(#hero-title)").forEach((el) => {
      splitLines(el, { scrollTrigger: { trigger: el, start: "top 85%" } });
    });
  }

  /* ---------- 2) Canli ornek ---------- */
  const SCENES = [
    { q: "Ödev teslim tarihi ne zaman?", a: "On ikinci haftanın cuma günü, saat 17.00'ye kadar öğretim elemanına e-postayla.", mark: "12", src: "Kaynak: Madde 12" },
    { q: "Geç teslim edersem ne olur?", a: "Her gün için 10 puan düşülür; üç günden sonra ödev kabul edilmez.", mark: "13", src: "Kaynak: Madde 13" },
    { q: "Yemekhane ücreti ne kadar?", a: "Yüklediğin belgelerde bu soruya dair bilgi bulamadım.", mark: null, src: "Belgede olmayan bilgi uydurulmaz." },
  ];

  function demo(c) {
    const fig = document.getElementById("demo");
    const doc = fig.querySelector(".demo-doc");
    const scan = fig.querySelector(".demo-scan");
    const marks = [...fig.querySelectorAll(".mark")];
    const qBox = fig.querySelector(".demo-q");
    const qText = fig.querySelector(".demo-q-text");
    const caret = fig.querySelector(".demo-caret");
    const aBox = fig.querySelector(".demo-a");
    const aText = fig.querySelector(".demo-a-text");
    const cite = fig.querySelector(".demo-cite");
    const src = fig.querySelector(".demo-src");
    const path = fig.querySelector(".demo-link path");
    const original = { q: qText.textContent, a: aText.textContent, src: src.textContent };

    let current = null;               // o an oynayan sahnenin zaman cizelgesi (timeline)
    let index = 0;
    let visible = true;

    // Ornek ekran disindayken durur (gereksiz yere calismasin)
    ScrollTrigger.create({
      trigger: fig, start: "top bottom", end: "bottom top",
      onToggle: (self) => { visible = self.isActive; if (current) visible ? current.resume() : current.pause(); },
    });

    // Yaniti kelimelere bol: her kelime ayri <span> (textContent ile; innerHTML kullanilmaz)
    function setWords(text) {
      aText.textContent = "";
      text.split(" ").forEach((w, i) => {
        if (i) aText.append(" ");
        const s = document.createElement("span");
        s.textContent = w;
        s.style.display = "inline-block";
        aText.append(s);
      });
      return aText.children;
    }

    // Yanit kutusundan isaretli maddeye cizgi. Metnin ustunden gecmesin diye kartin sol bosluguna (gutter)
    // cikar, yukari ciker ve maddenin ilk satirina girer. Koordinatlar karta (figure) gore piksel.
    function drawLink(target) {
      const box = fig.getBoundingClientRect();
      const a = aBox.getBoundingClientRect();
      const to = target.getClientRects()[0];
      const gutter = 9;
      const x1 = a.left - box.left, y1 = a.top + a.height / 2 - box.top;
      const x2 = to.left - box.left - 3, y2 = to.top + to.height / 2 - box.top;
      path.setAttribute("d", `M${x1},${y1} H${gutter} V${y2} H${x2}`);
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len, autoAlpha: 1 },
        { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" });
    }

    function scene(s) {
      const target = s.mark ? fig.querySelector(`.mark[data-mark="${s.mark}"]`) : null;
      const typed = { n: 0 };
      const tl = gsap.timeline({ paused: !visible, onComplete: next });
      const words = setWords(s.a);    // kutu bu anda gizli (onceki sahnenin sonunda soldu)

      tl.call(() => {
        qText.textContent = "";
        src.textContent = s.src;
        cite.hidden = !s.mark;
        aBox.classList.toggle("is-empty", !s.mark);
        path.setAttribute("d", "");
      });
      tl.set(marks, { backgroundSize: "0% 100%" });
      tl.set([qBox, aBox, src], { autoAlpha: 0 });
      tl.set(words, { opacity: 0, y: 6 });

      // Soru yazilir
      tl.to(qBox, { autoAlpha: 1, duration: 0.3 });
      tl.set(caret, { opacity: 1 });
      tl.to(typed, {
        n: s.q.length, duration: s.q.length * 0.045, ease: "none",
        onUpdate: () => { qText.textContent = s.q.slice(0, Math.round(typed.n)); },
      });
      tl.set(caret, { opacity: 0 }, "+=0.2");

      // Belge yukaridan asagi taranir
      tl.fromTo(scan, { y: 0, autoAlpha: 1 }, { y: () => doc.clientHeight, duration: 0.9, ease: "power1.inOut" });
      tl.set(scan, { autoAlpha: 0 });

      if (target) {
        tl.to(target, { backgroundSize: "100% 100%", duration: 0.6, ease: "power2.inOut" });
      } else {                        // bulunamadi: belge bir an soluklasir
        tl.to(doc.querySelectorAll("p"), { opacity: 0.35, duration: 0.25, yoyo: true, repeat: 1 });
      }

      // Yanit kelime kelime gelir
      tl.to(aBox, { autoAlpha: 1, duration: 0.25 });
      tl.to(words, { opacity: 1, y: 0, duration: 0.35, stagger: 0.035, ease: "power2.out" });
      if (target) {
        tl.fromTo(cite, { scale: 0.4 }, { scale: 1, duration: 0.35, ease: "back.out(3)" });
        tl.call(() => drawLink(target));
      }
      tl.to(src, { autoAlpha: 1, duration: 0.3 }, "+=0.4");

      // Bekle, sonra temizle
      tl.to([qBox, aBox, src, path], { autoAlpha: 0, duration: 0.4 }, "+=2.8");
      tl.to(marks, { backgroundSize: "0% 100%", duration: 0.4 }, "<");
      return tl;
    }

    function next() {
      c.add(() => { current = scene(SCENES[index++ % SCENES.length]); });
    }
    next();

    // revert: sahneyi durdur, metinleri HTML'deki haline dondur
    return () => {
      if (current) current.kill();
      gsap.killTweensOf(path);
      qText.textContent = original.q;
      aText.textContent = original.a;
      src.textContent = original.src;
      cite.hidden = false;
      aBox.classList.remove("is-empty");
      path.setAttribute("d", "");
    };
  }

  /* ---------- 3) Nasil calisir ---------- */
  function howItWorks(wide) {
    const sec = document.getElementById("nasil");
    const svg = document.getElementById("how-svg");
    const steps = [...sec.querySelectorAll(".steps li")];
    const strips = [...svg.querySelectorAll(".how-strip")];
    const dots = [...svg.querySelectorAll(".how-dot")];
    const near = [...svg.querySelectorAll(".how-dot.near")];
    const cites = [...svg.querySelectorAll(".how-answer .cite")];
    const lines = [...svg.querySelectorAll(".how-lines line")];
    const num = (el, a) => parseFloat(el.getAttribute(a));

    sec.classList.add("is-live");

    // Adim gecis anlari (zaman cizelgesindeki saniye). Etkin adim soldaki listede belirginlesir.
    const STEP_AT = [0, 1, 3, 4.6];
    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut", duration: 0.5 },
      scrollTrigger: wide
        ? { trigger: ".how-pin", start: "top 72px", end: "+=2600", pin: true, scrub: 1, anticipatePin: 1 }
        : { trigger: svg, start: "top 80%", end: "bottom 20%", scrub: 1 },
      onUpdate() {
        const t = this.time();
        const k = STEP_AT.filter((s) => t >= s - 0.01).length - 1;
        steps.forEach((li, i) => li.classList.toggle("is-active", i === k));
      },
    });

    // Baslangic durumu (t = 0)
    tl.set(".how-page, .how-space, .how-query, .how-answer, .how-radius", { autoAlpha: 0 });
    tl.set(strips, { autoAlpha: 0, y: 14 });
    tl.set([...dots, ...svg.querySelectorAll(".how-others circle")], { scale: 0, transformOrigin: "50% 50%" });
    tl.set(near, { "--on": 0 });
    tl.set(".how-radius", { scale: 0, transformOrigin: "50% 50%" });
    tl.set(".how-query", { scale: 0.4, transformOrigin: "50% 50%" });
    lines.forEach((l) => {
      const len = Math.hypot(num(l, "x2") - num(l, "x1"), num(l, "y2") - num(l, "y1"));
      tl.set(l, { strokeDasharray: len, strokeDashoffset: len });
    });
    tl.set(cites, { autoAlpha: 0 });

    // 1) Yukle: sayfa ve parcalari belirir
    tl.to(".how-page", { autoAlpha: 1, duration: 0.4 }, 0.05);
    tl.to(strips, { autoAlpha: 1, y: 0, stagger: 0.08 }, 0.15);

    // 2) Parcala: parcalar aralanir, sonra her biri kuculup anlam uzayindaki noktasina ucar
    tl.to(strips, { y: (i) => (i - 2.5) * 7, x: (i) => (i % 2 ? 6 : -6), duration: 0.5 }, 1);
    tl.to(".how-space", { autoAlpha: 1, duration: 0.4 }, 1.2);
    strips.forEach((g, i) => {
      const r = g.querySelector(".strip");
      const dot = svg.getElementById(g.dataset.dot);
      const dx = num(dot, "cx") - (num(r, "x") + num(r, "width") / 2);
      const dy = num(dot, "cy") - (num(r, "y") + num(r, "height") / 2);
      const at = 1.6 + i * 0.1;
      tl.to(g, { x: dx, y: dy, scale: 0.1, transformOrigin: "50% 50%", duration: 0.7, ease: "power3.in" }, at);
      tl.to(g, { autoAlpha: 0, duration: 0.15 }, at + 0.6);
      tl.to(dot, { scale: 1, duration: 0.3, ease: "back.out(3)" }, at + 0.6);
    });
    tl.to(".how-page", { autoAlpha: 0.25, duration: 0.4 }, 2.3);
    tl.to(".how-others circle", { scale: 1, stagger: 0.03, duration: 0.3, ease: "back.out(2)" }, 2.4);

    // 3) Sor: soru noktasi gelir, arama cemberi buyur, en yakin uc parca dolar ve cizgilerle baglanir
    tl.to(".how-query", { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, 3);
    tl.to(".how-radius", { autoAlpha: 1, scale: 1, duration: 0.6 }, 3.3);
    tl.to(near, { "--on": 1, stagger: 0.1, duration: 0.3 }, 3.8);
    tl.to(lines, { strokeDashoffset: 0, stagger: 0.1, duration: 0.4 }, 4);

    // 4) Yanit: kart gelir, en yakin uc nokta [1] [2] [3] kaynaklarina tasinir
    tl.to(".how-answer", { autoAlpha: 1, duration: 0.4 }, 4.6);
    tl.to([".how-radius", ".how-lines", ".how-others", ".how-query"], { autoAlpha: 0.15, duration: 0.4 }, 4.9);
    near.forEach((d) => {
      const cite = cites[Number(d.dataset.cite)];
      const b = cite.getBBox();
      tl.to(d, { x: b.x + b.width / 2 - num(d, "cx"), y: b.y + b.height / 2 - num(d, "cy"), duration: 0.6, ease: "power3.inOut" }, 5);
      tl.to(d, { scale: 0, duration: 0.2 }, 5.55);
      tl.to(cite, { autoAlpha: 1, duration: 0.2 }, 5.55);
    });
    tl.to({}, { duration: 0.6 });     // son kare bir sure ekranda kalsin

    // revert: "canli" sinifini ve etkin adim isaretini kaldir
    return () => {
      sec.classList.remove("is-live");
      steps.forEach((li) => li.classList.remove("is-active"));
    };
  }

  // Yazi tipleri yuklenince baslat: satir bolme ve pin olculeri dogru olsun
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { start(); ScrollTrigger.refresh(); });
})();
