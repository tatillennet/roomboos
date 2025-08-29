// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev';
const JWT_ALGS   = ['HS256', 'HS384', 'HS512'];

/* ---- küçük yardımcılar ---- */
function getTokenFrom(req) {
  // 1) Authorization: Bearer xxx
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);

  // 2) X-Access-Token
  const x = req.headers['x-access-token'];
  if (x && typeof x === 'string') return x;

  // 3) Cookie (auth_token | token)
  const cookie = req.headers.cookie || '';
  // çok basit ayrıştırma; prod’da cookie parser kullanılıyor olabilir
  const m1 = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (m1) return decodeURIComponent(m1[1]);
  const m2 = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (m2) return decodeURIComponent(m2[1]);

  return null;
}

function normalizeHotel(hotelRaw) {
  if (!hotelRaw) return null;
  if (typeof hotelRaw === 'string') return { _id: hotelRaw };
  if (typeof hotelRaw === 'object') {
    const out = { ...hotelRaw };
    if (!out._id && out.id) out._id = out.id;
    return out._id ? out : null;
  }
  return null;
}

/* ---- Auth middleware ---- */
export function auth(req, res, next) {
  const token = getTokenFrom(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized', code: 'TOKEN_MISSING' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGS });

    // id alanı esnek karşıla
    const id =
      payload.userId ||
      payload.id ||
      payload.sub ||
      payload._id ||
      null;

    // rol / hotel normalize
    let role  = payload.role || (Array.isArray(payload.roles) ? payload.roles[0] : null) || 'HOTEL_ADMIN';
    let hotel = normalizeHotel(payload.hotel || payload.hotelId || null);

    // --- Güvenli impersonate: sadece MASTER_ADMIN kullanabilir ---
    const impRole  = req.headers['x-impersonate-role']  || req.headers['x-imp-role'];
    const impHotel = req.headers['x-impersonate-hotel'] || req.headers['x-imp-hotel'];
    if (impRole || impHotel) {
      if (role !== 'MASTER_ADMIN') {
        return res.status(403).json({ message: 'Forbidden', code: 'IMPERSONATE_NOT_ALLOWED' });
      }
      if (impRole && typeof impRole === 'string') {
        role = impRole.trim().toUpperCase();
      }
      if (impHotel && typeof impHotel === 'string') {
        hotel = normalizeHotel(impHotel.trim());
      }
    }

    req.user = {
      id,
      role,
      hotel,
      permissions: payload.permissions || [],
      raw: payload,
      isMaster: role === 'MASTER_ADMIN',
    };

    // isteğe bağlı: auth meta (client gerekirse)
    req.auth = {
      token,
      issuedAt: payload.iat ? payload.iat * 1000 : undefined,
      expiresAt: payload.exp ? payload.exp * 1000 : undefined,
    };

    return next();
  } catch (e) {
    const code =
      e?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' :
      e?.name === 'JsonWebTokenError' ? 'TOKEN_INVALID' :
      'TOKEN_ERROR';

    return res.status(401).json({ message: 'Unauthorized', code });
  }
}

/* ---- Role guard ----
 * Varsayılan davranış korunur; buna ek olarak MASTER_ADMIN her zaman geçer.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // MASTER her yere erişsin (mevcut rotalarınızda beklenen davranış)
    if (req.user.role === 'MASTER_ADMIN') return next();

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}
