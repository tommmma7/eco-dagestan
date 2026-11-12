import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API = `http://${window.location.hostname}:8000`
const PROFILE_KEY = 'caspian_eco_profile_v1'
const DEFAULT_PROFILE = {
  name: 'Инспектор ООПТ',
  phone: '',
  gender: 'Не указан',
  email: '',
  role: 'Инспектор ООПТ',
  reserve: 'Дагестанский заповедник',
  shift: 'Дневная',
}

const TYPES = { boat: 'Браконьерский катер', gunshot: 'Выстрел', spill: 'Сброс / аномалия' }
const NAV = [
  ['home', 'Главная'],
  ['map', 'Карта мониторинга'],
  ['migration', 'Миграция животных'],
  ['audio', 'Акустический анализ'],
  ['water', 'Водная аналитика'],
  ['incidents', 'Инциденты'],
  ['settings', 'Настройки'],
]

const GOLD = '#D8C66A'
const WATER = '#83B7AC'
const riskColor = r => (r > 0.7 ? '#E5604D' : r > 0.4 ? '#D8C66A' : '#83B7AC')
const dot = c => L.divIcon({ className: '', html: `<div class="dot ${c}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
const CITIES = [['Астрахань', 46.35, 48.04], ['Махачкала', 42.98, 47.5], ['Атырау', 47.11, 51.92], ['Актау', 43.65, 51.15], ['Баку', 40.41, 49.87]]
const SIGHTINGS = [[44.45, 47.45], [44.5, 47.6], [44.3, 47.35], [44.7, 47.2], [44.9, 46.9], [45.1, 47.0], [44.6, 47.75]]
const ROUTES = [[[44.4, 47.5], [44.8, 47.1], [45.3, 47.4], [45.7, 48.2]], [[44.4, 47.5], [43.9, 47.7], [43.4, 47.6]]]
const FORECAST = [[45.7, 48.2], [46.0, 48.6], [46.2, 49.0]]
const RECORDS = [
  { id: 1, name: 'Буй «о. Тюлений» · 02:14', type: 'boat', label: 'Браконьерский катер', conf: 94 },
  { id: 2, name: 'Буй «Дельта Волги-1» · 05:40', type: 'wave', label: 'Шум волн / норма', conf: 88 },
  { id: 3, name: 'Буй «Кизлярский залив» · 07:05', type: 'gunshot', label: 'Выстрел', conf: 91 },
]
const SEASON = [20, 28, 35, 55, 78, 90, 70, 52, 40, 33, 25, 18]

const seeded = s => () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
const series = (seed, base, amp, n = 24) => {
  const r = seeded(seed)
  let v = base
  return Array.from({ length: n }, () => (v += (r() - 0.5) * amp, +v.toFixed(2)))
}

const getInitials = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'И'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE
  } catch {
    return DEFAULT_PROFILE
  }
}

/* Crisp SVG Icon Set (zero emojis, animates smoothly on hover) */
const Svg = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const Icons = {
  shield: (
    <Svg size={20}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M8.5 12.5c1.5-2 5.5-2 7 0" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
    </Svg>
  ),
  home: (
    <Svg>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  map: (
    <Svg>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </Svg>
  ),
  migration: (
    <Svg>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8 16.5C11 14 10 9 15.5 7.2" />
      <path d="M14 5l2.5 1-1 2.5" />
    </Svg>
  ),
  audio: (
    <Svg>
      <path d="M3 12h2l2-5 3 10 3-13 3 11 2-3h3" />
    </Svg>
  ),
  water: (
    <Svg>
      <path d="M12 2.5s6 6.8 6 11a6 6 0 1 1-12 0c0-4.2 6-11 6-11z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2" />
    </Svg>
  ),
  incidents: (
    <Svg>
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
  ),
  settings: (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  ),
  search: (
    <Svg size={15}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  ),
  radarAlert: (
    <Svg size={18}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M7.5 16.5a6.5 6.5 0 0 1 0-9" />
      <path d="M16.5 7.5a6.5 6.5 0 0 1 0 9" />
      <path d="M4.5 19.5a10.5 10.5 0 0 1 0-15" />
      <path d="M19.5 4.5a10.5 10.5 0 0 1 0 15" />
    </Svg>
  ),
  chevronDown: (
    <Svg size={14}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  ),
  close: (
    <Svg size={16}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  ),
  user: (
    <Svg size={14}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  phone: (
    <Svg size={14}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </Svg>
  ),
  mail: (
    <Svg size={14}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Svg>
  ),
  play: (
    <Svg size={14}>
      <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />
    </Svg>
  ),
  check: (
    <Svg size={16}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  ),
  edit: (
    <Svg size={14}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  ),
  bolt: (
    <Svg size={14}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  ),
}

function play(type, onDone) {
  const C = window.AudioContext || window.webkitAudioContext
  if (!C) return
  const ctx = new C()
  const g = ctx.createGain()
  g.connect(ctx.destination)
  const t = ctx.currentTime
  if (type === 'gunshot') {
    const len = ctx.sampleRate * 0.4
    const b = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12))
    const s = ctx.createBufferSource()
    s.buffer = b
    s.connect(g)
    g.gain.value = 0.8
    s.start()
    setTimeout(() => onDone && onDone(), 500)
  } else {
    const o = ctx.createOscillator()
    const lfo = ctx.createOscillator()
    const lg = ctx.createGain()
    o.type = type === 'boat' ? 'sawtooth' : 'sine'
    o.frequency.value = type === 'boat' ? 85 : 220
    lfo.frequency.value = type === 'boat' ? 14 : 0.5
    lg.gain.value = type === 'boat' ? 20 : 30
    lfo.connect(lg)
    lg.connect(o.frequency)
    g.gain.setValueAtTime(type === 'boat' ? 0.25 : 0.08, t)
    g.gain.linearRampToValueAtTime(0, t + 3)
    o.connect(g)
    o.start(t)
    lfo.start(t)
    o.stop(t + 3)
    lfo.stop(t + 3)
    setTimeout(() => onDone && onDone(), 3000)
  }
}

function Card({ title, icon, right, cls = '', children }) {
  return (
    <div className={'card ' + cls}>
      {title && (
        <div className="ct">
          <span className="ct-title">
            {icon && <span className="ct-ic">{icon}</span>}
            {title}
          </span>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

function Stat({ label, icon, value, unit, sub, cls }) {
  return (
    <Card title={label} icon={icon} cls={cls}>
      <div className="big">
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </Card>
  )
}

function Chart({ data, color = '#48543A', h = 110 }) {
  const w = 320
  const mn = Math.min(...data)
  const mx = Math.max(...data)
  const r = mx - mn || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 8 - ((v - mn) / r) * (h - 24)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" preserveAspectRatio="none">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity=".2" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.5" />
    </svg>
  )
}

function Wave({ seed, type, crit, playing }) {
  const r = seeded(seed)
  return (
    <div className={'wave ' + (playing ? 'playing' : '')}>
      {Array.from({ length: 90 }, (_, i) => {
        const env = type === 'gunshot' ? Math.exp(-Math.abs(i - 30) / 6) : type === 'boat' ? 0.5 + 0.4 * Math.sin(i / 4) : 0.25 + 0.15 * Math.sin(i / 9)
        return <i key={i} style={{ height: Math.max(4, env * (0.5 + r()) * 100) + '%', background: crit ? '#E5604D' : '#83B7AC' }} />
      })}
    </div>
  )
}

function MapView({ data, layers, onPick, focus, showLabels = true, center = [44.5, 47.8], zoom = 6 }) {
  const el = useRef(null)
  const map = useRef(null)
  const grp = useRef({})

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView(center, zoom)
    L.control.attribution({ prefix: false }).addTo(m)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 12 }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    grp.current = {
      labels: L.layerGroup().addTo(m),
      zones: L.layerGroup().addTo(m),
      buoys: L.layerGroup().addTo(m),
      incidents: L.layerGroup().addTo(m),
      animals: L.layerGroup().addTo(m),
    }
    map.current = m
    setTimeout(() => m.invalidateSize(), 100)
    return () => m.remove()
  }, [])

  useEffect(() => {
    const g = grp.current
    if (!g.labels) return
    g.labels.clearLayers()
    if (showLabels) {
      CITIES.forEach(([n, a, b]) => L.marker([a, b], { icon: L.divIcon({ className: '', html: `<div class="city">● ${n}</div>`, iconSize: [90, 14] }), interactive: false }).addTo(g.labels))
      L.marker([41.9, 50.8], { icon: L.divIcon({ className: '', html: '<div class="sea-l">КАСПИЙСКОЕ МОРЕ</div>', iconSize: [220, 20] }), interactive: false }).addTo(g.labels)
    }
  }, [showLabels])

  useEffect(() => {
    const g = grp.current
    if (!data || !g.zones) return
    g.zones.clearLayers()
    g.buoys.clearLayers()
    g.incidents.clearLayers()
    g.animals.clearLayers()
    if (layers.zones) data.risk_zones.forEach(z => L.polygon(z.polygon, { color: riskColor(z.risk), weight: 1.5, fillOpacity: 0.3 }).on('click', () => onPick && onPick({ kind: 'zone', obj: z })).addTo(g.zones))
    if (layers.buoys) data.buoys.forEach(b => L.marker([b.lat, b.lon], { icon: dot(b.status === 'critical' ? 'crit' : 'ok') }).on('click', () => onPick && onPick({ kind: 'buoy', obj: b })).addTo(g.buoys))
    if (layers.incidents) data.incidents.forEach(i => L.marker([i.lat, i.lon], { icon: dot('inc') }).on('click', () => onPick && onPick({ kind: 'incident', obj: i })).addTo(g.incidents))
    if (layers.animals) {
      SIGHTINGS.forEach(p => L.circleMarker(p, { radius: 5, color: GOLD, fillColor: GOLD, fillOpacity: 0.9, weight: 1 }).addTo(g.animals))
      ROUTES.forEach(r => L.polyline(r, { color: WATER, weight: 3 }).addTo(g.animals))
      L.polyline(FORECAST, { color: GOLD, weight: 3, dashArray: '8 8' }).addTo(g.animals)
    }
  }, [data, layers])

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], 9)
  }, [focus])

  return <div className="mapbox" ref={el} />
}

function ProfileModal({ profile, onSave, onClose }) {
  const [form, setForm] = useState(profile)
  const [formErr, setFormErr] = useState('')

  const set = (k, v) => {
    setFormErr('')
    setForm(f => ({ ...f, [k]: v }))
  }

  function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setFormErr('Укажите имя или ФИО инспектора')
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setFormErr('Проверьте формат электронной почты (например, name@example.ru)')
    }
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 7) {
      return setFormErr('Введите корректный номер телефона (минимум 7 цифр)')
    }
    onSave({
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      role: form.role.trim() || 'Инспектор ООПТ',
      reserve: form.reserve.trim() || 'Дагестанский заповедник',
    })
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-user">
            <div className="modal-avatar">{getInitials(form.name)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{form.name || 'Профиль инспектора'}</div>
              <div className="hint">{form.role || 'Инспектор ООПТ'} · {form.reserve || 'Заповедник'}</div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">{Icons.close}</button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-body">
            {formErr && <div className="f-err">{formErr}</div>}
            <div className="f-grid">
              <div className="field full">
                <label>{Icons.user} ФИО / Имя</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Например: Алина Магомедова" />
              </div>

              <div className="field">
                <label>{Icons.phone} Номер телефона</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+7 (999) 000-00-00" />
              </div>

              <div className="field">
                <label>{Icons.mail} Электронная почта</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="inspector@caspian.ru" />
              </div>

              <div className="field full">
                <label>Пол</label>
                <div className="seg">
                  {['Мужской', 'Женский', 'Не указан'].map(g => (
                    <button key={g} type="button" className={form.gender === g ? 'on' : ''} onClick={() => set('gender', g)}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Должность</label>
                <input type="text" value={form.role} onChange={e => set('role', e.target.value)} placeholder="Инспектор ООПТ" />
              </div>

              <div className="field">
                <label>Смена</label>
                <select value={form.shift} onChange={e => set('shift', e.target.value)}>
                  <option value="Дневная">Дневная</option>
                  <option value="Ночная">Ночная</option>
                  <option value="Суточное дежурство">Суточное дежурство</option>
                </select>
              </div>

              <div className="field full">
                <label>Территория / Заповедник</label>
                <input type="text" value={form.reserve} onChange={e => set('reserve', e.target.value)} placeholder="Дагестанский заповедник" />
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn">{Icons.check} Сохранить профиль</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [tab, setTab] = useState('home')
  const [selId, setSelId] = useState(null)
  const [pick, setPick] = useState(null)
  const [layers, setLayers] = useState({ buoys: true, zones: true, incidents: true, animals: false })
  const [rec, setRec] = useState(RECORDS[0])
  const [audio, setAudio] = useState(null)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [fStatus, setFStatus] = useState('all')
  const [fType, setFType] = useState('all')
  const [prefs, setPrefs] = useState({ push: true, sound: true, sms: false, zones: true, labels: true })

  const [profile, setProfile] = useState(loadProfile)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState(null)
  const notifyRef = useRef(null)

  const showToast = msg => {
    setToast(msg)
    setTimeout(() => setToast(cur => (cur === msg ? null : cur)), 2800)
  }

  async function load() {
    try {
      const r = await fetch(API + '/api/state')
      setData(await r.json())
      setErr(false)
    } catch {
      setErr(true)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onDocClick = e => {
      if (notifyRef.current && !notifyRef.current.contains(e.target)) setNotifyOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const simulate = async () => {
    try {
      await fetch(API + '/api/simulate', { method: 'POST' })
      await load()
      showToast('Симуляция тревоги добавлена в журнал')
    } catch {
      showToast('Сервер недоступен — не удалось создать тревогу')
    }
  }

  const dispatch = async id => {
    try {
      await fetch(`${API}/api/incidents/${id}/dispatch`, { method: 'POST' })
      await load()
      showToast(`Патруль направлен по инциденту №${id}`)
    } catch {
      showToast('Ошибка отправки патруля')
    }
  }

  async function upload(e) {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', f)
    try {
      const r = await fetch(API + '/api/analyze-audio', { method: 'POST', body: fd })
      if (!r.ok) throw new Error()
      setAudio(await r.json())
      load()
    } catch {
      setAudio({ error: 'Не удалось проанализировать файл' })
    }
    setBusy(false)
    e.target.value = ''
  }

  const triggerPlay = type => {
    setPlaying(true)
    play(type, () => setPlaying(false))
  }

  const saveProfile = next => {
    setProfile(next)
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)) } catch {}
    setProfileOpen(false)
    showToast('Профиль инспектора сохранён')
  }

  const openInc = i => {
    setSelId(i.id)
    setTab('incidents')
    setNotifyOpen(false)
  }

  const incs = data?.incidents || []
  const buoys = data?.buoys || []
  const zones = data?.risk_zones || []
  const newCount = incs.filter(i => i.status === 'Новый').length
  const sel = incs.find(i => i.id === selId)
  const hydro = data?.hydrology
  const title = NAV.find(n => n[0] === tab)[1]
  const list = incs.filter(i => (fStatus === 'all' || i.status === fStatus) && (fType === 'all' || i.type === fType))

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits = []
    NAV.forEach(([k, n]) => {
      if (n.toLowerCase().includes(q)) hits.push({ key: 'nav-' + k, title: n, sub: 'Раздел', go: () => setTab(k) })
    })
    buoys.forEach(b => {
      if (b.name.toLowerCase().includes(q)) hits.push({ key: 'b-' + b.id, title: b.name, sub: `Буй · ${b.temp}°C`, go: () => { setPick({ kind: 'buoy', obj: b }); setTab('map') } })
    })
    incs.forEach(i => {
      const label = TYPES[i.type] || i.type
      if (label.toLowerCase().includes(q) || i.message.toLowerCase().includes(q)) {
        hits.push({ key: 'i-' + i.id, title: `${label} №${i.id}`, sub: i.status, go: () => openInc(i) })
      }
    })
    return hits.slice(0, 6)
  }, [query, buoys, incs])

  const IncCard = i => (
    <div key={i.id} className={`ev ${i.priority === 'high' ? 'high' : ''} ${i.id === selId ? 'sel' : ''}`} onClick={() => openInc(i)}>
      <div>
        {TYPES[i.type]} {i.risk_zone && <span className="tag crit">в зоне риска</span>}
        <small>{i.message}</small>
      </div>
      <small>{i.time.slice(11)}</small>
    </div>
  )

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <div className="logo-mark">{Icons.shield}</div>
          <div>
            Эко-Щит Каспия
            <small>Помощник инспектора ООПТ</small>
          </div>
        </div>

        {NAV.map(([k, n]) => (
          <button key={k} className={'nav ' + (tab === k ? 'on' : '')} onClick={() => setTab(k)}>
            <span className="nav-ic">{Icons[k]}</span>
            <span>{n}</span>
            {k === 'incidents' && newCount > 0 && <span className="nav-badge">{newCount}</span>}
          </button>
        ))}
      </aside>

      <div className="col">
        <div className="top">
          <h1>{title}</h1>
          <span className="sp" />

          <span className={'conn ' + (err ? 'bad' : '')}>
            <span className="conn-dot" />
            {err ? 'нет связи с сервером' : `${buoys.length} буев онлайн`}
          </span>

          <div className="search-wrap">
            <span className="search-ic">{Icons.search}</span>
            <input
              className="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setQuery('')}
              placeholder="Поиск по системе…"
            />
            {searchHits.length > 0 && (
              <div className="search-drop">
                {searchHits.map(h => (
                  <button key={h.key} className="search-item" onClick={() => { h.go(); setQuery('') }}>
                    <span>{h.title}</span>
                    <small>{h.sub}</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="notify-wrap" ref={notifyRef}>
            <button
              className={'notify-btn ' + (newCount > 0 ? 'alert' : '')}
              onClick={() => setNotifyOpen(o => !o)}
              title="Центр оповещений"
            >
              <span className="n-ic">{Icons.radarAlert}</span>
              <span>Оповещения</span>
              {newCount > 0 ? <span className="notify-count">{newCount}</span> : <span className="notify-ok" />}
            </button>

            {notifyOpen && (
              <div className="notify-pop">
                <div className="notify-head">
                  <b>Оперативные оповещения</b>
                  <span className="hint">{newCount > 0 ? `активных: ${newCount}` : 'угроз нет'}</span>
                </div>
                <div className="notify-list">
                  {incs.length === 0 && (
                    <div className="sub" style={{ padding: '14px 10px', color: '#a9a58c' }}>
                      Все датчики работают в штатном режиме. Новых инцидентов нет.
                    </div>
                  )}
                  {incs.slice(0, 5).map(i => (
                    <button key={i.id} className="notify-item" onClick={() => openInc(i)}>
                      <span className={'notify-dot ' + (i.priority === 'high' ? '' : 'med')} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{TYPES[i.type]} №{i.id}</div>
                        <div className="hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.message}</div>
                      </div>
                      <span className="hint">{i.time.slice(11)}</span>
                    </button>
                  ))}
                </div>
                <div className="notify-foot">
                  <button className="btn ghost-dark" onClick={() => { setNotifyOpen(false); setTab('incidents') }}>
                    Все инциденты
                  </button>
                  <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => { setNotifyOpen(false); simulate() }}>
                    {Icons.bolt} Симуляция
                  </button>
                </div>
              </div>
            )}
          </div>

          <button className="me" onClick={() => setProfileOpen(true)} title="Открыть профиль инспектора">
            <i className="me-avatar">{getInitials(profile.name)}</i>
            <div className="me-info">
              <span className="me-name">{profile.name}</span>
              <span className="hint">{profile.reserve}</span>
            </div>
            <span className="me-chev">{Icons.chevronDown}</span>
          </button>
        </div>

        <div className={'content ' + (tab === 'map' ? 'flush' : '')}>
          {tab === 'home' && (
            <div className="tab-view" key="home">
              <div className="g4">
                <Stat label="Активные угрозы" icon={Icons.incidents} value={newCount} sub="требуют реакции" cls={newCount ? 'dark' : ''} />
                <Stat label="Датчики и буи" icon={Icons.radarAlert} value={buoys.length} sub={`тревога: ${buoys.filter(b => b.status === 'critical').length}`} />
                <Stat label="Всего инцидентов" icon={Icons.audio} value={incs.length} sub="за текущую сессию" />
                <Stat label="Зоны высокого риска" icon={Icons.shield} value={zones.filter(z => z.risk > 0.7).length} sub={`из ${zones.length}`} />
              </div>
              <div className="g2">
                <Card title="Последние события" icon={Icons.incidents} right={<button className="btn alt" onClick={simulate}>{Icons.bolt} Симуляция тревоги</button>}>
                  {incs.length === 0 && <div className="sub">Тревог нет. Нажмите «Симуляция тревоги».</div>}
                  {incs.slice(0, 5).map(IncCard)}
                </Card>
                <Card title="Обзор карты" icon={Icons.map}>
                  <div className="mini">
                    <MapView data={data} showLabels={prefs.labels} layers={{ buoys: true, zones: prefs.zones, incidents: true, animals: false }} />
                  </div>
                </Card>
              </div>
              <div className="g3 mt">
                <Stat label="Температура воды" icon={Icons.water} value={hydro?.avg_temp ?? '–'} unit="°C" />
                <Stat label="Солёность" icon={Icons.water} value={hydro?.avg_salinity ?? '–'} unit="‰" />
                <Stat label="Уровень моря" icon={Icons.map} value={hydro?.sea_level ?? '–'} unit="м" />
              </div>
            </div>
          )}

          {tab === 'map' && (
            <div className="tab-view full" key="map">
              <div className="mapscreen">
                <MapView data={data} layers={layers} onPick={setPick} focus={pick?.obj?.lat ? pick.obj : null} showLabels={prefs.labels} />
                <div className="ov l">
                  <h4>{Icons.map} Слои</h4>
                  {[['buoys', 'Датчики и буи'], ['zones', 'Охраняемые зоны'], ['animals', 'Животные'], ['incidents', 'Инциденты']].map(([k, n]) => (
                    <label key={k}><input type="checkbox" checked={layers[k]} onChange={() => setLayers(l => ({ ...l, [k]: !l[k] }))} />{n}</label>
                  ))}
                  <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={simulate}>{Icons.bolt} Симуляция тревоги</button>
                </div>
                <div className="ov r">
                  <h4>{Icons.radarAlert} Выбранный объект</h4>
                  {!pick && <div className="hint">Нажмите на маркер или зону на карте.</div>}
                  {pick?.kind === 'buoy' && <div><b>{pick.obj.name}</b><br />Вода: {pick.obj.temp}°C<br />Солёность: {pick.obj.salinity}‰<br />Статус: {pick.obj.status === 'critical' ? 'тревога' : 'норма'}</div>}
                  {pick?.kind === 'zone' && <div><b>{pick.obj.name}</b><br />Риск: {Math.round(pick.obj.risk * 100)}%<br /><span className="hint">{pick.obj.reason}</span></div>}
                  {pick?.kind === 'incident' && <div><b>{TYPES[pick.obj.type]}</b><br />{pick.obj.message}<br />Статус: {pick.obj.status}<br /><button className="btn" style={{ marginTop: 8 }} onClick={() => openInc(pick.obj)}>Открыть инцидент</button></div>}
                </div>
              </div>
            </div>
          )}

          {tab === 'migration' && (
            <div className="tab-view" key="migration">
              <div className="g2" style={{ marginTop: 0, gridTemplateColumns: '1.6fr 1fr' }}>
                <Card title="Миграция каспийского тюленя" icon={Icons.migration} right={<span className="hint">точки — наблюдения, сплошная — маршруты, пунктир — прогноз</span>}>
                  <div style={{ height: 520 }}><MapView data={data} showLabels={prefs.labels} layers={{ buoys: false, zones: prefs.zones, incidents: false, animals: true }} center={[44.8, 47.8]} zoom={7} /></div>
                </Card>
                <div className="stack">
                  <Card title="Сезонная активность, %" icon={Icons.migration}><Chart data={SEASON} color="#D97B50" /><div className="sub">янв → дек (демо-данные)</div></Card>
                  <Stat label="Наблюдений за 7 дней" value="42" sub="демо-данные" />
                  <Stat label="Прогноз перехода в зону нереста" value="78" unit="%" sub="по модели риска" cls="dark" />
                  <Stat label="Риск беспокойства животных" value="Средний" sub="рядом с маршрутом зафиксирован катер" />
                </div>
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <div className="tab-view" key="audio">
              <div className="g2" style={{ marginTop: 0 }}>
                <Card title="Аудиозаписи с буёв" icon={Icons.audio}>
                  {RECORDS.map(r => (
                    <div key={r.id} className={`ev ${r.type !== 'wave' ? 'high' : ''} ${rec.id === r.id ? 'sel' : ''}`} onClick={() => setRec(r)}>
                      <div>{r.name}<small>{r.label} · {r.conf}%</small></div>{r.type !== 'wave' && <span className="tag crit">угроза</span>}
                    </div>
                  ))}
                  <div className="mt"><b style={{ fontSize: 13 }}>Загрузить свой файл (.wav / .mp3)</b><br /><input type="file" accept=".wav,.mp3" onChange={upload} disabled={busy} /></div>
                  {busy && <div className="sub">Анализ…</div>}
                  {audio?.error && <div className="sub">{audio.error}</div>}
                  {audio?.label && (
                    <div className="mt">
                      <span className={'tag ' + (audio.label === 'Шум волн/Норма' ? 'ok' : 'crit')}>{audio.label} · {audio.confidence}%</span>
                      <div className="bars">{audio.spectrum.map((v, i) => <i key={i} style={{ height: Math.max(4, v * 100) + '%' }} />)}</div>
                    </div>
                  )}
                </Card>
                <Card title="Анализ записи" icon={Icons.radarAlert}>
                  <b>{rec.name}</b>
                  <Wave seed={rec.id * 7} type={rec.type} crit={rec.type !== 'wave'} playing={playing} />
                  <div className="row"><button className="btn" onClick={() => triggerPlay(rec.type)}>{Icons.play} {playing ? 'Воспроизведение…' : 'Воспроизвести'}</button></div>
                  <div className="mt">Результат ИИ: <span className={'tag ' + (rec.type !== 'wave' ? 'crit' : 'ok')}>{rec.label}</span><div className="sub">Уверенность: {rec.conf}%. {rec.type !== 'wave' ? 'Подозрительная активность — рекомендуется проверка.' : 'Нарушений не обнаружено.'}</div></div>
                </Card>
              </div>
            </div>
          )}

          {tab === 'water' && (
            <div className="tab-view" key="water">
              <div className="g3">
                <Stat label="Температура воды" icon={Icons.water} value={hydro?.avg_temp ?? '–'} unit="°C" sub="среднее по буям" />
                <Stat label="Солёность" icon={Icons.water} value={hydro?.avg_salinity ?? '–'} unit="‰" sub="среднее по буям" />
                <Stat label="Уровень моря" icon={Icons.map} value={hydro?.sea_level ?? '–'} unit="м" sub="Балтийская система" cls="dark" />
              </div>
              <div className="g3 mt">
                <Card title="Температура, 24 ч"><Chart data={series(3, 14, 0.6)} color="#D97B50" /></Card>
                <Card title="Солёность, 24 ч"><Chart data={series(8, 8, 0.5)} color="#48543A" /></Card>
                <Card title="Уровень, 24 ч"><Chart data={series(5, -28.3, 0.05)} color="#5b9d90" /></Card>
              </div>
              <Card title="Датчики" icon={Icons.radarAlert} cls="mt">
                <table className="tbl">
                  <thead><tr><th>Буй</th><th>Вода, °C</th><th>Солёность, ‰</th><th>Статус</th></tr></thead>
                  <tbody>{buoys.map(b => <tr key={b.id}><td>{b.name}</td><td>{b.temp}</td><td>{b.salinity}</td><td><span className={'tag ' + (b.status === 'critical' ? 'crit' : 'ok')}>{b.status === 'critical' ? 'тревога' : 'норма'}</span></td></tr>)}</tbody>
                </table>
              </Card>
            </div>
          )}

          {tab === 'incidents' && (
            <div className="tab-view" key="incidents">
              <div className="g2" style={{ marginTop: 0, gridTemplateColumns: '1.5fr 1fr' }}>
                <Card title="Журнал происшествий" icon={Icons.incidents} right={<button className="btn" onClick={simulate}>{Icons.bolt} Создать инцидент</button>}>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="all">Все статусы</option><option>Новый</option><option>Патруль направлен</option></select>
                    <select value={fType} onChange={e => setFType(e.target.value)}><option value="all">Все типы</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  </div>
                  <table className="tbl">
                    <thead><tr><th>Время</th><th>Тип</th><th>Место</th><th>Приоритет</th><th>Статус</th></tr></thead>
                    <tbody>{list.map(i => (
                      <tr key={i.id} className="rw" onClick={() => setSelId(i.id)}>
                        <td>{i.time.slice(11)}</td><td>{TYPES[i.type]}</td><td>{i.lat}, {i.lon}</td>
                        <td><span className={'tag ' + (i.priority === 'high' ? 'crit' : '')}>{i.priority === 'high' ? 'высокий' : 'средний'}</span></td><td>{i.status}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {list.length === 0 && <div className="sub">Нет инцидентов. Нажмите «Создать инцидент».</div>}
                </Card>
                <Card title="Детали инцидента" icon={Icons.radarAlert}>
                  {!sel && <div className="sub">Выберите строку в таблице.</div>}
                  {sel && (
                    <>
                      <b style={{ fontSize: 18 }}>{TYPES[sel.type]} №{sel.id}</b>
                      <div className="sub">{sel.message}</div>
                      <div className="mt">Точность ИИ: <b>{Math.round(sel.confidence * 100)}%</b><br />Приоритет: <b>{sel.priority === 'high' ? 'ВЫСОКИЙ' : 'средний'}</b><br />{sel.risk_zone ? <span className="tag crit">внутри зоны риска</span> : 'Вне зон риска'}<br />Статус: {sel.status}</div>
                      <Wave seed={sel.id * 11} type={sel.type} crit playing={playing} />
                      <div className="row">
                        <button className="btn alt" onClick={() => triggerPlay(sel.type)}>{Icons.play} Прослушать</button>
                        <button className="btn" disabled={sel.status === 'Патруль направлен'} onClick={() => dispatch(sel.id)}>{sel.status === 'Патруль направлен' ? 'Патруль в пути' : 'Направить патруль'}</button>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="tab-view" key="settings">
              <div className="g3" style={{ marginTop: 0 }}>
                <Card
                  title="Профиль инспектора"
                  icon={Icons.user}
                  right={<button className="btn alt" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setProfileOpen(true)}>{Icons.edit} Изменить</button>}
                >
                  <div className="sw">ФИО<b>{profile.name}</b></div>
                  <div className="sw">Телефон<b>{profile.phone || 'Не указан'}</b></div>
                  <div className="sw">Почта<b>{profile.email || 'Не указана'}</b></div>
                  <div className="sw">Пол<b>{profile.gender || 'Не указан'}</b></div>
                  <div className="sw">Должность<b>{profile.role}</b></div>
                  <div className="sw">Территория<b>{profile.reserve}</b></div>
                  <div className="sw">Смена<b>{profile.shift}</b></div>
                </Card>
                <Card title="Уведомления" icon={Icons.radarAlert}>
                  {[['push', 'Push-уведомления'], ['sound', 'Звук тревоги'], ['sms', 'SMS при критической угрозе']].map(([k, n]) => (
                    <div className="sw" key={k}>{n}<input type="checkbox" checked={prefs[k]} onChange={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} /></div>
                  ))}
                </Card>
                <Card title="Карта и система" icon={Icons.settings}>
                  {[['zones', 'Показывать зоны риска'], ['labels', 'Подписи городов']].map(([k, n]) => (
                    <div className="sw" key={k}>{n}<input type="checkbox" checked={prefs[k]} onChange={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} /></div>
                  ))}
                  <div className="sw">Обновление данных<b>3 сек</b></div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {profileOpen && <ProfileModal profile={profile} onSave={saveProfile} onClose={() => setProfileOpen(false)} />}
      {toast && <div className="toast">{Icons.check}<span>{toast}</span></div>}
    </div>
  )
}
