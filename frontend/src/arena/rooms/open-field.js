// Room #4: the Open Field — an endless meadow of rolling hills under a warm,
// low sun. Everything is generated in code (field.js): a painted sky with
// clouds, hills to the horizon, wind moving through ~90k blades of grass that
// part around the fighters, wildflowers, a dirt path, trees and far mountains.
//
// Where you can go is still the room's boxes: a flat meadow 60 x 50 m, with
// invisible walls at its edges (the land keeps rolling on past them).
const room = {
  slug: 'open-field',
  name: 'Open Field',

  width: 60,
  depth: 50,
  wallHeight: 18, // the invisible lid
  wallThickness: 0.5,
  pillars: [],
  blocks: [],

  spawn: { x: 0, y: 2.5, z: 8 },
  dummySpawn: { x: -6, y: 1.2, z: 0 },
  bossSpawn: { x: 0, y: 1.2, z: -14 },

  // Nothing of the boxy room is drawn: the field replaces it.
  drawWalls: false,
  drawGrid: false,
  wallTrim: false,
  blockTrim: false,
  centerRing: false,
  shadows: true,
  far: 1600,

  field: {
    sun: [-0.45, 0.32, -0.83], // low in the sky, ahead and to the left: long shadows, warm light
    terrainSize: 1400,
    flatX: 31, // the meadow you fight on stays flat (half sizes, a little past the walls)
    flatZ: 26,
    grassRadius: 48,
    grassCount: 120000,
    flowerCount: 2200,
    treeCount: 26,
    wind: [0.8, 0.5, 0.32], // direction x, z and strength
    sky: { zenith: '#5d93d6', horizon: '#ffe2c2', glow: '#ffbf7a', cloud: '#fff4ea' },
    ground: {
      grass: '#6fb43c',
      lush: '#3f9338',
      sunny: '#c8dc58',
      dirt: '#c9a66b',
      rock: '#8f8a7e',
      tree: '#4f8a3c',
      grassBase: '#3f8a2c',
      grassTip: '#c8ef7a',
      grassSun: '#f3e9a0',
    },
    mountains: { count: 22, distance: 560, stone: '#9a8fb8', snow: '#fff4f4' },
  },

  light: {
    sky: '#cfe4ff',
    ground: '#6f8f45',
    skyIntensity: 1.15,
    moon: '#ffe6c2', // the sun
    moonIntensity: 2.1,
    keyFrom: [-27, 19, -50], // along `sun`, so the shadows match the sky
    fill: '#ffd9b0',
    fillIntensity: 0.25,
  },
  exposure: 1.0,
  fogDensity: 0.0015,
  bloomThreshold: 0.97, // only the sun and effects glow, not white shirts in the sunlight

  colors: {
    background: '#ffe2c2',
    fog: '#f3dcc4', // warm haze: the distance fades into the sun's colour
    dust: '#fff6d8', // pollen in the light
    floor: '#7fb24a',
    wall: '#7fb24a',
    block: '#9fd3ff',
    trim: '#17a9bd',
    enemy: '#e0435a',
    grid: '#000000',
  },
}

export default room
