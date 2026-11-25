// The move list: every attack as a row of frame data, like a fighting game's
// frame data sheet. 60 frames = 1 second. Tune the feel here; nothing else needs
// to change.
//
//   startup    frames before the hit can land (the wind-up)
//   active     frames during which it hits
//   recovery   frames after, before you can act again (the punish window)
//   damage     health taken on hit (blocked hits do none)
//   hitstun    frames the victim can't act after being hit
//   blockstun  frames the blocker can't act after blocking it
//   push       m/s the victim is shoved back (on hit and on block)
//   hitstop    frames BOTH fighters freeze on impact: the "weight" of a hit
//   range      metres in front of the attacker where the hit sphere sits
//   radius     size of the hit sphere, metres
//   lunge      m/s forward step at the start of the move
//   knockdown  true = the victim is knocked off their feet
//   launch     m/s upward on knockdown (defaults to COMBAT.knockUp)
//   guard      guard meter taken from a blocker (see COMBAT.guardMax)
//   next       which button continues the string, and into what
//   air        true = a jump attack (keeps your momentum)
//
// Strings: Light, Light, Light   = left jab, right cross, uppercut (knockdown).
//                                  The uppercut deals 1.5x the jab (sim.spec checks it).
//          Light, (Light,) Heavy = jab(s) into a rising kick finisher (knockdown)
//          Heavy                 = slow, far-reaching, heavy hit
//
// Hitstun is always longer than the attacker's recovery + the next hit's
// startup, so a string that lands once keeps landing: that is what makes it a
// combo rather than three separate hits (sim.spec checks it).
export const MOVES = {
  L1: {
    name: 'Left jab',
    guard: 12,
    startup: 6,
    active: 3,
    recovery: 12,
    damage: 6,
    hitstun: 18,
    blockstun: 10,
    push: 2.5,
    hitstop: 5,
    range: 1.1,
    radius: 0.55,
    lunge: 2,
    next: { light: 'L2', heavy: 'LH' },
  },
  L2: {
    name: 'Right cross',
    guard: 14,
    startup: 7,
    active: 3,
    recovery: 14,
    damage: 7,
    hitstun: 20,
    blockstun: 11,
    push: 2.5,
    hitstop: 5,
    range: 1.15,
    radius: 0.55,
    lunge: 2,
    next: { light: 'L3', heavy: 'LH' },
  },
  L3: {
    name: 'Uppercut',
    guard: 22,
    startup: 11,
    active: 4,
    recovery: 20,
    damage: 9, // 1.5 x the left jab
    launch: 8, // pops them up
    hitstun: 0,
    blockstun: 14,
    push: 6,
    hitstop: 9,
    range: 1.3,
    radius: 0.6,
    lunge: 3,
    knockdown: true,
  },
  LH: {
    name: 'Rising kick',
    guard: 26,
    startup: 14,
    active: 4,
    recovery: 22,
    damage: 12,
    hitstun: 0,
    blockstun: 16,
    push: 7,
    hitstop: 10,
    range: 1.4,
    radius: 0.6,
    lunge: 3,
    knockdown: true,
  },
  H: {
    name: 'Heavy blow',
    guard: 30,
    startup: 16,
    active: 4,
    recovery: 24,
    damage: 14,
    hitstun: 26,
    blockstun: 16,
    push: 5,
    hitstop: 9,
    range: 1.5,
    radius: 0.65,
    lunge: 4,
  },
  AIR: {
    name: 'Jump kick',
    guard: 14,
    startup: 5,
    active: 6,
    recovery: 10,
    damage: 7,
    hitstun: 18,
    blockstun: 10,
    push: 3,
    hitstop: 6,
    range: 0.9,
    radius: 0.7,
    yOffset: -0.4, // aims a little downward
    air: true,
  },
}

// Total length of a move in frames.
export const moveFrames = (m) => m.startup + m.active + m.recovery

// Everything about a fighter that is not an attack, also in frames.
export const COMBAT = {
  maxHp: 100,
  blockArc: 0.5, // cos of the half-angle you can block in: 0.5 = 60° each side. Behind you is open.
  dashSpeed: 13, // m/s
  dashFrames: 12, // total, including recovery
  dashMoveFrames: 9, // frames of the dash that actually travel
  dashBrake: 0.2, // speed kept when the burst ends (0 = dead stop)
  dashInvuln: 6, // frames at the start of a dash where nothing hits you
  dashCooldown: 18, // frames before the next dash
  knockdownFrames: 45, // lying on the floor
  getupFrames: 18, // standing back up (invulnerable)
  koFrames: 150, // KO'd, then back on your feet with full health (it's a training room)
  blockHitstop: 4, // blocked hits freeze for less
  autoFaceRange: 3.5, // starting an attack snaps you to face an opponent this close
  blockFaceRange: 8, // blocking turns you towards an opponent this close
  knockUp: 5, // m/s upward when knocked down
  hitHeight: 1.1, // vertical tolerance of a hit around the target's centre
  inputBuffer: 8, // frames an attack press is remembered (during hitstop it waits)
  // The guard meter: blocking costs it, it refills when you stop blocking.
  guardMax: 100,
  guardHoldDrain: 4, // per second just for holding block
  guardRegen: 15, // per second once you have stopped blocking...
  guardRegenDelay: 60, // ...for this many frames
  guardBreakFrames: 50, // stunned and open when the guard hits zero
  guardMinToBlock: 10, // can't raise a guard below this
}
