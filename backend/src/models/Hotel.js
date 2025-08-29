// backend/src/models/Hotel.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const HotelSchema = new Schema(
  {
    name:   { type: String, required: true, trim: true },
    code:   { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g. KULE
    address:{ type: String, trim: true },
    phone:  { type: String, trim: true },
    email:  { type: String, trim: true, lowercase: true },
    website:{ type: String, trim: true },

    // Kim oluşturdu
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Otel açık/pasif
    active: { type: Boolean, default: true, index: true },

    // İsteğe bağlı ayarlar (opsiyonel, mevcut datayı bozmaz)
    settings: {
      currency: { type: String, default: 'TRY' },
      timezone: { type: String, default: 'Europe/Istanbul' },
      checkInHour:  { type: Number, default: 14 }, // 14:00
      checkOutHour: { type: Number, default: 12 }, // 12:00
      fiscalStartMonth: { type: Number, default: 1 }, // Ocak
    },
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

/* ---------------- Indexler ---------------- */
// NOT: code alanında zaten `unique: true` var → tekrar index tanımlamıyoruz (duplicate warning’i önler)
HotelSchema.index({ name: 'text', code: 'text' });

/* ---------------- Normalize ---------------- */
HotelSchema.pre('save', function (next) {
  if (this.code) this.code = this.code.trim().toUpperCase();
  if (this.name) this.name = this.name.trim();
  if (this.email) this.email = this.email.trim().toLowerCase();
  next();
});

HotelSchema.pre('findOneAndUpdate', function (next) {
  const upd = this.getUpdate() || {};
  if (upd.code) upd.code = String(upd.code).trim().toUpperCase();
  if (upd.$set?.code) upd.$set.code = String(upd.$set.code).trim().toUpperCase();
  if (upd.name) upd.name = String(upd.name).trim();
  if (upd.$set?.name) upd.$set.name = String(upd.$set.name).trim();
  if (upd.email) upd.email = String(upd.email).trim().toLowerCase();
  if (upd.$set?.email) upd.$set.email = String(upd.$set.email).trim().toLowerCase();
  this.setUpdate(upd);
  next();
});

export default mongoose.models.Hotel || mongoose.model('Hotel', HotelSchema);
