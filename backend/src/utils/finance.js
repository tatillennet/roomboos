// backend/src/utils/finance.js
import mongoose from 'mongoose';

/* =========================================================================
   Kanonikler & enum'lar
   ========================================================================= */
export const METHOD_CANON = {
  cash: 'cash', nakit: 'cash', 'cash ': 'cash',
  pos: 'pos', card: 'pos', kart: 'pos', 'kredi kartı': 'pos',
  transfer: 'transfer', havale: 'transfer', eft: 'transfer', wire: 'transfer', bank: 'transfer',
  online: 'online', virtualpos: 'online', stripe: 'online', paypal: 'online', iyzico: 'online',
  other: 'other',
};
export const METHOD_ENUM = ['cash', 'pos', 'transfer', 'online', 'other'];
export const TYPE_ENUM   = ['income', 'expense'];
export const CURR_ENUM   = ['TRY', 'USD', 'EUR', 'GBP'];

export const SOURCE_CANON = {
  manual: 'manual', system: 'system', import: 'import', adjustment: 'adjustment',

  // rezervasyon hareketleri – tüm varyasyonları aynı kanoniğe map’ler
  'reservation-payment': 'reservation-payment',
  res_payment: 'reservation-payment', payment: 'reservation-payment',

  'reservation-refund': 'reservation-refund',
  res_refund: 'reservation-refund', refund: 'reservation-refund',

  'reservation-balance': 'reservation-balance',
  res_balance: 'reservation-balance', balance: 'reservation-balance',

  'reservation-planned': 'reservation-planned',
  res_planned: 'reservation-planned', planned: 'reservation-planned',

  // kanallardan toplu ödeme vb.
  'channel-payout': 'channel-payout', channel_payout: 'channel-payout', ota: 'channel-payout',

  // kasa/banka arası
  'transfer-in': 'transfer-in',  transfer_in: 'transfer-in',
  'transfer-out': 'transfer-out', transfer_out: 'transfer-out',

  // açılış/kapanış
  'opening-balance': 'opening-balance', opening_balance: 'opening-balance',
  'closing-balance': 'closing-balance', closing_balance: 'closing-balance',
};
export const SOURCE_ENUM = Object.values({
  manual:1, system:1, import:1, adjustment:1,
  'reservation-payment':1, 'reservation-refund':1,
  'reservation-balance':1, 'reservation-planned':1,
  'channel-payout':1, 'transfer-in':1, 'transfer-out':1,
  'opening-balance':1, 'closing-balance':1,
});

/* =========================================================================
   Küçük yardımcılar
   ========================================================================= */
export const lower = (v, d = '') => (v == null ? d : String(v).trim().toLowerCase());
export const upper = (v, d = '') => (v == null ? d : String(v).trim().toUpperCase());

export const normMethod = (v) => {
  const k = lower(v, 'other');
  return METHOD_CANON[k] || (METHOD_ENUM.includes(k) ? k : 'other');
};
export const normSource = (v) => SOURCE_CANON[lower(v, 'manual')] || 'manual';

export const isObjId = (v) => mongoose.Types.ObjectId.isValid(String(v));

/** YYYY-MM-DD (UTC kırpılmış) */
export const iso = (d) => new Date(d).toISOString().slice(0, 10);

/** Gün başlangıcı / sonu */
export const parseDate = (d, endOfDay = false) => {
  if (!d) return undefined;
  const x = new Date(d);
  if (Number.isNaN(+x)) return undefined;
  x.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return x;
};

export const escRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** TRY karşılığı: 2 ondalık yuvarlar */
export const amountTry = (amount = 0, fxRate = 1) =>
  Math.round(Number(amount || 0) * Number(fxRate || 1) * 100) / 100;

/** Request → hotel scope
 *  Non-master: token.hotel; Master: ?hotelId varsa o, yoksa tümü
 */
export function scopeHotelFilter(req) {
  const role = req.user?.role;
  const tokenHotel = req.user?.hotel?._id || req.user?.hotel;
  const queryHotel = req.query?.hotelId;

  if (role !== 'MASTER_ADMIN') {
    return tokenHotel && isObjId(tokenHotel) ? { hotel: new mongoose.Types.ObjectId(tokenHotel) } : { hotel: null };
  }
  if (queryHotel && isObjId(queryHotel)) return { hotel: new mongoose.Types.ObjectId(queryHotel) };
  return {}; // master: all
}

/* =========================================================================
   Rezervasyon -> Finans üretimi (backend tarafı)
   Frontend Finance.jsx ile uyumlu olacak normalize fonksiyonları
   ========================================================================= */

/** "refund" ipuçları */
const looksRefund = (s) => {
  const x = lower(s || '');
  return x.includes('refund') || x.includes('iade') || x.includes('geri ödeme');
};

/** Tek payment satırını normalize et (amount negatif/pozitif işareti dahil) */
export function normalizePayment(raw = {}, fallback = {}) {
  const rawAmt = Number(raw.amount ?? raw.total ?? raw.paid ?? 0) || 0;
  const refund = looksRefund(raw.kind) || looksRefund(raw.type) || rawAmt < 0;

  const amount   = Math.abs(rawAmt) * (refund ? -1 : 1); // refund negatif
  const currency = upper(raw.currency || fallback.currency || 'TRY', 'TRY');
  const fxRate   = Number(raw.fxRate ?? raw.rate ?? fallback.fxRate ?? (currency === 'TRY' ? 1 : 1)) || 1;
  const date     = raw.date || raw.createdAt || fallback.date || new Date();
  const method   = normMethod(raw.method || raw.payMethod || raw.channel || raw.type);

  return {
    amount,
    currency,
    fxRate,
    date,
    method,
    type: refund ? 'refund' : 'payment',
    kind: refund ? 'refund' : 'payment',
    _id: raw._id || undefined,
  };
}

/** Rezervasyon objesine payments/paymentHistory/transactions alias’larını eklemek isterseniz */
export function attachFinanceAliases(res) {
  const out = { ...res };
  const total = Number(out.totalPrice ?? out.total ?? 0) || 0;
  if (out.total == null) out.total = total;
  if (!out.channel && out.source) out.channel = out.source;
  if (!out.guestName && out.primaryGuest) out.guestName = out.primaryGuest;

  const rawList =
    (Array.isArray(out.payments)       ? out.payments :
    (Array.isArray(out.paymentHistory) ? out.paymentHistory :
    (Array.isArray(out.transactions)   ? out.transactions : [])));

  const fallback = {
    currency: out.currency || 'TRY',
    fxRate: 1,
    date: out.createdAt || out.checkIn || new Date(),
  };

  let normalized = rawList.map((p) => normalizePayment(p, fallback));

  // hiç ödeme yoksa deposit'ten tek satır üret
  if ((!normalized || normalized.length === 0) && Number(out.depositAmount || 0) > 0) {
    normalized = [
      normalizePayment(
        { amount: Number(out.depositAmount), date: out.depositDate || out.createdAt || out.checkIn, method: 'transfer', type: 'payment' },
        fallback
      )
    ];
  }

  if (!out.payments) out.payments = normalized;
  if (!out.paymentHistory) out.paymentHistory = normalized;
  if (!out.transactions) out.transactions = normalized;

  return out;
}

/** idempotent anahtar üretimi (rezervasyon hareketleri için) */
export function uniqueKeyForResTxn(resId, kind, date, amountAbs, extId = '') {
  const safeDate = iso(date || new Date());
  const keyParts = ['res', String(resId || ''), String(kind || 'payment'), safeDate, String(Math.abs(Number(amountAbs || 0)))];
  if (extId) keyParts.push(String(extId));
  return keyParts.join(':');
}

/** Rezervasyon listesinden finans hareketleri üret
 *  opts:
 *    - includePayments (bool) -> gerçek ödeme/iade satırları
 *    - includePlannedBalance (bool) -> check-in gününde kalan tahsilat (planlanan gelir)
 */
export function buildEntriesFromReservations(reservations = [], opts = {}) {
  const { includePayments = true, includePlannedBalance = true } = opts;
  const out = [];

  for (const r of reservations) {
    if (!r) continue;

    const rid       = r._id || r.id;
    const hotel     = r.hotel?._id || r.hotel;
    const guestName = r.guest?.name || r.guestName || r.primaryGuest || 'Misafir';
    const channel   = r.channel || r.source || '-';
    const checkIn   = r.checkIn || r.arrivalDate || r.startDate;

    const total     = Number(r.totalPrice ?? r.total ?? 0) || 0;

    const sourcePayments =
      (Array.isArray(r.payments)       ? r.payments :
      (Array.isArray(r.paymentHistory) ? r.paymentHistory :
      (Array.isArray(r.transactions)   ? r.transactions : [])));

    // 1) Ödeme/İade
    if (includePayments && sourcePayments.length) {
      const fallback = { currency: r.currency || 'TRY', fxRate: 1, date: r.createdAt || checkIn || new Date() };
      for (const p of sourcePayments) {
        const n = normalizePayment(p, fallback);
        const isRefund = n.type === 'refund';
        const direction = isRefund ? 'expense' : 'income';

        const doc = {
          hotel,
          type: direction,
          method: n.method,
          category: isRefund ? 'İade/İptal' : 'Rezervasyon Ödemesi',
          date: n.date,
          amount: Math.abs(Number(n.amount || 0)),
          currency: n.currency || 'TRY',
          fxRate: Number(n.fxRate || 1),
          note: `${isRefund ? 'İade' : 'Ödeme'} • ${guestName} • ${channel}`,
          source: isRefund ? 'reservation-refund' : 'reservation-payment',
          reservation: rid,
          guestName,
          channel,
          ref: p?._id ? String(p._id) : '',
          uniqueKey: uniqueKeyForResTxn(rid, isRefund ? 'refund' : 'payment', n.date, Math.abs(Number(n.amount || 0)), p?._id),
        };
        out.push(doc);
      }
    }

    // 2) Planlanan kalan bakiye (check-in günü)
    if (includePlannedBalance && checkIn) {
      const paid = sourcePayments.reduce((s, p) => {
        const amt = Number(p.amount ?? p.total ?? p.paid ?? 0) || 0;
        return s + Math.max(0, amt); // sadece pozitifleri "ödenmiş" kabul edelim
      }, 0);
      const balance = Math.max(0, total - paid);

      if (balance > 0) {
        out.push({
          hotel,
          type: 'income',
          method: 'transfer',
          category: 'Rezervasyon Ödemesi',
          date: checkIn,
          amount: balance,
          currency: 'TRY',
          fxRate: 1,
          note: `Check-in kalan tahsilat • ${guestName} • ${channel}`,
          source: 'reservation-balance',
          reservation: rid,
          guestName,
          channel,
          uniqueKey: uniqueKeyForResTxn(rid, 'balance', checkIn, balance),
        });
      }
    }
  }

  return out;
}
