"""Arayuz testleri: guvenlik (XSS), tema, animasyon, erisilebilirlik ve backend ile baglanti.

Yalnizca Python standart kutuphanesi gerekir (kurulum yok):  python -m unittest discover tests
"""
import re
import unittest
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "public"


class ArayuzTests(unittest.TestCase):
    def setUp(self):
        self.html = (STATIC / "index.html").read_text(encoding="utf-8")
        self.css = (STATIC / "style.css").read_text(encoding="utf-8")

    def test_animasyonlar_kapatilabilir(self):
        """Hareket hassasiyeti olan kullanicilar (isletim sistemi ayari) icin animasyonlar kapanmali."""
        self.assertIn("prefers-reduced-motion: reduce", self.css)

    def test_koyu_ve_acik_tema(self):
        """Varsayilan tema koyu (modern siyah); acik tema dugmeyle secilir ve secim hatirlanir."""
        self.assertIn('[data-theme="light"]', self.css)
        self.assertIn("color-scheme: dark", self.css)
        self.assertIn('localStorage.getItem("p55_theme")', self.html)
        self.assertIn('id="theme-toggle"', self.html)

    def test_statik_dosyalar_var_ve_surumlu(self):
        """Her yerel CSS/JS baglantisi var olan bir dosyaya gider ve ?v= tasir (tarayici eskisini onbellekten
        getirmesin). Yollar goreli: site Vercel'de kok dizinden sunulur."""
        baglantilar = re.findall(r'(?:href|src)="([\w.-]+\.(?:js|css)\?v=\w+)"', self.html)
        adlar = {b.split("?")[0] for b in baglantilar}
        self.assertTrue({"config.js", "app.js", "docs.js", "chat.js", "report.js", "admin.js", "fx.js", "style.css"} <= adlar)
        for ad in adlar:
            self.assertTrue((STATIC / ad).is_file(), ad)
        self.assertNotIn('"/static/', self.html)
        for kimlik in ("auth-form", "upload-form", "search-form", "docs-table", "msg"):
            self.assertIn(f'id="{kimlik}"', self.html)

    def test_config_app_jsden_once_yuklenir(self):
        self.assertLess(self.html.index('src="config.js'), self.html.index('src="app.js'))

    def test_arayuz_sunucu_metnini_innerhtml_ile_yazmaz(self):
        """XSS onlemi: sunucudan gelen metin asla HTML olarak yorumlanmaz (textContent kullanilir)."""
        for dosya_yolu in sorted(STATIC.glob("*.js")):
            kod = dosya_yolu.read_text(encoding="utf-8")
            for riskli in (".innerHTML", ".outerHTML", "insertAdjacentHTML", "document.write"):
                self.assertNotIn(riskli, kod, f"{dosya_yolu.name}: {riskli} kullanimi XSS riski")

    def test_arayuzde_gizli_anahtar_yok(self):
        """Tarayiciya giden her dosya herkese aciktir; anahtar burada olamaz."""
        for dosya_yolu in sorted(STATIC.iterdir()):
            kod = dosya_yolu.read_text(encoding="utf-8")
            for desen in (r"sk-ant-", r"gsk_[A-Za-z0-9]{10}", r"hf_[A-Za-z0-9]{10}", r"service_role",
                          r"eyJhbGciOi", r"SUPABASE_SERVICE"):
                self.assertNotRegex(kod, desen, dosya_yolu.name)

    def test_backend_adresi_config_jsden_okunur(self):
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn("window.P55_CONFIG", app)
        self.assertIn("fetch(P55.api + path", app)
        config = (STATIC / "config.js").read_text(encoding="utf-8")
        self.assertIn("http://127.0.0.1:8000", config)            # yerel backend
        self.assertRegex(config, r'"https://[\w.-]+"')            # bulut backend (https)

    def test_arayuzde_sabit_boyut_yazmiyor(self):
        """Yukleme siniri sunucudan okunur (yerelde 500 MB, bulutta 50 MB)."""
        js = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertNotIn("10 MB", self.html)
        self.assertIn('id="upload-hint"', self.html)
        self.assertIn("/documents/limits", js)

    def test_bulutta_dosya_dogrudan_depoya_gider_token_gitmez(self):
        """Bulut akisi: upload-url -> Supabase'e PUT -> complete. Oturum token'i Supabase'e GONDERILMEZ."""
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        for parca in ('"/documents/upload-url"', 'method: "PUT"', '"/documents/complete"', "l.upload_mode"):
            self.assertIn(parca, docs)
        put = docs[docs.index("P55.send(t.upload_url"):]
        put = put[:put.index(");")]
        self.assertNotIn("auth: true", put)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn('if (o.auth && P55.token) xhr.setRequestHeader("Authorization"', app)

    def test_efekt_katmani_yerel_ve_kapatilabilir(self):
        """Gorsel efektler (fx.js) yerel dosyadir; CDN'den kod yuklenmez, "hareketi azalt" ve dokunmatik cihaz dikkate alinir."""
        self.assertIn('src="fx.js?v=', self.html)
        self.assertNotRegex(self.html, r'<script[^>]+src="https?://', "uygulama kodu internetten yuklenmemeli")
        fx = (STATIC / "fx.js").read_text(encoding="utf-8")
        self.assertIn("prefers-reduced-motion: reduce", fx)
        self.assertIn("pointer: fine", fx)                    # ozel imlec yalnizca fareyle
        self.assertIn("try { part(); }", fx)                  # bir efekt hata verirse digerleri ve uygulama calisir

    def test_dekoratif_ogeler_ekran_okuyucudan_gizli(self):
        """3B heykel tuvali ve arka plan susu ekran okuyucuya okunmaz; kaydiricilarin etiketi vardir."""
        self.assertRegex(self.html, r'<canvas id="sculpture" aria-hidden="true"')
        self.assertRegex(self.html, r'class="void" aria-hidden="true"')
        for kimlik in ("fx-light", "fx-depth"):
            self.assertIn(f'<label for="{kimlik}"', self.html)

    def test_ana_sayfa_giris_formuyla_acilmaz(self):
        """Ana sayfa proje tanitimidir; giris formu <dialog> penceresindedir ve yalnizca dugmeyle acilir."""
        for kimlik in ("home-view", "proje", "nasil", "gelistirici"):
            self.assertIn(f'id="{kimlik}"', self.html)
        self.assertIn("Samet DOĞANGÜN", self.html)
        dialog = self.html.index('<dialog id="auth-dialog"')
        self.assertGreater(self.html.index('id="auth-form"'), dialog, "giris formu pencerenin icinde olmali")
        self.assertNotRegex(self.html, r'<dialog id="auth-dialog"[^>]*\sopen', "pencere sayfa acilirken kapali olmali")
        self.assertGreaterEqual(self.html.count("data-open-auth"), 2)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn("showModal()", app)

    def test_sifremi_unuttum_arayuzu(self):
        for kimlik in ("forgot-form", "forgot-email", "reset-form", "reset-code", "reset-password", "auth-msg"):
            self.assertIn(f'id="{kimlik}"', self.html)
        self.assertIn('autocomplete="one-time-code"', self.html)
        self.assertIn('autocomplete="new-password"', self.html)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn('"/auth/forgot-password"', app)
        self.assertIn('"/auth/reset-password"', app)

    def test_yukle_dugmesi_dosya_secilene_kadar_pasif(self):
        self.assertRegex(self.html, r'<button type="submit" id="upload-btn"[^>]*\sdisabled')
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertIn("btn.disabled = !f || tooBig", docs)
        self.assertIn("#upload-btn.ready", self.css)            # aktiflesince bir kez parlar

    def test_yukleme_gercek_ilerleme_gosterir(self):
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn("xhr.upload.onprogress", app)
        self.assertIn('role="progressbar"', self.html)
        self.assertIn('aria-valuemax="100"', self.html)

    def test_sekmeler_erisilebilir(self):
        """Her sekme dugmesi kendi panelini gosterir (aria-controls), panel de dugmeye baglidir (aria-labelledby)."""
        for ad in ("docs", "chat", "search", "report", "admin"):
            self.assertIn(f'id="tabbtn-{ad}" aria-controls="tab-{ad}"', self.html)
            self.assertRegex(self.html, rf'id="tab-{ad}"[^>]*aria-labelledby="tabbtn-{ad}"')


if __name__ == "__main__":
    unittest.main()
