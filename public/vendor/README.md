# vendor/

Dışarıdan alınmış, **elle düzenlenmeyen** kütüphane dosyaları.

| Dosya | Ne | Lisans |
|---|---|---|
| `three.min.js` | Three.js 0.186.1 alt kümesi: yalnızca `cinema.js`'in kullandığı sınıflar, tek dosya, küçültülmüş (≈ 594 KB, gzip ≈ 150 KB) | MIT (`three.LICENSE`) |

Neden CDN değil: sürüm sabit kalır, internetsiz de çalışır, `tests/test_arayuz.py` dışarıdan kod yüklenmesini yasaklar.

## Yeniden üretmek (Node.js gerekir; yalnızca `cinema.js` yeni bir Three.js sınıfı kullanırsa)

```bash
mkdir three-build && cd three-build && npm init -y && npm install three@0.186.1 esbuild
```

`entry.js` dosyası:

```js
// P55 icin Three.js 0.186.1 alt kumesi (yalnizca cinema.js'in kullandiklari). Uretim: esbuild --bundle --minify
export { ACESFilmicToneMapping,AdditiveBlending,BoxGeometry,BufferAttribute,BufferGeometry,CatmullRomCurve3,Color,CylinderGeometry,DirectionalLight,DoubleSide,ExtrudeGeometry,FogExp2,Group,HemisphereLight,Line,LineBasicMaterial,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,PMREMGenerator,Path,PerspectiveCamera,PlaneGeometry,PointLight,Points,Scene,ShaderMaterial,Shape,Sphere,SphereGeometry,TorusGeometry,Vector2,Vector3,WebGLRenderer } from "three";
export { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
export { RenderPass } from "three/addons/postprocessing/RenderPass.js";
export { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
export { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
export { OutputPass } from "three/addons/postprocessing/OutputPass.js";
export { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
export { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
export { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
```

```bash
npx esbuild entry.js --bundle --minify --format=esm --target=es2020 --legal-comments=none --outfile=three.min.js
```
