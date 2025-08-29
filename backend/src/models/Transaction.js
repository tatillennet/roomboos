// backend/models/Transaction.js
// Cari işlemler: döviz alanı eklendi, type için varsayılan "expense" yapıldı,
// yararlı index’ler ve ufak doğrulamalar eklendi.

import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: true,
      index: true,
    },

    // UI’da "Tür" seçimi kaldırıldı; varsayılan olarak gider kaydediyoruz.
    type: {
      type: String,
      enum: ['income', 'expense'],
      default: 'expense',
      required: true,
      index: true,
    },

    date: { type: Date, required: true, default: () => new Date(), index: true },

    amount: { type: Number, required: true, min: 0 },

    // 💱 Yeni: döviz
    currency: {
      type: String,
      default: 'TRY',
      trim: true,
      uppercase: true,
    },

    category: { type: String, required: true, trim: true },

    description: { type: String, trim: true },

    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation',
      index: true,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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

// Yararlı index’ler
TransactionSchema.index({ hotel: 1, reservation: 1, date: -1 });
TransactionSchema.index({ hotel: 1, category: 1, date: -1 });

export default mongoose.model('Transaction', TransactionSchema);
