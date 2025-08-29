// backend/src/routes/dashboard.master.js
import express from 'express';
import { auth, requireRole } from '../middleware/auth.js';
import Reservation from '../models/Reservation.js';
import RoomType from '../models/RoomType.js';
import Hotel from '../models/Hotel.js';

const router = express.Router();

/* ---------- yardımcılar ---------- */
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const safeDate   = (v, def) => { const d = v ? new Date(v) : null; return (d && !Number.isNaN(+d)) ? d : def; };

function parseRange(query) {
  const today = new Date();
  const fallbackStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const start = safeDate(query.start, fallbackStart);
  const end   = safeDate(query.end, today);
  return { start: startOfDay(start), end: endOfDay(end) };
}

async function totalRoomsForScope(hotelIds) {
  const match = hotelIds?.length ? { hotel: { $in: hotelIds } } : {};
  const agg = await RoomType.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$totalRooms', 0] } } } }
  ]);
  return agg[0]?.total || 0;
}

function nightsBetween(a, b) {
  const A = new Date(a); A.setHours(0,0,0,0);
  const B = new Date(b); B.setHours(0,0,0,0);
  return Math.max(0, Math.round((B - A) / 86400000));
}

/* ---------- MASTER DASHBOARD ---------- */
router.get(
  '/master',
  auth,
  requireRole('MASTER_ADMIN'),
  async (req, res, next) => {
    try {
      const { start, end } = parseRange(req.query);

      // Çoklu hotelId desteği: hotelId=ID1,ID2,ID3 (opsiyonel)
      const hotelIdParam = (req.query.hotelId || '').trim();
      let hotels = [];
      if (hotelIdParam) {
        const ids = hotelIdParam.split(',').map(s => s.trim()).filter(Boolean);
        hotels = await Hotel.find({ _id: { $in: ids } }).select('_id name code').lean();
      } else {
        hotels = await Hotel.find({}).select('_id name code').lean();
      }
      const hotelIds = hotels.map(h => h._id);

      // toplam otel & oda
      const roomsTotalPromise = totalRoomsForScope(hotelIds);

      // bugün metrikleri
      const today = new Date();
      const tStart = startOfDay(today);
      const tEnd   = endOfDay(today);

      const baseHotelMatch = hotelIds.length ? { hotel: { $in: hotelIds } } : {};
      const baseNonCancelled = { status: { $ne: 'cancelled' } };

      // Parallelize I/O
      const [
        roomsTotal,
        todayInhouse,
        todayArrivalsRaw,
        todayDeparturesRaw
      ] = await Promise.all([
        roomsTotalPromise,
        Reservation.countDocuments({
          ...baseHotelMatch,
          ...baseNonCancelled,
          checkIn: { $lte: tEnd },
          checkOut:{ $gt:  tStart }
        }),
        Reservation.find({
          ...baseHotelMatch,
          ...baseNonCancelled,
          checkIn: { $gte: tStart, $lte: tEnd }
        }).populate('guest').lean(),
        Reservation.find({
          ...baseHotelMatch,
          ...baseNonCancelled,
          checkOut: { $gte: tStart, $lte: tEnd }
        }).populate('guest').lean()
      ]);

      const totals = { hotels: hotels.length, rooms: roomsTotal };

      const todayBlockNightsCapacity = totals.rooms; // 1 gece kapasite
      const occupancyPct = todayBlockNightsCapacity > 0
        ? Math.min(100, Math.round((todayInhouse / todayBlockNightsCapacity) * 100))
        : 0;

      const todayData = {
        inhouse: todayInhouse,
        arrivals: todayArrivalsRaw.length,
        departures: todayDeparturesRaw.length,
        occupancyPct
      };

      // MTD (ay başından bugüne) — mevcut mantık korunur
      const now = new Date();
      const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const mtdEnd   = endOfDay(now);

      const mtdRes = await Reservation.find({
        ...baseHotelMatch,
        ...baseNonCancelled,
        checkIn: { $lte: mtdEnd },
        checkOut:{ $gte: mtdStart }
      }).select('checkIn checkOut rooms totalPrice').lean();

      const mtdRevenue = mtdRes.reduce((s, r) => s + (r.totalPrice || 0), 0);
      const mtdRoomNights = mtdRes.reduce((s, r) => {
        const inRangeNights = nightsBetween(
          (r.checkIn  < mtdStart) ? mtdStart : r.checkIn,
          (r.checkOut > mtdEnd)   ? mtdEnd   : r.checkOut
        );
        return s + inRangeNights * (r.rooms || 1);
      }, 0);

      const daysSoFar = (Math.floor((startOfDay(now) - mtdStart) / 86400000) + 1) || 1;
      const mtdADR    = mtdRoomNights > 0 ? (mtdRevenue / mtdRoomNights) : 0;
      const mtdRevPAR = (totals.rooms > 0 && daysSoFar > 0)
        ? (mtdRevenue / (totals.rooms * daysSoFar))
        : 0;

      const mtd = { revenue: mtdRevenue, adr: mtdADR, revpar: mtdRevPAR };

      // Haftalık gelir (seçili aralıkta; toplam fiyatı check-in gününe yazar)
      const dailyAgg = await Reservation.aggregate([
        { $match: {
            ...baseHotelMatch,
            ...baseNonCancelled,
            checkIn: { $lte: end },    // aralıkla kesişenler
            checkOut:{ $gte: start }
        }},
        { $project: {
            checkIn: 1,
            totalPrice: { $ifNull: ['$totalPrice', 0] }
        }},
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkIn' } },
            total: { $sum: '$totalPrice' }
        }},
        { $sort: { _id: 1 } }
      ]);
      const weeklyRevenue = dailyAgg.map(d => ({ date: d._id, total: d.total }));

      // Son 30 gün kanal dağılımı (tutar bazlı)
      const last30Start = startOfDay(new Date(Date.now() - 29 * 86400000));
      const chanAgg = await Reservation.aggregate([
        { $match: {
            ...baseHotelMatch,
            ...baseNonCancelled,
            checkIn: { $gte: last30Start, $lte: endOfDay(new Date()) }
        }},
        { $group: {
            _id: '$channel',
            value: { $sum: { $ifNull: ['$totalPrice', 0] } }
        }},
        { $sort: { value: -1 } }
      ]);
      const channelLast30 = chanAgg.map(c => ({ label: c._id || 'direct', value: c.value }));

      // En iyi oteller (seçili aralıkta)
      const topAgg = await Reservation.aggregate([
        { $match: {
            ...baseHotelMatch,
            ...baseNonCancelled,
            checkIn: { $lte: end },
            checkOut:{ $gte: start }
        }},
        { $group: {
            _id: '$hotel',
            value: { $sum: { $ifNull: ['$totalPrice', 0] } }
        }},
        { $sort: { value: -1 } },
        { $limit: 10 }
      ]);

      // Hotel adlarını bağla
      const hotelMap = new Map(hotels.map(h => [String(h._id), `${h.name} (${h.code})`]));
      const topHotelsByRevenue = topAgg.map(x => ({
        label: hotelMap.get(String(x._id)) || 'Bilinmeyen Otel',
        value: x.value
      }));

      // Bugün giriş/çıkış listeleri
      const todayArrivals = todayArrivalsRaw.map(r => ({
        guest: r.guest?.name || r.guestName || 'Misafir',
        nights: nightsBetween(r.checkIn, r.checkOut),
        channel: r.channel || 'direct',
        checkIn: r.checkIn
      }));
      const todayDepartures = todayDeparturesRaw.map(r => ({
        guest: r.guest?.name || r.guestName || 'Misafir',
        nights: nightsBetween(r.checkIn, r.checkOut),
        channel: r.channel || 'direct',
        checkOut: r.checkOut
      }));

      res.json({
        totals,
        today: todayData,
        mtd,
        weeklyRevenue,
        channelLast30,
        topHotelsByRevenue,
        todayArrivals,
        todayDepartures
      });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
