import React, { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/axios'
import Header from '../../components/Header'

/* ---------------------------------------------------------
   TAKSONOMİ — UI tamamen Türkçe, API'ye sade değerler gider
--------------------------------------------------------- */
const OZELLIKLER = [
  { value: 'wifi',       label: 'Wi-Fi' },
  { value: 'ac',         label: 'Klima' },
  { value: 'tv',         label: 'TV' },
  { value: 'minibar',    label: 'Minibar' },
  { value: 'kettle',     label: 'Su ısıtıcısı' },
  { value: 'safe',       label: 'Kasa' },
  { value: 'work_desk',  label: 'Çalışma masası' },
  { value: 'balcony',    label: 'Balkon' },
]
const EKSTRALAR = [
  { key: 'hasPool',    label: 'Havuz' },
  { key: 'hasJacuzzi', label: 'Jakuzi' },
]
const MANZARALAR = [
  { value: 'sea',      label: 'Deniz manzarası' },
  { value: 'lake',     label: 'Göl manzarası' },
  { value: 'mountain', label: 'Dağ manzarası' },
  { value: 'forest',   label: 'Orman manzarası' },
  { value: 'garden',   label: 'Bahçe manzarası' },
  { value: 'city',     label: 'Şehir manzarası' },
]
const MUTFAK_ANAHTAR = { key: 'hasKitchen', label: 'Mutfak' }
const MUTFAK_OZELLK = [
  { value: 'stove',      label: 'Ocak' },
  { value: 'cooktop',    label: 'Set üstü ocak' },
  { value: 'oven',       label: 'Fırın' },
  { value: 'microwave',  label: 'Mikrodalga' },
  { value: 'dishwasher', label: 'Bulaşık makinesi' },
  { value: 'fridge',     label: 'Buzdolabı' },
]
const KONAKLAMA_TIPLERI = [
  { value:'room',      label:'Oda' },
  { value:'suite',     label:'Suit' },
  { value:'villa',     label:'Villa' },
  { value:'bungalow',  label:'Bungalov' },
  { value:'glamping',  label:'Glamping' },
  { value:'tinyhouse', label:'Tiny House' },
]
const YATAK_TIPLERI = [
  { value: 'single',       label: 'Tek kişilik' },
  { value: 'double',       label: 'Çift kişilik' },
  { value: 'twin',         label: 'Twin (iki tek)' },
  { value: 'french',       label: 'French' },
  { value: 'queen',        label: 'Queen' },
  { value: 'king',         label: 'King' },
  { value: 'bunk_single',  label: 'Ranza (tek)' },
  { value: 'bunk_double',  label: 'Ranza (çift)' },
]
const GUNLER = [
  { val:1, kisa:'Pzt', tam:'Pazartesi' },
  { val:2, kisa:'Sal', tam:'Salı' },
  { val:3, kisa:'Çar', tam:'Çarşamba' },
  { val:4, kisa:'Per', tam:'Perşembe' },
  { val:5, kisa:'Cum', tam:'Cuma' },
  { val:6, kisa:'Cmt', tam:'Cumartesi' },
  { val:7, kisa:'Paz', tam:'Pazar' },
]

/* ----------------- Yardımcılar ----------------- */
// localStorage destekli küçük helper
const useLocal = (key, initial) => {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }, [key, v])
  return [v, setV]
}

// TZ-güvenli YYYY-MM-DD (yerel)
const isoLocal = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const bugun = () => isoLocal(new Date())
const gunEkle = (s, n) => {
  const dt = new Date(`${s}T00:00:00`)
  dt.setDate(dt.getDate() + n)
  return isoLocal(dt)
}
const etiket = (arr, value) => arr.find(x => x.value === value)?.label || value
const konaklamaEtiketi = (v) => KONAKLAMA_TIPLERI.find(p => p.value === v)?.label || v
const formatTRY = (n) =>
  new Intl.NumberFormat('tr-TR', { style:'currency', currency:'TRY', minimumFractionDigits:0, maximumFractionDigits:0 })
    .format(Number(n || 0))
const gunNo = (dateStrOrDate) => {
  const d = (dateStrOrDate instanceof Date) ? dateStrOrDate : new Date(`${dateStrOrDate}T00:00:00`)
  const gd = d.getDay() // 0..6 (Paz..Cts)
  return gd === 0 ? 7 : gd
}

// --- Hata mesajlarını okunur göster (v7 uyumlu) ---
const showApiError = (err, fallback = 'İşlem başarısız') => {
  const data = err?.response?.data;
  const list = data?.errors;

  if (Array.isArray(list) && list.length) {
    const pretty = list.map((e) => {
      const field = e.param ?? e.path ?? '';
      const val   = e.value !== undefined
        ? (typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value))
        : undefined;
      return `• ${e.msg}${field ? ` [${field}]` : ''}${val !== undefined ? ` ← ${val}` : ''}`;
    }).join('\n');

    alert('Doğrulama hatası:\n' + pretty);
    console.error('API validation errors:', list, 'raw:', data);
  } else {
    alert(data?.message || err.message || fallback);
    console.error('API error raw response:', data);
  }
};

// --- Tarihi her koşulda YYYY-MM-DD'e çevir (dd.mm.yyyy yazılsa bile) ---
const toISODate = (s) => {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(+d) ? '' : isoLocal(d);
}

/* ---------- Basit Chip ---------- */
function Chip({ active, onClick, children }) {
  return (
    <span
      className={`chip ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e)=> (e.key === 'Enter' || e.key === ' ') && onClick()}
      style={{ userSelect:'none' }}
    >
      {children}
    </span>
  )
}

/* =========================================================
   TAKVİM (TEK TAKVİM — 1.tık başlangıç, 2.tık bitiş)
========================================================= */
function RangeCalendar({ start, end, onChange }) {
  const [ay, setAy] = useState(() => {
    const d = start ? new Date(`${start}T00:00:00`) : new Date()
    d.setDate(1)
    return d
  })
  const trAylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

  const oncekiAy = () => { const d = new Date(ay); d.setMonth(d.getMonth() - 1); setAy(d) }
  const sonrakiAy = () => { const d = new Date(ay); d.setMonth(d.getMonth() + 1); setAy(d) }
  const temizle = () => onChange({ start:'', end:'' })

  const ilkGun = new Date(ay)
  const basOffset = (gunNo(ilkGun) + 6) % 7 // Pazartesi=0
  const gunSayisi = new Date(ay.getFullYear(), ay.getMonth()+1, 0).getDate()

  const hucreler = []
  for (let i=0;i<basOffset;i++) hucreler.push(null)
  for (let d=1; d<=gunSayisi; d++) hucreler.push(new Date(ay.getFullYear(), ay.getMonth(), d))

  const sec = (d) => {
    const ds = isoLocal(d)
    if (!start || (start && end)) onChange({ start: ds, end: '' })
    else {
      let s = start, e = ds
      if (new Date(`${ds}T00:00:00`) < new Date(`${start}T00:00:00`)) { s = ds; e = start }
      onChange({ start: s, end: e })
    }
  }
  const araliktaMi = (d) => {
    if (!start || !end) return false
    const x = new Date(`${isoLocal(d)}T00:00:00`).getTime()
    const s = new Date(`${start}T00:00:00`).getTime()
    const e = new Date(`${end}T00:00:00`).getTime()
    return x>=s && x<=e
  }

  return (
    <div className="calendar">
      <div className="cal-head">
        <div className="cal-nav">
          <button type="button" className="btn sm" onClick={oncekiAy}>‹</button>
          <div className="cal-title">{trAylar[ay.getMonth()]} {ay.getFullYear()}</div>
          <button type="button" className="btn sm" onClick={sonrakiAy}>›</button>
        </div>
        <button type="button" className="btn sm" onClick={temizle}>Temizle</button>
      </div>

      <div className="cal-grid">
        {['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(h => <div key={h} className="cal-wd">{h}</div>)}
        {hucreler.map((d, i) => (
          <div
            key={i}
            className={`cal-cell ${d ? '' : 'empty'} ${d && araliktaMi(d) ? 'in-range':''} ${d && isoLocal(d)===start ? 'start':''} ${d && isoLocal(d)===end ? 'end':''}`}
            onClick={()=> d && sec(d)}
          >
            {d ? d.getDate() : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

/* =========================================================
   ANA BİLEŞEN
========================================================= */
export default function Rooms(){
  // ——— Stil (yalnızca bu sayfaya özel, hoş görünüm) ———
  const calendarStyles = `
    .tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap }
    .tab { padding:8px 12px; border:1px solid var(--border, #2e2e2e); border-radius:10px; cursor:pointer }
    .tab.active { background: var(--accent, #0dd); color:#0b0b0b; border-color: transparent; font-weight:600 }

    .calendar { border:1px solid var(--border, #2e2e2e); border-radius:16px; padding:12px; max-width: 420px; background: rgba(255,255,255,0.02) }
    .cal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
    .cal-nav { display:flex; align-items:center; gap:8px }
    .cal-title { font-weight:600 }
    .cal-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:6px }
    .cal-wd { text-align:center; font-size:12px; color:var(--muted,#999) }
    .cal-cell { aspect-ratio:1 / 1; display:flex; align-items:center; justify-content:center; border-radius:10px; cursor:pointer; user-select:none; border:1px solid transparent; }
    .cal-cell:hover { border-color: var(--border, #2e2e2e) }
    .cal-cell.in-range { background: rgba(13,221,221,0.12) }
    .cal-cell.start, .cal-cell.end { background: var(--accent, #0dd); color:#101010; font-weight:700 }
    .cal-cell.empty { opacity:0 }

    .ops-summary, .rule-summary { font-size: 12px; color: var(--muted, #999) }
    .chips { display:flex; gap:8px; flex-wrap:wrap }
  `

  /* ------- Liste & Form ------- */
  const [tipler, setTipler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [silinenId, setSilinenId] = useState(null)
  const [kopyalananId, setKopyalananId] = useState(null)

  const [aramaQ, setAramaQ] = useState('')
  const [debouncedArama, setDebouncedArama] = useState('')
  useEffect(() => { const t=setTimeout(()=>setDebouncedArama(aramaQ.trim().toLowerCase()),300); return ()=>clearTimeout(t) }, [aramaQ])

  const kodRef = useRef(null)
  const [kodaOdaklan, setKodaOdaklan] = useState(false)

  const bosForm = {
    code:'', name:'',
    basePrice:'', capacityAdults:2, capacityChildren:0,
    totalRooms:0, bedType:'', sizeSqm:'', smoking:false,
    amenities:[], scenicViews:[],
    hasPool:false, hasJacuzzi:false,
    hasKitchen:false, kitchenFeatures:[],
    propertyType:'room',
    bedrooms: [], unitBedrooms:0, unitBathrooms:0, unitBeds:0,
    description:'',
    channelCodes:{ direct:'', airbnb:'', booking:'', etstur:'' },
    active: true,
  }
  const [form, setForm] = useState(bosForm)
  const [duzenlemeId, setDuzenlemeId] = useState(null)

  /* ------- Envanter ------- */
  const [aktifSekme, setAktifSekme] = useState('takvim') // takvim | haftasonu | gunbazli | islemler
  const [envanter, setEnvanter] = useState({
    roomType:'', start: bugun(), end: gunEkle(bugun(), 14),
    price:'', allotment:'', stopSell:false,
    ruleName:'', saveAsRule:true, // yeni: takvim sekmesi için
  })
  const [envanterOnizleme, setEnvanterOnizleme] = useState([])
  const [envanterUyguluyor, setEnvanterUyguluyor] = useState(false)

  // Hafta sonu kısayolu
  const yilNow = new Date().getFullYear()
  const [haftaSonuGunleri, setHaftaSonuGunleri] = useState([5,6]) // Cuma-Cmt
  const [haftaSonuYil, setHaftaSonuYil] = useState(yilNow)
  const [haftaSonuFiyat, setHaftaSonuFiyat] = useState('')
  const [haftaSonuKaydet, setHaftaSonuKaydet] = useState(true)
  const [haftaSonuAd, setHaftaSonuAd] = useState('Hafta Sonu')

  // Gün bazlı kurallar (geçici edit alanı)
  const [kurallar, setKurallar] = useState([]) // {id, ad, weekdays, start, end, price}
  const [gunbazliKaydet, setGunbazliKaydet] = useState(true)

  // ——— İşlem Geçmişi (localStorage) ———
  const [islemler, setIslemler] = useLocal('rooms.invOps', [])

  // ——— Kayıtlı Kurallar (kalıcı) ———
  // rule: { id, roomType, name, type:'range'|'days', start, end, price?, allotment?, stopSell?, weekdays?[] , createdAt }
  const [kayitliKurallar, setKayitliKurallar] = useLocal('rooms.rulesV1', [])
  const [kuralDuzenId, setKuralDuzenId] = useState(null) // düzenlenmekte olan kayıtlı kural id
  const [kuralOdaFiltresi, setKuralOdaFiltresi] = useState('ALL')

  /* ------- Unit tip & yatak hesapları ------- */
  const unitTipMi = ['villa','bungalow','glamping','tinyhouse'].includes(form.propertyType)
  const toplamYatak = (bedrooms) =>
    (bedrooms || []).reduce((acc, od) => acc + (od.beds || []).reduce((a,b) => a + Number(b.count || 0), 0), 0)

  const yatakOdasiSayisiAyarla = (n) => {
    const adet = Math.max(0, Math.min(20, Number(n || 0)))
    setForm(f => {
      const kopya = [...(f.bedrooms || [])]
      if (adet > kopya.length) for (let i = kopya.length; i < adet; i++) kopya.push({ beds: [{ count: 1, type: 'double' }] })
      else if (adet < kopya.length) kopya.length = adet
      return { ...f, bedrooms: kopya, unitBedrooms: adet, unitBeds: toplamYatak(kopya) }
    })
  }
  const yatakSatiriEkle = (i) => setForm(f => {
    const k = [...f.bedrooms]; k[i] = { ...(k[i]||{beds:[]}), beds:[...(k[i]?.beds||[]), { count:1, type:'double' }] }
    return { ...f, bedrooms:k, unitBeds: toplamYatak(k) }
  })
  const yatakSatiriGuncelle = (oi, si, alan, deger) => setForm(f=>{
    const k=[...f.bedrooms]; const oda={...(k[oi]||{beds:[]})}; const beds=[...(oda.beds||[])]; const sat={...(beds[si]||{count:1,type:'double'})}
    if (alan==='count') sat.count=Math.max(0,Math.min(10,Number(deger||0))); else sat.type=deger
    beds[si]=sat; oda.beds=beds; k[oi]=oda; return {...f, bedrooms:k, unitBeds: toplamYatak(k)}
  })
  const yatakSatiriSil = (oi, si) => setForm(f=>{
    const k=[...f.bedrooms]; const oda={...(k[oi]||{beds:[]})}; const beds=[...(oda.beds||[])]; beds.splice(si,1)
    oda.beds=beds.length?beds:[{count:1,type:'double'}]; k[oi]=oda; return {...f, bedrooms:k, unitBeds: toplamYatak(k)}
  })

  /* ------- API ------- */
  const tipleriYukle = async () => {
    setYukleniyor(true)
    try {
      const { data } = await api.get('/rooms/types')
      setTipler(data)
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Liste yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(()=>{ tipleriYukle() }, [])

  useEffect(() => { if (kodaOdaklan && kodRef.current) { kodRef.current.focus(); setKodaOdaklan(false) } }, [kodaOdaklan])

  const kaydet = async (e) => {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) { alert('Kod ve Ad zorunludur.'); return }

    const payload = {
      ...form,
      basePrice: Number(form.basePrice || 0),
      capacityAdults: Number(form.capacityAdults || 0),
      capacityChildren: Number(form.capacityChildren || 0),
      totalRooms: Number(form.totalRooms || 0),
      sizeSqm: Number(form.sizeSqm || 0),
      unitBedrooms: unitTipMi ? Number(form.bedrooms?.length || 0) : Number(form.unitBedrooms || 0),
      unitBathrooms: Number(form.unitBathrooms || 0),
      unitBeds: Number(unitTipMi ? toplamYatak(form.bedrooms) : (form.unitBeds || 0)),
      bedType: unitTipMi ? (form.bedrooms?.[0]?.beds?.[0]?.type || '') : (form.bedType || ''),
    }

    setKaydediyor(true)
    try {
      if (duzenlemeId) await api.put(`/rooms/types/${duzenlemeId}`, payload)
      else await api.post('/rooms/types', payload)
      setForm(bosForm); setDuzenlemeId(null)
      await tipleriYukle()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || 'Kaydedilemedi')
    } finally {
      setKaydediyor(false)
    }
  }

  // >>> formu göster butonlarıyla uyumlu
  const [formOpen, setFormOpen] = useLocal('rooms.formOpen', false)
  const [invOpen, setInvOpen]   = useLocal('rooms.invOpen', false)

  const duzenle = (rt) => {
    setDuzenlemeId(rt._id)
    setForm({
      code: rt.code || '', name: rt.name || '',
      basePrice: rt.basePrice ?? '',
      capacityAdults: rt.capacityAdults ?? 2,
      capacityChildren: rt.capacityChildren ?? 0,
      totalRooms: rt.totalRooms ?? 0,
      bedType: rt.bedType || '',
      sizeSqm: rt.sizeSqm ?? '',
      smoking: !!rt.smoking,
      amenities: rt.amenities || [],
      scenicViews: rt.scenicViews || [],
      hasPool: !!rt.hasPool,
      hasJacuzzi: !!rt.hasJacuzzi,
      hasKitchen: !!rt.hasKitchen,
      kitchenFeatures: rt.kitchenFeatures || [],
      propertyType: rt.propertyType || 'room',
      bedrooms: Array.isArray(rt.bedrooms) ? rt.bedrooms : [],
      unitBedrooms: rt.unitBedrooms ?? 0,
      unitBathrooms: rt.unitBathrooms ?? 0,
      unitBeds: rt.unitBeds ?? 0,
      description: rt.description || '',
      channelCodes: {
        direct:  rt.channelCodes?.direct  || '',
        airbnb:  rt.channelCodes?.airbnb  || '',
        booking: rt.channelCodes?.booking || '',
        etstur:  rt.channelCodes?.etstur  || '',
      },
      active: typeof rt.active === 'boolean' ? rt.active : true,
    })
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const kopyala = async (rt) => {
    setKopyalananId(rt._id)
    try {
      const kopya = { ...rt }; delete kopya._id
      setDuzenlemeId(null)
      setForm({ ...bosForm, ...kopya, code:'', name:`${rt.name} (Kopya)`, channelCodes:{ direct:'', airbnb:'', booking:'', etstur:'' } })
      setKodaOdaklan(true)
      setFormOpen(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally { setKopyalananId(null) }
  }

  const sil = async (rt) => {
    if (!window.confirm(`“${rt.name}” tipini silmek istiyor musun?`)) return
    setSilinenId(rt._id)
    try { await api.delete(`/rooms/types/${rt._id}`); await tipleriYukle() }
    catch (e) { alert(e?.response?.data?.message || 'Silinemedi') }
    finally { setSilinenId(null) }
  }

  const toggleDizide = (key, val) =>
    setForm(f => f[key].includes(val) ? ({...f, [key]: f[key].filter(x => x !== val)}) : ({...f, [key]: [...f[key], val]}))

  /* ------- Envanter (Önizleme + Uygulama) ------- */
  const envanterGetir = async () => {
    if (!envanter.roomType || !envanter.start || !envanter.end) { setEnvanterOnizleme([]); return }
    try {
      const { data } = await api.get(`/rooms/inventory?roomType=${envanter.roomType}&start=${envanter.start}&end=${envanter.end}`)
      setEnvanterOnizleme(data)
    } catch { setEnvanterOnizleme([]) }
  }
  useEffect(()=>{ envanterGetir() }, [envanter.roomType, envanter.start, envanter.end]) // eslint-disable-line

  const odaTipSecenekleri = useMemo(() => tipler.map(t => ({ value: t._id, label: `${t.name} (${t.code})` })), [tipler])
  const roomTypeLabelById = (id) => {
    const t = tipler.find(x=>x._id===id)
    return t ? `${t.name} (${t.code})` : id
  }

  const opsEkle = (op) => setIslemler(list => [{...op, id: op.id || Date.now()}, ...list])
  const opsSil = (id) => setIslemler(list => list.filter(x => x.id !== id))
  const opsHepsiniSil = () => { if (window.confirm('Tüm işlem geçmişini silmek istiyor musunuz?')) setIslemler([]) }

  // ---- Yardımcı: tarih aralığında belirli günlere göre segmentlere böl
  const segmentlereBol = (startISO, endISO, weekdaysArr) => {
    const s = new Date(`${startISO}T00:00:00`)
    const e = new Date(`${endISO}T00:00:00`)
    const set = new Set(weekdaysArr)
    const selected = []
    for (let d=new Date(s); d<=e; d.setDate(d.getDate()+1)) {
      if (set.has(gunNo(d))) selected.push(isoLocal(d))
    }
    if (selected.length===0) return []
    // ardışık günleri gruplara ayır
    const groups = []
    let grpStart = selected[0], prev = selected[0]
    for (let i=1;i<selected.length;i++){
      const curr = selected[i]
      const prevNext = gunEkle(prev, 1)
      if (curr === prevNext) { prev = curr; continue }
      groups.push([grpStart, gunEkle(prev, 1)]) // end exclusive
      grpStart = curr; prev = curr
    }
    groups.push([grpStart, gunEkle(prev, 1)])
    return groups
  }

  // ---- Kural kaydet/sil/güncelle/uygula
  const kuralEkleKaydet = (rule) => setKayitliKurallar(list => [{...rule, id: Date.now()}, ...list])
  const kuralSil = (id) => setKayitliKurallar(list => list.filter(r => r.id !== id))
  const kuralGuncelleKaydet = (id, patch) => setKayitliKurallar(list => list.map(r => r.id===id ? ({...r, ...patch}) : r))

  const applyRuleToAPI = async (rule) => {
    // range -> tek istek
    if (rule.type === 'range') {
      const payload = {
        roomType: rule.roomType,
        start: rule.start,
        end: rule.end,
        stopSell: !!rule.stopSell,
      }
      if (rule.price !== '' && rule.price != null) payload.price = Number(rule.price)
      if (rule.allotment !== '' && rule.allotment != null) payload.allotment = Number(rule.allotment)
      await api.post('/rooms/inventory/bulk', payload)
      return
    }
    // days -> ardışık segmentlere bölüp çoklu istek
    const segments = segmentlereBol(rule.start, rule.end, rule.weekdays || [])
    for (const [segStart, segEndExcl] of segments) {
      const payload = {
        roomType: rule.roomType,
        start: segStart,
        end: segEndExcl,
        stopSell: !!rule.stopSell,
      }
      if (rule.price !== '' && rule.price != null) payload.price = Number(rule.price)
      if (rule.allotment !== '' && rule.allotment != null) payload.allotment = Number(rule.allotment)
      // eslint-disable-next-line no-await-in-loop
      await api.post('/rooms/inventory/bulk', payload)
    }
  }

  const envanterUygula = async (e) => {
    e.preventDefault();

    if (!envanter.roomType || !envanter.start || !envanter.end) {
      alert('Oda tipi ve tarih aralığı zorunlu.'); return;
    }

    const hasAnyChange =
      envanter.price !== '' ||
      envanter.allotment !== '' ||
      typeof envanter.stopSell === 'boolean';

    if (!hasAnyChange) {
      alert('Fiyat, allotment veya stop-sell’den en az birini giriniz.'); return;
    }

    const payload = {
      roomType: envanter.roomType,
      start: toISODate(envanter.start),
      end:   toISODate(envanter.end),
      stopSell: !!envanter.stopSell,
    };
    if (envanter.price !== '') payload.price = Number(envanter.price);
    if (envanter.allotment !== '') payload.allotment = Number(envanter.allotment);

    setEnvanterUyguluyor(true);
    try {
      await api.post('/rooms/inventory/bulk', payload);
      await envanterGetir();
      alert('Envanter güncellendi');

      // İşlem geçmişi
      opsEkle({
        kind: 'range',
        when: new Date().toISOString(),
        roomType: envanter.roomType,
        start: payload.start,
        end: payload.end,
        price: payload.price ?? null,
        allotment: payload.allotment ?? null,
        stopSell: payload.stopSell,
        payload,
      })

      // Kural olarak sakla (opsiyonel)
      if (envanter.saveAsRule) {
        kuralEkleKaydet({
          roomType: envanter.roomType,
          name: envanter.ruleName?.trim() || 'Yeni Kural',
          type: 'range',
          start: payload.start, end: payload.end,
          price: payload.price ?? '',
          allotment: payload.allotment ?? '',
          stopSell: payload.stopSell,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      showApiError(err, 'Envanter uygulanamadı');
    } finally {
      setEnvanterUyguluyor(false);
    }
  };

  /* ------- Hafta sonu kısayolu (gün bazlı) ------- */
  const haftaSonuUygula = async () => {
    if (!envanter.roomType) { alert('Oda tipi seçiniz'); return }
    if (haftaSonuFiyat === '') { alert('Hafta sonu fiyatını giriniz'); return }

    const start = `${haftaSonuYil}-01-01`, end = `${haftaSonuYil}-12-31`
    const weekdays = [...haftaSonuGunleri].sort((a,b)=>a-b)

    setEnvanterUyguluyor(true)
    try {
      // segmentlere böl ve uygula
      const segments = segmentlereBol(start, end, weekdays)
      for (const [s, e] of segments) {
        // eslint-disable-next-line no-await-in-loop
        await api.post('/rooms/inventory/bulk', {
          roomType: envanter.roomType,
          start: s, end: e,
          price: Number(haftaSonuFiyat),
          stopSell: false,
        })
      }
      await envanterGetir()
      alert('Hafta sonları uygulandı')

      opsEkle({
        kind: 'weekend',
        when: new Date().toISOString(),
        roomType: envanter.roomType,
        year: haftaSonuYil,
        weekdays: [...weekdays],
        price: Number(haftaSonuFiyat),
      })

      if (haftaSonuKaydet) {
        kuralEkleKaydet({
          roomType: envanter.roomType,
          name: haftaSonuAd?.trim() || 'Hafta Sonu',
          type: 'days',
          start: toISODate(start),
          end: toISODate(end),
          weekdays,
          price: Number(haftaSonuFiyat),
          stopSell: false,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      showApiError(err, 'Hafta sonu kuralı uygulanamadı')
    } finally {
      setEnvanterUyguluyor(false)
    }
  }

  /* ------- Gün bazlı kurallar (geçici panel -> kalıcı kaydet/uygula) ------- */
  const kuraliEkle = () => setKurallar(k => [...k, { id: Date.now(), ad:'Yeni Kural', weekdays:[1,2,3,4,5], start: envanter.start, end: envanter.end, price:'' }])
  const kuralPanelGuncelle = (id, alan, deger) => setKurallar(k => k.map(r => r.id===id ? { ...r, [alan]: deger } : r))
  const kuralPanelGunToggle = (id, g) => setKurallar(k => k.map(r => r.id===id ? ({...r, weekdays: r.weekdays.includes(g) ? r.weekdays.filter(x=>x!==g) : [...r.weekdays, g]}) : r))
  const kuralPanelSil = (id) => setKurallar(k => k.filter(r => r.id!==id))

  const sayGuneGore = (start, end, weekdays) => {
    const s = new Date(`${start}T00:00:00`), e = new Date(`${end}T00:00:00`)
    if (e < s) return 0
    let c = 0; const ws = new Set(weekdays)
    for (let d = new Date(s); d <= e; d.setDate(d.getDate()+1)) if (ws.has(gunNo(d))) c++
    return c
  }

  const kurallariUygula = async () => {
    if (!envanter.roomType) { alert('Oda tipi seçiniz'); return; }

    const temiz = kurallar
      .filter(r => r.price !== '' && r.weekdays?.length && r.start && r.end)
      .map(r => {
        const s = toISODate(r.start);
        const e = toISODate(r.end);
        if (!s || !e) return null;
        if (new Date(`${e}T00:00:00`) < new Date(`${s}T00:00:00`)) return null;
        return { ...r, start:s, end:e, price:Number(r.price) }
      })
      .filter(Boolean);

    if (!temiz.length) { alert('En az bir geçerli kural giriniz'); return; }

    setEnvanterUyguluyor(true);
    try {
      // API'ye uyarlayıp uygula
      for (const r of temiz) {
        const segments = segmentlereBol(r.start, r.end, r.weekdays)
        // eslint-disable-next-line no-await-in-loop
        for (const [s, e] of segments) await api.post('/rooms/inventory/bulk', {
          roomType: envanter.roomType, start: s, end: e, price: r.price, stopSell: false
        })
        if (gunbazliKaydet) {
          kuralEkleKaydet({
            roomType: envanter.roomType,
            name: r.ad?.trim() || 'Gün Bazlı',
            type: 'days',
            start: r.start, end: r.end,
            weekdays: [...r.weekdays],
            price: r.price,
            stopSell: false,
            createdAt: new Date().toISOString(),
          })
        }
      }
      await envanterGetir();
      alert('Kurallar uygulandı');

      opsEkle({
        kind: 'rules',
        when: new Date().toISOString(),
        roomType: envanter.roomType,
        rules: temiz.map(({weekdays,start,end,price})=>({weekdays,start,end,price})),
      })
    } catch (err) {
      showApiError(err, 'Kurallar uygulanamadı');
    } finally {
      setEnvanterUyguluyor(false);
    }
  }

  /* ------- İşlem Geçmişi Yardımcıları ------- */
  const haftaIciAdi = (val) => GUNLER.find(g=>g.val===val)?.tam || val
  const haftalikGunlerText = (arr=[]) => arr.slice().sort((a,b)=>a-b).map(haftaIciAdi).join(', ')

  const opsOzet = (op) => {
    if (op.kind === 'range') {
      const parts = []
      if (op.price!=null) parts.push(`Fiyat ${formatTRY(op.price)}`)
      if (op.allotment!=null) parts.push(`Allotment ${op.allotment}`)
      parts.push(op.stopSell ? 'Stop-Sell' : 'Satış Açık')
      return `${op.start} → ${op.end} • ${parts.join(' / ')}`
    }
    if (op.kind === 'weekend') {
      return `${op.year} • ${haftalikGunlerText(op.weekdays)} • ${formatTRY(op.price)}`
    }
    if (op.kind === 'rules') {
      const starts = op.rules.map(r=>r.start)
      const ends = op.rules.map(r=>r.end)
      const sMin = starts.slice().sort()[0]
      const eMax = ends.slice().sort().slice(-1)[0]
      return `${op.rules.length} kural • ${sMin} → ${eMax}`
    }
    return ''
  }

  const opsDuzenle = (op) => {
    setInvOpen(true)
    if (op.roomType) setEnvanter(e=>({ ...e, roomType: op.roomType }))

    if (op.kind === 'range') {
      setAktifSekme('takvim')
      setEnvanter(e => ({
        ...e,
        roomType: op.roomType || e.roomType,
        start: op.start || e.start,
        end: op.end || e.end,
        price: op.price ?? '',
        allotment: op.allotment ?? '',
        stopSell: !!op.stopSell,
        ruleName: op.name || 'Aralık',
        saveAsRule: true,
      }))
    } else if (op.kind === 'weekend') {
      setAktifSekme('haftasonu')
      setHaftaSonuYil(op.year || yilNow)
      setHaftaSonuGunleri(op.weekdays || [5,6])
      setHaftaSonuFiyat(op.price!=null ? String(op.price) : '')
      setHaftaSonuAd(op.name || 'Hafta Sonu')
      setHaftaSonuKaydet(true)
    } else if (op.kind === 'rules') {
      setAktifSekme('gunbazli')
      const rebuilt = (op.rules || []).map((r, i) => ({ id: Date.now()+i, ad: `Kural ${i+1}`, weekdays:[...(r.weekdays||[])], start:r.start, end:r.end, price:r.price }))
      setKurallar(rebuilt)
      setGunbazliKaydet(true)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const opsTekrarUygula = async (op) => {
    if (!op) return
    setEnvanterUyguluyor(true)
    try {
      if (op.kind === 'range') {
        await api.post('/rooms/inventory/bulk', {
          roomType: op.roomType, start: op.start, end: op.end,
          price: op.price ?? undefined,
          allotment: op.allotment ?? undefined,
          stopSell: !!op.stopSell,
        })
      } else if (op.kind === 'weekend' || op.kind === 'rules') {
        const rules = op.kind==='weekend'
          ? [{ start: `${op.year}-01-01`, end: `${op.year}-12-31`, weekdays: op.weekdays, price: op.price }]
          : (op.rules || [])
        for (const r of rules) {
          const segments = segmentlereBol(r.start, r.end, r.weekdays || [])
          // eslint-disable-next-line no-await-in-loop
          for (const [s,e] of segments) await api.post('/rooms/inventory/bulk', { roomType: op.roomType, start:s, end:e, price:r.price, stopSell:false })
        }
      }
      await envanterGetir()
      alert('İşlem tekrar uygulandı')
    } catch (err) {
      showApiError(err, 'İşlem tekrar uygulanamadı')
    } finally {
      setEnvanterUyguluyor(false)
    }
  }

  // ---- Kayıtlı kurallar UI yardımcıları
  const roomsWithRules = useMemo(() => {
    const ids = Array.from(new Set(kayitliKurallar.map(r=>r.roomType)))
    return ids.map(id => ({ id, label: roomTypeLabelById(id), count: kayitliKurallar.filter(r=>r.roomType===id).length }))
  }, [kayitliKurallar, tipler])

  const filtreliKurallar = useMemo(() => {
    return kayitliKurallar
      .filter(r => (kuralOdaFiltresi==='ALL' ? true : r.roomType===kuralOdaFiltresi))
      .sort((a,b)=> (b.createdAt || '').localeCompare(a.createdAt || ''))
  }, [kayitliKurallar, kuralOdaFiltresi])

  const kuralOzet = (r) => {
    const base = `${r.start} → ${r.end} • ${r.price!=null && r.price!=='' ? formatTRY(r.price) : '—'} • ${r.stopSell ? 'Stop-Sell' : 'Satış Açık'}`
    if (r.type === 'days') return `${base} • ${haftalikGunlerText(r.weekdays || [])}`
    return base
  }

  const kuralDuzenle = (r) => {
    setInvOpen(true)
    setKuralDuzenId(r.id)
    setEnvanter(e=>({ ...e, roomType: r.roomType }))
    if (r.type === 'range') {
      setAktifSekme('takvim')
      setEnvanter(e => ({
        ...e, start:r.start, end:r.end,
        price: r.price ?? '', allotment: r.allotment ?? '', stopSell: !!r.stopSell,
        ruleName: r.name || 'Kural', saveAsRule: true
      }))
    } else {
      setAktifSekme('gunbazli')
      setKurallar([{ id: Date.now(), ad: r.name || 'Kural', weekdays: [...(r.weekdays||[])], start: r.start, end: r.end, price: r.price ?? '' }])
      setGunbazliKaydet(true)
    }
    window.scrollTo({ top: 0, behavior:'smooth' })
  }

  const kuralUygulaButon = async (r) => {
    setEnvanterUyguluyor(true)
    try {
      await applyRuleToAPI(r)
      await envanterGetir()
      alert('Kural uygulandı')
    } catch (err) {
      showApiError(err, 'Kural uygulanamadı')
    } finally {
      setEnvanterUyguluyor(false)
    }
  }

  /* ------- Görüntüleme ------- */
  const filtreli = useMemo(() => {
    if (!debouncedArama) return tipler
    return tipler.filter(t =>
      [t.name, t.code, t.bedType, konaklamaEtiketi(t.propertyType)].filter(Boolean)
        .some(s => String(s).toLowerCase().includes(debouncedArama))
    )
  }, [tipler, debouncedArama])

  const ozellikListesiKisalt = (t) => {
    const arr = [
      ...(t.amenities || []).map(v => etiket(OZELLIKLER, v)),
      ...(t.scenicViews || []).map(v => etiket(MANZARALAR, v)),
      ...(t.hasPool     ? ['Havuz'] : []),
      ...(t.hasJacuzzi  ? ['Jakuzi'] : []),
      ...(t.hasKitchen  ? ['Mutfak'] : []),
      ...(t.kitchenFeatures || []).map(v => etiket(MUTFAK_OZELLK, v)),
    ].filter(Boolean)
    if (arr.length <= 3) return arr.join(', ')
    return `${arr.slice(0,3).join(', ')} +${arr.length - 3} daha`
  }

  return (
    <div>
      <style>{calendarStyles}</style>

      <Header title="Oda Tipleri & Envanter" subtitle="Oda tipi oluştur • Özellikler • Envanter (fiyat/allotment/stop-sell) toplu düzenle • Kayıtlı Kurallar • İşlem geçmişi" />

      {/* Üst aksiyon bar: iki buton */}
      <div className="card" style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <button
          className="btn"
          onClick={()=>setFormOpen(o=>!o)}
          aria-expanded={formOpen}
          style={{background:'linear-gradient(135deg,#34d399 0%,#22d3ee 100%)', border:'none', color:'#0b1220', fontWeight:600}}
        >
          {formOpen ? 'Oda Ekle (Gizle)' : 'Oda Ekle'}
        </button>
        <button
          className="btn"
          onClick={()=>setInvOpen(o=>!o)}
          aria-expanded={invOpen}
          style={{background:'linear-gradient(135deg,#34d399 0%,#22d3ee 100%)', border:'none', color:'#0b1220', fontWeight:600}}
        >
          {invOpen ? 'Toplu Envanter Düzenle (Gizle)' : 'Toplu Envanter Düzenle'}
        </button>
      </div>

      {/* -------- ODA TİPİ FORMU (AÇ/KAPA) -------- */}
      <div style={{overflow:'hidden', transition:'max-height .25s ease', maxHeight: formOpen ? 2000 : 0, marginBottom: formOpen ? 16 : 0}}>
        <div className="card">
          <div className="label" style={{marginBottom:8}}>
            {duzenlemeId ? 'Oda Tipini Düzenle' : 'Yeni Oda Tipi'}
          </div>

          <form className="form-grid" onSubmit={kaydet}>
            {/* Kimlik */}
            <label className="field">
              <span className="field-label">Kod <small className="muted">(STD, DLX…)</small></span>
              <input ref={kodRef} className="input" value={form.code} onChange={e=>setForm({...form, code:e.target.value})} required disabled={kaydediyor} />
            </label>
            <label className="field">
              <span className="field-label">Ad</span>
              <input className="input" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required disabled={kaydediyor} />
            </label>
            <label className="field">
              <span className="field-label">Baz Fiyat (₺)</span>
              <input className="input" type="number" min="0" max="10000000" value={form.basePrice}
                onChange={e=>setForm({...form, basePrice: Math.max(0, Math.min(10000000, Number(e.target.value || 0))) })} disabled={kaydediyor} />
            </label>

            {/* Kapasite */}
            <label className="field">
              <span className="field-label">Yetişkin Kapasitesi</span>
              <input className="input" type="number" min="0" max="30" value={form.capacityAdults}
                onChange={e=>setForm({...form, capacityAdults: Math.max(0, Math.min(30, Number(e.target.value || 0)))})} disabled={kaydediyor} />
            </label>
            <label className="field">
              <span className="field-label">Çocuk Kapasitesi</span>
              <input className="input" type="number" min="0" max="30" value={form.capacityChildren}
                onChange={e=>setForm({...form, capacityChildren: Math.max(0, Math.min(30, Number(e.target.value || 0)))})} disabled={kaydediyor} />
            </label>
            <label className="field">
              <span className="field-label">Toplam Oda Adedi</span>
              <input className="input" type="number" min="0" max="9999" value={form.totalRooms}
                onChange={e=>setForm({...form, totalRooms: Math.max(0, Math.min(9999, Number(e.target.value || 0)))})} disabled={kaydediyor} />
            </label>

            {/* Genel */}
            <label className="field">
              <span className="field-label">Yatak Tipi (genel)</span>
              <select className="select" value={form.bedType} onChange={e=>setForm({...form, bedType:e.target.value})} disabled={kaydediyor}>
                <option value="">Seçiniz</option>
                {YATAK_TIPLERI.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Metrekare</span>
              <input className="input" type="number" min="0" max="1000" value={form.sizeSqm}
                onChange={e=>setForm({...form, sizeSqm: Math.max(0, Math.min(1000, Number(e.target.value || 0)))})} disabled={kaydediyor} />
            </label>
            <label className="field">
              <span className="field-label">Sigara</span>
              <select className="select" value={form.smoking ? '1':'0'} onChange={e=>setForm({...form, smoking: e.target.value==='1'})} disabled={kaydediyor}>
                <option value="0">İçilmeyen</option><option value="1">İçilebilir</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Konaklama Tipi</span>
              <select className="select" value={form.propertyType} onChange={e=>setForm({...form, propertyType:e.target.value})} disabled={kaydediyor}>
                {KONAKLAMA_TIPLERI.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>

            {/* Unit tip alanları */}
            {unitTipMi ? (
              <>
                <label className="field">
                  <span className="field-label">Yatak Odası Sayısı</span>
                  <input className="input" type="number" min="0" max="20" value={form.bedrooms?.length || 0}
                    onChange={e=>yatakOdasiSayisiAyarla(e.target.value)} disabled={kaydediyor} />
                </label>
                <label className="field">
                  <span className="field-label">Banyo</span>
                  <input className="input" type="number" min="0" max="20" value={form.unitBathrooms}
                    onChange={e=>setForm({...form, unitBathrooms: Math.max(0, Math.min(20, Number(e.target.value || 0)))})} disabled={kaydediyor} />
                </label>

                <div className="field" style={{gridColumn:'1 / -1'}}>
                  <span className="field-label">Yatak Odası Detayları</span>
                  <div style={{display:'grid', gap:12}}>
                    {(form.bedrooms || []).map((oda, idx) => (
                      <div key={idx} className="card" style={{padding:12}}>
                        <div className="label" style={{marginBottom:8}}>Yatak Odası {idx + 1}</div>
                        <table className="table">
                          <thead><tr><th>Adet</th><th>Yatak Tipi</th><th className="right">Aksiyon</th></tr></thead>
                          <tbody>
                            {(oda.beds || []).map((b, bi) => (
                              <tr key={bi}>
                                <td style={{width:140}}>
                                  <input className="input" type="number" min="0" max="10" value={b.count}
                                    onChange={(e)=>yatakSatiriGuncelle(idx, bi, 'count', e.target.value)} disabled={kaydediyor} />
                                </td>
                                <td>
                                  <select className="select" value={b.type} onChange={(e)=>yatakSatiriGuncelle(idx, bi, 'type', e.target.value)} disabled={kaydediyor}>
                                    {YATAK_TIPLERI.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                </td>
                                <td className="right"><button type="button" className="btn sm danger" onClick={()=>yatakSatiriSil(idx, bi)} disabled={kaydediyor}>Sil</button></td>
                              </tr>
                            ))}
                            {(!oda.beds || !oda.beds.length) && (<tr><td colSpan={3} className="muted">Bu odada tanımlı yatak yok.</td></tr>)}
                          </tbody>
                        </table>
                        <button type="button" className="btn sm" onClick={()=>yatakSatiriEkle(idx)} disabled={kaydediyor}>Yatak satırı ekle</button>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span className="field-label">Toplam Yatak (otomatik)</span>
                  <input className="input" value={toplamYatak(form.bedrooms)} readOnly />
                </label>
              </>
            ) : (
              <>
                <label className="field"><span className="field-label">Yatak Odası (adet)</span>
                  <input className="input" type="number" min="0" max="20" value={form.unitBedrooms}
                    onChange={e=>setForm({...form, unitBedrooms: Math.max(0, Math.min(20, Number(e.target.value || 0)))})} disabled={kaydediyor} />
                </label>
                <label className="field"><span className="field-label">Banyo</span>
                  <input className="input" type="number" min="0" max="20" value={form.unitBathrooms}
                    onChange={e=>setForm({...form, unitBathrooms: Math.max(0, Math.min(20, Number(e.target.value || 0)))})} disabled={kaydediyor} />
                </label>
                <label className="field"><span className="field-label">Toplam Yatak</span>
                  <input className="input" type="number" min="0" max="50" value={form.unitBeds}
                    onChange={e=>setForm({...form, unitBeds: Math.max(0, Math.min(50, Number(e.target.value || 0)))})} disabled={kaydediyor} />
                </label>
              </>
            )}

            {/* Özellikler */}
            <div className="field" style={{gridColumn:'1 / -1'}}>
              <span className="field-label">Oda Özellikleri</span>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {OZELLIKLER.map(a => <Chip key={a.value} active={form.amenities.includes(a.value)} onClick={() => !kaydediyor && toggleDizide('amenities', a.value)}>{a.label}</Chip>)}
                {EKSTRALAR.map(ex => <Chip key={ex.key} active={!!form[ex.key]} onClick={() => !kaydediyor && setForm(f => ({ ...f, [ex.key]: !f[ex.key] }))}>{ex.label}</Chip>)}
              </div>
            </div>

            {/* Manzara */}
            <div className="field" style={{gridColumn:'1 / -1'}}>
              <span className="field-label">Manzara</span>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {MANZARALAR.map(v => <Chip key={v.value} active={form.scenicViews.includes(v.value)} onClick={() => !kaydediyor && toggleDizide('scenicViews', v.value)}>{v.label}</Chip>)}
              </div>
            </div>

            {/* Açıklama */}
            <label className="field" style={{gridColumn:'1 / -1'}}>
              <span className="field-label">Açıklama</span>
              <textarea className="input" rows={2} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} disabled={kaydediyor} />
            </label>

            {/* Kanal Kodları */}
            <Accordion title="Kanal Kodları (opsiyonel)">
              <div className="form-grid">
                <label className="field"><span className="field-label">Direct</span>
                  <input className="input" value={form.channelCodes.direct} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, direct:e.target.value}})} disabled={kaydediyor} />
                </label>
                <label className="field"><span className="field-label">Airbnb</span>
                  <input className="input" value={form.channelCodes.airbnb} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, airbnb:e.target.value}})} disabled={kaydediyor} />
                </label>
                <label className="field"><span className="field-label">Booking</span>
                  <input className="input" value={form.channelCodes.booking} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, booking:e.target.value}})} disabled={kaydediyor} />
                </label>
                <label className="field"><span className="field-label">Etstur</span>
                  <input className="input" value={form.channelCodes.etstur} onChange={e=>setForm({...form, channelCodes:{...form.channelCodes, etstur:e.target.value}})} disabled={kaydediyor} />
                </label>
              </div>
            </Accordion>

            {/* Durum */}
            <label className="field">
              <span className="field-label">Durum</span>
              <select className="select" value={form.active ? '1' : '0'} onChange={e=>setForm({...form, active: e.target.value==='1'})} disabled={kaydediyor}>
                <option value="1">Aktif</option><option value="0">Pasif</option>
              </select>
            </label>

            <div style={{display:'flex', gap:8, gridColumn:'1 / -1'}}>
              <button className="btn primary" type="submit" disabled={kaydediyor}>{kaydediyor ? 'Kaydediliyor…' : (duzenlemeId ? 'Güncelle' : 'Ekle')}</button>
              {duzenlemeId && <button className="btn" type="button" onClick={()=>{ setDuzenlemeId(null); setForm(bosForm) }} disabled={kaydediyor}>Vazgeç</button>}
            </div>
          </form>
        </div>
      </div>

      {/* -------- ODA TİPLERİ -------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="label" style={{marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span>Oda Tipleri</span>
          <input className="input" style={{maxWidth:320}} placeholder="Ara: Kod, Ad, Tip…" value={aramaQ} onChange={(e)=>setAramaQ(e.target.value)} />
        </div>
        {yukleniyor ? 'Yükleniyor…' : (
          <table className="table hover">
            <thead><tr><th>Kod</th><th>Ad</th><th>Baz Fiyat</th><th>Kapasite</th><th>Toplam Oda</th><th>Tip</th><th>Özellikler</th><th>Durum</th><th className="right">Aksiyon</th></tr></thead>
            <tbody>
              {filtreli.map(t => (
                <tr key={t._id}>
                  <td>{t.code}</td><td>{t.name}</td>
                  <td>{formatTRY(t.basePrice)}</td>
                  <td>{t.capacityAdults}+{t.capacityChildren}</td>
                  <td>{t.totalRooms}</td>
                  <td>{konaklamaEtiketi(t.propertyType || 'room')}</td>
                  <td className="muted" style={{fontSize:12}}>{ozellikListesiKisalt(t)}</td>
                  <td>{t.active === false ? 'Pasif' : 'Aktif'}</td>
                  <td className="right">
                    <div style={{display:'inline-flex', gap:8}}>
                      <button className="btn sm" onClick={()=>duzenle(t)} disabled={!!silinenId || !!kopyalananId}>Düzenle</button>
                      <button className="btn sm" onClick={()=>kopyala(t)} disabled={!!silinenId || !!kopyalananId}>{kopyalananId===t._id ? 'Kopyalanıyor…' : 'Kopyala'}</button>
                      <button className="btn sm danger" onClick={()=>sil(t)} disabled={silinenId===t._id || !!kopyalananId}>{silinenId===t._id ? 'Siliniyor…' : 'Sil'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtreli.length===0 && <tr><td colSpan={9} className="muted">Eşleşen oda tipi yok</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* -------- ENVANTER (SEKMELİ) — AÇ/KAPA -------- */}
      <div style={{overflow:'hidden', transition:'max-height .25s ease', maxHeight: invOpen ? 5000 : 0}}>
        <div className="card">
          <div className="label" style={{marginBottom:8}}>Envanter (Toplu Düzenleme)</div>

          <div className="form-grid">
            <label className="field">
              <span className="field-label">Oda Tipi</span>
              <select className="select" value={envanter.roomType} onChange={e=>setEnvanter({...envanter, roomType:e.target.value})} required>
                <option value="">Seçiniz</option>
                {odaTipSecenekleri.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {/* Sekmeler */}
          <div className="tabs">
            {['takvim','haftasonu','gunbazli','islemler'].map(k => (
              <div key={k} className={`tab ${aktifSekme===k?'active':''}`} onClick={()=>setAktifSekme(k)}>
                {k==='takvim' ? 'Takvim' : k==='haftasonu' ? 'Hafta Sonu' : k==='gunbazli' ? 'Gün Bazlı' : 'İşlemler'}
              </div>
            ))}
          </div>

          {/* — Takvim Sekmesi — */}
          {aktifSekme==='takvim' && (
            <form className="form-grid" onSubmit={envanterUygula}>
              <div className="field" style={{gridColumn:'1 / -1'}}>
                <span className="field-label">Tarih Aralığı</span>
                <div style={{display:'flex', gap:16, alignItems:'center', flexWrap:'wrap'}}>
                  <RangeCalendar
                    start={envanter.start}
                    end={envanter.end}
                    onChange={({start, end}) => setEnvanter(e => ({...e, start: start || e.start, end: end || ''}))}
                  />
                  <div className="muted">
                    Başlangıç: <b>{new Date(`${envanter.start}T00:00:00`).toLocaleDateString('tr-TR')}</b><br/>
                    Bitiş: <b>{envanter.end ? new Date(`${envanter.end}T00:00:00`).toLocaleDateString('tr-TR') : '—'}</b>
                  </div>
                </div>
              </div>

              <label className="field">
                <span className="field-label">Kural Adı</span>
                <input className="input" placeholder="Opsiyonel" value={envanter.ruleName} onChange={(e)=>setEnvanter({...envanter, ruleName:e.target.value})} />
              </label>

              <label className="field">
                <span className="field-label">Fiyat (₺)</span>
                <input className="input" type="number" min="0" max="10000000" placeholder="Opsiyonel" value={envanter.price}
                  onChange={e=>setEnvanter({...envanter, price: Math.max(0, Math.min(10000000, Number(e.target.value || 0)))})}
                />
              </label>
              <label className="field">
                <span className="field-label">Allotment</span>
                <input className="input" type="number" min="0" max="500" placeholder="Opsiyonel" value={envanter.allotment}
                  onChange={e=>setEnvanter({...envanter, allotment: Math.max(0, Math.min(500, Number(e.target.value || 0)))})}
                />
              </label>
              <label className="field">
                <span className="field-label">Satış</span>
                <select className="select" value={envanter.stopSell ? '1' : '0'} onChange={e=>setEnvanter({...envanter, stopSell: e.target.value==='1'})}>
                  <option value="0">Açık</option><option value="1">Stop-Sell</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Kural Olarak Kaydet</span>
                <select className="select" value={envanter.saveAsRule ? '1':'0'} onChange={(e)=>setEnvanter({...envanter, saveAsRule: e.target.value==='1'})}>
                  <option value="1">Evet</option><option value="0">Hayır</option>
                </select>
              </label>
              <div style={{display:'flex', alignItems:'end'}}>
                <button className="btn primary" style={{minWidth:160}} disabled={envanterUyguluyor}>
                  {envanterUyguluyor ? 'Uygulanıyor…' : (kuralDuzenId ? 'Güncelle & Uygula' : 'Uygula')}
                </button>
              </div>
            </form>
          )}

          {/* — Hafta Sonu Sekmesi — */}
          {aktifSekme==='haftasonu' && (
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Kural Adı</span>
                <input className="input" value={haftaSonuAd} onChange={(e)=>setHaftaSonuAd(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Yıl</span>
                <select className="select" value={haftaSonuYil} onChange={(e)=>setHaftaSonuYil(Number(e.target.value))}>
                  {[yilNow-1, yilNow, yilNow+1, yilNow+2].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Hafta Sonu Günleri</span>
                <div className="chips">
                  {GUNLER.map(g => (
                    <Chip key={g.val} active={haftaSonuGunleri.includes(g.val)} onClick={()=>setHaftaSonuGunleri(curr => curr.includes(g.val) ? curr.filter(x=>x!==g.val) : [...curr, g.val])}>
                      {g.tam}
                    </Chip>
                  ))}
                </div>
                <small className="muted">Genelde Cuma & Cumartesi seçilir.</small>
              </label>
              <label className="field">
                <span className="field-label">Hafta Sonu Fiyatı (₺)</span>
                <input className="input" type="number" min="0" max="10000000" value={haftaSonuFiyat} onChange={(e)=>setHaftaSonuFiyat(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Kural Olarak Kaydet</span>
                <select className="select" value={haftaSonuKaydet ? '1':'0'} onChange={(e)=>setHaftaSonuKaydet(e.target.value==='1')}>
                  <option value="1">Evet</option><option value="0">Hayır</option>
                </select>
              </label>
              <div style={{display:'flex', alignItems:'end'}}>
                <button className="btn" onClick={haftaSonuUygula} disabled={envanterUyguluyor || !envanter.roomType}>
                  {envanterUyguluyor ? 'Uygulanıyor…' : 'Yıl Boyu Hafta Sonlarını Uygula'}
                </button>
              </div>
            </div>
          )}

          {/* — Gün Bazlı Sekmesi — */}
          {aktifSekme==='gunbazli' && (
            <div className="card" style={{padding:12}}>
              {kurallar.length===0 && <div className="muted" style={{marginBottom:8}}>Henüz kural yok. “+ Kural Ekle” ile başlayın.</div>}
              {kurallar.map((r, idx) => {
                const say = (r.start && r.end && r.weekdays?.length) ? sayGuneGore(r.start, r.end, r.weekdays) : 0
                return (
                  <div key={r.id} className="card" style={{padding:12, marginBottom:12}}>
                    <div className="label" style={{marginBottom:8}}>Kural {idx+1} — {r.ad || 'isimsiz'} {say ? `• ${say} gün` : ''}</div>
                    <div className="form-grid">
                      <label className="field"><span className="field-label">Ad</span>
                        <input className="input" value={r.ad || ''} onChange={(e)=>kuralPanelGuncelle(r.id,'ad',e.target.value)} />
                      </label>
                      <label className="field"><span className="field-label">Başlangıç</span>
                        <input className="input" type="date" value={r.start || ''} onChange={(e)=>kuralPanelGuncelle(r.id,'start',e.target.value)} />
                      </label>
                      <label className="field"><span className="field-label">Bitiş</span>
                        <input className="input" type="date" value={r.end || ''} onChange={(e)=>kuralPanelGuncelle(r.id,'end',e.target.value)} />
                      </label>
                      <label className="field"><span className="field-label">Fiyat (₺)</span>
                        <input className="input" type="number" min="0" max="10000000" value={r.price} onChange={(e)=>kuralPanelGuncelle(r.id,'price',e.target.value)} />
                      </label>
                      <div className="field" style={{gridColumn:'1 / -1'}}>
                        <span className="field-label">Günler</span>
                        <div className="chips">
                          {GUNLER.map(g => <Chip key={g.val} active={r.weekdays?.includes(g.val)} onClick={()=>kuralPanelGunToggle(r.id, g.val)}>{g.tam}</Chip>)}
                        </div>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:8}}>
                      <button type="button" className="btn sm danger" onClick={()=>kuralPanelSil(r.id)}>Kuralı Sil</button>
                    </div>
                  </div>
                )
              })}

              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <button type="button" className="btn sm" onClick={kuraliEkle}>+ Kural Ekle</button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={kurallariUygula}
                  disabled={envanterUyguluyor || !envanter.roomType}
                >
                  {envanterUyguluyor ? 'Uygulanıyor…' : (kuralDuzenId ? 'Güncelle & Uygula' : 'Kuralları Uygula')}
                </button>
                <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
                  <input type="checkbox" checked={gunbazliKaydet} onChange={(e)=>setGunbazliKaydet(e.target.checked)} />
                  <span className="muted">Kural olarak kaydet</span>
                </label>
              </div>
            </div>
          )}

          {/* — İşlemler Sekmesi — */}
          {aktifSekme==='islemler' && (
            <div className="card" style={{padding:12}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                <div className="label">İşlem Geçmişi</div>
                {islemler.length>0 && <button className="btn sm danger" onClick={opsHepsiniSil}>Hepsini Sil</button>}
              </div>

              <table className="table hover">
                <thead>
                  <tr>
                    <th>Tarih/Saat</th>
                    <th>Oda Tipi</th>
                    <th>Tür</th>
                    <th>Özet</th>
                    <th className="right">Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {islemler.map(op => (
                    <tr key={op.id}>
                      <td>{new Date(op.when).toLocaleString('tr-TR')}</td>
                      <td>{roomTypeLabelById(op.roomType)}</td>
                      <td>{op.kind==='range'?'Aralık':op.kind==='weekend'?'Hafta Sonu':'Gün Bazlı'}</td>
                      <td className="ops-summary">{opsOzet(op)}</td>
                      <td className="right">
                        <div style={{display:'inline-flex', gap:8}}>
                          <button className="btn sm" onClick={()=>opsDuzenle(op)}>Düzenle</button>
                          <button className="btn sm" onClick={()=>opsTekrarUygula(op)} disabled={envanterUyguluyor}>Uygula</button>
                          <button className="btn sm danger" onClick={()=>opsSil(op.id)}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {islemler.length===0 && (
                    <tr>
                      <td colSpan={5} className="muted">Henüz kayıtlı işlem yok. Takvim/Hafta Sonu/Gün Bazlı sekmelerinden bir uygulama yaptığınızda burada listelenecek.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Önizleme */}
          <div className="label" style={{margin:'12px 0 6px'}}>Önizleme</div>
          <div style={{overflowX:'auto'}}>
            <table className="table">
              <thead><tr><th>TARİH</th><th>FİYAT</th><th>ALLOTMENT</th><th>STOP</th></tr></thead>
              <tbody>
                {envanterOnizleme.map(x => (
                  <tr key={x._id || String(x.date)}>
                    <td>{new Date(x.date).toLocaleDateString('tr-TR')}</td>
                    <td>{formatTRY(x.price)}</td>
                    <td>{x.allotment ?? 0}</td>
                    <td>{x.stopSell ? 'Evet' : 'Hayır'}</td>
                  </tr>
                ))}
                {envanterOnizleme.length===0 && <tr><td className="muted" colSpan={4}>Seçilen aralık için veri yok</td></tr>}
              </tbody>
            </table>
          </div>

          {/* —— KAYITLI KURALLAR —— */}
          <div className="label" style={{margin:'16px 0 8px'}}>Kayıtlı Kurallar</div>
          <div className="card" style={{padding:12}}>
            {/* Oda filtresi chip’leri */}
            <div className="chips" style={{marginBottom:8}}>
              <Chip active={kuralOdaFiltresi==='ALL'} onClick={()=>setKuralOdaFiltresi('ALL')}>Tümü</Chip>
              {roomsWithRules.map(r => (
                <Chip key={r.id} active={kuralOdaFiltresi===r.id} onClick={()=>setKuralOdaFiltresi(r.id)}>
                  {r.label} <span className="muted">({r.count})</span>
                </Chip>
              ))}
            </div>

            <table className="table hover">
              <thead>
                <tr>
                  <th>Oda</th>
                  <th>Ad</th>
                  <th>Tip</th>
                  <th>Özet</th>
                  <th className="right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtreliKurallar.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span
                        className="link"
                        style={{cursor:'pointer', textDecoration:'underline'}}
                        onClick={()=>setKuralOdaFiltresi(r.roomType)}
                        title="Bu odaya filtrele"
                      >
                        {roomTypeLabelById(r.roomType)}
                      </span>
                    </td>
                    <td>{r.name || '-'}</td>
                    <td>{r.type==='range' ? 'Takvim (Aralık)' : 'Gün Bazlı'}</td>
                    <td className="rule-summary">{kuralOzet(r)}</td>
                    <td className="right">
                      <div style={{display:'inline-flex', gap:8}}>
                        <button className="btn sm" onClick={()=>kuralDuzenle(r)}>Düzenle</button>
                        <button className="btn sm" onClick={()=>kuralUygulaButon(r)} disabled={envanterUyguluyor}>Uygula</button>
                        <button className="btn sm danger" onClick={()=>kuralSil(r.id)}>Sil</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtreliKurallar.length===0 && (
                  <tr><td colSpan={5} className="muted">Kayıtlı kural yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  )
}

/* ---------- Basit Accordion ---------- */
function Accordion({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{gridColumn:'1 / -1'}}>
      <button type="button" className="btn" onClick={()=>setOpen(v=>!v)} style={{marginBottom:8}}>
        {open ? '▲ ' : '▼ '} {title}
      </button>
      {open && <div className="card" style={{padding:12}}>{children}</div>}
    </div>
  )
}
