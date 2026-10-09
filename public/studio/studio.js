/* Ana sayfa "studyo": tam ekran 3B sahne (Three.js) + tek bir acilis animasyonu (GSAP).

   Nesne: bir klavye gibi duran "belge": tepsi + 12 x 5 = 60 tus. Her tus belgenin bir PARCASI (chunk).
   Acilis (yaklasik 4,5 sn, bir kez oynar):
     1  Tepsi asagidan yukselir
     2  Uc belge (PDF, DOCX, TXT) sol ustten ucarak gelir, tepsinin ustunde suzulur
     3  Belgeler tepsiye iner ve kaybolur; yerlerinde ortadan disa dogru tuslar (parcalar) belirir
     4  Soruya en yakin 3 parca turuncu olur ve hafifce yukselir
   Sonra nesne yalnizca hafifce suzulur. Kaydirmaya bagli sahne yok.

   Neden bu yapi? Her karede tum nesnelerin yeri tek bir fonksiyonla (update) hesaplanir; GSAP yalnizca tek bir
   SAYIYI degistirir: S.t (acilisin kacinci saniyesi, 0 -> END). "Animasyonu kapat" denince S.t = END yapip bir
   kare cizmek yeter: son hal (tuslar yerinde, 3 kaynak turuncu) gorunur.

   home.js bu dosyayi window.Studio.start() / stop() ile yonetir. WebGL ya da GSAP yoksa yalnizca metin
   animasyonsuz gorunur (CSS: .studio:not(.is-live)). */
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

  /* ---------- Nesne: tepsi + tuslar + belgeler ---------- */
  const board = new THREE.Group();
  board.rotation.set(0.04, -0.62, 0);
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

  // Kucuk resim (canvas): tus ustunde metin satirlari ya da [1] [2] [3]; belge sayfasinda tur etiketi + satirlar
  function texture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const topTexture = (bg, ink, label) => texture(128, 128, (g) => {
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
  });
  const pageTexture = (label) => texture(256, 340, (g) => {
    g.fillStyle = "#f4f4f2";
    g.fillRect(0, 0, 256, 340);
    g.fillStyle = "#161618";
    g.font = "700 34px Montserrat, Inter, sans-serif";
    g.fillText(label, 26, 58);
    g.fillStyle = "#b9b9bd";
    for (let y = 92, i = 0; y < 310; y += 22, i++) g.fillRect(26, y, 204 - (i * 37 % 70), 8);
  });

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
      const x = (c - (COLS - 1) / 2) * GAP, z = (r - (ROWS - 1) / 2) * GAP;
      mesh.userData = { src, x, z, delay: Math.hypot(x, z * 1.6) * 0.055 };   // ortadan disa dalga
      board.add(mesh);
      caps.push(mesh);
    }
  }

  // Belgeler: ince, yuvarlak koseli sayfalar. Saydam malzeme: tepsiye inerken solarlar.
  const pageGeo = new RoundedBoxGeometry(2.3, 0.05, 3.0, 2, 0.025);
  const pages = ["PDF", "DOCX", "TXT"].map((label, i) => {
    const edge = new THREE.MeshStandardMaterial({ color: "#e4e4e1", roughness: 0.8, transparent: true });
    const face = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pageTexture(label), roughness: 0.8, transparent: true });
    const mesh = new THREE.Mesh(pageGeo, mats(edge, face));
    mesh.castShadow = true;
    // Suzulme yeri: tepsinin ustunde, yelpaze gibi hafif acili
    mesh.userData = { x: -2.6 + i * 2.6, y: 1.75 + i * 0.12, z: 0.6 - i * 0.15, ry: (1 - i) * 0.14, start: 0.25 + i * 0.22 };
    board.add(mesh);
    return mesh;
  });

  /* ---------- Acilis: S.t saniyesine gore her seyin yeri ---------- */
  const Y0 = 0.25 + 0.23;                         // tepsinin ustu + tusun yari yuksekligi
  const T = { tray: 0.8, fly: 1.0, land: 2.05, landLen: 0.6, keys: 2.3, keyLen: 0.55, glow: 3.75, glowLen: 0.6 };
  const END = T.glow + T.glowLen;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const outCubic = (k) => 1 - Math.pow(1 - k, 3);
  const outBack = (k) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);   // hafif yaylanarak oturur
  const lerp = (a, b, t) => a + (b - a) * t;
  const S = { t: END, time: 0, visible: true };

  function update() {
    board.position.y = layout.y + Math.sin(S.time * 0.8) * 0.05;          // hafif suzulme
    tray.position.y = -(1 - outCubic(clamp01(S.t / T.tray))) * 2.5;

    for (const p of pages) {
      const d = p.userData;
      const fly = outCubic(clamp01((S.t - d.start) / T.fly)), off = 1 - fly;   // sol ust-arkadan ucarak gelir
      const land = clamp01((S.t - T.land - (2 - pages.indexOf(p)) * 0.08) / T.landLen);
      const down = land * land;                                              // tepsiye hizlanarak iner
      p.position.set(d.x - 6 * off, lerp(d.y, Y0, down) + 7 * off, d.z - 3 * off);
      p.rotation.set(0.5 * off, d.ry + 0.8 * off, -0.35 * off);
      p.scale.setScalar(1 - 0.25 * down);
      for (const m of new Set(p.material)) m.opacity = 1 - down;
      p.visible = S.t > d.start && land < 1;
    }

    const glow = outCubic(clamp01((S.t - T.glow) / T.glowLen));            // 3 kaynak turuncu olur, yukselir
    for (const m of caps) {
      const d = m.userData;
      const k = clamp01((S.t - T.keys - d.delay) / T.keyLen);
      const e = outBack(k);
      const lift = d.src >= 0 ? 0.35 * glow : 0;
      m.position.set(d.x, Y0 - 0.6 * (1 - e) + lift, d.z);                  // tepsinin icinden yukari cikar
      m.scale.setScalar(Math.max(0.01, 0.4 + 0.6 * e));
      m.visible = k > 0;
      if (d.src >= 0) {
        m.material[0].color.copy(BLACK).lerp(ORANGE, glow);
        m.material[2].color.copy(BLACK).lerp(ORANGE, glow);
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
  const hero = section.querySelector(".scene");

  function start() {
    if (ctx) return;
    section.classList.add("is-live");
    ctx = gsap.context(() => {
      // Acilis: belgeler gelir, parcalara donusur; yazi satir satir gelir
      S.t = 0;
      gsap.to(S, { t: END, duration: END, ease: "none" });
      SplitText.create(hero.querySelector(".scene-title"), {
        type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, stagger: 0.1, delay: 0.6, ease: "expo.out" }),
      });
      gsap.from(hero.querySelectorAll("p, .scene-cta"), { y: 14, autoAlpha: 0, duration: 0.8, stagger: 0.1, delay: 1.1 });
      // Bolum ekranda degilken cizim durur (islemci bosuna calismasin)
      ScrollTrigger.create({ trigger: section, start: "top bottom", end: "bottom top", onToggle: (st) => { S.visible = st.isActive; } });
    });
    gsap.ticker.add(tick);
  }

  // Animasyonsuz hal: acilisin son hali, tek kare
  function stop() {
    gsap.ticker.remove(tick);
    if (ctx) { ctx.revert(); ctx = null; }
    hero.removeAttribute("style");
    section.classList.remove("is-live");
    Object.assign(S, { t: END, time: 0, visible: true });
    requestAnimationFrame(resize);                  // yerlesim (alt alta duzen) degisti: boyutu yeniden olc
    resize();
  }

  resize();
  return { start, stop };
}
