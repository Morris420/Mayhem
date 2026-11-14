// Challenge tiers. The XP numbers here are only for *previewing* in the task
// builder - the server is the source of truth and decides the real XP.
// (Full class strings are written out so Tailwind can see and generate them.)

export const TIERS = ['E', 'D', 'C', 'B', 'A', 'S']

export const TIER_XP = { E: 10, D: 25, C: 50, B: 100, A: 200, S: 400 }

export const TIER_META = {
  E: {
    name: 'Warm-up',
    badge: 'bg-slate-900/80 border-slate-500/50 text-slate-300',
    text: 'text-slate-300',
    bar: 'bg-slate-400',
    ring: 'border-slate-500/60 text-slate-200 bg-slate-900',
  },
  D: {
    name: 'Routine',
    badge: 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300',
    text: 'text-emerald-300',
    bar: 'bg-emerald-400',
    ring: 'border-emerald-500/60 text-emerald-200 bg-emerald-950',
  },
  C: {
    name: 'Solid',
    badge: 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300',
    text: 'text-cyan-300',
    bar: 'bg-cyan-400',
    ring: 'border-cyan-400/70 text-cyan-200 bg-cyan-950 shadow-[0_0_10px_rgba(6,182,212,0.3)]',
  },
  B: {
    name: 'Hard',
    badge: 'bg-amber-950/70 border-amber-500/40 text-amber-300',
    text: 'text-amber-300',
    bar: 'bg-amber-400',
    ring: 'border-amber-400/70 text-amber-200 bg-amber-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]',
  },
  A: {
    name: 'Elite',
    badge: 'bg-purple-950/70 border-purple-500/40 text-purple-300',
    text: 'text-purple-300',
    bar: 'bg-purple-400',
    ring: 'border-purple-400/70 text-purple-200 bg-purple-950 shadow-[0_0_10px_rgba(168,85,247,0.3)]',
  },
  S: {
    name: 'Legendary',
    badge: 'bg-red-950/70 border-red-500/40 text-red-300',
    text: 'text-red-300',
    bar: 'bg-red-400',
    ring: 'border-red-400/70 text-red-200 bg-red-950 shadow-[0_0_10px_rgba(239,68,68,0.35)]',
  },
}

export function hunterId(id) {
  return `#${String(id ?? 0).padStart(6, '0')}`
}

export function shortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
