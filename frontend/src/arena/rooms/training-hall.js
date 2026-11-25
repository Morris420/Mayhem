// Room #1. A room is pure data: world.js turns it into colliders and meshes, so a
// second arena is a new file like this one rather than new code.
//
// Units are metres. The floor's top surface is y = 0, and the room is centred on
// the origin. +x is right and -z is "forward" (away from the camera).
export default {
  slug: 'training-hall',
  name: 'Training Hall',

  // Inner floor size, wall to wall. The middle is kept open: that is where you fight.
  width: 44,
  depth: 44,
  wallHeight: 7,
  wallThickness: 0.5,

  // Square pillars, floor to ceiling height: { x, z, size }.
  pillars: [
    { x: -12, z: -12, size: 2 },
    { x: 12, z: -12, size: 2 },
    { x: -12, z: 12, size: 2 },
    { x: 12, z: 12, size: 2 },
  ],

  // Solid blocks to jump on: { x, z, w (x size), d (z size), h (height) }.
  // A full jump lifts your feet ~1.6 m (player.js), so every step below is at
  // most 1.4 m above the one before it.
  blocks: [
    // Back-left corner: a staircase of ledges up to a high perch.
    { x: -18.5, z: -8, w: 5, d: 4, h: 1.0 },
    { x: -18.5, z: -12.5, w: 5, d: 5, h: 2.0 },
    { x: -18.5, z: -17.5, w: 5, d: 5, h: 3.4 },
    // Front-right: a low step and a long ledge along the wall.
    { x: 16, z: 6, w: 3, d: 3, h: 0.8 },
    { x: 19.5, z: 12, w: 5, d: 8, h: 1.3 },
  ],

  // The player starts in the air on purpose: the first thing M1 proved is gravity.
  spawn: { x: 0, y: 2.5, z: 10 },
  // The training dummy starts in the centre ring, facing the player.
  dummySpawn: { x: 0, y: 0.95, z: 2 },

  colors: {
    background: '#020306',
    floor: '#05070b',
    wall: '#0c1222',
    block: '#152038',
    trim: '#17a9bd', // the app's cyan, dimmed
    enemy: '#e0435a', // the dummy's outline
    grid: '#0b4f5c',
  },
  // How bright the neon reads, 0..1. Lower = darker room and less bloom.
  trimIntensity: 0.75,
}
