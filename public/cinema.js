/* Sinematik giris sahnesi (ana sayfa, Three.js / WebGL ile gercek zamanli 3B).

   Senaryo (26 sn'lik dongu, kamera hic durmadan ileri gider = "push-in"):
     0-13 sn   Antika bir saat mekanizmasinin icinden gecilir: pirinc disliler tik tak doner (hiper hizlandirilmis
               zaman: kucuk disliler cok hizli, ana disli "tik"lerle), havada isikta parlayan toz, amber isik huzmeleri.
     13-18 sn  Zaman durur; ortadaki buyuk disli parlayan kenarlarla erir ve yildiz tozuna dagilir.
     16-23 sn  Toz girdap yaparak mor-amber bir nebulaya (sarmal kollu bulut) donusur, diger disliler de erir.
     23-26 sn  Kamera nebulanin cekirdegine dalar, goruntu karariyor, dongu basa sarar.
   Son islem (post-processing): isima (bloom), hareket izi (motion blur yerine "afterimage"), film greni,
   kenar kararmasi (vignette) ve hafif renk kaymasi (kromatik sapma).

   Neden kutuphane: metal yansimasi, isik, isima ve ~20 000 parcacigi her karede cizmek icin GPU (WebGL) gerekir;
   Three.js bunun standart kutuphanesidir. vendor/three.min.js = Three.js 0.186.1'in yalnizca burada kullanilan
   parcalari (MIT lisansi, vendor/three.LICENSE). Internetten (CDN) yuklenmez: surum sabit, cevrimdisi da calisir.

   Asamali iyilestirme: WebGL yoksa ya da bu dosya hata verirse fx.js'teki 2B tel kafes heykel calisir; uygulamanin
   kendisi (giris, yukleme, sohbet) bu dosyadan hic etkilenmez. "Hareketi azalt" aciksa tek bir sabit kare cizilir.
   Sahne ekranda degilse (giris yapilinca, asagi kaydirilinca, sekme gizliyken) dongu durur: pil ve GPU tasarrufu. */
import * as THREE from "./vendor/three.min.js";

const { EffectComposer, RenderPass, UnrealBloomPass, AfterimagePass, OutputPass, ShaderPass,
        RoomEnvironment, MeshSurfaceSampler } = THREE;

const TAU = Math.PI * 2;
const CYCLE = 26;                       // dongu suresi (sn)
const BREAK = 12.8;                     // ortadaki dislinin dagilmaya basladigi an
const MODULE = 0.13;                    // disli "modulu" = dis buyuklugu. Ayni modullu disliler birbirine gecer.
const NEBULA = new THREE.Vector3(0, 0, -5);
const NEBULA_TILT = 1.05;               // nebula diski kameraya egik durur (radyan)
const STILL_FRAME = 11.5;               // "hareketi azalt" aciksa cizilen tek kare (disliler + isik)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const bump = (x, a, b, c, d) => smooth(a, b, x) * (1 - smooth(c, d, x));       // a-b arasi yukselir, c-d arasi iner
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/* Saatteki "tik": aci her adimda hizla ilerler, hafifce ileri tasip geri oturur, sonra adimin geri kalaninda bekler. */
function tick(t, perSecond, step) {
  const x = t * perSecond, n = Math.floor(x), f = x - n;
  return (n + (f < 0.22 ? easeOutBack(f / 0.22) : 1)) * step;
}

/* ------------------------------------------------------------------ Disli geometrisi
   Disli = 2B bir sekil (disler + govdedeki bosluklar), sonra kalinlik verilerek 3B'ye cikarilir (extrude).
   Hatve (pitch) yaricapi r = modul * dis sayisi / 2: iki disli bu dairelerde birbirine teget olur. */
const geometryCache = new Map();

function gearGeometry(teeth, thickness, spokes) {
  const key = teeth + "/" + thickness + "/" + spokes;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const r = MODULE * teeth / 2, rTip = r + MODULE, rRoot = r - 1.25 * MODULE;
  const step = TAU / teeth;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {                 // her dis: dip - yukselis - tepe - inis (yamuk profil)
    const a = i * step;
    const profile = [[rRoot, 0], [rRoot, 0.18], [rTip, 0.36], [rTip, 0.64], [rRoot, 0.82]];
    profile.forEach(([rad, k], j) => {
      const x = Math.cos(a + k * step) * rad, y = Math.sin(a + k * step) * rad;
      if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  // Govdeyi hafifleten "pencereler": kollar (spoke) arasindaki halka dilimleri
  const rim = rRoot - 0.14 * r - 0.04, hub = r * 0.28;
  if (spokes > 0 && rim - hub > 0.2) {
    const gap = TAU / spokes, spokeW = Math.min(0.55, 0.22 / hub + 0.1);
    for (let k = 0; k < spokes; k++) {
      const a0 = k * gap + spokeW / 2, a1 = (k + 1) * gap - spokeW / 2;
      const hole = new THREE.Path();
      hole.absarc(0, 0, rim, a0, a1, false);
      hole.absarc(0, 0, hub, a1, a0, true);
      shape.holes.push(hole);
    }
  }
  const axle = new THREE.Path();
  axle.absarc(0, 0, Math.max(0.05, r * 0.07), 0, TAU, true);
  shape.holes.push(axle);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.018, bevelSegments: 1, curveSegments: 20,
  });
  geo.translate(0, 0, -thickness / 2);
  const out = { geo, r, tip: rTip };
  geometryCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ Eriyen metal
   MeshStandardMaterial'in hazir golgelendiricisine (shader) kucuk bir ek: her piksel icin 3B gurultu degeri
   hesaplanir; degeri esikten (uDissolve) kucuk olan piksel cizilmez (discard). Esik buyudukce metal delik delik
   erir; esige yakin pikseller amber renkte parlar (yanan kenar). Dis kenardan (disler) baslasin diye yaricap da eklenir. */
const NOISE_GLSL = `
uniform float uDissolve; uniform float uRadius; uniform vec3 uEdge;
varying vec3 vObjPos;
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0)), f.x), f.y), f.z);
}`;

function dissolvable(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + NOISE_GLSL)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        float dn = vnoise(vObjPos * 2.3) * 0.7 + (1.0 - clamp(length(vObjPos.xy) / uRadius, 0.0, 1.0)) * 0.42;
        float th = uDissolve * 1.15;
        if (uDissolve > 0.0 && dn < th) discard;
        float burn = uDissolve > 0.0 ? 1.0 - smoothstep(th, th + 0.07, dn) : 0.0;`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdge * burn * 5.0;");
  };
  return material;
}

/* ------------------------------------------------------------------ Parlayan noktalar (toz, yildiz, gaz)
   Her nokta ekranda yumusak bir daire olarak cizilir; renkler toplanir (additive) -> ust uste gelen isik parlar. */
const SOFT_POINT_FRAG = `
varying vec3 vColor; varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}`;

function glowPoints({ positions, colors, sizes, seeds, maxSize = 64, twinkle = 0.4 }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHalfH: { value: 400 }, uOpacity: { value: 1 }, uMax: { value: maxSize }, uTwinkle: { value: twinkle } },
    vertexShader: `
      uniform float uTime, uHalfH, uOpacity, uMax, uTwinkle;
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * projectionMatrix[1][1] * uHalfH / -mv.z, uMax);
        vColor = aColor;
        float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 60.0));
        vAlpha = uOpacity * tw * smoothstep(0.3, 2.0, -mv.z);          // kameraya cok yakin olani sondur
      }`,
    fragmentShader: SOFT_POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, material);
}

/* ------------------------------------------------------------------ Sahne */
function start() {
  const canvas = document.getElementById("cinema");
  if (!canvas) return;
  const root = document.documentElement;
  // Isletim sisteminin "hareketi azalt" ayari; ust bardaki "Animasyonlar" dugmesi onu ezer (bkz. fx.js, app.js)
  const osReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = {
    get matches() { const m = root.dataset.motion; return m === "off" || (m !== "on" && osReduced.matches); },
    addEventListener(type, fn) { osReduced.addEventListener(type, fn); addEventListener("p55:motion", fn); },
  };
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const modest = matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency || 8) <= 4;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !modest, powerPreference: "high-performance" });
  } catch (e) {
    return;                                            // WebGL yok: 2B heykel (fx.js) yerinde kalir
  }
  let pixelRatio = Math.min(devicePixelRatio || 1, modest ? 1.25 : 1.6);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050307);
  scene.fog = new THREE.FogExp2(0x07040b, 0.028);       // uzak disliler karanliga gomulur: derinlik hissi

  // Metal yansimasi icin sahte bir "oda" ortami (metal, cevresini yansittigi icin parlak gorunur)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.14;          // yuksek olursa duz pirinc yuzler ayna gibi parlar

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 220);

  // Isiklar: sicak amber ana isik + arkadan mor kenar isigi + kamerayla gezen kucuk lamba (dislilerde parlama)
  scene.add(new THREE.HemisphereLight(0x3b2a5c, 0x120904, 0.7));
  const key = new THREE.DirectionalLight(0xffb35c, 2.4);
  key.position.set(-6, 8, 12);
  const rim = new THREE.DirectionalLight(0x8f5bff, 1.8);
  rim.position.set(6, -4, -10);
  const lamp = new THREE.PointLight(0xffc27a, 22, 22, 1.6);
  scene.add(key, rim, lamp);

  // Malzemeler. "central" ortadaki dislinin, "rest" diger hepsinin erime ayaridir.
  const central = { uDissolve: { value: 0 }, uRadius: { value: 3.3 }, uEdge: { value: new THREE.Color(0xff9a3c) } };
  const rest = { uDissolve: { value: 0 }, uRadius: { value: 4.5 }, uEdge: { value: new THREE.Color(0xc77dff) } };
  const metal = (color, roughness, uniforms) =>
    dissolvable(new THREE.MeshStandardMaterial({ color, metalness: 1, roughness }), uniforms);
  const M = {
    brassC: metal(0xc59645, 0.4, central), steelC: metal(0x9097a1, 0.22, central),
    brass: metal(0xb88a3e, 0.3, rest), oldBrass: metal(0x8a6a33, 0.42, rest), copper: metal(0xa35a30, 0.34, rest),
    steel: metal(0x8d939c, 0.24, rest),
  };
  const ruby = new THREE.MeshPhysicalMaterial({ color: 0x8e0f24, roughness: 0.08, clearcoat: 1, emissive: 0x2a0006 });
  const jewels = { central: [], rest: [] };

  /* Disli takimi (train): bir grubun kendi duzleminde (XY) birbirine gecen disliler.
     drive: { tick: [saniyede adim, adim acisi] } | { spin: rad/sn } | { mesh: ebeveyn, phi: yon } | { coax: ebeveyn, dz } */
  function buildTrain(def) {
    const group = new THREE.Group();
    group.position.set(...def.pos);
    if (def.rot) group.rotation.set(...def.rot);
    const gears = [];
    for (const g of def.gears) {
      const { geo, r, tip } = gearGeometry(g.n, g.th || 0.26, g.spokes ?? 5);
      const pivot = new THREE.Group();
      const body = new THREE.Mesh(geo, g.mat);
      const bossGeo = new THREE.CylinderGeometry(r * 0.3, r * 0.3, (g.th || 0.26) * 1.7, 28).rotateX(Math.PI / 2);
      const boss = new THREE.Mesh(bossGeo, g.mat);
      const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 12).rotateX(Math.PI / 2);
      const axle = new THREE.Mesh(axleGeo, g.axleMat || M.steel);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), ruby);
      jewel.position.z = (g.th || 0.26) * 0.9;
      // Yakut yatak tasi eriyen malzemeden degil: dislisi eridikce kuculup kaybolur (render'da)
      (g.mat === M.brassC ? jewels.central : jewels.rest).push(jewel);
      pivot.add(body, boss, axle, jewel);
      const info = { ...g, pivot, body, r, tip, angle: 0, x: 0, y: 0, z: 0 };
      if (g.drive.mesh !== undefined) {                 // ebeveyne temas ederek yerlesir (hatve yaricaplari toplami)
        const p = gears[g.drive.mesh];
        info.x = p.x + (p.r + r) * Math.cos(g.drive.phi);
        info.y = p.y + (p.r + r) * Math.sin(g.drive.phi);
        info.z = p.z;
      } else if (g.drive.coax !== undefined) {          // ayni mile takili (birlikte doner), onune
        const p = gears[g.drive.coax];
        info.x = p.x; info.y = p.y; info.z = p.z + g.drive.dz;
      }
      pivot.position.set(info.x, info.y, info.z);
      group.add(pivot);
      gears.push(info);
    }
    scene.add(group);
    return { group, gears };
  }

  /* Birbirine gecen iki dislide, temas noktasinda birinin disi digerinin bosluguna denk gelmeli.
     Ebeveyn aci kadar donunce cocuk -aci * (Ne / Nc) kadar doner; asagidaki formul bu iliskiyi ve
     "dis-bosluk" hizasini birlikte saglar (dislerin merkezi adimin ortasinda, bosluklar adim sinirinda). */
  function updateTrain(train, t) {
    for (const g of train.gears) {
      const d = g.drive;
      if (d.tick) g.angle = (d.dir || 1) * tick(t, d.tick[0], d.tick[1]) + (d.phase || 0);
      else if (d.spin !== undefined) g.angle = d.spin * t + (d.phase || 0);
      else if (d.coax !== undefined) g.angle = train.gears[d.coax].angle;
      else {
        const p = train.gears[d.mesh];
        const stepP = TAU / p.n, stepC = TAU / g.n;
        g.angle = d.phi + Math.PI - stepC * (0.5 - (d.phi - p.angle) / stepP);
      }
      g.pivot.rotation.z = g.angle;
    }
  }

  // Ortadaki mekanizma (kameranin vardigi yer). G0 dagilacak olan buyuk disli.
  const heart = buildTrain({ pos: [0, 0, 0], gears: [
    { n: 48, th: 0.36, spokes: 6, mat: M.brassC, axleMat: M.steelC, drive: { tick: [1, (TAU / 48) * 1.5] } },
    { n: 18, mat: M.oldBrass, drive: { mesh: 0, phi: 0.55 } },
    { n: 30, mat: M.copper, drive: { mesh: 0, phi: 3.6 } },
    { n: 12, mat: M.steel, spokes: 0, drive: { coax: 1, dz: 0.42 } },
    { n: 40, mat: M.brass, drive: { mesh: 3, phi: 1.9 } },
    { n: 24, mat: M.oldBrass, drive: { mesh: 2, phi: -2.2 } },
  ] });
  // Kamera yolunun iki yanindaki disliler (hiper hizlandirilmis zaman: surekli ve hizli doner)
  const tunnel = [
    { pos: [6.2, -1.0, 7], rot: [0, -0.5, 0], gears: [
      { n: 60, mat: M.brass, drive: { spin: 0.5 } }, { n: 16, mat: M.steel, spokes: 0, drive: { mesh: 0, phi: 2.8 } }] },
    { pos: [-6.5, 2.6, 12], rot: [0.2, 0.6, 0], gears: [
      { n: 50, mat: M.copper, drive: { tick: [2, TAU / 50] } }, { n: 26, mat: M.brass, drive: { mesh: 0, phi: -0.4 } },
      { n: 12, mat: M.steel, spokes: 0, drive: { mesh: 1, phi: 0.9 } }] },
    { pos: [4.4, 4.2, 17], rot: [0, 1.4, 0], gears: [
      { n: 72, mat: M.oldBrass, spokes: 8, drive: { spin: -0.22 } }, { n: 20, mat: M.brass, drive: { mesh: 0, phi: 3.5 } }] },
    { pos: [-4.8, -4.6, 22], rot: [0.5, 0, 0], gears: [
      { n: 40, mat: M.brass, drive: { spin: -0.9 } }, { n: 15, mat: M.copper, spokes: 0, drive: { mesh: 0, phi: 1.2 } }] },
    { pos: [5.5, -4.8, 27], rot: [0, 0, 0.3], gears: [
      { n: 56, mat: M.copper, drive: { tick: [3, TAU / 56] } }, { n: 18, mat: M.oldBrass, drive: { mesh: 0, phi: 2.2 } }] },
    { pos: [-7, 0.5, 31], rot: [0, 0.8, 0], gears: [{ n: 44, mat: M.brass, drive: { spin: 0.7 } }] },
  ].map(buildTrain);

  // Denge carki (saatin "kalbi"): ileri geri salinan halka + spiral yay
  const balance = new THREE.Group();
  balance.position.set(-3.6, 3.4, 9.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 12, 72), M.brass);
  balance.add(ring);
  for (let k = 0; k < 3; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.05), M.brass);
    spoke.rotation.z = (k * Math.PI) / 3;
    balance.add(spoke);
  }
  const spiral = [];
  for (let i = 0; i <= 400; i++) {
    const a = i * 0.11, rr = 0.08 + a * 0.012;
    spiral.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.12));
  }
  const hairspring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(spiral),
    new THREE.LineBasicMaterial({ color: 0xc9ced6 }));
  balance.add(hairspring);
  scene.add(balance);

  // Havadaki toz: isik huzmelerinde parlayan kucuk noktalar (makro objektif hissi)
  const dustN = modest ? 900 : 2000;
  const dust = (() => {
    const pos = new Float32Array(dustN * 3), col = new Float32Array(dustN * 3), size = new Float32Array(dustN), seed = new Float32Array(dustN);
    const c = new THREE.Color();
    for (let i = 0; i < dustN; i++) {
      const a = Math.random() * TAU, r = 0.6 + Math.random() * 7;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, -2 + Math.random() * 38], i * 3);
      c.setHSL(0.09 + Math.random() * 0.04, 0.8, 0.55 + Math.random() * 0.3).toArray(col, i * 3);
      size[i] = 0.015 + Math.random() * 0.04;
      seed[i] = Math.random();
    }
    return glowPoints({ positions: pos, colors: col, sizes: size, seeds: seed, maxSize: 14, twinkle: 0.7 });
  })();
  scene.add(dust);

  // Uzak yildizlar: dislilerin bosluklarindan gorunur, nebulada belirginlesir
  const starN = modest ? 1500 : 3200;
  const stars = (() => {
    const pos = new Float32Array(starN * 3), col = new Float32Array(starN * 3), size = new Float32Array(starN), seed = new Float32Array(starN);
    const c = new THREE.Color();
    for (let i = 0; i < starN; i++) {
      const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(60 + Math.random() * 40);
      v.z = -Math.abs(v.z) - 10;
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(Math.random() < 0.7 ? 0.62 : 0.08, 0.5, 0.75).toArray(col, i * 3);
      size[i] = 0.12 + Math.random() * 0.3;
      seed[i] = Math.random();
    }
    return glowPoints({ positions: pos, colors: col, sizes: size, seeds: seed, maxSize: 6, twinkle: 0.5 });
  })();
  scene.add(stars);

  // Hacimsel isik huzmeleri: uzun, ince, kenarlara dogru solan amber seritler (toplamali karisim)
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.1 }, uTime: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uOpacity, uTime; varying vec2 vUv;
      void main() {
        float across = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 2.5);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float hum = 0.85 + 0.15 * sin(uTime * 2.3 + vUv.y * 6.0);
        gl_FragColor = vec4(vec3(1.0, 0.68, 0.32), across * along * hum * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beams = new THREE.Group();
  [[-2.5, 6, 6, -0.55, 1.6], [1.5, 7, 13, -0.62, 1.1], [-1, 6.5, 20, -0.5, 2.2], [3, 5, 2, -0.7, 1.3]].forEach(([x, y, z, rz, w]) => {
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), beamMat);
    beam.position.set(x, y - 8, z);
    beam.rotation.set(-0.15, 0, rz);
    beams.add(beam);
  });
  scene.add(beams);

  /* Yildiz tozu: ortadaki dislinin YUZEYINDEN ornek noktalar alinir (MeshSurfaceSampler), boylece toz tam olarak
     dislinin oldugu yerden dogar. Her noktanin bir de nebuladaki hedefi vardir. Hareketin tamami GPU'da
     (vertex shader) hesaplanir: JavaScript her karede yalnizca 4-5 sayi (uBreak, uForm, uTime...) gonderir. */
  const heartGear = heart.gears[0];
  const dustCount = modest ? 8000 : 16000;
  const stardust = (() => {
    const sampler = new MeshSurfaceSampler(heartGear.body).build();
    const start = new Float32Array(dustCount * 3), target = new Float32Array(dustCount * 3);
    const color = new Float32Array(dustCount * 3), seed = new Float32Array(dustCount), delay = new Float32Array(dustCount);
    const p = new THREE.Vector3(), c = new THREE.Color();
    const white = new THREE.Color(0xfff1d6), amber = new THREE.Color(0xffa63d), violet = new THREE.Color(0x8b3dff),
          deep = new THREE.Color(0x2f1784), rose = new THREE.Color(0xff5fc8);
    for (let i = 0; i < dustCount; i++) {
      sampler.sample(p);
      start.set([p.x, p.y, p.z], i * 3);
      seed[i] = Math.random();
      delay[i] = clamp(1 - Math.hypot(p.x, p.y) / heartGear.tip, 0, 1) * 0.6 + Math.random() * 0.4;   // disler once kopar
      // Nebula: uc sarmal kollu disk + etrafinda seyrek bir hale (diskin kendi duzleminde; egim shader'da)
      let x, y, z, k;
      if (Math.random() < 0.16) {
        const v = new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(4.2);
        x = v.x; y = v.y; z = v.z * 0.6; k = clamp(v.length() / 11, 0, 1);
      } else {
        const rr = Math.pow(Math.random(), 0.55) * 9.5, arm = i % 3;
        const ang = (arm * TAU) / 3 + rr * 0.75 + gauss() * 0.4 * (0.35 + rr / 9.5);
        x = Math.cos(ang) * rr; y = Math.sin(ang) * rr; z = gauss() * 0.5 * (1.2 - rr / 11); k = rr / 9.5;
      }
      target.set([x, y, z], i * 3);
      if (k < 0.12) c.copy(white).lerp(amber, k / 0.12);
      else if (k < 0.6) c.copy(amber).lerp(violet, smooth(0.12, 0.6, k));
      else c.copy(violet).lerp(deep, smooth(0.6, 1, k));
      if (Math.random() < 0.06) c.copy(Math.random() < 0.5 ? rose : amber);
      c.toArray(color, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(start, 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    geo.boundingSphere = new THREE.Sphere(NEBULA.clone(), 40);     // nokta GPU'da yer degistirdigi icin elle
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBreak: { value: 0 }, uForm: { value: 0 }, uRot: { value: 0 }, uFlash: { value: 0 },
        uHalfH: { value: 400 }, uBrass: { value: new THREE.Color(0xffc56e) }, uNebula: { value: NEBULA }, uTilt: { value: NEBULA_TILT },
      },
      vertexShader: `
        uniform float uTime, uBreak, uForm, uRot, uFlash, uHalfH, uTilt;
        uniform vec3 uBrass, uNebula;
        attribute vec3 aTarget, aColor; attribute float aSeed, aDelay;
        varying vec3 vColor; varying float vAlpha;
        vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
        void main() {
          // 1) Dislinin uzerindeki yer (disli dondugu acida)
          vec3 p = vec3(rot(position.xy, uRot), position.z);
          // 2) Kopma: f = 0 (yerinde) .. 1 (savrulmus). Merkez etrafinda girdap + disari savrulma + titresim
          float f = clamp((uBreak - aDelay * 0.65) / 0.35, 0.0, 1.0);
          float ef = f * f * (3.0 - 2.0 * f);
          float r = length(p.xy) + 1e-4;
          p.xy = rot(p.xy, ef * (1.6 + aSeed * 2.4) / (0.35 + r * 0.25));
          p.xy *= 1.0 + ef * (0.35 + aSeed * 1.1);
          p.z += ef * (sin(aSeed * 91.0) * 1.6 - 0.8);
          p += ef * 0.18 * vec3(sin(uTime * 1.7 + aSeed * 40.0), cos(uTime * 1.3 + aSeed * 60.0), sin(uTime * 1.1 + aSeed * 20.0));
          // 3) Nebulaya donusum: hedef kendi diskinde doner (merkeze yakin olan daha hizli, galaksi gibi), sonra egilir
          float g = clamp((uForm - aSeed * 0.35) / 0.65, 0.0, 1.0);
          float eg = g * g * (3.0 - 2.0 * g);
          vec3 n = aTarget;
          n.xy = rot(n.xy, uTime * 0.06 / (0.25 + length(n.xy) * 0.12));
          n = vec3(n.x, n.y * cos(uTilt) - n.z * sin(uTilt), n.y * sin(uTilt) + n.z * cos(uTilt)) + uNebula;
          p = mix(p, n, eg);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.012 + aSeed * 0.03) * (1.0 + 0.6 * ef * (1.0 - eg)) * (1.0 + 0.8 * eg);
          gl_PointSize = min(size * projectionMatrix[1][1] * uHalfH / -mv.z, 22.0);
          vColor = mix(uBrass * (1.0 + 0.5 * ef), aColor * 1.4, eg) * (1.0 + uFlash);
          // ust uste binen binlerce nokta toplanarak parlar; tek tek soluk tutulur (yoksa ekran beyaza doyar)
          vAlpha = 0.5 * smoothstep(0.0, 0.06, f) * (0.7 + 0.3 * sin(uTime * 3.0 + aSeed * 80.0)) * smoothstep(0.5, 2.5, -mv.z);
        }`,
      fragmentShader: SOFT_POINT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, material);
  })();
  scene.add(stardust);

  // Nebula gazi: az sayida ama cok buyuk, cok soluk noktalar (bulutun yumusak govdesi)
  const gasN = modest ? 90 : 170;
  const gas = (() => {
    const pos = new Float32Array(gasN * 3), col = new Float32Array(gasN * 3), size = new Float32Array(gasN), seed = new Float32Array(gasN);
    const c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < gasN; i++) {
      const rr = Math.pow(Math.random(), 0.7) * 9, ang = ((i % 3) * TAU) / 3 + rr * 0.75 + gauss() * 0.5;
      v.set(Math.cos(ang) * rr, Math.sin(ang) * rr, gauss() * 0.8);
      v.set(v.x, v.y * Math.cos(NEBULA_TILT) - v.z * Math.sin(NEBULA_TILT), v.y * Math.sin(NEBULA_TILT) + v.z * Math.cos(NEBULA_TILT)).add(NEBULA);
      pos.set([v.x, v.y, v.z], i * 3);
      c.set(rr < 2.5 ? 0xff9b45 : Math.random() < 0.6 ? 0x7b2cff : 0x3d1cb0).multiplyScalar(0.55).toArray(col, i * 3);
      size[i] = 2.5 + Math.random() * 4;
      seed[i] = Math.random();
    }
    return glowPoints({ positions: pos, colors: col, sizes: size, seeds: seed, maxSize: 520, twinkle: 0.15 });
  })();
  scene.add(gas);

  /* ---------------------------------------------------------------- Son islem (post-processing) zinciri
     Sahne -> hareket izi -> isima -> renk donusumu (tone mapping + sRGB) -> film greni / kenar kararmasi / renk kaymasi */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const trails = new AfterimagePass(0);
  composer.addPass(trails);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime, uFade; uniform vec2 uRes; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5; float d = length(c);
        vec2 off = c * d * 0.012;                                        // kromatik sapma: kenarlarda renkler ayrilir
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        col *= mix(1.0, smoothstep(0.95, 0.25, d), 0.75);                // kenar kararmasi (vignette)
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float grain = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 113.0) - 0.5;
        col += grain * 0.07 * (1.0 - lum * 0.6);                         // film greni (karanlikta daha belirgin)
        gl_FragColor = vec4(col * (1.0 - uFade), 1.0);
      }`,
  });
  composer.addPass(film);

  /* ---------------------------------------------------------------- Kamera yolu
     Catmull-Rom egrisi bu noktalardan yumusakca gecer. Parametre zamanla esit artar; noktalar arasi mesafe
     farkli oldugu icin hiz kendiliginden degisir: basta hizli (hiper hizlandirma), dislinin onunde yavas,
     nebulaya dogru yeniden hizlanir. */
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.2, 0.8, 34), new THREE.Vector3(-0.9, 0.4, 24), new THREE.Vector3(0.7, -0.5, 15),
    new THREE.Vector3(0.25, 0.15, 8), new THREE.Vector3(0, 0, 4.4), new THREE.Vector3(0.15, 0.1, 0.8),
    new THREE.Vector3(0, 0, -4.2),
  ], false, "centripetal");
  const camPos = new THREE.Vector3(), ahead = new THREE.Vector3(), look = new THREE.Vector3();

  // Kontroller: ana sayfadaki "Isik yogunlugu" ve "Perspektif" kaydiricilari
  const lightInput = document.getElementById("fx-light"), depthInput = document.getElementById("fx-depth");
  const L = () => (lightInput ? lightInput.value / 100 : 0.7);
  const fovBase = () => 22 + (depthInput ? depthInput.value / 100 : 0.5) * 56;    // 22 (tele/makro) .. 78 (genis aci)

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  if (finePointer) addEventListener("pointermove", (ev) => {
    pointer.x = (ev.clientX / innerWidth) * 2 - 1;
    pointer.y = (ev.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  // Boyut: baslik solda, sahnenin odagi sagda (genis ekran) ya da ustte (telefon)
  let width = 1, height = 1;
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    const narrow = width < 900;
    const cx = narrow ? width / 2 : width * 0.64, cy = narrow ? Math.min(170, height * 0.3) : height * 0.47;
    camera.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
    const halfH = (height * pixelRatio) / 2;
    for (const m of [stardust.material, dust.material, stars.material, gas.material]) m.uniforms.uHalfH.value = halfH;
    film.uniforms.uRes.value.set(width * pixelRatio, height * pixelRatio);
  }

  /* ---------------------------------------------------------------- Bir kare
     t: toplam gecen sure (sn). p: dongu icindeki an (0..26). Her sey p'ye bagli oldugu icin dongu kendini tekrarlar. */
  function render(t) {
    const p = t % CYCLE, u = p / CYCLE, light = L();

    // Zaman dislinin dagilmaya basladigi anda durur (merkez mekanizma donmayi birakir)
    const tHeart = p < BREAK ? t : t - (p - BREAK);
    updateTrain(heart, tHeart);
    for (const train of tunnel) updateTrain(train, t);
    balance.rotation.z = 2.2 * Math.sin(t * TAU * 1.25);
    hairspring.scale.setScalar(1 + 0.12 * Math.sin(t * TAU * 1.25));

    // Asamalar
    const breakP = clamp((p - BREAK) / 4.7, 0, 1);
    const form = smooth(15.5, 22.5, p);
    central.uDissolve.value = clamp((p - (BREAK - 0.2)) / 3.4, 0, 1);
    rest.uDissolve.value = clamp((p - 15) / 5.5, 0, 1);
    for (const [list, d] of [[jewels.central, central.uDissolve.value], [jewels.rest, rest.uDissolve.value]]) {
      const k = 1 - smooth(0.1, 0.6, d);
      for (const j of list) { j.scale.setScalar(Math.max(k, 0.001)); j.visible = k > 0.001; }
    }
    const flash = Math.exp(-(((p - 16.8) / 0.8) ** 2));
    const su = stardust.material.uniforms;
    su.uTime.value = t; su.uBreak.value = breakP; su.uForm.value = form; su.uFlash.value = flash * 0.4;
    su.uRot.value = heartGear.angle;
    gas.material.uniforms.uOpacity.value = 0.09 * form;
    gas.rotation.z = t * 0.01;
    for (const m of [dust.material, stars.material, gas.material]) m.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = (0.5 + 0.6 * light) * (1 - form);
    stars.material.uniforms.uOpacity.value = 0.35 + 0.65 * form;
    beamMat.uniforms.uOpacity.value = (0.04 + 0.12 * light) * (1 - smooth(13, 18, p));
    beamMat.uniforms.uTime.value = t;

    // Kamera: egri uzerinde ilerler, hep ileri (-z) bakar; fareye gore hafif kayar, yavasca yuvarlanir (roll)
    path.getPoint(u, camPos);
    path.getPoint(Math.min(u + 0.04, 1), ahead);
    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;
    camera.position.copy(camPos).add(look.set(pointer.sx * 0.35, -pointer.sy * 0.25, 0));
    camera.lookAt(look.set(ahead.x * 0.4, ahead.y * 0.4, camPos.z - 6));
    camera.rotateZ(0.06 * Math.sin(t * 0.23) + 0.25 * smooth(14, 24, p));
    camera.fov = fovBase() * (1 + 0.035 * Math.sin(t * 0.4)) * (1 - 0.08 * smooth(8, 13, p));   // dislinin onunde "makro" yakinlasma
    camera.updateProjectionMatrix();
    lamp.position.copy(camera.position).add(look.set(3, 2.5, -1));       // yandan: yansima tam ortada patlamasin
    lamp.intensity = 3 + 7 * light;
    key.intensity = 0.5 + 1.5 * light;

    // Son islem ayarlari
    renderer.toneMappingExposure = 0.7 + 0.4 * light + 0.15 * flash;
    bloom.strength = 0.25 + 0.6 * light + 0.4 * flash + 0.3 * form;
    trails.damp = useTrails ? 0.6 * bump(p, 13.2, 14.5, 19.5, 22.5) : 0;      // girdapta hareket izi
    film.uniforms.uTime.value = t;
    film.uniforms.uFade.value = Math.max(1 - smooth(0, 1.4, p), smooth(24.4, 26, p));   // donguye karartmayla gir/cik

    composer.render();
  }

  /* ---------------------------------------------------------------- Dongu ve tasarruf */
  let t = 0, last = 0, running = false, visible = true, raf = 0, useTrails = !modest;
  let frames = 0, slow = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    render(t);
    // Ilk 90 karede ortalama cok yavassa (< ~30 fps) cozunurlugu dusur ve hareket izini kapat
    if (frames < 90) {
      frames++; slow += dt;
      if (frames === 90 && slow / 90 > 0.034 && pixelRatio > 1) {
        pixelRatio = 1; useTrails = false;
        renderer.setPixelRatio(1); resize();
      }
    }
    raf = running ? requestAnimationFrame(frame) : 0;
  }
  function setRunning() {
    const should = visible && !document.hidden && !reduced.matches;
    if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }
  const still = () => { if (!running) render(t || STILL_FRAME); };

  resize();
  // Sunumda belirli bir ani gostermek icin: adres?sahne=16 -> donguye 16. saniyeden baslar
  const seek = parseFloat(new URLSearchParams(location.search).get("sahne"));
  if (Number.isFinite(seek)) t = clamp(seek, 0, CYCLE - 0.01);
  if (reduced.matches) t = STILL_FRAME;
  render(t);                                             // ilk kare (shader'lar burada derlenir)

  new ResizeObserver(() => { resize(); still(); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(); }).observe(canvas);
  document.addEventListener("visibilitychange", setRunning);
  reduced.addEventListener("change", () => { if (reduced.matches) t = STILL_FRAME; setRunning(); still(); });
  for (const input of [lightInput, depthInput]) if (input) input.addEventListener("input", still);

  // Basarili: 2B heykeli kapat (fx.js dinliyor), tuvali gorunur yap, aciklama satirini guncelle
  root.classList.add("cinema-on");
  dispatchEvent(new Event("p55:cinema"));
  const meta = document.querySelectorAll(".hero-meta span");
  if (meta.length === 2) {
    meta[0].textContent = "FIG. 01 — Saat mekanizması → yıldız tozu → nebula";
    meta[1].textContent = `Three.js · ${dustCount.toLocaleString("tr-TR")} parçacık · ${CYCLE} sn döngü`;
  }
  setRunning();
}

try {
  start();
} catch (e) {
  // Sahne kurulamazsa 2B heykel calismaya devam eder; uygulama etkilenmez
  console.warn("Sinematik sahne başlatılamadı, 2B görsel kullanılıyor:", e);
}
