import React, { useEffect, useMemo, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'

/* ---------------- Yerel tarih yardımcıları (UTC yok) ---------------- */
const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
}
const parseYMD = (s) => {
  if (!s) return null
  const [y,m,d] = s.split('-').map(Number)
  return new Date(y, m-1, d)
}
const todayYMD = () => ymd(new Date())
const startOfMonthYMD = () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return ymd(d) }
const endOfMonthYMD   = () => { const d = new Date(); d.setMonth(d.getMonth()+1,0); d.setHours(0,0,0,0); return ymd(d) }
const addDaysYMD = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate()+n); return ymd(d) }
const daysBetween = (a,b) => {
  const A = parseYMD(a); const B = parseYMD(b)
  return Math.max(0, Math.round((B - A)/86400000))
}
const nightsBetween = (a,b) => Math.max(1, daysBetween(a,b))
const fmtDate = (d) => new Date(d).toLocaleDateString('tr-TR')
const TRYfmt = (n) => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n||0))
const monthNameTR = (m)=>['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][m]
const firstOf = (y,m)=> ymd(new Date(y, m, 1))
const lastOf  = (y,m)=> ymd(new Date(y, m+1, 0))

/* Güvenli fetchAll — backend bitişi hariç tuttuğu için end'i +1 gün */
async function fetchAllRange(baseUrl, start, end /* dahil göstermek istediğin gün */) {
  const endEx = addDaysYMD(end, 1)
  let out = []; let p = 1; const l = 200
  for(;;) {
    try {
      const { data } = await api.get(`${baseUrl}&start=${start}&end=${endEx}&page=${p}&limit=${l}`)
      out = out.concat(data.items || [])
      if (out.length >= (data.total || out.length)) break
      p++
    } catch { break }
  }
  return out
}

/* ---------------- Donut ---------------- */
function Donut({ slices=[], size=180 }) {
  const total = slices.reduce((a,s)=>a+s.value,0) || 1
  const r = size/2 - 10, cx=size/2, cy=size/2
  let acc = 0
  const colors = ['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#22d3ee','#fb7185','#f59e0b']
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14"/>
      {slices.map((s,idx)=>{
        const angle = (s.value/(total||1))*Math.PI*2
        const x1 = cx + r*Math.cos(acc)
        const y1 = cy + r*Math.sin(acc)
        acc += angle
        const x2 = cx + r*Math.cos(acc)
        const y2 = cy + r*Math.sin(acc)
        const large = angle>Math.PI ? 1 : 0
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
        return <path key={idx} d={path} stroke={colors[idx%colors.length]} strokeWidth="14" fill="none" />
      })}
      <circle cx={cx} cy={cy} r={r-28} fill="rgba(255,255,255,.03)" />
    </svg>
  )
}

/* ---------------- Modal (arka planı daha koyu & blur) ---------------- */
function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div
      style={{
        position:'fixed', inset:0, background:'rgba(2,6,23,.60)', zIndex:9999,
        display:'flex', alignItems:'center', justifyContent:'center', padding:12, backdropFilter:'blur(2px)'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        onClick={(e)=>e.stopPropagation()}
        style={{
          width:'min(740px, 92vw)',
          border:'1px solid rgba(255,255,255,.12)',
          background:'rgba(11,17,28,.96)',
          boxShadow:'0 18px 40px rgba(0,0,0,.55)'
        }}
      >
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontWeight:700}}>{title}</div>
          <button className="btn sm" onClick={onClose}>Kapat</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------------- Aylık Takvim (kompakt & okunaklı) ---------------- */
function MonthCalendar({ year, month, occupiedSet, onPrev, onNext, onDayClick }) {
  const styles = `
    .cal { border:1px solid var(--border,#263046); border-radius:14px; padding:10px; background:rgba(255,255,255,.02) }
    .cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px }
    .cal-title { font-weight:700; letter-spacing:.2px }
    .cal-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:5px; grid-auto-rows:42px }
    .cal-wd { text-align:center; font-size:12px; color:var(--muted,#9aa); font-weight:600 }
    .cell {
      display:flex; align-items:center; justify-content:center; border-radius:9px; user-select:none;
      border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.01);
      font-weight:700; font-size:13px; color:rgba(255,255,255,.92)
    }
    .cell:hover { border-color:#2b3857; background:rgba(255,255,255,.02) }
    .occ { background: rgba(239,68,68,.14); border-color: rgba(239,68,68,.35); color:#ffd0d0; cursor:pointer }
    .today { outline:2px dashed rgba(255,255,255,.18); outline-offset:-4px; }
    .empty { opacity:.0 }
    .legend { display:flex; gap:12px; margin-top:8px; color:var(--muted); font-size:12px }
    .dot { width:11px; height:11px; border-radius:6px; display:inline-block; vertical-align:middle; margin-right:6px; border:1px solid rgba(255,255,255,.14) }
    .dot.occ { background: rgba(239,68,68,.18); border-color: rgba(239,68,68,.35) }
  `
  const first = new Date(year, month, 1)
  const startOffset = ((first.getDay() || 7) + 6) % 7 // Pazartesi = 0
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = []
  for(let i=0;i<startOffset;i++) cells.push(null)
  for(let d=1; d<=daysInMonth; d++) cells.push(new Date(year, month, d))
  const todayStr = todayYMD()

  return (
    <div className="cal">
      <style>{styles}</style>
      <div className="cal-head">
        <button type="button" className="btn sm" onClick={onPrev}>‹</button>
        <div className="cal-title">{monthNameTR(month)} {year}</div>
        <button type="button" className="btn sm" onClick={onNext}>›</button>
      </div>
      <div className="cal-grid">
        {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(h => <div key={h} className="cal-wd">{h}</div>)}
        {cells.map((d,i)=>{
          if (!d) return <div key={`e${i}`} className="cell empty"/>
          const key = ymd(d)
          const occ = occupiedSet.has(key)
          const isToday = key===todayStr
          return (
            <div
              key={key}
              className={`cell ${occ?'occ':''} ${isToday?'today':''}`}
              onClick={() => occ && onDayClick?.(key)}
              title={occ ? 'Dolu gün — tıkla' : ''}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span><span className="dot occ"/> Dolu</span>
        <span><span className="dot"/> Boş</span>
      </div>
    </div>
  )
}

/* ------------------- Dashboard ------------------- */
export default function HotelDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kpi, setKpi] = useState({
    inhouse:0, arrivals:0, departures:0, mtdRevenue:0, mtdADR:0, mtdRevPAR:0, occToday:0, totalRooms:0
  })
  const [channels, setChannels] = useState([])

  // ---- Takvim (ODA TİPİ) ----
  const [roomTypes, setRoomTypes] = useState([])          // [{key,label}]
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [occRange, setOccRange] = useState({ start: startOfMonthYMD(), end: endOfMonthYMD() })
  const [occupiedSet, setOccupiedSet] = useState(new Set())
  const [occRes, setOccRes] = useState([])

  // Görünen ay; navigasyon takvim aralığını da günceller
  const viewStart = parseYMD(occRange.start)
  const [viewYear, setViewYear]   = useState(viewStart.getFullYear())
  const [viewMonth, setViewMonth] = useState(viewStart.getMonth())

  const setMonthView = (y,m) => {
    setViewYear(y); setViewMonth(m)
    setOccRange({ start: firstOf(y,m), end: lastOf(y,m) })
  }
  const prevMonth  = () => { const d = new Date(viewYear, viewMonth-1, 1); setMonthView(d.getFullYear(), d.getMonth()) }
  const nextMonth  = () => { const d = new Date(viewYear, viewMonth+1, 1); setMonthView(d.getFullYear(), d.getMonth()) }

  // popup
  const [popup, setPopup] = useState({ open:false, date:'', items:[] })

  /* KPI + Kanal (yerel hesap) */
  useEffect(()=>{
    let mounted = true
    async function run(){
      setLoading(true); setError('')
      try {
        // Oda tipleri → toplam oda
        let rt = []
        try { rt = (await api.get('/rooms/types')).data || [] } catch { rt = [] }
        const totalRooms = (rt || []).reduce((a,x)=>a+Number(x.totalRooms||0),0)

        const today = todayYMD()
        const mtdStart = startOfMonthYMD()
        const base = '/reservations?status=confirmed'
        const [resMTD, resL30, resToday] = await Promise.all([
          fetchAllRange(base, mtdStart, today),
          fetchAllRange(base, addDaysYMD(today,-30), today),
          fetchAllRange(base, today, today)
        ])

        const inhouse = resToday.reduce((a,r)=>{
          const inside = (new Date(r.checkIn) <= parseYMD(today)) && (new Date(r.checkOut) > parseYMD(today))
          return a + (inside ? Number(r.rooms||1) : 0)
        },0)
        const arrivals   = resToday.filter(r => ymd(new Date(r.checkIn))===today).reduce((a,r)=>a+Number(r.rooms||1),0)
        const departures = resToday.filter(r => ymd(new Date(r.checkOut))===today).reduce((a,r)=>a+Number(r.rooms||1),0)

        const daysSoFar = daysBetween(mtdStart, addDaysYMD(today,1))
        const roomNightsSold = resMTD.reduce((a,r)=>{
          const s = new Date(Math.max(new Date(r.checkIn), parseYMD(mtdStart)))
          const e = new Date(Math.min(new Date(r.checkOut), parseYMD(addDaysYMD(today,1))))
          const n = Math.max(0, Math.round((e - s)/86400000))
          return a + (Number(r.rooms||1) * n)
        },0)
        const mtdRevenue = resMTD.reduce((a,r)=>{
          const totalN = nightsBetween(ymd(new Date(r.checkIn)), ymd(new Date(r.checkOut)))
          const s = new Date(Math.max(new Date(r.checkIn), parseYMD(mtdStart)))
          const e = new Date(Math.min(new Date(r.checkOut), parseYMD(addDaysYMD(today,1))))
          const overlapN = Math.max(0, Math.round((e - s)/86400000))
          const share = (Number(r.totalPrice||0) * (overlapN/totalN))
          return a + share
        },0)
        const mtdADR = roomNightsSold>0 ? (mtdRevenue / roomNightsSold) : 0
        const mtdRevPAR = (totalRooms>0 && daysSoFar>0) ? (mtdRevenue / (totalRooms * daysSoFar)) : 0
        const occToday = (totalRooms>0) ? Math.min(100, Math.round((inhouse/totalRooms)*100)) : 0

        const chanMap = {}
        resL30.forEach(r => { const c = r.channel || 'other'; chanMap[c] = (chanMap[c]||0) + 1 })
        const chanSlices = Object.entries(chanMap).map(([k,v])=>({label:k, value:v}))
          .sort((a,b)=>b.value-a.value).slice(0,8)

        if (!mounted) return
        setKpi({ inhouse, arrivals, departures, mtdRevenue, mtdADR, mtdRevPAR, occToday, totalRooms })
        setChannels(chanSlices)
        setLoading(false)
      } catch (e) {
        if (!mounted) return
        setError(e?.response?.data?.message || 'Bir şeyler ters gitti.')
        setLoading(false)
      }
    }
    run()
    return ()=>{ mounted=false }
  }, [])

  /* Oda tipleri (takvim) */
  useEffect(()=>{
    let mounted = true
    async function loadTypes(){
      try {
        const { data } = await api.get('/rooms/types')
        const list = (data||[]).map(rt => ({ key: rt._id, label: `${rt.name} (${rt.code})` }))
        if (mounted) {
          setRoomTypes(list)
          if (list.length && !selectedTypeId) setSelectedTypeId(list[0].key)
        }
      } catch {
        try {
          const res = await fetchAllRange('/reservations?status=confirmed', occRange.start, occRange.end)
          const map = new Map()
          res.forEach(r=>{
            const id = r.roomType?._id || r.roomType || r.roomTypeId
            const nm = r.roomType?.name || r.roomTypeName || 'Oda Tipi'
            const cd = r.roomType?.code || r.roomTypeCode || '—'
            const key = id || `${nm} ${cd}`
            if (!map.has(key)) map.set(key, { key, label:`${nm} (${cd})` })
          })
          const list = Array.from(map.values())
          if (mounted) {
            setRoomTypes(list)
            if (list.length && !selectedTypeId) setSelectedTypeId(list[0].key)
          }
        } catch {}
      }
    }
    loadTypes()
    return ()=>{ mounted=false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occRange.start, occRange.end])

  /* Seçili ODA TİPİ için dolu gün + popup listesi */
  useEffect(()=>{
    let mounted = true
    async function loadOcc(){
      if (!selectedTypeId) { setOccupiedSet(new Set()); setOccRes([]); return }
      try {
        const reservations = await fetchAllRange('/reservations?status=confirmed', occRange.start, occRange.end)
        const occ = new Set()
        const filtered = []
        const start = parseYMD(occRange.start)
        const endEx = parseYMD(addDaysYMD(occRange.end, 1))

        reservations.forEach(r=>{
          const typeId = r.roomType?._id || r.roomType || r.roomTypeId
          if (String(typeId) !== String(selectedTypeId)) return
          filtered.push(r)
          const s = new Date(Math.max(new Date(r.checkIn).getTime(), start.getTime()))
          const e = new Date(Math.min(new Date(r.checkOut).getTime(), endEx.getTime()))
          for(let d = new Date(s); d < e; d.setDate(d.getDate()+1)){
            occ.add( ymd(d) )
          }
        })

        if (mounted) { setOccupiedSet(occ); setOccRes(filtered) }
      } catch { if (mounted) { setOccupiedSet(new Set()); setOccRes([]) } }
    }
    loadOcc()
    return ()=>{ mounted=false }
  }, [selectedTypeId, occRange.start, occRange.end])

  /* Popup tetikleyici */
  const openDayPopup = (dateYMD) => {
    const items = occRes.filter(r => {
      const s = parseYMD(ymd(new Date(r.checkIn)))
      const e = parseYMD(ymd(new Date(r.checkOut)))
      const d = parseYMD(dateYMD)
      return d >= s && d < e
    })
    setPopup({ open:true, date:dateYMD, items })
  }

  const kpiCards = useMemo(()=>[
    { label:'İçeride (in-house)', value:kpi.inhouse },
    { label:'Bugün Giriş', value:kpi.arrivals },
    { label:'Bugün Çıkış', value:kpi.departures },
    { label:'MTD Gelir', value: TRYfmt(kpi.mtdRevenue) },
    { label:'MTD ADR', value: TRYfmt(kpi.mtdADR) },
    { label:'MTD RevPAR', value: TRYfmt(kpi.mtdRevPAR) },
    { label:'Doluluk % (bugün)', value: `${kpi.occToday}%` },
    { label:'Toplam Oda', value: kpi.totalRooms }
  ], [kpi])

  return (
    <div>
      <Header
        title="Otel Dashboard"
        subtitle="Bugün • MTD — KPI’lar, kanal dağılımı ve oda doluluk takvimi"
      />

      {/* KPIs */}
      <div className="kpis" style={{gridTemplateColumns:'repeat(4, minmax(0,1fr))'}}>
        {kpiCards.map((c,i)=>(
          <div key={i} className="card">
            <div className="label">{c.label}</div>
            <div className="value">{loading ? '—' : c.value}</div>
          </div>
        ))}
      </div>

      {/* Orta sıra */}
      <div style={{display:'grid', gridTemplateColumns:'1.35fr .8fr', gap:16, marginTop:16, alignItems:'stretch'}}>
        {/* Oda Doluluk Takvimi */}
        <div className="card" style={{minHeight:220}}>
          <div className="label" style={{marginBottom:6}}>Oda Doluluk Takvimi</div>

          <div className="form-grid" style={{marginBottom:8}}>
            <label className="field">
              <span className="field-label">Oda Tipi</span>
              <select className="select" value={selectedTypeId} onChange={e=>setSelectedTypeId(e.target.value)}>
                {roomTypes.length===0 && <option value="">—</option>}
                {roomTypes.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Başlangıç</span>
              <input
                className="input"
                type="date"
                value={occRange.start}
                onChange={e=>{
                  const d=parseYMD(e.target.value)
                  setMonthView(d.getFullYear(), d.getMonth())
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Bitiş</span>
              <input
                className="input"
                type="date"
                value={occRange.end}
                onChange={e=> setOccRange(r=>({...r, end:e.target.value}))}
              />
            </label>
          </div>

          <MonthCalendar
            year={viewYear}
            month={viewMonth}
            occupiedSet={occupiedSet}
            onPrev={prevMonth}
            onNext={nextMonth}
            onDayClick={openDayPopup}
          />
        </div>

        {/* Kanal dağılımı */}
        <div className="card" style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'center', minHeight:220}}>
          <div className="label" style={{gridColumn:'1 / -1'}}>Son 30 Gün Kanal Dağılımı</div>
          {loading ? (
            <div className="muted" style={{gridColumn:'1 / -1'}}>Yükleniyor…</div>
          ) : (
            <>
              <Donut slices={channels}/>
              <div>
                {(channels.length ? channels : [{label:'Kayıt yok', value:1}]).map((s,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span className="muted">{s.label}</span>
                    <b>{s.value}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <ArrDepTables />

      {!!error && (
        <div className="card" style={{marginTop:16, borderColor:'rgba(239,68,68,.35)', background:'rgba(239,68,68,.06)'}}>
          <div style={{fontWeight:700, marginBottom:6}}>Uyarı</div>
          {error}
        </div>
      )}

      {/* DOLU GÜN POPUP */}
      <Modal
        open={popup.open}
        onClose={()=>setPopup(p=>({...p, open:false}))}
        title={`Dolu Gün • ${fmtDate(popup.date)}`}
      >
        {popup.items.length===0 ? (
          <div className="muted">Kayıt bulunamadı.</div>
        ) : (
          <div style={{display:'grid', gap:8, maxHeight: '60vh', overflow:'auto'}}>
            {popup.items.map(r=>{
              const dep = Number(r.depositAmount||0)
              const tot = Number(r.totalPrice||0)
              const bal = Math.max(0, tot - dep)
              const rtName = r.roomType?.name || r.roomTypeName || ''
              const rtCode = r.roomType?.code || r.roomTypeCode || ''
              return (
                <div key={r._id} className="card" style={{padding:'10px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)'}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', rowGap:4, columnGap:12, fontSize:14}}>
                    <div><b>Misafir:</b> {r.guest?.name || r.guestName || '—'}</div>
                    <div><b>Telefon:</b> {r.guest?.phone || '—'}</div>
                    <div><b>Giriş:</b> {fmtDate(r.checkIn)}</div>
                    <div><b>Çıkış:</b> {fmtDate(r.checkOut)} &nbsp; <span className="muted">({nightsBetween(ymd(new Date(r.checkIn)), ymd(new Date(r.checkOut)))} gece)</span></div>
                    <div><b>Oda Tipi:</b> {rtName || '—'} {rtCode ? `(${rtCode})` : ''}</div>
                    <div><b>Kanal:</b> {r.channel || '—'}</div>
                    <div><b>Durum:</b> {r.status || '—'}</div>
                    <div><b>Oda:</b> {r.rooms ?? 1}</div>
                    <div><b>Toplam:</b> {TRYfmt(tot)} &nbsp; <b>Kapora:</b> {TRYfmt(dep)} &nbsp; <b>Kalan:</b> {TRYfmt(bal)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}

/* -------- Bugün giriş/çıkış tabloları -------- */
function ArrDepTables(){
  const [loading, setLoading] = useState(true)
  const [arrivalsToday, setArrivalsToday] = useState([])
  const [departuresToday, setDeparturesToday] = useState([])

  useEffect(()=>{
    let mounted = true
    async function load(){
      setLoading(true)
      const today = todayYMD()
      const base = '/reservations?status=confirmed'
      const resToday = await fetchAllRange(base, today, today)
      if (!mounted) return
      setArrivalsToday(resToday.filter(r => ymd(new Date(r.checkIn))===today).slice(0,6))
      setDeparturesToday(resToday.filter(r => ymd(new Date(r.checkOut))===today).slice(0,6))
      setLoading(false)
    }
    load(); return ()=>{ mounted=false }
  }, [])

  const roomText = (r) => {
    const rt = r.roomType
    if (rt && (rt.name || rt.code)) return `${rt.name||''}${rt.code?` (${rt.code})`:''}`
    return r.roomTypeName ? `${r.roomTypeName}${r.roomTypeCode?` (${r.roomTypeCode})`:''}` : '—'
  }

  const nights = (r) => nightsBetween(ymd(new Date(r.checkIn)), ymd(new Date(r.checkOut)))

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16}}>
      <div className="card">
        <div className="label" style={{marginBottom:8}}>Bugün Girişler</div>
        <table className="table">
          <thead><tr><th>Misafir</th><th>Oda Tipi</th><th>Gece</th><th>Kanal</th><th>Giriş</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="muted" colSpan={5}>Yükleniyor…</td></tr>
            ) : arrivalsToday.length ? arrivalsToday.map(r=>(
              <tr key={r._id}>
                <td>{r.guest?.name || r.guestName}</td>
                <td>{roomText(r)}</td>
                <td>{nights(r)}</td>
                <td className="muted">{r.channel||'—'}</td>
                <td className="muted">{fmtDate(r.checkIn)}</td>
              </tr>
            )) : <tr><td className="muted" colSpan={5}>Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="label" style={{marginBottom:8}}>Bugün Çıkışlar</div>
        <table className="table">
          <thead><tr><th>Misafir</th><th>Oda Tipi</th><th>Gece</th><th>Kanal</th><th>Çıkış</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="muted" colSpan={5}>Yükleniyor…</td></tr>
            ) : departuresToday.length ? departuresToday.map(r=>(
              <tr key={r._id}>
                <td>{r.guest?.name || r.guestName}</td>
                <td>{roomText(r)}</td>
                <td>{nights(r)}</td>
                <td className="muted">{r.channel||'—'}</td>
                <td className="muted">{fmtDate(r.checkOut)}</td>
              </tr>
            )) : <tr><td className="muted" colSpan={5}>Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
