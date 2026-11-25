// Room #1: the Dungeon Gate. A room is pure data: world.js turns it into colliders
// and meshes, so a second arena is a new file like this one rather than new code.
//
// The look comes from a kit of modular pieces (KayKit Dungeon Remastered, CC0,
// see docs/arena-assets.md): `dressing` lists every piece and where it goes. It
// is visual only: what you collide with is the floor, walls, pillars and blocks
// below, which the pieces are placed to match.
//
// Units are metres. The floor's top surface is y = 0, and the room is centred on
// the origin. +x is right and -z is "forward" (away from the camera).
const room = {
  slug: 'training-hall',
  name: 'Dungeon Gate',

  // Inner floor size, wall to wall. The middle is kept open: that is where you fight.
  width: 44,
  depth: 44,
  wallHeight: 7,
  wallThickness: 0.5,

  // Square pillars, floor to ceiling height: { x, z, size }.
  pillars: [
    { x: -12, z: -12, size: 2.1 },
    { x: 12, z: -12, size: 2.1 },
    { x: -12, z: 12, size: 2.1 },
    { x: 12, z: 12, size: 2.1 },
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

  // The kit file and the pieces taken from it (filled in at the bottom).
  kit: '/models/arena/dungeon-kit.glb',
  dressing: [],
  // Procedural parts that the kit replaces.
  drawWalls: false,
  drawGrid: false,
  wallTrim: false,
  // Warm torch light, cold blue sky light: a dungeon behind a gate.
  light: {
    sky: '#5d6f9e',
    ground: '#1a1410',
    skyIntensity: 0.75,
    moon: '#9fb4ff',
    moonIntensity: 0.55,
  },
  torchLight: { color: '#ff9a4a', intensity: 22, distance: 16 },

  colors: {
    background: '#03050a',
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

// --- the dressing: every kit piece and where it goes ---------------------------
// Pieces are on a 4 m grid. { piece, x, y, z, rot (radians about y), scale: [x,y,z] }
function dress(r) {
  const out = []
  const G = 4
  const hw = r.width / 2
  const hd = r.depth / 2
  const n = r.width / G // 11 tiles across
  // Floor: large stone tiles, now and then a rocky one (a fixed pattern).
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // Rocky tiles only along the walls: in the middle they read as obstacles.
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1
      const piece = edge && (i + j) % 3 === 0 ? 'floor_tile_large_rocks' : 'floor_tile_large'
      out.push({ piece, x: -hw + G / 2 + i * G, y: -0.05, z: -hd + G / 2 + j * G })
    }
  }
  // Walls: two rows of 4 m pieces; the top row is squashed to reach wallHeight.
  const topScale = (r.wallHeight - 4) / 4
  const sides = [
    { axis: 'x', fixed: -hd - 0.5, rot: 0 }, // back
    { axis: 'x', fixed: hd + 0.5, rot: Math.PI }, // front
    { axis: 'z', fixed: -hw - 0.5, rot: Math.PI / 2 }, // left
    { axis: 'z', fixed: hw + 0.5, rot: -Math.PI / 2 }, // right
  ]
  sides.forEach((side, si) => {
    for (let k = 0; k < n; k++) {
      const along = -hw + G / 2 + k * G
      const at = side.axis === 'x' ? { x: along, z: side.fixed } : { x: side.fixed, z: along }
      const piece = (k + si) % 4 === 1 ? 'wall_cracked' : 'wall'
      out.push({ piece, ...at, y: 0, rot: side.rot })
      out.push({ piece: 'wall', ...at, y: 4, rot: side.rot, scale: [1, topScale, 1] })
      // Inward-facing direction, for things hung on the wall.
      const inX = side.axis === 'z' ? -Math.sign(side.fixed) : 0
      const inZ = side.axis === 'x' ? -Math.sign(side.fixed) : 0
      const on = { x: at.x + inX * 0.55, z: at.z + inZ * 0.55, rot: side.rot }
      if (k % 2 === 0) out.push({ piece: 'torch_mounted', ...on, y: 2.6, light: true })
      else if (k % 4 === 1) out.push({ piece: 'banner_patternA_blue', ...on, y: 1.6 })
      else out.push({ piece: 'banner_thin_blue', ...on, y: 1.8 })
    }
  })
  // Pillars, sized to their colliders.
  for (const p of r.pillars) {
    const s = p.size / 1.5
    out.push({ piece: 'pillar', x: p.x, y: 0, z: p.z, scale: [s, r.wallHeight / 4, s] })
  }
  return out
}
room.dressing = dress(room)

export default room
