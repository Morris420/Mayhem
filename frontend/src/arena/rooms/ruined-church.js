// Room #2: the Ruined Church — the nave of a bombed-out orthodox church.
//
// Model: "Interior view of Orthodox Church of Al-Tahira" by Hussein Yaseen
// (https://sketchfab.com/HusseinYaseen), licensed under Creative Commons
// Attribution. A photogrammetry scan: 7M triangles and an 8K texture, reduced to
// 300k triangles and a 4K texture, and scaled to 62% so the hunters stand big in
// it and the fight stays close (docs/arena-assets.md).
//
// The scan is only the look. What you collide with is the data below: the floor
// at y = 0 (the scan's floor was flattened to match inside the fight area, with
// rubble left round the edges), the two outer walls, invisible walls across the
// nave, and the two columns that stand inside the fight area.
//
// Units are metres, centred on the fight area. +x is right, -z is "forward".
const room = {
  slug: 'ruined-church',
  name: 'Ruined Church',

  width: 38.75, // aisle wall to aisle wall
  depth: 18.6, // the stretch of the nave between two rows of columns
  wallHeight: 8, // the invisible lid; the vault is far higher
  wallThickness: 0.5,

  // The two great columns inside the fight area (round in the scan).
  pillars: [
    { x: -8.5, z: 0, size: 1.5 },
    { x: 10.4, z: 0.3, size: 1.5 },
  ],
  blocks: [],

  spawn: { x: 0, y: 2.5, z: 6 },
  dummySpawn: { x: 0, y: 1.2, z: -2 },

  model: '/models/arena/church.glb',
  drawWalls: false,
  drawGrid: false,
  wallTrim: false,
  blockTrim: false,
  centerRing: false,

  // Dim: the scan's baked daylight is darkened (modelTint) and fades into a
  // dusky haze; the fighters get a soft key light and a cool rim from behind so
  // they always read against the ruins.
  modelTint: '#6b686c',
  light: {
    sky: '#c9c4bc',
    ground: '#2a2622',
    skyIntensity: 0.9,
    moon: '#ffe2bd', // warm light falling through the broken roof
    moonIntensity: 1.5,
    fill: '#8fa4c8', // cool rim from the far end of the nave
    fillIntensity: 1.1,
  },
  exposure: 1.0,
  fogDensity: 0.03,

  colors: {
    background: '#1d1c1f',
    fog: '#2a282b',
    dust: '#e8dcc8',
    floor: '#8a857c',
    wall: '#8a857c',
    block: '#8a857c',
    trim: '#17a9bd', // the hunter's shield colour
    enemy: '#e0435a',
    grid: '#000000',
  },
}

export default room
