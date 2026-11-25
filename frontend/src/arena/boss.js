// Bosses: who they are (numbers) and how they think. Part of the deterministic
// simulation like ai.js: the brain produces the same controls a player would,
// plus `special` (a move id from moves.js) for the techniques only bosses have.
// Randomness only from the sim's seeded rng.
//
// The Shadow Knight: slow, heavy, one katana swing, and his signature — a gloomy
// stance that charges for a second while turning to face you, then a huge dash
// forward with the blade. Roll through it, sidestep it late, or block it and
// lose most of your guard.
import { MOVES } from './moves.js'

export const BOSSES = {
  shadow_knight: {
    name: 'Shadow Knight',
    // His stat block, like a loadout from the server (the server decides who may
    // fight him and what beating him unlocks: backend ArenaRules::BOSSES).
    loadout: { stats: { health: 400, guard: 260, damage: 100, ability_power: 100 }, abilities: [] },
    walk: 0.5, // share of a hunter's walking speed: he walks slowly
    wakeRange: 16, // he starts towards you when you come this close
    slashRange: 2.6, // swings when you are this close
    slashEvery: [55, 40], // frames between swings: min + random spread
    rushRange: [3.2, 14], // rushes from this far...
    rushEvery: [240, 120], // ...this often
    firstRush: 60, // ...the first time after this many frames of fighting
  },
}

export function createBossBrain(slug) {
  return { slug, awake: false, slashCd: 30, rushCd: BOSSES[slug].firstRush, fightTicks: 0 }
}

const idle = () => ({
  mx: 0,
  mz: 0,
  sprint: false,
  jump: false,
  jumpPressed: false,
  lightPressed: false,
  heavyPressed: false,
  block: false,
  dashPressed: false,
  emotePressed: false,
  abilityPressed: 0,
  special: null,
})

const spread = ([min, plus], rng) => min + Math.floor(rng() * plus)

export function thinkBoss(b, self, foe, rng) {
  const B = BOSSES[b.slug]
  const ctl = idle()
  if (!foe || foe.c.state === 'ko' || self.c.state === 'ko') return ctl
  const s = self.body.state.pos
  const f = foe.body.state.pos
  const dx = f.x - s.x
  const dz = f.z - s.z
  const d = Math.sqrt(dx * dx + dz * dz)
  if (!b.awake) {
    if (d < B.wakeRange) b.awake = true
    else return ctl
  }
  b.fightTicks++
  if (b.slashCd > 0) b.slashCd--
  if (b.rushCd > 0) b.rushCd--
  if (self.c.state !== 'free') return ctl

  if (b.rushCd === 0 && d >= B.rushRange[0] && d <= B.rushRange[1]) {
    ctl.special = 'KNIGHT_RUSH'
    b.rushCd = spread(B.rushEvery, rng)
    b.slashCd = Math.max(b.slashCd, 50)
    return ctl
  }
  if (d < B.slashRange) {
    if (b.slashCd === 0) {
      ctl.special = 'KNIGHT_SLASH'
      b.slashCd = spread(B.slashEvery, rng)
    }
    return ctl // stands his ground between swings
  }
  // Walk towards you, slowly.
  ctl.mx = (dx / d) * B.walk
  ctl.mz = (dz / d) * B.walk
  return ctl
}

export const bossMoveName = (id) => MOVES[id]?.name
