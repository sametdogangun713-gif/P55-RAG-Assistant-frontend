/* Ana sayfa "studyo": tam ekran 3B sahne (Three.js) + kaydirdikca degisen 5 sahne (GSAP ScrollTrigger).

   Nesne: bir klavye gibi duran "belge": tepsi + 12 x 5 = 60 tus. Her tus belgenin bir PARCASI (chunk).
   Sahneler (kaydirma ilerledikce p = 0 -> 4):
     0  Toplanmis belge (acilista tuslar yukaridan akip yerine oturur)
     1  Parcalara ayrilir: tuslar aralanir ve yukselir
     2  Anlam vektoru: her tus anlamina gore farkli yukseklikte (dalgali bir yuzey)
     3  Soru: soruya en yakin 3 parca turuncu olur ve yukselir
     4  Yanit: bu 3 parca one cikar, ustlerinde [1] [2] [3] yazar

   Neden bu yapi? Her karede tuslarin yeri tek bir fonksiyonla hesaplanir: konum = sahne(p) + acilis(intro).
   GSAP yalnizca iki SAYIYI degistirir: S.intro (0 -> 1, acilista) ve S.p (0 -> 4, kaydirmayla). Boylece iki
   animasyon birbirini bozmaz ve "animasyonu kapat" denince yalnizca p = 0, intro = 1 yapip bir kare cizmek yeter.

   home.js bu dosyayi window.Studio.start() / stop() ile yonetir. WebGL ya da GSAP yoksa sahne metinleri
   animasyonsuz, alt alta gorunur (CSS: .studio:not(.is-live)). */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const section = document.getElementById("nasil");
const canvas = document.getElementById("studio-canvas");
const COLS = 12, ROWS = 5, GAP = 1;
const SOURCES = [16, 31, 41];                 // kaynak olacak 3 parcanin sirasi (satir * 12 + sutun)
const ORANGE = new THREE.Color("#f05a28");
const BLACK = new THREE.Color("#161618");

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}

if (!window.gsap || !webglAvailable()) {
  section.classList.add("no-3d");
  window.Studio = null;
} else {
  window.Studio = createStudio();
}
window.dispatchEvent(new Event("studio-ready"));

function createStudio() {
  /* ---------- Sahne, kamera, isik ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });   // alpha: arkadaki CSS degradesi gorunsun
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;            // yumusaklik: shadow.radius (PCFSoft bu surumde kaldirildi)

  const scene = new THREE.Scene();
  // Ortam yansimasi: "oda" isigiyla metal tepsi ve plastik tuslar gercekci parlar
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);   // sol ustten gelen ana isik, golge dusurur
  key.position.set(-7, 13, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.5));

  // Gorunmez zemin: yalnizca yumusak golgeyi alir (nesne havada degil, studyoda dursun)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.3;
  floor.receiveShadow = true;
  scene.add(floor);

  /* ---------- Nesne: tepsi + tuslar ---------- */
  const board = new THREE.Group();
  scene.add(board);
  const tray = new THREE.Mesh(
    new RoundedBoxGeometry(COLS * GAP + 0.7, 0.5, ROWS * GAP + 0.7, 4, 0.16),
    new THREE.MeshStandardMaterial({ color: "#1b1b1e", metalness: 0.75, roughness: 0.34 }));
  tray.castShadow = tray.receiveShadow = true;
  board.add(tray);

  // Tus bicimi: yuvarlak koseli kutu, ustu %16 daraltilmis (gercek tus basligi gibi)
  const capGeo = new RoundedBoxGeometry(0.86, 0.46, 0.86, 3, 0.09);
  const pos = capGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) { const k = 1 - 0.16 * (y / 0.23); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
  }
  capGeo.computeVertexNormals();

  // Tusun ust yuzu icin kucuk resim (canvas): parcalarda metin satirlari, kaynaklarda [1] [2] [3]
  function topTexture(bg, ink, label) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = ink;
    if (label) {
      g.font = "600 44px Montserrat, Inter, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 64, 66);
    } else {
      g.fillRect(28, 44, 72, 6); g.fillRect(28, 61, 58, 6); g.fillRect(28, 78, 66, 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const plastic = (color, map = null) => new THREE.MeshStandardMaterial({ color, map, roughness: 0.58, metalness: 0 });
  const blackSide = plastic("#161618"), greySide = plastic("#3d3d41");
  const blackTop = plastic("#ffffff", topTexture("#161618", "#4a4a4f"));
  const greyTop = plastic("#ffffff", topTexture("#3d3d41", "#6c6c71"));
  // BoxGeometry yuz sirasi: +x, -x, +y (UST), -y, +z, -z -> ust yuze ayri malzeme
  const mats = (side, top) => [side, side, top, side, side, side];

  const caps = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const src = SOURCES.indexOf(i);
      let m;
      if (src >= 0) {
        // Kaynak tuslar: renkleri siyahtan turuncuya gecer (rengi kendine ait malzeme)
        const side = plastic(BLACK.clone()), top = plastic(BLACK.clone(), topTexture("#ffffff", "#141414", `[${src + 1}]`));
        m = mats(side, top);
      } else {
        const grey = (c + r * 3) % 7 === 0 || c === 0 || c === COLS - 1;      // kenarlarda ve arada gri tuslar
        m = grey ? mats(greySide, greyTop) : mats(blackSide, blackTop);
      }
      const mesh = new THREE.Mesh(capGeo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = {
        r, c, src,
        x: (c - (COLS - 1) / 2) * GAP, z: (r - (ROWS - 1) / 2) * GAP,
        h: 0.35 + 1.25 * (0.5 + 0.5 * Math.sin(c * 0.9 + r * 1.7) * Math.cos(c * 0.35 - r * 0.6)),   // "vektor" yuksekligi
        order: c * ROWS + (c % 2 ? ROWS - 1 - r : r),                                                 // acilista yilan gibi siralama
        spin: [(i * 7 % 5 - 2) * 0.6, (i * 11 % 7 - 3) * 0.5],
      };
      board.add(mesh);
      caps.push(mesh);
    }
  }

  /* ---------- Sahneler: p'ye gore konumlar ---------- */
  const Y0 = 0.25 + 0.23;                         // tepsinin ustu + tusun yari yuksekligi
  const BOARD = [                                  // tepsi donusu (y, x) ve tepsi yuksekligi, sahne basina
    { ry: -0.62, rx: 0.0, ty: 0 }, { ry: -0.42, rx: 0.14, ty: -0.55 }, { ry: -0.86, rx: 0.06, ty: 0 },
    { ry: -0.55, rx: 0.3, ty: 0 }, { ry: -0.42, rx: 0.2, ty: 0 },
  ];
  function pose(d, s) {
    const src = d.src >= 0;
    switch (s) {
      case 0: return [d.x, Y0, d.z, 0];
      case 1: return [d.x * 1.22, Y0 + 0.45 + 0.035 * d.c, d.z * 1.22, 0];
      case 2: return [d.x * 1.08, Y0 + d.h, d.z * 1.08, 0];
      case 3: return src ? [d.x, Y0 + 1.5, d.z, 0] : [d.x, Y0 + 0.12, d.z, 0];
      default: return src ? [-1.9 + d.src * 1.9, 3.1, 3.4, 0.55] : [d.x, Y0, d.z, 0];
    }
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const S = { p: 0, intro: 1, time: 0, visible: true };
  const INTRO_STEP = 0.035, INTRO_FLY = 1.1, INTRO_LEN = INTRO_STEP * (COLS * ROWS - 1) + INTRO_FLY;

  function update() {
    const s = Math.min(3, Math.floor(S.p)), t = smooth(S.p - s);
    const b0 = BOARD[s], b1 = BOARD[s + 1];
    board.rotation.set(lerp(b0.rx, b1.rx, t), lerp(b0.ry, b1.ry, t), 0);
    board.position.y = layout.y + Math.sin(S.time * 0.8) * 0.05;          // hafif suzulme
    const trayIntro = 1 - Math.pow(1 - Math.min(1, S.intro * INTRO_LEN / 0.8), 3);
    tray.position.y = -0.0 + lerp(b0.ty, b1.ty, t) - (1 - trayIntro) * 2.5;
    const orange = Math.min(1, Math.max(0, S.p - 2));                      // 2 -> 3 arasinda turuncuya gecer

    for (const m of caps) {
      const d = m.userData;
      const a = pose(d, s), b = pose(d, s + 1);
      // Acilis: her tus sirasi gelince sol ust-arkadan "yilan" gibi akip yerine oturur
      const k = Math.min(1, Math.max(0, (S.intro * INTRO_LEN - d.order * INTRO_STEP) / INTRO_FLY));
      const e = 1 - Math.pow(1 - k, 3), off = 1 - e;
      m.position.set(lerp(a[0], b[0], t) - 3 * off, lerp(a[1], b[1], t) + 9 * off, lerp(a[2], b[2], t) - 2.5 * off);
      m.rotation.set(lerp(a[3], b[3], t) + d.spin[0] * off, d.spin[1] * off, 0);
      m.visible = k > 0;
      if (d.src >= 0) {
        m.material[0].color.copy(BLACK).lerp(ORANGE, orange);
        m.material[2].color.copy(BLACK).lerp(ORANGE, orange);
      }
    }
  }

  /* ---------- Boyut ve yerlesim: genis ekranda nesne sagda, dar ekranda altta ---------- */
  const layout = { y: 0 };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w > 1000 && section.classList.contains("is-live")) {          // tam ekran: nesne sagda, yazi solda
      board.position.x = 3.6; board.scale.setScalar(1); layout.y = 0;
      camera.fov = 26; camera.position.set(-0.5, 11.5, 22); camera.lookAt(0.8, -0.9, 0);
    } else if (w > 1000) {                                                 // animasyonsuz: nesne ortada
      board.position.x = 0; board.scale.setScalar(1); layout.y = 0;
      camera.fov = 26; camera.position.set(-2, 11.5, 21); camera.lookAt(0, -0.6, 0);
    } else {
      const s = Math.max(0.5, Math.min(0.85, w / 900));
      board.position.x = 0.6; board.scale.setScalar(s); layout.y = -3.3;
      camera.fov = 32; camera.position.set(0, 12, 20); camera.lookAt(0, -1.2, 0);
    }
    camera.updateProjectionMatrix();
    render();
  }
  function render() { update(); renderer.render(scene, camera); }
  new ResizeObserver(resize).observe(canvas);

  /* ---------- Canli mod ---------- */
  let ctx = null;
  const tick = (time) => { S.time = time; if (S.visible) render(); };
  const scenes = [...section.querySelectorAll(".scene")];
  const counter = document.getElementById("studio-index");

  function start() {
    if (ctx) return;
    section.classList.add("is-live");
    ctx = gsap.context(() => {
      gsap.set(scenes.slice(1), { autoAlpha: 0 });
      // Acilis: tuslar akar, ilk sahnenin yazisi satir satir gelir
      S.intro = 0;
      gsap.to(S, { intro: 1, duration: INTRO_LEN, ease: "none" });
      SplitText.create(scenes[0].querySelector(".scene-title"), {
        type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, stagger: 0.1, delay: 0.6, ease: "expo.out" }),
      });
      gsap.from(scenes[0].querySelectorAll("p, .scene-cta"), { y: 14, autoAlpha: 0, duration: 0.8, stagger: 0.1, delay: 1.1 });

      // Kaydirma: bolum ekrana sabitlenir; 4 ekran boyu kaydirma = p 0 -> 4
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: ".studio-pin", start: "top top", end: () => "+=" + window.innerHeight * 4,
          pin: true, scrub: 1, invalidateOnRefresh: true,
        },
        onUpdate() { counter.textContent = "00" + (Math.round(this.time()) + 1); },
      });
      tl.to(S, { p: 4, duration: 4, ease: "none" }, 0);
      for (let k = 1; k < scenes.length; k++) {   // sahne metinleri: eskisi yukari kayip solar, yenisi alttan gelir
        tl.to(scenes[k - 1], { autoAlpha: 0, y: -40, duration: 0.3 }, k - 0.55);
        tl.fromTo(scenes[k], { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.3 }, k - 0.3);
      }
      // Bolum ekranda degilken cizim durur (islemci bosuna calismasin)
      ScrollTrigger.create({ trigger: section, start: "top bottom", end: "bottom top", onToggle: (st) => { S.visible = st.isActive; } });
    });
    gsap.ticker.add(tick);
  }

  // Animasyonsuz hal: toplanmis belge, tek kare
  function stop() {
    gsap.ticker.remove(tick);
    if (ctx) { ctx.revert(); ctx = null; }
    scenes.forEach((s) => s.removeAttribute("style"));                    // GSAP'in biraktigi gorunurluk stilleri
    section.classList.remove("is-live");
    counter.textContent = "001";
    Object.assign(S, { p: 0, intro: 1, time: 0, visible: true });
    requestAnimationFrame(resize);                  // yerlesim (alt alta duzen) degisti: boyutu yeniden olc
    resize();
  }

  resize();
  return { start, stop };
}
