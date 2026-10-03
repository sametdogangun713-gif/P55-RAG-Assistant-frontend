"""Arayuz testleri: guvenlik (XSS), tema, erisilebilirlik ve backend ile baglanti.

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
        """Hareket hassasiyeti olan kullanicilar (isletim sistemi ayari) icin islevsel gostergeler de durmali."""
        self.assertIn("prefers-reduced-motion: reduce", self.css)

    def test_koyu_ve_acik_tema(self):
        """Secim yoksa isletim sisteminin temasi; dugmeyle acik/koyu secilir ve secim hatirlanir."""
        self.assertIn('[data-theme="light"]', self.css)
        self.assertIn('[data-theme="dark"]', self.css)
        self.assertIn("@media (prefers-color-scheme: dark)", self.css)
        self.assertIn("color-scheme: dark", self.css)
        self.assertIn('localStorage.getItem("p55_theme")', self.html)
        self.assertIn('id="theme-toggle"', self.html)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn('matchMedia("(prefers-color-scheme: dark)")', app)
        self.assertIn('localStorage.setItem("p55_theme"', app)

    def test_susleme_animasyonu_yok(self):
        """Tema sade: 3B sahne, imlec, paralaks ve kayan acilislar kaldirildi; yalnizca islevsel gostergeler kaldi."""
        for ad in ("fx.js", "cinema.js", "vendor"):
            self.assertFalse((STATIC / ad).exists(), ad)
        for kalinti in ("<canvas", "data-split", "data-magnetic", "motion-toggle", "fx.js", "cinema.js"):
            self.assertNotIn(kalinti, self.html)
        izinli = {"spin", "indet", "dot"}                     # yukleniyor, ilerleme cubugu, "yaziyor" noktalari
        self.assertEqual(set(re.findall(r"@keyframes\s+([\w-]+)", self.css)), izinli)
        self.assertNotRegex(self.html, r'<script[^>]+src="https?://', "uygulama kodu internetten yuklenmemeli")

    def test_statik_dosyalar_var_ve_surumlu(self):
        """Her yerel CSS/JS baglantisi var olan bir dosyaya gider ve ?v= tasir (tarayici eskisini onbellekten
        getirmesin). Yollar goreli: site Vercel'de kok dizinden sunulur."""
        baglantilar = re.findall(r'(?:href|src)="([\w.-]+\.(?:js|css)\?v=\w+)"', self.html)
        adlar = {b.split("?")[0] for b in baglantilar}
        self.assertTrue({"config.js", "app.js", "docs.js", "chat.js", "report.js", "admin.js", "account.js", "style.css"} <= adlar)
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
        for dosya_yolu in sorted(p for p in STATIC.rglob("*") if p.is_file()):    # vendor/ dahil
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

    def test_hesabim_sekmesi(self):
        """Ad, parola (mevcut parola + tekrar) ve onayli hesap silme; sekme klavyeyle de gezilebilir (role=tab)."""
        self.assertIn('data-tab="account"', self.html)
        for kimlik in ("tab-account", "name-form", "acc-name", "password-form", "acc-pw-current", "acc-pw-new2",
                       "delete-account-form", "acc-del-password"):
            self.assertIn(f'id="{kimlik}"', self.html)
        self.assertIn('src="account.js?v=', self.html)
        js = (STATIC / "account.js").read_text(encoding="utf-8")
        for parca in ('"/auth/me", { method: "PATCH"', '"/auth/change-password"', '"/auth/me", { method: "DELETE"', "confirm("):
            self.assertIn(parca, js)

    def test_belge_suzme_siralama_ve_sohbet_adlandirma(self):
        for kimlik in ("docs-filter", "docs-sort", "docs-summary"):
            self.assertIn(f'id="{kimlik}"', self.html)
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertIn("const fold", docs)                             # Turkce harf duyarsiz arama
        chat = (STATIC / "chat.js").read_text(encoding="utf-8")
        self.assertIn('method: "PATCH"', chat)
        self.assertIn('"Escape"', chat)

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

    def _panel(self, ad):
        """index.html'den bir giris penceresi panelinin HTML'i (bir sonraki panele kadar)."""
        bas = self.html.index(f'id="auth-panel-{ad}"')
        son = self.html.find('id="auth-panel-', bas + 10)
        return self.html[bas:son if son > 0 else len(self.html)]

    def test_kayit_ve_giris_ayri_ekranlar(self):
        """Giris paneli yalnizca e-posta + parola ister; kayit paneli ad soyad ve parola tekrarini da ister."""
        giris, kayit = self._panel("login"), self._panel("register")
        self.assertIn('id="auth-form"', giris)
        self.assertNotIn("btn-register", giris, "kayit dugmesi giris formunda olmamali")
        for kimlik in ("register-form", "reg-name", "reg-email", "reg-password", "reg-password2", "btn-register"):
            self.assertIn(f'id="{kimlik}"', kayit)
        self.assertIn('autocomplete="name"', kayit)
        self.assertIn('data-auth-panel="register"', giris)      # "Hesabin yok mu? Kayit ol"
        self.assertIn('data-auth-panel="login"', kayit)         # "Zaten hesabin var mi? Giris yap"
        self.assertIn('data-open-auth="register"', self.html)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn("full_name", app)
        self.assertIn("Parolalar birbirini tutmuyor", app)

    def test_e_posta_dogrulama_arayuzu(self):
        dogrulama = self._panel("verify")
        for kimlik in ("verify-form", "verify-code", "btn-verify", "btn-resend", "verify-email-text"):
            self.assertIn(f'id="{kimlik}"', dogrulama)
        self.assertIn('autocomplete="one-time-code"', dogrulama)
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn('"/auth/verify-email"', app)
        self.assertIn('"/auth/resend-verification"', app)
        self.assertIn("e.status === 403", app)                   # girişte doğrulanmamış hesap -> kod paneli

    def test_hidden_her_zaman_gizler(self):
        """Gercek hata: button { display: inline-flex } hidden'i eziyordu, giristen sonra "Giris yap" gorunuyordu."""
        self.assertIn("[hidden] { display: none !important; }", self.css)

    def test_buyuk_belge_parca_parca_indekslenir(self):
        """Sunucu bir istekte sure butcesi kadar indeksler; arayuz belge 'chunked' oldukca index-next'i tekrar
        cagirir, gercek yuzdeyi gosterir ve ilerleme durursa sonsuz donguye girmez."""
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertIn('while (d.status === "chunked")', docs)
        self.assertIn('"/index-next", { method: "POST" }', docs)
        self.assertIn("d.indexed_chunks / d.total_chunks", docs)
        self.assertIn("++stalled >= 3", docs)
        self.assertIn('"Devam et"', docs)

    def test_genel_yanit_etiketlenir(self):
        """Belge disi (general) yanit kaynaksiz gelir ve "belgelerinden degil" notuyla, farkli gorunur."""
        chat = (STATIC / "chat.js").read_text(encoding="utf-8")
        self.assertIn('m.status === "general"', chat)
        self.assertIn("belgelerinden değil", chat)
        self.assertIn(".bubble.general", self.css)
        report = (STATIC / "report.js").read_text(encoding="utf-8")
        self.assertIn('general: "Genel yanıt (belge dışı)"', report)

    def test_belge_yeniden_indekslenebilir(self):
        """Embedding modeli degisince eski belgeler aranamaz; her hazir belgede "Yeniden indeksle" olmali."""
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertIn("if (d.chunk_count > 0)", docs)
        self.assertIn('"/reindex", { method: "POST" }', docs)
        self.assertIn("P55.setBusy(btn, true)", docs)

    def test_yukle_dugmesi_dosya_secilene_kadar_pasif(self):
        self.assertRegex(self.html, r'<button type="submit" id="upload-btn"[^>]*\sdisabled')
        docs = (STATIC / "docs.js").read_text(encoding="utf-8")
        self.assertIn("btn.disabled = !f || tooBig", docs)
        self.assertIn("#upload-btn.ready", self.css)            # dosya secilince vurgulanir

    def test_yukleme_gercek_ilerleme_gosterir(self):
        app = (STATIC / "app.js").read_text(encoding="utf-8")
        self.assertIn("xhr.upload.onprogress", app)
        self.assertIn('role="progressbar"', self.html)
        self.assertIn('aria-valuemax="100"', self.html)

    def test_sekmeler_erisilebilir(self):
        """Her sekme dugmesi kendi panelini gosterir (aria-controls), panel de dugmeye baglidir (aria-labelledby)."""
        for ad in ("docs", "chat", "search", "report", "account", "admin"):
            self.assertIn(f'id="tabbtn-{ad}" aria-controls="tab-{ad}"', self.html)
            self.assertRegex(self.html, rf'id="tab-{ad}"[^>]*aria-labelledby="tabbtn-{ad}"')


if __name__ == "__main__":
    unittest.main()
