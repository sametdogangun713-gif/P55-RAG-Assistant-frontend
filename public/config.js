"use strict";
/* Arayuzun konusacagi backend (API) adresi.
   Bu dosyada GIZLI BILGI OLMAZ: tarayiciya giden her dosya herkes tarafindan okunabilir.
   - Kendi bilgisayarinda (localhost): backend http://127.0.0.1:8000 adresinde calisir (uvicorn app.main:app; backend README).
   - Bulutta: backend Vercel'e yuklenince aldigi adresi asagidaki satira yaz. */
window.APP_CONFIG = {
  apiBase: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:8000"
    : "https://p55-rag-assistant-backend.vercel.app",
};
