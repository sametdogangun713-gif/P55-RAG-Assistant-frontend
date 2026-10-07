# vendor/ — dışarıdan alınan kütüphaneler

| Dosya | Sürüm | Kaynak | Lisans |
|---|---|---|---|
| `gsap.min.js` | GSAP 3.15.0 | `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js` | [GSAP Standard "no charge" license](https://gsap.com/standard-license) |
| `ScrollTrigger.min.js` | 3.15.0 | aynı paket, `dist/ScrollTrigger.min.js` | aynı |
| `SplitText.min.js` | 3.15.0 | aynı paket, `dist/SplitText.min.js` | aynı |

- Neden CDN yerine depoda? Site internet bağlantısı olmayan bir sunucuda da çalışabilsin ve sürüm kendiliğinden değişmesin.
- İndirilen dosyalar unpkg.com'daki kopyalarla karşılaştırıldı (SHA-256 aynı, 2026-10-07).
- Güncellemek için: üç dosyayı aynı sürümle yeniden indir, `index.html`'deki `?v=` numarasını artır.
- GSAP yalnızca ana sayfa animasyonlarında kullanılır (`home.js`). Yüklenemezse sayfa animasyonsuz ama eksiksiz görünür.
