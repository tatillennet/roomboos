import axios from "axios";

/* -------------------------------------------------------
   API URL çözümü (fallback'ler)
------------------------------------------------------- */
const fromEnv =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "";

const fromWindow =
  typeof window !== "undefined" && window.__API_URL__
    ? window.__API_URL__
    : "";

const isDev5173 =
  typeof window !== "undefined" &&
  window.location &&
  window.location.port === "5173";

const API_URL =
  fromEnv || fromWindow || (isDev5173 ? "http://localhost:5000/api" : "/api");

/* -------------------------------------------------------
   Basit toast pub/sub
------------------------------------------------------- */
let toastCb = null;
export function bindToast(cb) { toastCb = cb; }
function toast(msg, type = "info") { if (toastCb) toastCb({ msg, type }); }

/* -------------------------------------------------------
   Axios instance
------------------------------------------------------- */
const api = axios.create({
  baseURL: API_URL,
  withCredentials: false,
  timeout: 15000,
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

/* -------------------------------------------------------
   Request: Authorization taşı
------------------------------------------------------- */
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

/* -------------------------------------------------------
   Request fix (/reservations GET):
   - end -> +1 gün (bitiş hariç backend'ler için)
   - limit -> en çok 100
   - URL'yi absolute'e çevirmeden, URL+params'ı birleştir
------------------------------------------------------- */
api.interceptors.request.use((config) => {
  try {
    if ((config.method || "get").toLowerCase() !== "get") return config;

    const raw = String(config.url || "");
    const pathOnly = raw.split("?")[0];

    // Sadece .../reservations veya .../reservations/ hedeflensin
    if (!/\/reservations\/?$/.test(pathOnly)) return config;

    // URL üzerindeki query
    const sp = new URLSearchParams(raw.includes("?") ? raw.split("?")[1] : "");

    // config.params varsa merge et (axios sonradan bunları eklerdi)
    if (config.params && typeof config.params === "object") {
      for (const [k, v] of Object.entries(config.params)) {
        if (v === undefined || v === null) continue;
        sp.set(k, String(v));
      }
      // çakışmayı önlemek için params'ı biz işledik
      delete config.params;
    }

    // end -> +1 gün (YYYY-MM-DD güvenli artış)
    const start = sp.get("start");
    const end = sp.get("end");
    if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      const [y, m, d] = end.split("-").map(Number);
      const nd = new Date(y, (m - 1), d + 1); // yerel takvimle
      const y2 = nd.getFullYear();
      const m2 = String(nd.getMonth() + 1).padStart(2, "0");
      const d2 = String(nd.getDate()).padStart(2, "0");
      sp.set("end", `${y2}-${m2}-${d2}`);
    }

    // limit -> 100
    const lim = Number(sp.get("limit") || 0);
    if (!lim || lim > 100) sp.set("limit", "100");

    // baseURL'i bozmadan relative url'i yeniden kur
    const qs = sp.toString();
    config.url = pathOnly + (qs ? `?${qs}` : "");
  } catch {
    // sessiz geç
  }
  return config;
});

/* -------------------------------------------------------
   Response: Hata yakalama
------------------------------------------------------- */
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!err.response) {
      toast("Sunucuya ulaşılamadı. İnternet/CORS kontrol edin.", "error");
      return Promise.reject(err);
    }

    const { status, data, statusText } = err.response;

    let message = "";
    try {
      if (data instanceof Blob) {
        const text = await data.text();
        try { message = JSON.parse(text)?.message || statusText || "Hata"; }
        catch { message = text || statusText || "Hata"; }
      } else if (typeof data === "string") {
        message = data;
      } else {
        message = data?.message || statusText || "Hata";
      }
    } catch { message = "Hata"; }

    const valErrs = Array.isArray(data?.errors) ? data.errors : null;
    if (valErrs && valErrs.length) {
      const f = valErrs[0];
      const det = (f?.path ? `${f.path}: ` : "") + (f?.msg || f?.message || "");
      toast(`Doğrulama hatası: ${det || message}`, "error");
      return Promise.reject(err);
    }

    if (status === 401) {
      toast("Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "warn");
      try { localStorage.clear(); } catch {}
      setTimeout(() => (window.location.href = "/login"), 400);
      return Promise.reject(err);
    }
    if (status === 403) { toast("Bu işlem için yetkiniz yok.", "error"); return Promise.reject(err); }
    if (status === 409) { toast(message || "Çakışma/uygunsuzluk hatası.", "error"); return Promise.reject(err); }
    if (status === 422 || status === 400) { toast(message || "Geçersiz istek.", "error"); return Promise.reject(err); }

    toast(message || "Beklenmeyen hata.", "error");
    return Promise.reject(err);
  }
);

export default api;
