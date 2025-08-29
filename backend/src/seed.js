// backend/src/seed.js
import 'dotenv/config'
import mongoose from 'mongoose'

import Hotel from './models/Hotel.js'
import User from './models/User.js'
import Reservation from './models/Reservation.js'
import Transaction from './models/Transaction.js'
import ChannelConnection from './models/ChannelConnection.js'

const { MONGODB_URI, MONGODB_DB } = process.env

async function run() {
  if (!MONGODB_URI || !MONGODB_DB) {
    throw new Error('MONGODB_URI ve/veya MONGODB_DB .env içinde yok')
  }

  // DB connect
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB })
  console.log(`✅ Mongo connected: ${mongoose.connection.name}`)

  // Temizlik
  await Promise.all([
    User.deleteMany({}),
    Hotel.deleteMany({}),
    Reservation.deleteMany({}),
    Transaction.deleteMany({}),
    ChannelConnection.deleteMany({}),
  ])
  console.log('🧹 Koleksiyonlar temizlendi')

  // Kullanıcılar
  const master = await User.create({
    name: 'Master Admin',
    email: 'master@demo.local',
    password: 'Master123!',        // pre-save hook hash'ler
    role: 'MASTER_ADMIN',
  })

  // Oteller
  const h1 = await Hotel.create({
    name: 'Kule Sapanca',
    code: 'KULE',
    address: 'Sapanca',
    phone: '+90 500 000 00 00',
    createdBy: master._id,
  })
  const h2 = await Hotel.create({
    name: 'Iotape Hotel',
    code: 'IOTAPE',
    address: 'Alanya',
    phone: '+90 500 000 00 01',
    createdBy: master._id,
  })

  // Otel adminleri
  const u1 = await User.create({
    name: 'Hotel 1 Admin',
    email: 'hotel1@demo.local',
    password: 'Demo123!',
    role: 'HOTEL_ADMIN',
    hotel: h1._id,
  })
  const u2 = await User.create({
    name: 'Hotel 2 Admin',
    email: 'hotel2@demo.local',
    password: 'Demo123!',
    role: 'HOTEL_ADMIN',
    hotel: h2._id,
  })

  // Örnek rezervasyon + hareketler
  const today = new Date()
  const res1 = await Reservation.create({
    hotel: h1._id,
    channel: 'direct',
    guestName: 'Ali Veli',
    checkIn: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
    checkOut: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2),
    adults: 2,
    children: 0,
    totalPrice: 4500,
    currency: 'TRY',
    status: 'confirmed',
  })

  await Transaction.create({
    hotel: h1._id,
    type: 'income',
    date: new Date(),
    amount: 4500,
    category: 'Room',
    description: 'Reservation income',
    reservation: res1._id,
    createdBy: u1._id,
  })

  await Transaction.create({
    hotel: h1._id,
    type: 'expense',
    date: new Date(),
    amount: 800,
    category: 'Cleaning',
    description: 'Housekeeping supplies',
    createdBy: u1._id,
  })

  // Kanal bağlantıları
  await ChannelConnection.create({ hotel: h1._id, channel: 'airbnb',  active: false })
  await ChannelConnection.create({ hotel: h1._id, channel: 'booking', active: false })
  await ChannelConnection.create({ hotel: h1._id, channel: 'etstur',  active: false })

  console.log('✅ Seed tamam')
  console.log('👤 Hesaplar:')
  console.log('  MASTER  : master@demo.local / Master123!')
  console.log('  HOTEL 1 : hotel1@demo.local / Demo123!')
  console.log('  HOTEL 2 : hotel2@demo.local / Demo123!')

  await mongoose.connection.close()
  console.log('🔌 Bağlantı kapatıldı')
}

run().catch((err) => {
  console.error('❌ Seed hata:', err)
  process.exit(1)
})
