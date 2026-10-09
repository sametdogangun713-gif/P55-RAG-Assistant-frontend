# Belge Tabanlı Soru Asistanı (RAG) · Frontend

Belge Tabanlı Soru Asistanı projesinin **web arayüzü**. Saf HTML, CSS ve JavaScript; derleme adımı, paket yöneticisi ya da çerçeve yok.
Geliştirici: Samet DOĞANGÜN · Ders: Bilgisayar Uygulamaları I (Bingöl Üniversitesi) · Öğr. Gör. Mustafa NARİN

| Depo | İçerik |
|---|---|
| **P55-RAG-Assistant-frontend** (bu depo) | Arayüz: ana sayfa, giriş/kayıt, belgeler, sohbet, arama, rapor, yönetim |
| [P55-RAG-Assistant-backend](https://github.com/sametdogangun713-gif/P55-RAG-Assistant-backend) | API, veritabanı, testler ve **projenin tüm belgeleri** (`docs/`) |

Projenin ne yaptığı, mimarisi, sözlü hazırlık ve ilerleme: backend deposundaki [`README.md`](https://github.com/sametdogangun713-gif/P55-RAG-Assistant-backend#readme) ve [`docs/`](https://github.com/sametdogangun713-gif/P55-RAG-Assistant-backend/tree/main/docs).

## Dosyalar
Her dosya kendi adını taşıyan klasörde durur (`public/docs/docs.js` gibi); `public/` kökünde yalnızca `index.html` var.
```
public/index.html              tek sayfa: ana sayfa + giriş penceresi + sekmeler
public/config/config.js        backend (API) adresi  <- buluta çıkarken değiştirilen tek dosya
public/app/app.js              çekirdek: API istemcisi, oturum, sekmeler, tema, bildirimler
public/docs/docs.js            belgeler (yükleme: yerelde doğrudan, bulutta Supabase Storage'a) ve arama
public/chat/chat.js            sohbet
public/report/report.js        kullanım raporu ve PDF indirme
public/admin/admin.js          yönetim (yalnızca yönetici)
public/account/account.js      Hesabım sekmesi: ad, parola, API anahtarları, hesap silme
public/home/home.js            ana sayfa animasyonları (GSAP)
public/studio/studio.js        ana sayfadaki 3B açılış sahnesi (Three.js)
public/style/style.css         keskin siyah-beyaz tema: açık/koyu (seçim yoksa işletim sistemi ayarı), düzen (masaüstü/mobil)
public/vendor/                 dışarıdan gelen kütüphaneler (GSAP, Three.js), internetten yüklenmez
tests/                         arayüz testleri (yalnızca Python standart kütüphanesi)
vercel.json                    Vercel ayarı: site public/ klasöründen sunulur + güvenlik başlıkları
```

## Yerelde çalıştırma
1. Önce backend'i başlat (backend README'sindeki "Adım adım kurulum" → http://127.0.0.1:8000).
2. Bu klasörde şu komutu çalıştır, sonra http://localhost:5500 adresini aç:
   `python -m http.server 5500 --bind 127.0.0.1 --directory public`

Arayüz `localhost`'ta açıldığında backend'i otomatik olarak `http://127.0.0.1:8000`'de arar (`public/config/config.js`).
Backend, `http://localhost:5500`'e izin verecek şekilde ayarlıdır (`ALLOWED_ORIGINS`).

## Buluta (Vercel) çıkarma
1. Backend'i önce dağıt ([`docs/dagitim/dagitim.md`](https://github.com/sametdogangun713-gif/P55-RAG-Assistant-backend/blob/main/docs/dagitim/dagitim.md)), adresini al.
2. `public/config/config.js` içindeki bulut adresini backend adresinle değiştir, commit + push.
3. Vercel → Add New → Project → bu depo → Framework: **Other** → Deploy.
4. Çıkan adresi backend'in `ALLOWED_ORIGINS` değişkenine yaz ve backend'i yeniden dağıt.

## Güvenlik
- Bu depoda **hiçbir gizli değer yoktur ve olmamalıdır**: tarayıcıya giden her dosya herkes tarafından okunabilir. Test bunu tarar.
- Sunucudan gelen metin asla `innerHTML` ile yazılmaz (`textContent`; XSS önlemi) — test tüm `.js` dosyalarını tarar.
- Oturum token'ı `sessionStorage`'da (sekme kapanınca silinir) ve yalnızca kendi backend'imize gönderilir; dosya Supabase'e
  yüklenirken token gönderilmez (backend'in verdiği tek kullanımlık imzalı adres kullanılır).

## Testler
```bat
python -m unittest discover -s tests -v
```
ya da `testleri_calistir.bat`. 23 test: statik dosya bağlantıları, XSS taraması, gizli anahtar taraması, tema, erişilebilirlik
(ARIA, "hareketi azalt"), şifremi unuttum, yükleme düğmesi ve ilerleme, bulut yükleme akışı.
