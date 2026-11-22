// Body parts must match the backend's Exercise::BODY_PARTS.
export const BODY_PARTS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio']

export const BODY_PART_LABEL = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
}

/** "62.5" / "60" - no trailing zeros. */
export function fmtWeight(n) {
  if (n === null || n === undefined) return '—'
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(2))
}
