/* Ana sayfa animasyonlarinin yoneticisi: GSAP 3 + ScrollTrigger + SplitText (public/vendor/). Uygulama ekranlarina dokunmaz.

   Parcalar:
   1) Studyo (studio.js, Three.js): tam ekran 3B sahne + tek acilis animasyonu (belgeler gelir, parcalara
      donusur). Bu dosya onu yalnizca baslatir/durdurur (window.Studio.start / stop).
   2) Basliklar: SplitText metni satirlara boler, her satir bir "maske"nin altindan yukari kayarak gorunur.
   3) Canli ornek: soru harf harf yazilir, belge taranir, ilgili madde fosforlu kalemle isaretlenir,
      yanit kelime kelime gelir ve [1] ile o madde arasina cizgi cekilir. Ucuncu ornekte belgede bilgi yoktur.

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

  // Ana sayfa gorunurken <html class="is-home">: ust bar seffaf, arka plan gri studyo (style.css).
  // Kaydirinca "is-scrolled": ust bar okunabilsin diye hafif buzlu cam olur.
  const syncHome = () => root.classList.toggle("is-home", !home.hidden);
  syncHome();
  addEventListener("scroll", () => root.classList.toggle("is-scrolled", scrollY > 30), { passive: true });

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
    new MutationObserver(syncHome).observe(home, { attributes: true, attributeFilter: ["hidden"] });
    return;
  }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  syncButton();

  let mm = null;                      // gsap.matchMedia: icinde olusturulan her sey tek revert() ile geri alinir
  const studio = () => window.Studio; // studio.js bir modul; sonradan yuklenir (yuklenemezse null kalir)

  function start() {
    if (mm || root.dataset.motion !== "on" || home.hidden) return;
    mm = gsap.matchMedia();
    mm.add({ wide: "(min-width: 1001px)", narrow: "(max-width: 1000px)" }, (c) => {
      sectionTitles();
      return demo(c);                 // dondurdugu fonksiyon revert sirasinda calisir (demoyu temizler)
    });
    if (studio()) studio().start();
  }
  function stop() {
    if (mm) { mm.revert(); mm = null; }
    if (studio()) studio().stop();    // 3B sahne: animasyonsuz tek kare
  }

  btn.addEventListener("click", () => {
    root.dataset.motion = root.dataset.motion === "on" ? "off" : "on";
    try { localStorage.setItem(KEY, root.dataset.motion); } catch (e) { /* gizli pencere: yalnizca bu oturum */ }
    syncButton();
    if (root.dataset.motion === "on") { start(); ScrollTrigger.refresh(); } else { stop(); }
  });

  // Giris/cikis: app.js #home-view'in hidden niteligini degistirir
  new MutationObserver(() => { syncHome(); home.hidden ? stop() : start(); })
    .observe(home, { attributes: true, attributeFilter: ["hidden"] });

  // studio.js hazir oldugunda: animasyon aciksa baslat, degilse sabit bir kare ciz
  addEventListener("studio-ready", () => {
    if (!studio()) return;
    if (mm) { studio().start(); ScrollTrigger.refresh(); } else { studio().stop(); }
  });

  /* ---------- Basliklar ---------- */
  // Satir maskesi: her satir kendi kutusunun altindan (yPercent 110) yerine kayar. autoSplit: yazi tipi
  // yuklenince ya da genislik degisince satirlar yeniden bolunur; onSplit'in dondurdugu animasyon da yenilenir.
  function splitLines(el, vars) {
    return SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, stagger: 0.1, ease: "expo.out", ...vars }),
    });
  }

  function sectionTitles() {
    home.querySelectorAll("[data-split]").forEach((el) => {
      splitLines(el, { scrollTrigger: { trigger: el, start: "top 85%" } });
    });
  }

  /* ---------- Canli ornek ---------- */
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

  // Yazi tipleri yuklenince baslat: satir bolme ve pin olculeri dogru olsun
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { start(); ScrollTrigger.refresh(); });
})();
