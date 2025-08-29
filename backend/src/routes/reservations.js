// backend/src/routes/reservations.js
import express from 'express';
import mongoose from 'mongoose';
import { body, query, param, validationResult } from 'express-validator';

import Reservation from '../models/Reservation.js';
import Guest from '../models/Guest.js';
import { auth, requireRole } from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ensureAvailability } from '../utils/availability.js';

const router = express.Router();

/* ---------------- helpers ---------------- */
const isObjId = (v) => mongoose.Types.ObjectId.isValid(String(v));
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const escRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const num = (v, def=0) => (Number.isFinite(Number(v)) ? Number(v) : def);

const validate = (runs) => [
  ...runs,
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message:'Doğrulama hatası', errors: errors.array() });
    next();
  }
];

/** Otel kapsamı: Hotel kullanıcıları kendi otelini, Master ?hotelId verdiyse onu; yoksa tümü */
function scopeFilter(req) {
  const role = req.user?.role;
  const tokenHotel = req.user?.hotel?._id || req.user?.hotel;
  const queryHotel = req.query?.hotelId;

  if (role !== 'MASTER_ADMIN') {
    return tokenHotel && isObjId(tokenHotel) ? { hotel: new mongoose.Types.ObjectId(tokenHotel) } : { hotel: null };
  }
  if (queryHotel && isObjId(queryHotel)) return { hotel: new mongoose.Types.ObjectId(queryHotel) };
  return {}; // master tüm oteller
}

/* ---------------- Finans senk. için normalize yardımcıları ---------------- */
const METHOD_CANON = {
  cash: 'cash', nakit: 'cash', 'cash ': 'cash',
  pos: 'pos', card: 'pos', kart: 'pos', 'kredi kartı': 'pos',
  transfer: 'transfer', havale: 'transfer', eft: 'transfer', wire: 'transfer', bank: 'transfer',
  online: 'online', virtualpos: 'online', stripe: 'online', paypal: 'online', iyzico: 'online',
  other: 'other',
};
const lower = (v, d='') => (v==null ? d : String(v).trim().toLowerCase());
const upper = (v, d='') => (v==null ? d : String(v).trim().toUpperCase());
const normMethod = (v) => {
  const k = lower(v,'other');
  return METHOD_CANON[k] || (['cash','pos','transfer','online','other'].includes(k) ? k : 'other');
};
const isRefundFlag = (s) => {
  const x = lower(s||'');
  return x.includes('refund') || x.includes('iade') || x.includes('refundment');
};

/** Tek bir ödeme objesini normalize eder (Finance.jsx’in beklediği alanlara uygun) */
function normPayment(raw = {}, fallback = {}) {
  const amtRaw = Number(raw.amount ?? raw.total ?? raw.paid ?? 0) || 0;
  const kindRefund = isRefundFlag(raw.kind) || isRefundFlag(raw.type) || amtRaw < 0;
  const amount = Math.abs(amtRaw) * (kindRefund ? -1 : 1);           // refund’ı negatif yapıyoruz
  const currency = upper(raw.currency || fallback.currency || 'TRY', 'TRY');
  const fxRate = Number(raw.fxRate ?? raw.rate ?? fallback.fxRate ?? (currency === 'TRY' ? 1 : 1)) || 1;
  const date = raw.date || raw.createdAt || fallback.date || new Date();
  const method = normMethod(raw.method || raw.payMethod || raw.channel || (kindRefund ? raw.type : raw.type));
  const type   = kindRefund ? 'refund' : 'payment';
  const kind   = type; // Finance.jsx hem kind hem type’a bakabiliyor

  return {
    amount,
    currency,
    fxRate,
    date,
    method,
    type,
    kind,
    _id: raw._id || undefined,
  };
}

/** Rezervasyondan payment listesi türet + alias’ları ekle */
function attachFinanceAliases(r) {
  const out = { ...r };

  // total alias
  const total = Number(out.totalPrice ?? out.total ?? 0) || 0;
  if (out.total == null) out.total = total;

  // channel/source alias (frontend channel || source okuyor)
  if (!out.channel && out.source) out.channel = out.source;

  // guestName fallback
  if (!out.guestName && out.primaryGuest) out.guestName = out.primaryGuest;

  // payments kaynakları
  const rawPayments =
    (Array.isArray(out.payments)       ? out.payments :
    (Array.isArray(out.paymentHistory) ? out.paymentHistory :
    (Array.isArray(out.transactions)   ? out.transactions : [])));

  const fallback = {
    currency: out.currency || 'TRY',
    fxRate: 1,
    date: out.createdAt || out.checkIn || new Date(),
  };

  let normalized = rawPayments.map(p => normPayment(p, fallback));

  // Sadece kapora alan basit kayıtlar için (payment bulunmuyorsa) deposit’ten bir ödeme çıkar
  if ((!normalized || normalized.length === 0) && Number(out.depositAmount || 0) > 0) {
    normalized = [
      normPayment(
        { amount: Number(out.depositAmount), date: out.depositDate || out.createdAt || out.checkIn, method: 'transfer', type: 'payment' },
        fallback
      )
    ];
  }

  // alias’ları ekle
  if (!out.payments) out.payments = normalized;
  if (!out.paymentHistory) out.paymentHistory = normalized;
  if (!out.transactions) out.transactions = normalized;

  return out;
}

/* utils: misafir kaydı normalize */
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keys.includes(k)));
const sanitizeGuest = (g, role='companion') => {
  const base = pick(g, ['fullName','nationality','tckn','passportNo','birthDate','country']);
  return {
    role,
    fullName: String(base.fullName || '').trim(),
    nationality: (base.nationality === 'FOREIGN' ? 'FOREIGN' : 'TC'),
    tckn: String(base.tckn || '').trim(),
    passportNo: String(base.passportNo || '').trim(),
    birthDate: base.birthDate ? new Date(base.birthDate) : null,
    country: String(base.country || '').trim(),
  };
};
const validateOwnerLogic = (owner) => {
  if (!owner.fullName) return 'Rezervasyon sahibinin adı zorunludur.';
  if (owner.nationality === 'TC') {
    if (!owner.tckn) return 'Rezervasyon sahibinin TCKN alanı zorunludur.';
  } else {
    if (!owner.passportNo) return 'Rezervasyon sahibinin pasaport numarası zorunludur.';
    if (!owner.birthDate)  return 'Rezervasyon sahibinin doğum tarihi zorunludur.';
    if (!owner.country)    return 'Rezervasyon sahibinin ülke alanı zorunludur.';
  }
  return null;
};

/* =================================================================== */
/* GET /api/reservations                                               */
/* =================================================================== */
router.get(
  '/',
  auth,
  validate([
    query('page').optional().toInt().isInt({ min:1 }),
    query('limit').optional().toInt().isInt({ min:1, max:100 }),
    query('start').optional().isISO8601().toDate(),
    query('end').optional().isISO8601().toDate(),
    query('status').optional().isString(),
    query('channel').optional().isString(),
    query('guest').optional().isString(),
    query('hotelId').optional().custom((v)=> isObjId(v) || v==='').withMessage('Geçersiz hotelId')
  ]),
  asyncHandler(async (req, res) => {
    const { page=1, limit=20, status, channel } = req.query;
    const filter = { ...scopeFilter(req) };

    // Tarih çakışma filtresi (aralık içinde kalanlar)
    if (req.query.start || req.query.end) {
      const s = req.query.start ? startOfDay(req.query.start) : null;
      const e = req.query.end   ? endOfDay(req.query.end)     : null;
      filter.$and = [];
      if (e) filter.$and.push({ checkIn: { $lte: e } });
      if (s) filter.$and.push({ checkOut: { $gte: s } });
      if (!filter.$and.length) delete filter.$and;
    }

    if (status)  filter.status  = status;
    if (channel) filter.channel = channel;

    // Misafir araması: guestName + Guest tablosunda name/email/phone
    if (req.query.guest && String(req.query.guest).trim()) {
      const regex = new RegExp(escRegex(req.query.guest.trim()), 'i');
      const or = [{ guestName: { $regex: regex } }];

      const guestMatch = { $or: [{ name: regex }, { email: regex }, { phone: regex }] };
      // Hotel kapsamı varsa Guest aramasını da o kapsamda yap
      const scopedGuestMatch = filter.hotel ? { ...guestMatch, hotel: filter.hotel } : guestMatch;
      const guests = await Guest.find(scopedGuestMatch).select('_id').lean();
      if (guests.length) or.push({ guest: { $in: guests.map(g => g._id) } });
      filter.$or = or;
    }

    const p = Number(page), l = Number(limit);
    const [rawItems, total] = await Promise.all([
      Reservation.find(filter)
        .populate('roomType')
        .populate('guest')
        .sort({ checkIn: -1, createdAt: -1 })
        .skip((p-1)*l).limit(l)
        .lean(),                                // lean: sonra alias ekleyeceğiz
      Reservation.countDocuments(filter),
    ]);

    const items = rawItems.map(attachFinanceAliases);
    res.json({ items, total, page:p, pages: Math.ceil(total / l) });
  })
);

/* =================================================================== */
/* POST /api/reservations                                              */
/* =================================================================== */
router.post(
  '/',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    body().custom((val)=> {
      const inline = val?.guestName && String(val.guestName).trim();
      const nested = val?.guest?.name && String(val.guest.name).trim();
      if (inline || nested) return true;
      throw new Error('Misafir adı zorunludur (guestName veya guest.name)');
    }),
    body('checkIn').isISO8601().toDate(),
    body('checkOut').isISO8601().toDate(),
    body('rooms').optional().toInt().isInt({ min:1 }),
    body('roomType').optional().isMongoId(),
    body('totalPrice').optional().isFloat({ min:0 }),
    body('depositAmount').optional().isFloat({ min:0 }),
  ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id;
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' });

    const payload = { ...req.body };
    if (new Date(payload.checkOut) <= new Date(payload.checkIn)) {
      return res.status(400).json({ message: 'Çıkış tarihi girişten sonra olmalı' });
    }

    // sayısal alanlar
    payload.rooms         = num(payload.rooms || 1, 1);
    payload.adults        = num(payload.adults || 0, 0);
    payload.children      = num(payload.children || 0, 0);
    payload.totalPrice    = num(payload.totalPrice || 0, 0);
    payload.depositAmount = num(payload.depositAmount || 0, 0);
    payload.hotel         = hotel;
    payload.status        = payload.status || 'confirmed';

    // guest upsert/bind
    let guestId = payload.guestId;
    let guestNameCandidate = payload.guestName;

    if (!guestId && payload.guest && payload.guest.name) {
      const { name, email, phone, country, documentNo } = payload.guest;
      let g = null;
      if (email || phone) {
        g = await Guest.findOne({ hotel, $or: [ ...(email?[{email}]:[]), ...(phone?[{phone}]:[]) ] });
      }
      if (g) { g.set({ name, email, phone, country, documentNo }); await g.save(); }
      else  { g = await Guest.create({ hotel, name, email, phone, country, documentNo }); }
      guestId = g._id;
      guestNameCandidate = guestNameCandidate || name;
    }
    if (guestId) payload.guest = guestId;
    if (!payload.guestName) payload.guestName = guestNameCandidate || 'Misafir';

    // uygunluk
    if (payload.roomType) {
      await ensureAvailability({
        hotel,
        roomType: payload.roomType,
        checkIn:  payload.checkIn,
        checkOut: payload.checkOut,
        rooms:    payload.rooms || 1
      });
    }

    const created = await Reservation.create(payload);
    const populated = await Reservation.findById(created._id).populate('roomType').populate('guest').lean();
    res.status(201).json(attachFinanceAliases(populated));
  })
);

/* =================================================================== */
/* PUT /api/reservations/:id                                           */
/* =================================================================== */
router.put(
  '/:id',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    param('id').isMongoId(),
    body('guestName').optional().isString().trim(),
    body('checkIn').optional().isISO8601().toDate(),
    body('checkOut').optional().isISO8601().toDate(),
    body('rooms').optional().toInt().isInt({ min:1 }),
    body('roomType').optional().isMongoId(),
    body('totalPrice').optional().isFloat({ min:0 }),
    body('depositAmount').optional().isFloat({ min:0 }),
  ]), 
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id;
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' });

    const current = await Reservation.findOne({ _id: req.params.id, hotel });
    if (!current) return res.status(404).json({ message: 'Bulunamadı' });

    const next = { ...req.body };
    // numerikler
    if ('rooms'         in next) next.rooms         = num(next.rooms, 1);
    if ('adults'        in next) next.adults        = num(next.adults, 0);
    if ('children'      in next) next.children      = num(next.children, 0);
    if ('totalPrice'    in next) next.totalPrice    = num(next.totalPrice, 0);
    if ('depositAmount' in next) next.depositAmount = num(next.depositAmount, 0);

    // guest upsert (opsiyonel)
    if (next.guestId) {
      next.guest = next.guestId;
    } else if (next.guest && next.guest.name) {
      const { name, email, phone, country, documentNo } = next.guest;
      let g = null;
      if (email || phone) {
        g = await Guest.findOne({ hotel, $or: [ ...(email?[{email}]:[]), ...(phone?[{phone}]:[]) ] });
      }
      if (g) { g.set({ name, email, phone, country, documentNo }); await g.save(); }
      else  { g = await Guest.create({ hotel, name, email, phone, country, documentNo }); }
      next.guest = g._id;
      if (!next.guestName) next.guestName = name;
    }

    const ci = next.checkIn  || current.checkIn;
    const co = next.checkOut || current.checkOut;
    const rt = next.roomType || current.roomType;
    const rm = 'rooms' in next ? next.rooms : current.rooms;

    if (new Date(co) <= new Date(ci)) {
      return res.status(400).json({ message: 'Çıkış tarihi girişten sonra olmalı' });
    }

    if (rt) {
      await ensureAvailability({
        hotel, roomType: rt, checkIn: ci, checkOut: co, rooms: rm, excludeResId: current._id
      });
    }

    const updated = await Reservation.findOneAndUpdate(
      { _id: current._id },
      next,
      { new: true }
    ).populate('roomType').populate('guest').lean();

    res.json(attachFinanceAliases(updated));
  })
);

/* =================================================================== */
/* PATCH /api/reservations/:id/status                                  */
/* =================================================================== */
router.patch(
  '/:id/status',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([ param('id').isMongoId(), body('status').isIn(['pending','confirmed','cancelled']) ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id;
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' });

    const updated = await Reservation.findOneAndUpdate(
      { _id: req.params.id, hotel },
      { status: req.body.status },
      { new: true }
    ).populate('roomType').populate('guest').lean();

    if (!updated) return res.status(404).json({ message: 'Bulunamadı' });
    res.json(attachFinanceAliases(updated));
  })
);

/* =================================================================== */
/* DELETE /api/reservations/:id                                        */
/* =================================================================== */
router.delete(
  '/:id',
  auth, requireRole('HOTEL_ADMIN'),
  validate([ param('id').isMongoId() ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id;
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' });

    const deleted = await Reservation.findOneAndDelete({ _id: req.params.id, hotel });
    if (!deleted) return res.status(404).json({ message: 'Bulunamadı' });
    res.json({ ok: true });
  })
);

/* =================================================================== */
/* NEW: Guests (owner + companions)                                    */
/* =================================================================== */

/** GET /api/reservations/:id/guests → kayıtlı misafir listesi */
router.get(
  '/:id/guests',
  auth,
  validate([ param('id').isMongoId() ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id || req.user?.hotel;
    const filter = req.user?.role === 'MASTER_ADMIN'
      ? { _id: req.params.id }
      : { _id: req.params.id, hotel };

    const r = await Reservation.findOne(filter).lean();
    if (!r) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });

    res.json({ items: r.guestsInfo || [] });
  })
);

/** POST /api/reservations/:id/guests → owner + companions kaydet (tamamını değiştirir) */
router.post(
  '/:id/guests',
  auth, requireRole('HOTEL_ADMIN','HOTEL_STAFF'),
  validate([
    param('id').isMongoId(),
    body('owner').isObject(),
    body('companions').optional().isArray(),
  ]),
  asyncHandler(async (req, res) => {
    const hotel = req.user?.hotel?._id;
    if (!hotel) return res.status(400).json({ message: 'Hotel context yok' });

    const r = await Reservation.findOne({ _id: req.params.id, hotel });
    if (!r) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });

    const ownerRaw = sanitizeGuest(req.body.owner || {}, 'owner');
    const errOwner = validateOwnerLogic(ownerRaw);
    if (errOwner) return res.status(400).json({ message: errOwner });

    const companionsRaw = Array.isArray(req.body.companions) ? req.body.companions : [];
    const companionsSan = companionsRaw.map((g) => sanitizeGuest(g, 'companion'));

    // guestsInfo alanını tamamen güncelliyoruz
    r.guestsInfo = [ownerRaw, ...companionsSan];

    // rezervasyon sahibinin adı guestName olarak da güncellensin (UI’de tutarlılık)
    if (ownerRaw.fullName) r.guestName = ownerRaw.fullName;

    await r.save();

    res.json({ ok: true, guests: r.guestsInfo });
  })
);

export default router;
