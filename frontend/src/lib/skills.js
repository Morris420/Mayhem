// One colour per skill, used for bars and badges (inline styles, so Tailwind doesn't need to know them).
export const SKILL_COLORS = {
  strength: '#f87171',
  stamina: '#34d399',
  discipline: '#22d3ee',
  intellect: '#a78bfa',
  literacy: '#60a5fa',
  faith: '#fbbf24',
  affection: '#f472b6',
  fortune: '#facc15',
  craft: '#fb923c',
}

export const skillColor = (slug) => SKILL_COLORS[slug] ?? '#94a3b8'
