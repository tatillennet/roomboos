// backend/src/middleware/errorHandler.js
export default function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  /* ---------------- Status belirleme ---------------- */
  let status = 500
  if (typeof err === 'number') status = err
  else if (Number.isInteger(err?.statusCode)) status = err.statusCode
  else if (Number.isInteger(err?.status)) status = err.status

  /* ---------------- Bilinen hata tipleri ------------ */
  // express-rate-limit
  if (err?.name === 'RateLimitError') status = 429

  // Mongoose doğrulama hatası
  if (err?.name === 'ValidationError') status = 400

  // Mongo duplicate key
  if (err?.code === 11000) status = 409

  // JWT hataları
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') status = 401

  if (!Number.isInteger(status) || status < 100 || status > 599) status = 500

  /* ---------------- Payload ------------------------- */
  const requestId = req?.id || req.headers['x-request-id'] || null
  let message =
    err?.message ||
    (status === 429 ? 'Çok fazla istek.' : 'İşlem başarısız.')

  const payload = { message, requestId }

  // express-validator hataları (err.errors dizi olabilir)
  if (Array.isArray(err?.errors) && err.errors.length) {
    payload.errors = err.errors
  }

  // Mongoose ValidationError alanlarını detaylandır
  if (err?.name === 'ValidationError' && err?.errors) {
    payload.errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
      kind: e.kind,
    }))
  }

  // Duplicate key detayları
  if (err?.code === 11000 && err?.keyValue) {
    payload.errors = Object.entries(err.keyValue).map(([k, v]) => ({
      field: k,
      message: `Bu değer zaten kayıtlı: ${v}`,
    }))
    if (!err.message) message = 'Kayıt zaten mevcut.'
    payload.message = message
  }

  // Development’ta faydalı ekstra bilgiler
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err?.stack
    payload.method = req?.method
    payload.path = req?.originalUrl
  }

  /* ---------------- Logging ------------------------- */
  const tag = `[${requestId || '-'}] ${req?.method || ''} ${req?.originalUrl || ''} -> ${status}`
  if (status >= 500) console.error(tag, err)
  else console.warn(tag, err?.message || message)

  return res.status(status).json(payload)
}
