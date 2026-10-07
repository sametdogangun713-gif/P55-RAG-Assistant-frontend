# vendor/ — dışarıdan alınan kütüphaneler

| Dosya | Sürüm | Kaynak | Lisans |
|---|---|---|---|
| `gsap.min.js` | GSAP 3.15.0 | `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js` | [GSAP Standard "no charge" license](https://gsap.com/standard-license) |
| `ScrollTrigger.min.js` | 3.15.0 | aynı paket, `dist/ScrollTrigger.min.js` | aynı |
| `SplitText.min.js` | 3.15.0 | aynı paket, `dist/SplitText.min.js` | aynı |
| `three/three.module.min.js` | Three.js 0.186.1 | `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js` (jsDelivr'in resmi `three.module.js`'ten ürettiği küçültülmüş kopya) | MIT (`three/LICENSE`) |
| `three/three.core.js` | 0.186.1 | `…/build/three.core.min.js` — modül bu adla içe aktardığı için `three.core.js` olarak kaydedildi | MIT |
| `three/addons/geometries/RoundedBoxGeometry.js` | 0.186.1 | `…/examples/jsm/geometries/RoundedBoxGeometry.js` | MIT |
| `three/addons/environments/RoomEnvironment.js` | 0.186.1 | `…/examples/jsm/environments/RoomEnvironment.js` | MIT |

- Neden CDN yerine depoda? Site internet bağlantısı olmayan bir sunucuda da çalışabilsin ve sürüm kendiliğinden değişmesin.
- İndirilen dosyalar unpkg.com'daki kopyalarla karşılaştırıldı (SHA-256 aynı, 2026-10-07). Three.js'te paket
  küçültülmüş dosya içermediği için resmi `three.module.js`, `three.core.js`, eklentiler ve `LICENSE` iki CDN'de
  karşılaştırıldı (aynı); küçültülmüş kopyalar jsDelivr'den alındı.
- Güncellemek için: dosyaları aynı sürümle yeniden indir, `index.html`'deki `?v=` numaralarını (import haritası dahil) artır.
- Three.js bir ES modülüdür: `index.html`'deki `<script type="importmap">` `three` adını `three/three.module.min.js`'e bağlar.
- GSAP ana sayfa animasyonlarında (`home.js`), Three.js 3B stüdyoda (`studio.js`) kullanılır. Yüklenemezlerse ya da
  tarayıcıda WebGL yoksa sayfa animasyonsuz ama eksiksiz görünür.
