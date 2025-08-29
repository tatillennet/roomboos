// backend/src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'

// ROUTES & MIDDLEWARES
import authRoutes from './routes/auth.js'
import hotelRoutes from './routes/hotels.js'
import reservationRoutes from './routes/reservations.js'
import financeRoutes from './routes/finance.js'
import channelRoutes from './routes/channels.js'
import dashboardRoutes from './routes/dashboard.js'
import roomsRoutes from './routes/rooms.js'
import guestsRoutes from './routes/guests.js'
import errorHandler from './middleware/errorHandler.js'

const app = express()

/* ---------------- Core app setup ---------------- */
app.disable('x-powered-by')
app.set('trust proxy', 1)

// Request-Id (log/trace)
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID()
  req.id = id
  res.setHeader('X-Request-Id', id)
  next()
})

// Güvenlik başlıkları
app.use(
  helmet({
    crossOriginResourcePolicy: false, // SPA isteklerinde sorun çıkmasın
  })
)

// Sıkıştırma
app.use(compression())

/* ---------------- CORS ---------------- */
const RAW_ORIGINS = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3001'
const ORIGIN_LIST = RAW_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)

const corsOptions = {
  origin(origin, cb) {
    // CLI/SSR/healthz gibi Origin'siz istekler
    if (!origin) return cb(null, true)
    if (ORIGIN_LIST.includes('*')) return cb(null, true)
    if (ORIGIN_LIST.includes(origin)) return cb(null, true)
    return cb(new Error(`Not allowed by CORS: ${origin}`))
  },
  credentials: false, // JWT header ile
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Request-Id'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.options('/api/*', cors(corsOptions))

/* --------------- Parsers & Logs --------------- */
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'))

/* --------------- Rate limit (/api) ------------ */
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_API_MAX || 200),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'RATE_LIMIT' },
  })
)

/* ------------ Basit cache kontrolü (API) ------ */
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

/* ---------------- Healthchecks ---------------- */
app.get('/', (_req, res) => res.json({ ok: true, name: 'HMS Backend' }))

app.get('/api/healthz', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
    mongo: mongoose.connection.readyState, // 1 = connected
  })
})

app.get('/api/readyz', (_req, res) => {
  const ready = mongoose.connection.readyState === 1
  res.status(ready ? 200 : 503).json({ ok: ready })
})

/* -------------------- Routes ------------------- */
// Kimlik
app.use('/api/auth', authRoutes)
// Tesis
app.use('/api/hotels', hotelRoutes)
// Oda tipleri / envanter / availability quote
app.use('/api/rooms', roomsRoutes)
// Misafirler
app.use('/api/guests', guestsRoutes)
// Rezervasyonlar (popup için /:id/guests endpoint’i dahil)
app.use('/api/reservations', reservationRoutes)
// Finans (cari, kur, özet, CSV)
app.use('/api/finance', financeRoutes)
// Kanallar
app.use('/api/channels', channelRoutes)
// Dashboard
app.use('/api/dashboard', dashboardRoutes)

/* -------------- 404 (sadece /api) ------------- */
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }))

/* --------------- Error handler ---------------- */
app.use(errorHandler)

/* --------- Start & graceful shutdown ---------- */
const PORT = process.env.PORT || 5000
let server

const start = async () => {
  try {
    const { MONGODB_URI, MONGODB_DB } = process.env
    if (!MONGODB_URI) throw new Error('MONGODB_URI missing in .env')
    if (!MONGODB_DB) throw new Error('MONGODB_DB missing in .env')

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB })
    console.log(`✅ Mongo connected: ${mongoose.connection.name}`)

    server = app.listen(PORT, () => {
      console.log(`✅ HMS API running on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('DB connection error:', err)
    process.exit(1)
  }
}
start()

const shutdown = async (signal) => {
  try {
    console.log(`\n${signal} alındı, kapanıyor...`)
    if (server) await new Promise((resolve) => server.close(resolve))
    await mongoose.connection.close()
    console.log('🔌 Kapatıldı')
    process.exit(0)
  } catch (e) {
    console.error('Kapanış hatası:', e)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

export default app
