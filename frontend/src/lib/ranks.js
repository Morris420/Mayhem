// Hunter ranks: where each begins (by level) and how its banner looks.
// The server decides your rank (Progression::rankForLevel); this file only describes it.
export const RANKS = [
  { rank: 'E', min: 1, name: 'Unawakened', color: '#94a3b8', soft: 'rgba(148,163,184,0.16)', glow: 0 },
  { rank: 'D', min: 5, name: 'Rising', color: '#e0955c', soft: 'rgba(224,149,92,0.18)', glow: 1 },
  { rank: 'C', min: 10, name: 'Gate Runner', color: '#7dd3fc', soft: 'rgba(125,211,252,0.18)', glow: 2 },
  { rank: 'B', min: 20, name: 'Elite', color: '#fbbf24', soft: 'rgba(251,191,36,0.2)', glow: 3 },
  { rank: 'A', min: 35, name: 'Master', color: '#22d3ee', soft: 'rgba(34,211,238,0.22)', glow: 4 },
  { rank: 'S', min: 50, name: 'Monarch', color: '#c084fc', soft: 'rgba(192,132,252,0.26)', glow: 5 },
]

export function rankInfo(rank) {
  return RANKS.find((r) => r.rank === rank) ?? RANKS[0]
}

/** The next rank and how far through the current one you are, by level. */
export function rankProgress(level) {
  let i = 0
  RANKS.forEach((r, idx) => level >= r.min && (i = idx))
  const next = RANKS[i + 1] ?? null
  return {
    current: RANKS[i],
    next,
    levelsLeft: next ? next.min - level : 0,
    pct: next ? Math.floor(((level - RANKS[i].min) / (next.min - RANKS[i].min)) * 100) : 100,
  }
}
