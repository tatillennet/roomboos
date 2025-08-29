// backend/src/models/User.js
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const { Schema } = mongoose
const ROLES = ['MASTER_ADMIN', 'HOTEL_ADMIN', 'HOTEL_STAFF']

const UserSchema = new Schema(
  {
    name: { type: String, trim: true }, // optional: register akışıyla uyumlu
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false }, // login'de .select('+password') ile alın
    role: { type: String, enum: ROLES, default: 'HOTEL_STAFF' },
    hotel: { type: Schema.Types.ObjectId, ref: 'Hotel', default: null },
  },
  { timestamps: true }
)

// benzersiz email
UserSchema.index({ email: 1 }, { unique: true })

// create/save sırasında şifre hash
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

// findOneAndUpdate ile şifre güncellenirse hash
UserSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {}
  if (update.password) {
    update.password = await bcrypt.hash(update.password, 10)
    this.setUpdate(update)
  }
  next()
})

// karşılaştırma yardımcıları
UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password)
}
UserSchema.methods.compare = UserSchema.methods.comparePassword // geriye dönük uyum

// JSON çıktısından parolayı kaldır
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password
    return ret
  },
})

export default mongoose.models.User || mongoose.model('User', UserSchema)
