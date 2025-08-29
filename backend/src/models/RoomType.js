// backend/models/RoomType.js
// Oda Tipi modeli — UI’deki teklif/uygunluk (assistant) için gerekli alanlar (totalRooms, basePrice) korunup
// sağlamlaştırıldı. Kod büyük/küçük harf normalize, faydalı index’ler ve küçük ergonomiler eklendi.

import mongoose from 'mongoose';

const RoomTypeSchema = new mongoose.Schema(
  {
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
      index: true,
    },

    // Kimlik
    code: { type: String, required: true, trim: true }, // STD, DLX...
    name: { type: String, required: true, trim: true },

    // Fiyat / Kapasite
    basePrice: { type: Number, default: 0, min: 0 },
    capacityAdults: { type: Number, default: 2, min: 1 },
    capacityChildren: { type: Number, default: 0, min: 0 },

    // 🔙 Legacy (eski "capacity" kullanan yerleri bozmamak için)
    capacity: { type: Number, default: 2, min: 1, select: false },

    // Fiziksel envanter (assistant/uygunluk hesabı için şart)
    totalRooms: { type: Number, default: 0, min: 0 },

    // Açıklayıcı
    bedType: { type: String, trim: true }, // Double/Twin/French
    sizeSqm: { type: Number, default: 0, min: 0 },
    smoking: { type: Boolean, default: false },

    // Özellik taksonomisi
    amenities: [{ type: String, trim: true }],   // wifi, ac, tv, minibar, kettle, safe, work_desk...
    scenicViews: [{ type: String, trim: true }], // sea, lake, mountain, forest, garden, city
    hasPool: { type: Boolean, default: false },
    hasJacuzzi: { type: Boolean, default: false },

    // Mutfak
    hasKitchen: { type: Boolean, default: false },
    kitchenFeatures: [{ type: String, trim: true }], // stove, oven, cooktop, dishwasher, fridge, microwave

    // Konaklama tipi (villa/bungalov/glamping/tinyhouse)
    propertyType: {
      type: String,
      enum: ['room', 'suite', 'villa', 'bungalow', 'glamping', 'tinyhouse'],
      default: 'room',
      index: true,
    },
    unitBedrooms: { type: Number, default: 0, min: 0 },
    unitBathrooms: { type: Number, default: 0, min: 0 },
    unitBeds: { type: Number, default: 0, min: 0 },

    description: { type: String, trim: true },
    images: [{ type: String, trim: true }],

    // Kanal haritaları (opsiyonel)
    channelCodes: {
      direct: { type: String, trim: true },
      airbnb: { type: String, trim: true },
      booking: { type: String, trim: true },
      etstur: { type: String, trim: true },
    },

    // Durum
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/* ---------- Index’ler ---------- */
// Aynı otelde code benzersiz
RoomTypeSchema.index({ hotel: 1, code: 1 }, { unique: true });
// Arama/sıralama kolaylığı
RoomTypeSchema.index({ hotel: 1, name: 1 });
RoomTypeSchema.index({ hotel: 1, basePrice: 1 });

/* ---------- Virtual’lar ---------- */
RoomTypeSchema.virtual('capacityTotal').get(function () {
  return Number(this.capacityAdults || 0) + Number(this.capacityChildren || 0);
});

RoomTypeSchema.virtual('displayName').get(function () {
  const c = (this.code || '').toString().toUpperCase();
  return this.name ? `${this.name}${c ? ` (${c})` : ''}` : c || '';
});

/* ---------- Normalize / Legacy aktarımı ---------- */
RoomTypeSchema.pre('save', function (next) {
  // Legacy "capacity" -> adults'a yansıt
  if (
    (this.isModified('capacity') || this.isNew) &&
    !this.isModified('capacityAdults') &&
    this.capacity != null
  ) {
    this.capacityAdults = this.capacity;
  }

  if (this.code) this.code = this.code.trim().toUpperCase();
  if (this.name) this.name = this.name.trim();

  // Dizi alanlarını tekilleştir
  const uniq = (arr = []) =>
    Array.from(new Set(arr.map((s) => (s || '').toString().trim()).filter(Boolean)));

  this.amenities = uniq(this.amenities);
  this.scenicViews = uniq(this.scenicViews);
  this.kitchenFeatures = uniq(this.kitchenFeatures);

  // Kanal kodları whitespace temizliği
  if (this.channelCodes) {
    ['direct', 'airbnb', 'booking', 'etstur'].forEach((k) => {
      if (this.channelCodes[k]) this.channelCodes[k] = this.channelCodes[k].trim();
    });
  }
  next();
});

export default mongoose.models.RoomType ||
  mongoose.model('RoomType', RoomTypeSchema);
