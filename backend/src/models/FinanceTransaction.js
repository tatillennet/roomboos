// backend/src/models/FinanceTransaction.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/* ---------------- helpers ---------------- */
const lower = (v, d = '') => (v == null ? d : String(v).trim().toLowerCase());
const upper = (v, d = '') => (v == null ? d : String(v).trim().toUpperCase());

/* yöntem canonicalization */
const METHOD_CANON = {
  cash: 'cash', nakit: 'cash', 'cash ': 'cash',
  pos: 'pos', card: 'pos', kart: 'pos', 'kredi kartı': 'pos',
  transfer: 'transfer', havale: 'transfer', eft: 'transfer', wire: 'transfer', bank: 'transfer',
  online: 'online', virtualpos: 'online', stripe: 'online', paypal: 'online', iyzico: 'online',
  other: 'other',
};
const METHOD_ENUM = ['cash', 'pos', 'transfer', 'online', 'other'];
const normMethod = (v) => {
  const k = lower(v || 'cash');
  return METHOD_CANON[k] || (METHOD_ENUM.includes(k) ? k : 'other');
};

/* source canonicalization — FinanceEntry ile uyumlu */
const SOURCE_CANON = {
  manual: 'manual', system: 'system', import: 'manual', adjustment: 'system',

  // rezervasyon varyasyonları -> tek kanonik
  'reservation-payment': 'res_payment', res_payment: 'res_payment', payment: 'res_payment',
  'reservation-refund':  'res_refund',  res_refund:  'res_refund',  refund:  'res_refund',
  'reservation-balance': 'res_balance', res_balance: 'res_balance', balance: 'res_balance',
  'reservation-planned': 'res_balance', res_planned: 'res_balance', planned: 'res_balance',

  // diğer (opsiyonel)
  'channel-payout': 'system', channel_payout: 'system', ota: 'system',
  'transfer-in': 'manual',  transfer_in: 'manual',
  'transfer-out': 'manual', transfer_out: 'manual',
  'opening-balance': 'system', opening_balance: 'system',
  'closing-balance': 'system', closing_balance: 'system',
};
const SOURCE_ENUM = ['manual','res_payment','res_balance','res_refund','system'];
const normSource = (v) => SOURCE_CANON[lower(v || 'manual')] || 'manual';

/* para birimi enum (gerekirse genişlet) */
const CURR_ENUM = ['TRY', 'USD', 'EUR', 'GBP'];

/* ---------------- Schema ---------------- */
const FinanceTransactionSchema = new Schema(
  {
    hotel:  { type: Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },

    type:     { type: String, enum: ['income','expense'], required: true, set: (v) => lower(v), index: true },
    method:   { type: String, enum: METHOD_ENUM, default: 'cash', set: normMethod, index: true },
    category: { type: String, default: 'Genel', trim: true, index: true },

    date:   { type: Date, default: Date.now, index: true },

    // tutar + kur + TRY karşılığı
    amount:    { type: Number, required: true, min: 0 },
    currency:  { type: String, enum: CURR_ENUM, default: 'TRY', set: (v) => upper(v, 'TRY') },
    fxRate:    { type: Number, default: 1, min: 0 },
    amountTry: { type: Number, default: 0 }, // amount * fxRate

    note: { type: String, default: '', trim: true },

    // Dış referans/kimlikler
    ref:    { type: String, default: '', trim: true },
    source: { type: String, enum: SOURCE_ENUM, default: 'manual', set: normSource, index: true },

    // Rezervasyon bağlantıları (opsiyonel)
    reservation:  { type: Schema.Types.ObjectId, ref: 'Reservation', index: true },
    resPaymentId: { type: Schema.Types.ObjectId },
    guestName:    { type: String, default: '', trim: true },
    channel:      { type: String, default: '', trim: true },

    // idempotency
    uniqueKey: { type: String, index: { unique: true, sparse: true } },
  },
  { timestamps: true }
);

/* ---------------- Index’ler ---------------- */
FinanceTransactionSchema.index({ hotel: 1, date: -1, type: 1 });
FinanceTransactionSchema.index({ hotel: 1, method: 1, date: -1 });
FinanceTransactionSchema.index({ hotel: 1, category: 1, date: -1 });
FinanceTransactionSchema.index({ hotel: 1, source: 1, ref: 1 });
FinanceTransactionSchema.index({ reservation: 1 });

/* ---------------- Normalize & TRY hesap ---------------- */
// TRY -> fxRate = 1 koruması
FinanceTransactionSchema.pre('validate', function (next) {
  this.currency = upper(this.currency || 'TRY', 'TRY');
  if (this.currency === 'TRY' && (this.isModified('currency') || this.fxRate === undefined)) {
    this.fxRate = 1;
  }
  next();
});

// save öncesi amountTry hesapla
FinanceTransactionSchema.pre('save', function (next) {
  const amt  = Number(this.amount || 0);
  const rate = Number(this.fxRate || 1);
  this.amountTry = +(amt * rate);
  next();
});

// insertMany için de normalize + hesap
FinanceTransactionSchema.pre('insertMany', function (next, docs) {
  if (!Array.isArray(docs)) return next();
  for (const d of docs) {
    d.method   = normMethod(d.method);
    d.source   = normSource(d.source);
    d.currency = upper(d.currency || 'TRY', 'TRY');
    if (d.currency === 'TRY' && (d.fxRate === undefined || d.fxRate === null)) d.fxRate = 1;
    const a = Number(d.amount || 0);
    const r = Number(d.fxRate || 1);
    d.amountTry = +(a * r);
  }
  next();
});

// findOneAndUpdate: normalize + tekrar hesap
FinanceTransactionSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  if (!update.$set) update.$set = {};
  const $set = update.$set;

  if (update.type || $set.type)   $set.type   = lower($set.type ?? update.type);
  if (update.method || $set.method) $set.method = normMethod($set.method ?? update.method);
  if (update.source || $set.source) $set.source = normSource($set.source ?? update.source);

  if (update.currency || $set.currency) {
    const cur = upper($set.currency ?? update.currency, 'TRY');
    $set.currency = cur;
    if (cur === 'TRY' && $set.fxRate === undefined && update.fxRate === undefined) $set.fxRate = 1;
  }

  const amt  = $set.amount ?? update.amount;
  const rate = $set.fxRate ?? update.fxRate;
  if (amt !== undefined || rate !== undefined) {
    const a = amt  !== undefined ? Number(amt)  : 0;
    const r = rate !== undefined ? Number(rate) : 1;
    $set.amountTry = +(a * r);
  }

  this.setUpdate(update);
  next();
});

/* ---------------- JSON görünümü ---------------- */
FinanceTransactionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  },
});

/* ---------------- Convenience statics ---------------- */
FinanceTransactionSchema.statics.upsertByUniqueKey = async function (doc) {
  if (!doc.uniqueKey) return this.create(doc);
  try {
    return await this.create(doc);
  } catch (e) {
    if (e?.code === 11000) return this.findOne({ uniqueKey: doc.uniqueKey });
    throw e;
  }
};

// Rezervasyon hareketlerinden kolay kayıt üretme (payment/refund/balance/planned)
FinanceTransactionSchema.statics.fromReservation = function ({
  hotel, reservation, guestName, channel,
  kind = 'payment',                // 'payment' | 'refund' | 'balance' | 'planned'
  amount, currency = 'TRY', fxRate = 1,
  direction = 'income',            // income/expense (refund: expense)
  method = 'cash',
  category = 'Rezervasyon Ödemesi',
  date = new Date(),
  note = '', uniqueKey, ref,
}) {
  const kindMap = { payment: 'res_payment', refund: 'res_refund', balance: 'res_balance', planned: 'res_balance' };
  return {
    hotel,
    type: direction,
    method: normMethod(method),
    category,
    date,
    amount,
    currency: upper(currency || 'TRY', 'TRY'),
    fxRate: Number(currency === 'TRY' ? 1 : (fxRate || 1)),
    note,
    reservation,
    guestName,
    channel,
    uniqueKey,
    ref,
    source: kindMap[kind] || 'res_payment',
  };
};

export default mongoose.models.FinanceTransaction || mongoose.model('FinanceTransaction', FinanceTransactionSchema);
