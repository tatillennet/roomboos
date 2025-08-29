// backend/models/Reservation.js
// Mevcut yapıyı BOZMADAN, misafir kartı popup’ı için
// rezervasyon sahibinin ve birlikte konaklayanların alanlarını ekledim.

import mongoose from 'mongoose';

// Rezervasyon sahibi ve yanında konaklayanlar için ortak alt şema
const PersonSchema = new mongoose.Schema(
  {
    fullName:   { type: String, trim: true, default: '' },                 // Ad Soyad
    nationality:{ type: String, enum: ['TC', 'FOREIGN'], default: 'TC' },  // Uyruk
    // TC uyruk ise:
    tckn:       { type: String, trim: true, default: '' },
    // Yabancı ise:
    passportNo: { type: String, trim: true, default: '' },
    birthDate:  { type: String, trim: true, default: '' },                 // YYYY-MM-DD (string tutuyoruz)
    country:    { type: String, trim: true, default: '' },                 // Ülke
  },
  { _id: false }
);

const ReservationSchema = new mongoose.Schema(
  {
    hotel:     { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    roomType:  { type: mongoose.Schema.Types.ObjectId, ref: 'RoomType' },

    // Misafir referansı + isim snapshot (mevcut alanlar)
    guestName: { type: String, trim: true },
    guest:     { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },

    checkIn:   { type: Date, required: true, index: true },
    checkOut:  { type: Date, required: true, index: true },

    adults:    { type: Number, default: 2 },
    children:  { type: Number, default: 0 },
    rooms:     { type: Number, default: 1 },

    channel:   { type: String, enum: ['direct','airbnb','booking','etstur'], default: 'direct', index: true },
    status:    { type: String, enum: ['pending','confirmed','cancelled'], default: 'confirmed', index: true },

    // 💸 finans alanları
    totalPrice:     { type: Number, default: 0 },
    depositAmount:  { type: Number, default: 0 },
    paymentMethod:  { type: String, enum: ['', 'cash','pos','transfer','online'], default: '' },
    paymentStatus:  { type: String, enum: ['unpaid','partial','paid'], default: 'unpaid' },

    arrivalTime: { type: String, default: '' },
    notes:       { type: String, default: '' },

    // 🔽 Yeni: Popup için rezervasyon sahibi + birlikte konaklayanlar
    guestOwner: { type: PersonSchema, default: null },      // Rezervasyon sahibi detayları
    companions: { type: [PersonSchema], default: [] },      // Beraber kalan misafirler
  },
  {
    timestamps: true,
    minimize: false, // boş alanların da (örn. guestOwner:{}) kaydedilmesini sağlar
  }
);

// Faydalı indeksler (mevcutta olanları koruyoruz)
ReservationSchema.index({ hotel: 1, status: 1, channel: 1 });
ReservationSchema.index({ hotel: 1, checkIn: 1 });
ReservationSchema.index({ hotel: 1, checkOut: 1 });

export default mongoose.model('Reservation', ReservationSchema);
