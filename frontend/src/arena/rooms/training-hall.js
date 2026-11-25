// Room #1. A room is pure data: world.js turns it into colliders and meshes, so a
// second arena is a new file like this one rather than new code.
//
// Units are metres. The floor's top surface is y = 0, and the room is centred on
// the origin. +x is right and -z is "forward" (away from the camera).
export default {
  slug: 'training-hall',
  name: 'Training Hall',

  // Inner floor size, wall to wall.
  width: 24,
  depth: 24,
  wallHeight: 4,
  wallThickness: 0.5,

  // Square pillars: { x, z, size }. Something to walk into that is not a wall.
  pillars: [
    { x: -6, z: -6, size: 1.2 },
    { x: 6, z: -6, size: 1.2 },
    { x: -6, z: 6, size: 1.2 },
    { x: 6, z: 6, size: 1.2 },
  ],

  // The player starts in the air on purpose: the first thing M1 proves is gravity.
  spawn: { x: 0, y: 2.5, z: 4 },

  colors: {
    background: '#04060b',
    floor: '#080b12',
    wall: '#121b33',
    trim: '#22d3ee', // the app's cyan
    grid: '#0e7490',
  },
}
