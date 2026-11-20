// Challenge tiers. The XP numbers here are only for *previewing* in the quest
// builder - the server is the source of truth and decides the real XP.
// (Full class strings are written out so Tailwind can see and generate them.)

export const TIERS = ['E', 'D', 'C', 'B', 'A', 'S']

export const TIER_XP = { E: 10, D: 25, C: 50, B: 100, A: 200, S: 400 }

export const TIER_META = {
  E: { name: 'Warm-up', badge: 'bg-slate-800 text-slate-300', text: 'text-slate-300', bar: 'bg-slate-400', ring: 'border-slate-500 bg-slate-800 text-slate-100' },
  D: { name: 'Routine', badge: 'bg-emerald-500/10 text-emerald-300', text: 'text-emerald-300', bar: 'bg-emerald-400', ring: 'border-emerald-500 bg-emerald-500/10 text-emerald-200' },
  C: { name: 'Solid', badge: 'bg-sky-500/10 text-sky-300', text: 'text-sky-300', bar: 'bg-sky-400', ring: 'border-sky-500 bg-sky-500/10 text-sky-200' },
  B: { name: 'Hard', badge: 'bg-amber-500/10 text-amber-300', text: 'text-amber-300', bar: 'bg-amber-400', ring: 'border-amber-500 bg-amber-500/10 text-amber-200' },
  A: { name: 'Elite', badge: 'bg-violet-500/10 text-violet-300', text: 'text-violet-300', bar: 'bg-violet-400', ring: 'border-violet-500 bg-violet-500/10 text-violet-200' },
  S: { name: 'Legendary', badge: 'bg-rose-500/10 text-rose-300', text: 'text-rose-300', bar: 'bg-rose-400', ring: 'border-rose-500 bg-rose-500/10 text-rose-200' },
}

// ISO weekdays: 1 = Monday ... 7 = Sunday (matches the backend).
export const WEEKDAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
]

export function hunterId(id) {
  return `#${String(id ?? 0).padStart(6, '0')}`
}

export function shortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** "Mon · Wed · Fri", "Every day", "Fri 20 Nov" or "Not scheduled". */
export function describeSchedule(s) {
  if (!s || s.mode === 'none') return 'Not scheduled'
  if (s.mode === 'date') return fromISO(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  if (s.days.length === 7) return 'Every day'
  return WEEKDAYS.filter((d) => s.days.includes(d.n)).map((d) => d.short).join(' · ')
}

// --- local-date helpers (never use toISOString: it shifts the day by timezone) ---
export function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
