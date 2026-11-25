// Room #3: the Training Room — a clean, bright test room in the style of Dani's
// Unity prototypes (navy surfaces, glowing grid lines, pastel props). Built only
// from boxes: no model to download, and every surface is exactly what you
// collide with. Organised in zones so movement, combat and VFX are easy to test:
//
//   centre        the sparring floor: you and the dummy, nothing in the way
//   back-left     a staircase of ledges (1 / 2 / 3.2 m) for jumps and drops
//   back-right    a high platform with a step, and a gap to jump across
//   left wall     cabinets to wall-jump from and hide behind
//   right         low tables (vault height) and a crate stack
//   front         open space to run, roll and sprint
//
// Grid cells are 2 m, so distances can be read straight off the floor.
const PROP = { blue: '#9fd3ff', deep: '#5aa8e6', pink: '#ffc4d4', white: '#e9f2fb' }

const room = {
  slug: 'training-room',
  name: 'Training Room',

  width: 34,
  depth: 30,
  wallHeight: 9,
  wallThickness: 0.5,

  pillars: [],

  // Solid props, standing on the floor: { x, z, w, d, h, color }.
  blocks: [
    // Back-left: the ledge staircase.
    { x: -13, z: -6, w: 4, d: 3, h: 1.0, color: PROP.blue },
    { x: -13, z: -9.5, w: 4, d: 4, h: 2.0, color: PROP.deep },
    { x: -13, z: -13, w: 4, d: 3, h: 3.2, color: PROP.blue },
    // Back-right: a step up to a high platform, and a second one across a gap.
    { x: 9, z: -12.5, w: 3, d: 3, h: 1.2, color: PROP.pink },
    { x: 13.5, z: -12, w: 5, d: 6, h: 2.4, color: PROP.white },
    { x: 13.5, z: -4.5, w: 5, d: 3, h: 2.4, color: PROP.white },
    // Left wall: tall cabinets (pink top half is the same box; colour per box).
    { x: -16, z: 2, w: 1.4, d: 2.2, h: 3.4, color: PROP.blue },
    { x: -16, z: 5, w: 1.4, d: 2.2, h: 3.4, color: PROP.pink },
    { x: -16, z: 8, w: 1.4, d: 2.2, h: 3.4, color: PROP.blue },
    // Right side: low tables (vault height) and a crate stack.
    { x: 11, z: 4, w: 3.2, d: 1.4, h: 0.9, color: PROP.blue },
    { x: 11, z: 8.5, w: 3.2, d: 1.4, h: 0.9, color: PROP.blue },
    { x: 15.5, z: 11, w: 2, d: 2, h: 2, color: PROP.deep },
    { x: 15.5, z: 13, w: 2, d: 2, h: 1, color: PROP.deep },
  ],

  spawn: { x: 0, y: 2.5, z: 8 },
  dummySpawn: { x: 0, y: 1.2, z: 0 },

  // The look: navy, with glowing white-blue grid lines; bright, clean light with
  // real shadows so movement reads clearly.
  grid: { line: '#d6ecff', cell: 2, width: 0.035, glow: 0.6, propLine: '#ffffff' },
  drawCeiling: true,
  drawGrid: false,
  wallTrim: false,
  blockTrim: false,
  centerRing: false,
  shadows: true,
  light: {
    sky: '#e8f2ff',
    ground: '#3a4458',
    skyIntensity: 1.1,
    moon: '#ffffff',
    moonIntensity: 1.7,
    keyFrom: [8, 20, 10],
    fill: '#cfe2ff',
    fillIntensity: 0.3,
  },
  exposure: 1.0,
  fogDensity: 0.004,

  colors: {
    background: '#141b27',
    fog: '#1b2433',
    dust: '#cfe9ff',
    floor: '#2c3a55',
    wall: '#3a4a69',
    ceiling: '#2a3550',
    block: PROP.blue,
    trim: '#17a9bd', // the hunter's shield colour
    enemy: '#e0435a',
    grid: '#000000',
  },
}

export default room
