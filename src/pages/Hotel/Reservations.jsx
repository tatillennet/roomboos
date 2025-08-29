// Reservations.jsx — son sürüm (popup ve cari düzeltildi)
import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'
import GuestPicker from '../../components/GuestPicker.jsx'
import Drawer from '../../components/Drawer.jsx'
import MiniTimeline from '../../components/MiniTimeline.jsx'

/* ------------------- sabitler ------------------- */
const STATUS   = ['confirmed', 'pending', 'cancelled']
const CHANNELS = ['direct', 'airbnb', 'booking', 'etstur']

/* --- API hata mesajlarını okunur göster --- */
const showApiError = (err, fallback = 'İşlem başarısız') => {
  const data = err?.response?.data
  const list = data?.errors
  if (Array.isArray(list) && list.length) {
    const pretty = list.map((e) => {
      const field = e.param ?? e.path ?? ''
      const val   = e.value !== undefined
        ? (typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value))
        : undefined
      return `• ${e.msg}${field ? ` [${field}]` : ''}${val !== undefined ? ` ← ${val}` : ''}`
    }).join('\n')
    alert('Doğrulama hatası:\n' + pretty)
    console.error('API validation errors:', list, 'raw:', data)
  } else {
    alert(data?.message || err.message || fallback)
    console.error('API error raw response:', data || err)
  }
}

const fmtDate = (d) => {
  if (!d) return '—'
  const asDate = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(d.split('-')[0], Number(d.split('-')[1]) - 1, d.split('-')[2])
    : new Date(d)
  return asDate.toLocaleDateString('tr-TR')
}
const toLocalYMD = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const todayISO  = () => toLocalYMD(new Date())
const toLocalDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate())
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y,m,d] = v.split('-').map(Number)
    return new Date(y, m-1, d)
  }
  const t = new Date(v); return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}
const nightsBetween = (a, b) => {
  const A = toLocalDate(a), B = toLocalDate(b)
  if (!A || !B) return 0
  return Math.max(1, Math.round((B - A) / 86400000))
}
const formatTRY = (n) => new Intl.NumberFormat('tr-TR', {
  style:'currency', currency:'TRY', minimumFractionDigits:0, maximumFractionDigits:0
}).format(Number(n || 0))

/* localStorage hook */
const useLocal = (key, initial) => {
  const [v,setV] = useState(()=> {
    try { const x = localStorage.getItem(key); return x ? JSON.parse(x) : initial }
    catch { return initial }
  })
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)) }, [key,v])
  return [v,setV]
}

/* ==== DateRangePicker (kapama fix) ==== */
function DateRangePicker({ start, end, onChange }) {
  const [open, setOpen] = useState(false)
  const [autoCloseUsed, setAutoCloseUsed] = useState(false)
  const popRef = useRef(null)

  const parseISO = (s) => (s ? toLocalDate(s) : null)
  const [view, setView] = useState(parseISO(start) || new Date())
  const [s, setS] = useState(parseISO(start))
  const [e, setE] = useState(parseISO(end))

  useEffect(() => {
    if (open) {
      setS(parseISO(start)); setE(parseISO(end)); setView(parseISO(start) || new Date())
    }
    const onDown = (ev) => { if (open && popRef.current && !popRef.current.contains(ev.target)) setOpen(false) }
    const onKey  = (ev) => { if (ev.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, start, end])

  const closePopup = () => { setOpen(false); setAutoCloseUsed(true) }
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return x }
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const inRange = (d) => s && e && startOf(d) >= startOf(s) && startOf(d) <= startOf(e)
  const isSameDay = (a,b) => a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()

  const buildDays = () => {
    const y = view.getFullYear(); const m = view.getMonth()
    const first = new Date(y, m, 1)
    const dow = (first.getDay()+6)%7 // Pazartesi=0
    const startCell = new Date(y, m, 1 - dow)
    const arr = []
    for (let i=0;i<42;i++){ const dd=new Date(startCell); dd.setDate(startCell.getDate()+i); arr.push(dd) }
    return arr
  }

  const selectDay = (d) => {
    if (!s || (s && e)) { setS(d); setE(null) }
    else if (d < s) { setS(d) }
    else {
      const sYMD = toLocalYMD(s)
      const eYMD = toLocalYMD(d)
      setE(d)
      onChange(sYMD, eYMD)
      if (!autoCloseUsed) closePopup()
    }
  }

  const clearSel = () => { setS(null); setE(null); onChange('', '') }
  const quickToday = () => {
    const t=new Date(); const t2=new Date(t); t2.setDate(t2.getDate()+1)
    onChange(toLocalYMD(t), toLocalYMD(t2)); setS(t); setE(t2)
    if (!autoCloseUsed) closePopup()
  }

  const displayStart = start ? parseISO(start) : null
  const displayEnd   = end ? parseISO(end)   : null
  const display = (displayStart && displayEnd)
    ? `${displayStart.toLocaleDateString('tr-TR')} — ${displayEnd.toLocaleDateString('tr-TR')}`
    : (displayStart ? `${displayStart.toLocaleDateString('tr-TR')} — …` : 'Tarih aralığını seç')

  return (
    <div style={{ position:'relative' }}>
      <button type="button" className="input"
        onClick={()=>setOpen(true)}
        style={{ textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px',
          border:'1px solid rgba(34,211,238,.35)', background:'linear-gradient(135deg, rgba(52,211,153,.06), rgba(34,211,238,.06))' }}>
        <span>{display}</span>
        <span aria-hidden>📅</span>
      </button>

      {open && (
        <div ref={popRef} className="card"
          style={{ position:'absolute', zIndex:1000, top:'calc(100% + 6px)', left:0, width:320, padding:10,
            background:'rgba(11,18,32,.98)', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 12px 30px rgba(0,0,0,.45)', backdropFilter:'blur(2px)' }}>
          <div className="label" style={{ marginBottom:6, display:'inline-block', padding:'4px 8px', borderRadius:999,
            background:'linear-gradient(135deg, rgba(52,211,153,.15), rgba(34,211,238,.15))', border:'1px solid rgba(34,211,238,.35)' }}>
            Tarih aralığını seç
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'6px 0 8px 0' }}>
            <button type="button" className="btn" onClick={()=>setView(v=>addMonths(v,-1))}>←</button>
            <div><b>{view.toLocaleDateString('tr-TR', { year:'numeric', month:'long' })}</b></div>
            <button type="button" className="btn" onClick={()=>setView(v=>addMonths(v,1))}>→</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4, textAlign:'center', fontSize:12, opacity:.7, marginBottom:4 }}>
            {['Pt','Sa','Ça','Pe','Cu','Ct','Pa'].map(d=> <div key={d}>{d}</div> )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4 }}>
            {buildDays().map((d,i)=>{
              const inMonth = d.getMonth()===view.getMonth()
              const selStart = s && isSameDay(d,s)
              const selEnd   = e && isSameDay(d,e)
              const mid = inRange(d) && !selStart && !selEnd
              return (
                <button key={i} type="button" onClick={()=>selectDay(new Date(d))} disabled={!inMonth} className="btn"
                  style={{ padding:'6px 0', opacity: inMonth?1:.35,
                    background: selStart||selEnd ? 'linear-gradient(135deg, #34d399, #22d3ee)' : (mid ? 'rgba(34,211,238,.15)' : 'transparent'),
                    border: selStart||selEnd ? '1px solid rgba(34,211,238,.45)' : '1px solid rgba(255,255,255,.08)',
                    color: selStart||selEnd ? '#0b1220' : 'inherit', borderRadius: selStart||selEnd ? 10 : 8 }}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, gap:6 }}>
            <button type="button" className="btn" onMouseDown={(e)=>e.stopPropagation()} onClick={clearSel}>Temizle</button>
            <div style={{display:'flex', gap:6}}>
              <button type="button" className="btn" onMouseDown={(e)=>e.stopPropagation()} onClick={quickToday}>Bugün</button>
              <button type="button" className="btn" onMouseDown={(e)=>e.stopPropagation()} onClick={closePopup}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ==== GuestPopup (misafir + cari, küçültülmüş/kapalı arkaplan) ==== */
function GuestPopup({ open, onClose, reservation, onChanged }) {
  const [tab, setTab] = useState('summary') // summary | guests | ledger

  // rezervasyon sahibi
  const [owner, setOwner] = useState({
    fullName: reservation?.guest?.name || reservation?.guestName || '',
    nationality: 'TC', // 'TC' | 'FOREIGN'
    tckn: '', passportNo: '', birthDate: '', country: ''
  })
  // birlikte kalanlar
  const [companions, setCompanions] = useState([])

  // cari
  const [txnCat, setTxnCat] = useState('Mini Bar')
  const [txnAmount, setTxnAmount] = useState('')
  const [txnCcy, setTxnCcy] = useState('TRY')
  const [txns, setTxns] = useState([])

  // totals
  const tot = Number(reservation?.totalPrice || 0)
  const dep = Number(reservation?.depositAmount || 0)
  const baseBal = Math.max(0, tot - dep)
  const nights = nightsBetween(reservation?.checkIn, reservation?.checkOut)

  // cari toplam (sadece harcamalar)
  const txnExpenseTotal = useMemo(() => {
    return txns.filter(t => (t.type || 'expense') !== 'income')
               .reduce((a,b)=> a + Number(b.amount || 0), 0)
  }, [txns])

  // arkaplan scroll kilidi
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // var olan cari ve misafirleri çekmeyi dene (müsaitse)
  useEffect(() => {
    if (!open || !reservation?._id) return
    ;(async () => {
      try {
        const { data } = await api.get(`/finance/transactions?reservation=${reservation._id}`)
        const list = Array.isArray(data) ? data : (data.items || data.data || [])
        setTxns(list)
      } catch {}
      try {
        const { data } = await api.get(`/reservations/${reservation._id}/guests`)
        if (data?.owner) setOwner(o => ({...o, ...data.owner}))
        if (Array.isArray(data?.companions)) setCompanions(data.companions)
      } catch {}
    })()
  }, [open, reservation?._id])

  const addCompanion = () =>
    setCompanions(xs => [...xs, { fullName:'', nationality:'TC', tckn:'', passportNo:'', birthDate:'', country:'' }])
  const setComp = (i, patch) => setCompanions(xs => xs.map((x,idx)=> idx===i ? ({...x, ...patch}) : x))
  const removeComp = (i) => setCompanions(xs => xs.filter((_,idx)=>idx!==i))

  const saveGuests = async () => {
    try {
      await api.post(`/reservations/${reservation._id}/guests`, { owner, companions })
      onChanged?.()
      alert('Misafir bilgileri kaydedildi.')
      setTab('summary')
    } catch {
      alert('Misafir bilgileri kaydedilemedi.')
    }
  }

  const addTxn = async () => {
    if (!txnAmount) return
    try {
      await api.post('/finance/transactions', {
        reservation: reservation._id,
        hotel: reservation.hotel?._id || reservation.hotel,
        type: 'expense',                    // tür alanı kaldırıldı → daima gider
        amount: Number(txnAmount),
        currency: txnCcy,
        category: txnCat,
        description: `Popup üzerinden eklendi (${txnCat})`,
        date: new Date().toISOString()
      })
      setTxnAmount('')
      const { data } = await api.get(`/finance/transactions?reservation=${reservation._id}`)
      const list = Array.isArray(data) ? data : (data.items || data.data || [])
      setTxns(list)
      onChanged?.()
    } catch {
      alert('Cari işlem kaydedilemedi.')
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:2000,
        background:'rgba(7,10,18,.92)'  // opak → arka metin görünmez
      }}
      onClick={onClose}
    >
      <div
        className="card"
        onClick={(e)=>e.stopPropagation()}
        style={{
          position:'relative',
          margin:'6% auto',
          maxWidth:880,
          width:'92%',
          maxHeight:'82vh',
          overflow:'auto',
          padding:16,
          border:'1px solid rgba(255,255,255,.08)'
        }}
      >
        {/* başlık/aksiyon */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <div className="label">Rezervasyon Özeti</div>
          <div style={{display:'flex', gap:8}}>
            <button className={`btn ${tab==='guests'?'primary':''}`} onClick={()=>setTab('guests')}>Misafir Ekle</button>
            <button className={`btn ${tab==='ledger'?'primary':''}`} onClick={()=>setTab('ledger')}>Cari Hesap Ekle</button>
            <button className="btn" onClick={onClose}>Kapat</button>
          </div>
        </div>

        {/* özet 2 sütun */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div>
            <div className="muted">Ad Soyad</div>
            <div style={{fontSize:18}}>{reservation?.guest?.name || reservation?.guestName || '—'}</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <div className="muted">Rezervasyon Toplamı</div>
            <div style={{fontSize:18}}>{formatTRY(tot)}</div>
          </div>

          <div>
            <div className="muted">Telefon</div>
            <div>{reservation?.guest?.phone || '—'}</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <div className="muted">Alınan Kapora</div>
            <div>{formatTRY(dep)}</div>
          </div>

          <div>
            <div className="muted">E-posta</div>
            <div>{reservation?.guest?.email || '—'}</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <div className="muted">Kalan</div>
            <div>{formatTRY(baseBal)}</div>
          </div>

          <div>
            <div className="muted">Giriş Tarihi</div>
            <div>{fmtDate(reservation?.checkIn)}</div>
          </div>
          <div>
            <div className="muted">Cari Bakiye (harcama toplamı)</div>
            <div>{formatTRY(txnExpenseTotal)}</div>
          </div>

          <div>
            <div className="muted">Çıkış Tarihi</div>
            <div>{fmtDate(reservation?.checkOut)}</div>
          </div>
          <div>
            <div className="muted">Gece Sayısı</div>
            <div>{nights || 0}</div>
          </div>
        </div>

        {tab==='summary' && <div className="muted">İşlem yapmak için üstteki butonları kullanabilirsin.</div>}

        {/* MISAFIR EKLE */}
        {tab==='guests' && (
          <div style={{display:'grid', gap:12}}>
            <div className="label">Rezervasyon Sahibi</div>
            <div className="card" style={{padding:12}}>
              <div style={{display:'grid', gridTemplateColumns:'1.2fr .8fr', gap:10}}>
                <label className="field">
                  <span className="field-label">Ad Soyad</span>
                  <input className="input" value={owner.fullName} onChange={e=>setOwner(o=>({...o,fullName:e.target.value}))}/>
                </label>
                <label className="field">
                  <span className="field-label">Uyruk</span>
                  <select className="select" value={owner.nationality} onChange={e=>setOwner(o=>({...o,nationality:e.target.value}))}>
                    <option value="TC">TC</option>
                    <option value="FOREIGN">Yabancı</option>
                  </select>
                </label>

                {owner.nationality==='TC' ? (
                  <label className="field">
                    <span className="field-label">TCKN</span>
                    <input className="input" value={owner.tckn} onChange={e=>setOwner(o=>({...o,tckn:e.target.value}))}/>
                  </label>
                ) : (
                  <>
                    <label className="field">
                      <span className="field-label">Pasaport No</span>
                      <input className="input" value={owner.passportNo} onChange={e=>setOwner(o=>({...o,passportNo:e.target.value}))}/>
                    </label>
                    <label className="field">
                      <span className="field-label">Doğum Tarihi</span>
                      <input className="input" type="date" value={owner.birthDate} onChange={e=>setOwner(o=>({...o,birthDate:e.target.value}))}/>
                    </label>
                    <label className="field">
                      <span className="field-label">Ülke</span>
                      <input className="input" value={owner.country} onChange={e=>setOwner(o=>({...o,country:e.target.value}))}/>
                    </label>
                  </>
                )}
              </div>
            </div>

            <div className="label" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>Yanında Konaklayanlar</span>
              <button className="btn" onClick={addCompanion}>+ Ekle</button>
            </div>

            {companions.map((g, i)=>(
              <div key={i} className="card" style={{padding:12}}>
                <div style={{display:'grid', gridTemplateColumns:'1.2fr .6fr .6fr .6fr .6fr', gap:10, alignItems:'end'}}>
                  <label className="field">
                    <span className="field-label">Ad Soyad</span>
                    <input className="input" value={g.fullName} onChange={e=>setComp(i,{fullName:e.target.value})}/>
                  </label>
                  <label className="field">
                    <span className="field-label">Uyruk</span>
                    <select className="select" value={g.nationality} onChange={e=>setComp(i,{nationality:e.target.value})}>
                      <option value="TC">TC</option>
                      <option value="FOREIGN">Yabancı</option>
                    </select>
                  </label>

                  {g.nationality==='TC' ? (
                    <>
                      <label className="field">
                        <span className="field-label">TCKN</span>
                        <input className="input" value={g.tckn} onChange={e=>setComp(i,{tckn:e.target.value})}/>
                      </label>
                      <div></div><div></div>
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span className="field-label">Pasaport No</span>
                        <input className="input" value={g.passportNo} onChange={e=>setComp(i,{passportNo:e.target.value})}/>
                      </label>
                      <label className="field">
                        <span className="field-label">Doğum Tarihi</span>
                        <input className="input" type="date" value={g.birthDate} onChange={e=>setComp(i,{birthDate:e.target.value})}/>
                      </label>
                      <label className="field">
                        <span className="field-label">Ülke</span>
                        <input className="input" value={g.country} onChange={e=>setComp(i,{country:e.target.value})}/>
                      </label>
                    </>
                  )}

                  <div style={{display:'flex', justifyContent:'flex-end'}}>
                    <button className="btn" onClick={()=>removeComp(i)}>Sil</button>
                  </div>
                </div>
              </div>
            ))}

            {/* eklenen misafirlerin özeti */}
            <div className="card" style={{padding:10}}>
              <div className="label" style={{marginBottom:6}}>Eklenen Misafirler</div>
              {companions.length === 0 ? (
                <div className="muted">Henüz ekli misafir yok.</div>
              ) : (
                <div style={{display:'grid', gap:6}}>
                  {companions.map((g,i)=>(
                    <div key={`sum-${i}`} style={{display:'grid', gridTemplateColumns:'1fr 140px 160px', gap:8,
                      borderBottom:'1px solid rgba(255,255,255,.06)', paddingBottom:6}}>
                      <div>{g.fullName || '—'}</div>
                      <div className="muted">{g.nationality==='TC' ? 'TC' : 'Yabancı'}</div>
                      <div className="muted">
                        {g.nationality==='TC'
                          ? (g.tckn || '—')
                          : [g.passportNo || '—', g.birthDate || '—', g.country || '—'].filter(Boolean).join(' • ')
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button className="btn" onClick={onClose}>Kapat</button>
              <button className="btn primary" onClick={saveGuests}>Kaydet</button>
            </div>
          </div>
        )}

        {/* CARI */}
        {tab==='ledger' && (
          <div style={{display:'grid', gap:12}}>
            <div className="label">Cari Hesap</div>

            {/* üst bilgi */}
            <div className="muted">
              <div><b>{reservation?.guest?.name || reservation?.guestName || '—'}</b> • Oda: {reservation?.roomType?.name || '—'} • {fmtDate(reservation?.checkIn)} → {fmtDate(reservation?.checkOut)}</div>
            </div>

            {/* ekleme formu (Tür alanı kaldırıldı) */}
            <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr .8fr auto', gap:8, alignItems:'end'}}>
              <label className="field">
                <span className="field-label">Harcama Tipi</span>
                <input className="input" value={txnCat} onChange={e=>setTxnCat(e.target.value)} placeholder="Örn. Mini Bar" />
              </label>
              <label className="field">
                <span className="field-label">Tutar</span>
                <input className="input" type="number" min="0" value={txnAmount} onChange={e=>setTxnAmount(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Döviz</span>
                <select className="select" value={txnCcy} onChange={e=>setTxnCcy(e.target.value)}>
                  <option>TRY</option><option>USD</option><option>EUR</option><option>GBP</option>
                </select>
              </label>
              <button className="btn primary" onClick={addTxn}>Ekle</button>
            </div>

            {/* liste */}
            <div className="card" style={{padding:10}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <div className="label" style={{margin:0}}>İşlemler</div>
                <div className="muted">Cari Bakiye (harcama toplamı): <b>{formatTRY(txnExpenseTotal)}</b></div>
              </div>
              {txns.length===0 ? (
                <div className="muted">Henüz işlem yok.</div>
              ) : (
                <div style={{display:'grid', gap:8}}>
                  {txns.map(t=>(
                    <div key={t._id || (t.date+t.amount)} style={{display:'grid', gridTemplateColumns:'160px 1fr 120px 120px', gap:8, alignItems:'center', borderBottom:'1px solid rgba(255,255,255,.06)', paddingBottom:6}}>
                      <div className="muted">{new Date(t.date||Date.now()).toLocaleString('tr-TR')}</div>
                      <div>{t.category || '-'}</div>
                      <div>{(t.type||'expense')==='income' ? 'Tahsilat' : 'Gider'}</div>
                      <div style={{textAlign:'right'}}>{Number(t.amount||0).toLocaleString('tr-TR')} {t.currency||'TRY'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button className="btn" onClick={onClose}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===================== ANA SAYFA ===================== */
export default function Reservations({ forceHotelIdForMaster }) {
  const role = localStorage.getItem('role')
  const isMaster = role === 'MASTER_ADMIN'
  const masterViewing = !!forceHotelIdForMaster

  /* liste state */
  const [items, setItems] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useLocal('resv.page', 1)
  const [pages, setPages] = useState(1)
  const [limit] = useState(10)
  const [loading, setLoading] = useState(false)

  const [filters, setFilters] = useLocal('resv.filters', {
    start: '', end: '', status: '', channel: '', guest: '',
    hotelId: (isMaster && !masterViewing) ? '' : (localStorage.getItem('hotelId') || '')
  })
  const [sort, setSort] = useLocal('resv.sort', { by: 'checkIn', dir: 'desc' })

  const [hotels, setHotels] = useState([])
  const [roomTypes, setRoomTypes] = useState([])

  /* form state */
  const emptyForm = {
    guestId:'', guest:null, guestName:'',
    checkIn:'', checkOut:'', adults:2, children:0, rooms:1,
    roomType:'', channel:'direct', status:'confirmed',
    arrivalTime:'', paymentMethod:'', paymentStatus:'unpaid',
    notes:'', totalPrice:'', depositAmount:''
  }
  const [form, setForm] = useState(emptyForm)

  /* akıllı asistan */
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  /* drawer & seçim */
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editModel, setEditModel] = useState(null)
  const [selected, setSelected] = useState([])

  /* saved views + filtre toggle */
  const [views, setViews] = useLocal('resv.views', [])
  const [filtersOpen, setFiltersOpen] = useLocal('resv.filtersOpen', false)
  const activeFilterCount = useMemo(() => {
    let c = 0
    if (filters.start) c++
    if (filters.end) c++
    if (filters.status) c++
    if (filters.channel) c++
    if (filters.guest) c++
    if (isMaster && !masterViewing && filters.hotelId) c++
    return c
  }, [filters, isMaster, masterViewing])

  /* oluşturma paneli açık/kapalı */
  const [createOpen, setCreateOpen] = useLocal('resv.createOpen', false)

  /* popup state */
  const [guestPopupOpen, setGuestPopupOpen] = useState(false)
  const [guestPopupRes, setGuestPopupRes]   = useState(null)

  /* hesaplamalar */
  const nights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0
  const rooms = Number(form.rooms || 1)
  const totalAmount = Number(form.totalPrice || 0)
  const deposit = Number(form.depositAmount || 0)
  const balance = Math.max(0, totalAmount - deposit)
  const adr = nights > 0 ? totalAmount / (nights * (rooms || 1)) : 0
  const invalidDates = form.checkIn && form.checkOut && toLocalDate(form.checkOut) <= toLocalDate(form.checkIn)
  const overDeposit  = deposit > totalAmount

  /* master için oteller + oda tipleri */
  useEffect(() => {
    if (isMaster && !masterViewing) api.get('/hotels').then(res => setHotels(res.data))
    api.get('/rooms/types').then(res => setRoomTypes(res.data))
  }, [isMaster, masterViewing])

  /* listeyi getir */
  const buildQuery = () => {
    const p = new URLSearchParams()
    p.set('page', page); p.set('limit', limit)
    const startOk = !!filters.start
    const endOk = !!filters.end && (!filters.start || toLocalDate(filters.end) >= toLocalDate(filters.start))
    if (startOk) p.set('start', filters.start)
    if (endOk) p.set('end', filters.end)
    if (filters.status) p.set('status', filters.status)
    if (filters.channel) p.set('channel', filters.channel)
    if (filters.guest) p.set('guest', filters.guest)
    if (masterViewing) p.set('hotelId', forceHotelIdForMaster)
    else if (isMaster && filters.hotelId) p.set('hotelId', filters.hotelId)
    return p.toString()
  }

  const loadingListRef = useRef(false)
  const load = async () => {
    if (loadingListRef.current) return
    loadingListRef.current = true
    try {
      setLoading(true)
      const qs = buildQuery()
      const { data } = await api.get(`/reservations?${qs}`)
      const sorted = [...data.items].sort((a,b) => {
        const getV = (k, v) =>
          (k==='checkIn'||k==='checkOut') ? new Date(v).getTime()
          : (typeof v === 'string' ? v.toLowerCase() : Number(v||0))
        const fa = getV(sort.by, a[sort.by]); const fb = getV(sort.by, b[sort.by])
        return sort.dir === 'asc' ? (fa - fb) : (fb - fa)
      })
      setItems(sorted); setTotalCount(data.total); setPages(data.pages)
      setSelected([])
    } finally {
      setLoading(false)
      loadingListRef.current = false
    }
  }
  useEffect(() => { load() }, [page, sort.by, sort.dir]) // eslint-disable-line

  /* filtreler */
  const debounce = useRef(null)
  const onFilterSubmit = async (e) => { e.preventDefault(); setPage(1); await load() }
  const onFilterChange = (fn) => {
    setFilters(f => { const next = fn(f); return next })
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(()=> { setPage(1); load() }, 450)
  }
  const quick = {
    arrivals:   () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO(), status:'', channel:'', guest:''})),
    departures: () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO()})),
    inhouse:    () => onFilterChange(f => ({...f, start: todayISO(), end: todayISO(), status:'confirmed'})),
  }
  const resetFilters = () => {
    setFilters({
      start: '', end: '', status: '', channel: '', guest: '',
      hotelId: (isMaster && !masterViewing) ? '' : (localStorage.getItem('hotelId') || '')
    })
    setPage(1)
    load()
  }

  /* oluştur */
  const create = async (e) => {
    e.preventDefault()
    if (invalidDates) { alert('Çıkış tarihi, giriş tarihinden sonra olmalı.'); return }
    if (overDeposit)  { alert('Kapora toplam tutarı aşamaz.'); return }

    const payload = {
      guestId: form.guestId || undefined,
      guest:   form.guest   || undefined,
      guestName: form.guest?.name || form.guestName || '',
      checkIn: form.checkIn, checkOut: form.checkOut,
      adults: Number(form.adults || 0),
      children: Number(form.children || 0),
      rooms: Number(form.rooms || 1),
      roomType: form.roomType,
      channel: form.channel, status: form.status,
      arrivalTime: form.arrivalTime || '',
      paymentMethod: form.paymentMethod || '',
      paymentStatus: form.paymentStatus || 'unpaid',
      notes: form.notes || '',
      totalPrice: Number(form.totalPrice || 0),
      depositAmount: Number(form.depositAmount || 0),
      ...(isMaster && masterViewing ? { hotelId: forceHotelIdForMaster } : {}),
    }

    try {
      await api.post('/reservations', payload)
      setForm(emptyForm)
      setFilters(f => ({ ...f, start: payload.checkIn, end: payload.checkOut, status:'', channel:'', guest:'' }))
      setPage(1)
      await load()
      alert('Rezervasyon eklendi.')
    } catch (err) {
      showApiError(err, 'Rezervasyon kaydedilemedi')
    }
  }

  /* durum değiştir */
  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/reservations/${id}/status`, { status })
      await load()
    } catch (err) {
      showApiError(err, 'Durum güncellenemedi')
    }
  }

  /* drawer aç / kaydet */
  const openDrawer = (row) => {
    setEditModel({
      ...row,
      checkIn: row.checkIn?.slice(0,10),
      checkOut: row.checkOut?.slice(0,10),
      totalPrice: row.totalPrice ?? '',
      depositAmount: row.depositAmount ?? '',
    })
    setDrawerOpen(true)
  }
  const saveEdit = async (e) => {
    e.preventDefault()
    const endBeforeStart = toLocalDate(editModel.checkOut) <= toLocalDate(editModel.checkIn)
    if (endBeforeStart) { alert('Çıkış tarihi, girişten sonra olmalı.'); return }
    if (Number(editModel.depositAmount||0) > Number(editModel.totalPrice||0)) { alert('Kapora toplamı aşamaz.'); return }

    const id = editModel._id
    const payload = {
      guestName: editModel.guest?.name || editModel.guestName,
      checkIn: editModel.checkIn, checkOut: editModel.checkOut,
      adults: Number(editModel.adults || 0),
      children: Number(editModel.children || 0),
      totalPrice: Number(editModel.totalPrice || 0),
      depositAmount: Number(editModel.depositAmount || 0),
      channel: editModel.channel, status: editModel.status,
      roomType: editModel.roomType?._id || editModel.roomType || '',
      rooms: Number(editModel.rooms || 1),
      arrivalTime: editModel.arrivalTime || '',
      paymentMethod: editModel.paymentMethod || '',
      paymentStatus: editModel.paymentStatus || 'unpaid',
      notes: editModel.notes || ''
    }
    try {
      await api.put(`/reservations/${id}`, payload)
      setDrawerOpen(false)
      await load()
      alert('Rezervasyon güncellendi.')
    } catch (err) {
      showApiError(err, 'Rezervasyon güncellenemedi')
    }
  }

  /* sil */
  const remove = async (id) => {
    if (!window.confirm('Bu rezervasyonu silmek istediğine emin misin?')) return
    try {
      await api.delete(`/reservations/${id}`)
      await load()
    } catch (err) {
      showApiError(err, 'Silinemedi')
    }
  }

  /* toplu iptal / csv / ics */
  const bulkCancel = async () => {
    if (!selected.length) return
    if (!window.confirm(`${selected.length} rezervasyon iptal edilsin mi?`)) return
    try {
      await Promise.all(selected.map(id => api.patch(`/reservations/${id}/status`, { status:'cancelled' })))
      await load()
    } catch (err) {
      showApiError(err, 'Toplu iptal başarısız')
    }
  }

  const exportCsv = async () => {
    const qs = buildQuery(); let all = []; let p=1; const l=500
    while (true) {
      const res = await api.get(`/reservations?${qs}&page=${p}&limit=${l}`)
      all = all.concat(res.data.items)
      if (all.length >= res.data.total) break; p++
    }
    const rows = [
      ['Guest','Phone','Email','CheckIn','CheckOut','Nights','RoomType','Rooms','Channel','Status','Total','Deposit','Balance'],
      ...all.map(r=>{
        const dep = Number(r.depositAmount || 0)
        const tot = Number(r.totalPrice || 0)
        const bal = Math.max(0, tot - dep)
        return [
          r.guest?.name || r.guestName, r.guest?.phone || '', r.guest?.email || '',
          toLocalYMD(new Date(r.checkIn)), toLocalYMD(new Date(r.checkOut)), nightsBetween(r.checkIn,r.checkOut),
          r.roomType ? `${r.roomType.name} (${r.roomType.code})` : '',
          r.rooms ?? 1, r.channel, r.status,
          String(tot).replace('.',','), String(dep).replace('.',','), String(bal).replace('.',',')
        ]
      })
    ]
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download=`reservations_${toLocalYMD(new Date())}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const exportIcsSelected = () => {
    if (!selected.length) return
    const sel = items.filter(i=>selected.includes(i._id))
    const pads = n => String(n).padStart(2,'0')
    const dt = d => `${d.getUTCFullYear()}${pads(d.getUTCMonth()+1)}${pads(d.getUTCDate())}T${pads(d.getUTCHours())}${pads(d.getUTCMinutes())}00Z`
    const toICS = (r) => {
      const ci = new Date(r.checkIn); ci.setHours(14,0,0,0)
      const co = new Date(r.checkOut); co.setHours(12,0,0,0)
      const dep = Number(r.depositAmount || 0)
      const tot = Number(r.totalPrice || 0)
      const bal = Math.max(0, tot - dep)
      return [
        'BEGIN:VEVENT',
        `UID:${r._id}@hms.local`,
        `DTSTAMP:${dt(new Date())}`,
        `DTSTART:${dt(ci)}`,
        `DTEND:${dt(co)}`,
        `SUMMARY:${(r.guest?.name || r.guestName || 'Guest')} - ${r.roomType ? r.roomType.name : ''}`,
        `DESCRIPTION:Kanal ${r.channel} • Durum ${r.status} • Oda ${r.rooms} • Toplam ${tot} TL • Kapora ${dep} TL • Kalan ${bal} TL`,
        'END:VEVENT'
      ].join('\n')
    }
    const cal = ['BEGIN:VCALENDAR','VERSION:2.0', ...sel.map(toICS),'END:VCALENDAR'].join('\n')
    const blob = new Blob([cal], {type:'text/calendar'})
    const url = URL.createObjectURL(blob); const a=document.createElement('a')
    a.href=url; a.download='reservations_selected.ics'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  /* kolonlar + sıralama */
  const headers = useMemo(()=>([
    { key:'select',      label:'' },
    { key:'guestName',   label:'Misafir' },
    { key:'checkIn',     label:'Giriş' },
    { key:'checkOut',    label:'Çıkış' },
    { key:'roomType',    label:'Oda Tipi' },
    { key:'channel',     label:'Kanal' },
    { key:'status',      label:'Durum' },
    { key:'rooms',       label:'Oda' },
    { key:'totalPrice',  label:'Toplam' },
    { key:'deposit',     label:'Kapora' },
    { key:'balance',     label:'Kalan' },
    { key:'timeline',    label:'Takvim' },
    { key:'actions',     label:'Aksiyon' },
  ]),[])
  const onSort = (key) => {
    if (['select','actions','timeline','roomType','deposit','balance'].includes(key)) return
    setSort(s => s.by === key ? ({by:key,dir:s.dir==='asc'?'desc':'asc'}) : ({by:key,dir:'asc'}))
  }

  /* Asistan (availability + öneri) */
  const canQuote = form.roomType && form.checkIn && form.checkOut
  useEffect(() => {
    let ignore = false
    const run = async () => {
      if (!canQuote) { setQuote(null); return }
      setQuoteLoading(true)
      try {
        const params = new URLSearchParams({
          roomType: form.roomType,
          start: form.checkIn,
          end: form.checkOut,
          rooms: String(form.rooms || 1)
        })
        const { data } = await api.get(`/rooms/availability/quote?${params.toString()}`)
        if (!ignore) setQuote(data)
        if (!ignore && (!form.totalPrice || Number(form.totalPrice)===0)) {
          setForm(f=>({...f,totalPrice:data.suggestedTotalPrice||''}))
        }
      } finally { if (!ignore) setQuoteLoading(false) }
    }
    run()
    return ()=>{ ignore=true }
  }, [form.roomType, form.checkIn, form.checkOut, form.rooms]) // eslint-disable-line
  const fillSuggested = () => { if (quote?.suggestedTotalPrice) setForm(f=>({...f,totalPrice:quote.suggestedTotalPrice})) }

  /* seçim */
  const toggleAll = (e) => { setSelected(e.target.checked ? items.map(i=>i._id) : []) }
  const toggleOne = (id) => { setSelected(xs => xs.includes(id) ? xs.filter(x=>x!==id) : [...xs,id]) }

  /* views */
  const saveView = () => {
    const name = prompt('Görünüme bir ad verin:')
    if (!name) return
    setViews(v => [...v, { name, filters, sort }])
  }
  const loadView = (v) => {
    setFilters(v.filters); setSort(v.sort); setPage(1); load()
  }

  return (
    <div>
      <Header title="Rezervasyonlar" subtitle="Akıllı asistan • CRM • Timeline • Toplu işlem • CSV/ICS" />

      {/* top çubuk */}
      <div className="card" style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <button
          className="btn"
          onClick={()=>setCreateOpen(o=>!o)}
          aria-expanded={createOpen}
          style={{background: 'linear-gradient(135deg, #34d399 0%, #22d3ee 100%)', border: 'none', color:'#0b1220', fontWeight:600}}
        >
          {createOpen ? 'Yeni Rezervasyon’u Gizle' : 'Yeni Rezervasyon Ekle'}
        </button>

        <button className="btn" onClick={quick.arrivals}>Bugün Giriş</button>
        <button className="btn" onClick={quick.departures}>Bugün Çıkış</button>
        <button className="btn" onClick={quick.inhouse}>İçeride (In-house)</button>
        <button
          className="btn"
          style={{background: 'linear-gradient(135deg, #34d399 0%, #22d3ee 100%)', border: 'none', color:'#0b1220', fontWeight:600}}
          onClick={()=>setFiltersOpen(o=>!o)}
        >
          {filtersOpen ? 'Filtreleri Gizle' : ('Filtreler' + (activeFilterCount ? ' ('+activeFilterCount+')' : ''))}
        </button>
        <button className="btn" onClick={resetFilters}>Filtreleri Sıfırla</button>

        <div style={{marginLeft:'auto', display:'flex', gap:8}}>
          {selected.length>0 && <button className="btn" onClick={bulkCancel}>Seçilileri İptal ({selected.length})</button>}
          {selected.length>0 && <button className="btn" onClick={exportIcsSelected}>ICS (seçili)</button>}
          <button className="btn" onClick={exportCsv}>CSV (filtre)</button>
          <div className="dropdown">
            <button className="btn">Görünümler</button>
            <div className="dropdown-menu">
              {views.map((v,i)=>(<div key={i} className="dropdown-item" onClick={()=>loadView(v)}>{v.name}</div>))}
              <div className="dropdown-item" onClick={saveView}>+ Görünüm Kaydet</div>
            </div>
          </div>
        </div>
      </div>

      {/* filtreler */}
      <div style={{overflow:'hidden', transition:'max-height 0.25s ease', maxHeight: filtersOpen ? 1000 : 0, marginBottom: filtersOpen ? 16 : 0}}>
        <div className="card">
          <form className="form-grid" onSubmit={onFilterSubmit}>
            <label className="field">
              <span className="field-label">Başlangıç</span>
              <input className="input" type="date" value={filters.start} onChange={e=>onFilterChange(f=>({...f,start:e.target.value}))}/>
            </label>
            <label className="field">
              <span className="field-label">Bitiş</span>
              <input className="input" type="date" value={filters.end} onChange={e=>onFilterChange(f=>({...f,end:e.target.value}))}/>
            </label>
            <label className="field">
              <span className="field-label">Durum</span>
              <select className="select" value={filters.status} onChange={e=>onFilterChange(f=>({...f,status:e.target.value}))}>
                <option value="">Hepsi</option>
                {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Kanal</span>
              <select className="select" value={filters.channel} onChange={e=>onFilterChange(f=>({...f,channel:e.target.value}))}>
                <option value="">Hepsi</option>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field" style={{gridColumn:isMaster && !masterViewing ? '1 / span 2' : 'auto'}}>
              <span className="field-label">Misafir / Telefon / E-posta</span>
              <input className="input" placeholder="Ara…" value={filters.guest} onChange={e=>onFilterChange(f=>({...f,guest:e.target.value}))}/>
            </label>
            {(isMaster && !masterViewing) && (
              <label className="field">
                <span className="field-label">Otel</span>
                <select className="select" value={filters.hotelId} onChange={e=>onFilterChange(f=>({...f,hotelId:e.target.value}))}>
                  <option value="">Hepsi</option>
                  {hotels.map(h => <option key={h._id} value={h._id}>{h.name} ({h.code})</option>)}
                </select>
              </label>
            )}
            <div style={{display:'flex',alignItems:'end'}}>
              <button className="btn">Filtrele</button>
            </div>
          </form>
        </div>
      </div>

      {/* form + asistan + özet */}
      {createOpen && (
        <div style={{display:'grid', gridTemplateColumns:'1.2fr .8fr', gap:16, alignItems:'start', marginBottom:16}}>
          {/* yeni rezervasyon */}
          {(!isMaster || masterViewing) && (
            <div className="card">
              <div className="label" style={{marginBottom:8}}>Yeni Rezervasyon</div>
              <form className="form-grid" onSubmit={create}>
                <label className="field" style={{gridColumn:'1 / -1'}}>
                  <span className="field-label">Misafir</span>
                  <GuestPicker
                    value={form.guest}
                    onChange={(g)=> setForm(f => ({
                      ...f,
                      guestId: g.guestId || '',
                      guest: g.guest || (g.guestId ? null : { name: g.name, email: g.email, phone: g.phone }),
                      guestName: g.name
                    }))}
                  />
                </label>

                <label className="field">
                  <span className="field-label">Telefon</span>
                  <input className="input" placeholder="+90…" value={form.guest?.phone || ''} onChange={e=>setForm(f=>({...f, guest:{...(f.guest||{}), phone:e.target.value}}))}/>
                </label>
                <label className="field">
                  <span className="field-label">E-posta</span>
                  <input className="input" placeholder="ornek@otel.com" value={form.guest?.email || ''} onChange={e=>setForm(f=>({...f, guest:{...(f.guest||{}), email:e.target.value}}))}/>
                </label>

                <label className="field" style={{gridColumn:'1 / -1'}}>
                  <span className="field-label">Tarih Aralığı</span>
                  <DateRangePicker
                    start={form.checkIn}
                    end={form.checkOut}
                    onChange={(s,e)=> setForm(f => ({...f, checkIn:s, checkOut:e}))}
                  />
                </label>

                <label className="field">
                  <span className="field-label">Oda Tipi</span>
                  <select className="select" value={form.roomType} onChange={e=>setForm({...form,roomType:e.target.value})} required>
                    <option value="">Seçiniz</option>
                    {roomTypes.map(rt => <option key={rt._id} value={rt._id}>{rt.name} ({rt.code})</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Oda Adedi</span>
                  <input className="input" type="number" min="1" value={form.rooms} onChange={e=>setForm({...form,rooms:e.target.value})}/>
                </label>
                <label className="field">
                  <span className="field-label">Yetişkin</span>
                  <input className="input" type="number" min="0" value={form.adults} onChange={e=>setForm({...form,adults:e.target.value})}/>
                </label>
                <label className="field">
                  <span className="field-label">Çocuk</span>
                  <input className="input" type="number" min="0" value={form.children} onChange={e=>setForm({...form,children:e.target.value})}/>
                </label>

                <label className="field">
                  <span className="field-label">Kanal</span>
                  <select className="select" value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}>
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Durum</span>
                  <select className="select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                    {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Varış Saati</span>
                  <input className="input" type="time" value={form.arrivalTime} onChange={e=>setForm({...form,arrivalTime:e.target.value})}/>
                </label>

                <label className="field">
                  <span className="field-label">Ödeme Yöntemi</span>
                  <select className="select" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}>
                    <option value="">Seçiniz</option>
                    <option value="cash">Nakit</option>
                    <option value="pos">POS</option>
                    <option value="transfer">Havale/EFT</option>
                    <option value="online">Online</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Ödeme Durumu</span>
                  <select className="select" value={form.paymentStatus} onChange={e=>setForm({...form,paymentStatus:e.target.value})}>
                    <option value="unpaid">Ödenmemiş</option>
                    <option value="partial">Kısmi</option>
                    <option value="paid">Ödendi</option>
                  </select>
                </label>
                <label className="field" style={{gridColumn:'1 / -1'}}>
                  <span className="field-label">Notlar</span>
                  <textarea className="input" rows={2} placeholder="(opsiyonel)" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
                </label>

                <label className="field">
                  <span className="field-label">Toplam Tutar</span>
                  <input className="input" type="number" min="0" value={form.totalPrice} onChange={e=>setForm({...form,totalPrice:e.target.value})}/>
                </label>
                <label className="field">
                  <span className="field-label">Kapora</span>
                  <input className="input" type="number" min="0" value={form.depositAmount} onChange={e=>setForm({...form,depositAmount:e.target.value})}/>
                </label>
                <label className="field">
                  <span className="field-label">Kalan</span>
                  <input className="input" readOnly value={balance}/>
                </label>

                {(invalidDates || overDeposit) && (
                  <div className="card" style={{gridColumn:'1 / -1', padding:'10px', border:'1px solid rgba(239,68,68,.35)', background:'rgba(239,68,68,.06)'}}>
                    {invalidDates && <div>⚠️ Çıkış tarihi, girişten sonra olmalı.</div>}
                    {overDeposit  && <div>⚠️ Kapora toplam tutarı aşamaz.</div>}
                  </div>
                )}

                <div style={{display:'flex', gap:8}}>
                  <button className="btn primary" disabled={invalidDates || overDeposit}>Ekle</button>
                </div>
              </form>
            </div>
          )}

          {/* sağ panel: asistan + özet */}
          <div style={{display:'grid', gap:16}}>
            <div className="card" aria-live="polite">
              <div className="label" style={{marginBottom:8}}>Akıllı Asistan</div>
              {!form.roomType || !form.checkIn || !form.checkOut ? (
                <div className="muted">Oda tipi ve tarihleri seçtiğinde kalan allotment ve önerilen fiyat burada görünecek.</div>
              ) : quoteLoading ? (
                <div>Hesaplanıyor…</div>
              ) : quote ? (
                <div style={{display:'grid',gap:8}}>
                  <div>Gece sayısı: <b>{quote.nights}</b></div>
                  <div>Önerilen toplam: <b>{formatTRY(quote.suggestedTotalPrice || 0)}</b>
                    <button className="btn" style={{marginLeft:8}} onClick={fillSuggested}>Fiyatı Doldur</button>
                  </div>
                  <div className="label" style={{marginTop:8}}>Günlük Kalan Allotment</div>
                  <div style={{display:'grid',gap:6, maxHeight:180, overflow:'auto'}}>
                    {quote.remainingPerDay.map((d,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px', borderRadius:8,
                        border:`1px solid ${d.remaining >= (form.rooms||1) ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.35)'}`, background:'rgba(255,255,255,.04)'}}>
                        <span>{fmtDate(d.date)}</span>
                        <span className="muted">Açık {Math.max(0, d.allotment-d.used)} / {d.allotment}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:6}}>Uygunluk: {quote.available ? <b style={{color:'#34d399'}}>Uygun</b> : <b style={{color:'#ef4444'}}>Yetersiz</b>}</div>
                </div>
              ) : <div className="muted">Hesaplanamadı.</div>}
            </div>

            <div className="card">
              <div className="label" style={{marginBottom:8}}>Rezervasyon Özeti</div>
              <div className="muted" style={{fontSize:13, lineHeight:1.7}}>
                <div><b>Ad Soyad:</b> {form.guest?.name || form.guestName || '—'}</div>
                <div><b>Telefon:</b> {form.guest?.phone || '—'}</div>
                <div><b>Giriş:</b> {fmtDate(form.checkIn)} &nbsp; <b>Çıkış:</b> {fmtDate(form.checkOut)} &nbsp; <b>Gece:</b> {nights || 0}</div>
                <div><b>Oda Tipi:</b> {roomTypes.find(r=>r._id===form.roomType)?.name || '—'} ({roomTypes.find(r=>r._id===form.roomType)?.code || '—'})</div>
                <div><b>Oda Adedi:</b> {rooms} &nbsp; <b>Kişi:</b> {Number(form.adults||0)} yetişkin, {Number(form.children||0)} çocuk</div>
                <div><b>Kanal:</b> {form.channel || '—'} &nbsp; <b>Durum:</b> {form.status || '—'}</div>
                <div><b>Toplam:</b> {formatTRY(totalAmount)} &nbsp; <b>Kapora:</b> {formatTRY(deposit)} &nbsp; <b>Kalan:</b> {formatTRY(balance)}</div>
                {nights>0 && rooms>0 && <div><b>ADR:</b> {formatTRY(adr)}</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* liste */}
      <div className="card" style={{ position:'relative', overflowX:'auto' }}>
        {loading && (
          <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.2)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12}}>Yükleniyor…</div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.length===items.length && items.length>0} onChange={toggleAll} /></th>
              {headers.slice(1).map(h=>(
                <th key={h.key} onClick={()=>onSort(h.key)} style={{cursor: (['actions','timeline','roomType','deposit','balance'].includes(h.key))?'default':'pointer'}}>
                  {h.label}{(sort.by===h.key)?(sort.dir==='asc'?' ▲':' ▼'):''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(r=>{
              const dep = Number(r.depositAmount || 0)
              const tot = Number(r.totalPrice || 0)
              const bal = Math.max(0, tot - dep)
              return (
                <tr key={r._id} style={{
                  background: r.status==='cancelled' ? 'rgba(239,68,68,.06)'
                           : r.status==='pending'   ? 'rgba(245,158,11,.06)' : 'transparent'
                }}>
                  <td><input type="checkbox" checked={selected.includes(r._id)} onChange={()=>toggleOne(r._id)} /></td>
                  <td>
                    <a style={{cursor:'pointer', textDecoration:'underline'}}
                       onClick={() => { setGuestPopupRes(r); setGuestPopupOpen(true) }}>
                      {r.guest?.name || r.guestName}
                    </a>
                    <div className="muted" style={{fontSize:11}}>
                      {r.guest?.phone || ''} {r.guest?.email ? ` • ${r.guest.email}` : ''}
                    </div>
                  </td>
                  <td>{fmtDate(r.checkIn)}</td>
                  <td>{fmtDate(r.checkOut)}</td>
                  <td>{r.roomType ? `${r.roomType.name} (${r.roomType.code})` : '—'}</td>
                  <td>{r.channel}</td>
                  <td>
                    {(!isMaster || masterViewing) ? (
                      <select className="select" value={r.status} onChange={e=>changeStatus(r._id, e.target.value)}>
                        {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span>{r.status}</span>}
                  </td>
                  <td>{r.rooms ?? 1}</td>
                  <td>{formatTRY(tot)}</td>
                  <td style={{color: dep>0 ? '#34d399' : undefined}}>{formatTRY(dep)}</td>
                  <td style={{color: bal>0 ? '#f59e0b' : '#34d399'}}>{formatTRY(bal)}</td>
                  <td><MiniTimeline checkIn={r.checkIn} checkOut={r.checkOut} /></td>
                  <td>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button className="btn" onClick={()=>openDrawer(r)}>Düzenle</button>
                      {(!isMaster || masterViewing) && (
                        <>
                          {r.status!=='cancelled' && <button className="btn" onClick={()=>changeStatus(r._id,'cancelled')}>İptal</button>}
                          <button className="btn" onClick={()=>remove(r._id)}>Sil</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {items.length===0 && !loading && <tr><td colSpan={headers.length} className="muted">Kayıt bulunamadı</td></tr>}
          </tbody>
        </table>

        {/* sayfalama */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <div className="muted" style={{fontSize:12}}>Toplam {totalCount} kayıt • Sayfa {page}/{pages}</div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Önceki</button>
            <button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Sonraki</button>
          </div>
        </div>
      </div>

      {/* Drawer: düzenle */}
      <Drawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} title="Rezervasyon Düzenle">
        {editModel && (
          <form className="form-grid" onSubmit={saveEdit}>
            <label className="field">
              <span className="field-label">Misafir</span>
              <input className="input" value={editModel.guest?.name || editModel.guestName || ''} readOnly />
            </label>
            <label className="field"><span className="field-label">Giriş</span>
              <input className="input" type="date" value={editModel.checkIn} onChange={e=>setEditModel(m=>({...m,checkIn:e.target.value}))} required/>
            </label>
            <label className="field"><span className="field-label">Çıkış</span>
              <input className="input" type="date" value={editModel.checkOut} onChange={e=>setEditModel(m=>({...m,checkOut:e.target.value}))} required/>
            </label>
            <label className="field"><span className="field-label">Oda Tipi</span>
              <select className="select" value={editModel.roomType?._id || editModel.roomType || ''} onChange={e=>setEditModel(m=>({...m,roomType:e.target.value}))}>
                <option value="">Seçiniz</option>
                {roomTypes.map(rt => <option key={rt._id} value={rt._id}>{rt.name} ({rt.code})</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Oda Adedi</span>
              <input className="input" type="number" min="1" value={editModel.rooms ?? 1} onChange={e=>setEditModel(m=>({...m,rooms:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kanal</span>
              <select className="select" value={editModel.channel} onChange={e=>setEditModel(m=>({...m,channel:e.target.value}))}>
                {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Durum</span>
              <select className="select" value={editModel.status} onChange={e=>setEditModel(m=>({...m,status:e.target.value}))}>
                {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">Varış Saati</span>
              <input className="input" type="time" value={editModel.arrivalTime || ''} onChange={e=>setEditModel(m=>({...m,arrivalTime:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Ödeme Yöntemi</span>
              <select className="select" value={editModel.paymentMethod || ''} onChange={e=>setEditModel(m=>({...m,paymentMethod:e.target.value}))}>
                <option value="">Seçiniz</option>
                <option value="cash">Nakit</option>
                <option value="pos">POS</option>
                <option value="transfer">Havale/EFT</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label className="field"><span className="field-label">Ödeme Durumu</span>
              <select className="select" value={editModel.paymentStatus || 'unpaid'} onChange={e=>setEditModel(m=>({...m,paymentStatus:e.target.value}))}>
                <option value="unpaid">Ödenmemiş</option>
                <option value="partial">Kısmi</option>
                <option value="paid">Ödendi</option>
              </select>
            </label>
            <label className="field" style={{gridColumn:'1 / -1'}}>
              <span className="field-label">Notlar</span>
              <textarea className="input" rows={3} placeholder="(opsiyonel)" value={editModel.notes || ''} onChange={e=>setEditModel(m=>({...m,notes:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Toplam Tutar</span>
              <input className="input" type="number" min="0" value={editModel.totalPrice} onChange={e=>setEditModel(m=>({...m,totalPrice:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kapora</span>
              <input className="input" type="number" min="0" value={editModel.depositAmount} onChange={e=>setEditModel(m=>({...m,depositAmount:e.target.value}))}/>
            </label>
            <label className="field"><span className="field-label">Kalan</span>
              <input className="input" readOnly value={Math.max(0, Number(editModel.totalPrice||0) - Number(editModel.depositAmount||0))}/>
            </label>

            <button className="btn primary" type="submit">Kaydet</button>
          </form>
        )}
      </Drawer>

      {/* Misafir/Cari popup */}
      <GuestPopup
        open={guestPopupOpen}
        onClose={()=>setGuestPopupOpen(false)}
        reservation={guestPopupRes}
        onChanged={load}
      />
    </div>
  )
}
