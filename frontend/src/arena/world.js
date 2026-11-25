// The room: floor, walls, pillars, blocks, lights, fog, neon trim and dust, built
// from a room file in rooms/. One function describes the solid boxes (`roomBoxes`)
// and both the physics and the meshes are made from that list, so what you see is
// exactly what you collide with.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { roomBoxes } from './physics.js'

export { roomBoxes }

// roomBoxes() lives in physics.js (pure, no three.js) so the simulation can use
// it without pulling in the renderer. Meshes are built from the same list.

function boxGeometry(center, half) {
  const g = new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2)
  g.translate(...center)
  return g
}

// The neon strips. Bands are deliberately a few centimetres thick: hairline
// strips become thinner than a pixel at distance and shimmer as you move.
const BAND = 0.08
const LIP = 0.03

function trimGeometries(room) {
  const hw = room.width / 2
  const hd = room.depth / 2
  const h = room.wallHeight
  const out = []
  const ys = [BAND / 2 + 0.02, h - BAND / 2 - 0.2]

  for (const y of room.wallTrim === false ? [] : ys) {
    out.push(boxGeometry([0, y, -hd + LIP / 2], [hw, BAND / 2, LIP / 2]))
    out.push(boxGeometry([0, y, hd - LIP / 2], [hw, BAND / 2, LIP / 2]))
    out.push(boxGeometry([-hw + LIP / 2, y, 0], [LIP / 2, BAND / 2, hd]))
    out.push(boxGeometry([hw - LIP / 2, y, 0], [LIP / 2, BAND / 2, hd]))
  }
  for (const p of room.wallTrim === false ? [] : (room.pillars ?? [])) {
    const s = p.size / 2 + LIP
    for (const y of ys) out.push(boxGeometry([p.x, y, p.z], [s, BAND / 2, s]))
  }
  // Blocks: a glowing edge round the top, so you can read where to land.
  for (const b of room.blockTrim === false ? [] : (room.blocks ?? [])) {
    const y = b.h - BAND / 2
    const hx = b.w / 2 + LIP
    const hz = b.d / 2 + LIP
    out.push(boxGeometry([b.x, y, b.z - hz + LIP / 2], [hx, BAND / 2, LIP / 2]))
    out.push(boxGeometry([b.x, y, b.z + hz - LIP / 2], [hx, BAND / 2, LIP / 2]))
    out.push(boxGeometry([b.x - hx + LIP / 2, y, b.z], [LIP / 2, BAND / 2, hz]))
    out.push(boxGeometry([b.x + hx - LIP / 2, y, b.z], [LIP / 2, BAND / 2, hz]))
  }
  return out
}

// The floor grid as a texture, not as line geometry. A texture gets mipmaps, so
// far-away lines fade smoothly instead of flickering in and out pixel by pixel.
function gridTexture(color) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

// A soft round dot, so dust near the camera is not a square.
function dotTexture() {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// Slow-drifting dust in the air: makes the dark feel like a space, not a void.
// Render-only; it never touches the simulation.
function dust(room, count = 260) {
  const pos = new Float32Array(count * 3)
  // A fixed pattern, not Math.random, so screenshots are reproducible.
  let s = 1234567
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * room.width
    pos[i * 3 + 1] = rnd() * room.wallHeight
    pos[i * 3 + 2] = (rnd() - 0.5) * room.depth
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: room.colors.dust ?? room.colors.trim,
    map: dotTexture(),
    size: 0.06,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'dust'
  const base = pos.slice()
  points.userData.update = (t) => {
    const a = points.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      a[i * 3] = base[i * 3] + Math.sin(t * 0.07 + i) * 0.4
      a[i * 3 + 1] = (base[i * 3 + 1] + t * 0.05 * (0.5 + (i % 5) * 0.1)) % room.wallHeight
      a[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.05 + i * 1.3) * 0.4
    }
    points.geometry.attributes.position.needsUpdate = true
  }
  return points
}

// A surface with glowing grid lines drawn from its world position (so every box,
// whatever its size, gets square cells that line up): the Dani-style training
// room look. Lit like any standard material; the lines are emissive, so the
// bloom pass makes them glow.
//   line   colour of the lines     cell   metres per cell
//   width  line width in metres    glow   how bright the lines are
export function gridMaterial({ color, line = '#cfe9ff', cell = 2, width = 0.05, glow = 1.6 }) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 })
  mat.userData.grid = { line, cell, width, glow }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.gridLine = { value: new THREE.Color(line) }
    shader.uniforms.gridCell = { value: cell }
    shader.uniforms.gridWidth = { value: width }
    shader.uniforms.gridGlow = { value: glow }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vGridPos;\nvarying vec3 vGridNormal;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
  vGridPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vGridNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGridPos;
varying vec3 vGridNormal;
uniform vec3 gridLine;
uniform float gridCell;
uniform float gridWidth;
uniform float gridGlow;
float gridLines(vec2 p) {
  vec2 q = p / gridCell;
  vec2 d = abs(fract(q - 0.5) - 0.5) * gridCell; // metres to the nearest line
  vec2 aa = fwidth(p) * 1.2;
  vec2 m = 1.0 - smoothstep(vec2(gridWidth * 0.5), vec2(gridWidth * 0.5) + aa, d);
  return max(m.x, m.y);
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  vec3 an = abs(vGridNormal);
  vec2 gp = an.y > an.x && an.y > an.z ? vGridPos.xz : (an.x > an.z ? vGridPos.zy : vGridPos.xy);
  float gl = gridLines(gp);
  totalEmissiveRadiance += gridLine * gl * gridGlow;
  diffuseColor.rgb = mix(diffuseColor.rgb, gridLine, gl * 0.3);`,
      )
  }
  return mat
}

// Builds everything visible. Static geometry is merged by material, so the whole
// room is a handful of draw calls (budget: playbook §6). Call
// group.userData.update(seconds) each frame for the ambient animation.
export function buildRoomScene(room) {
  const c = room.colors
  const group = new THREE.Group()
  group.name = 'room'
  const boxes = roomBoxes(room)
  const pick = (kinds) =>
    mergeGeometries(
      boxes.filter((b) => kinds.includes(b.kind)).map((b) => boxGeometry(b.center, b.half)),
    )

  const kitted = room.drawWalls === false // a kit draws the floor, walls and pillars
  const G = room.grid // the grid style: { line, cell, width, glow }, or none
  const floor = new THREE.Mesh(
    pick(['floor']),
    G
      ? gridMaterial({ color: c.floor, ...G })
      : new THREE.MeshStandardMaterial({ color: c.floor, roughness: 0.9, metalness: 0.05 }),
  )
  floor.name = 'floor'
  floor.receiveShadow = true
  if (!kitted) group.add(floor)

  const walls = new THREE.Mesh(
    pick(['wall', 'pillar']),
    G
      ? gridMaterial({ color: c.wall, ...G })
      : new THREE.MeshStandardMaterial({ color: c.wall, roughness: 0.75, metalness: 0.15 }),
  )
  walls.name = 'walls'
  walls.receiveShadow = true
  if (!kitted) group.add(walls)

  if (G && room.drawCeiling) {
    // The ceiling is only drawn: the collision lid sits at the same height.
    const hw = room.width / 2 + room.wallThickness
    const hd = room.depth / 2 + room.wallThickness
    const ceiling = new THREE.Mesh(
      boxGeometry([0, room.wallHeight + 0.25, 0], [hw, 0.25, hd]),
      gridMaterial({ color: c.ceiling ?? c.wall, ...G }),
    )
    ceiling.name = 'ceiling'
    group.add(ceiling)
  }

  if (G && room.blocks?.length) {
    // Props: one mesh per colour, each with a finer, fainter grid.
    const byColor = {}
    for (const b of room.blocks) (byColor[b.color ?? c.block] ??= []).push(b)
    for (const [color, list] of Object.entries(byColor)) {
      const mesh = new THREE.Mesh(
        mergeGeometries(
          list.map((b) => boxGeometry([b.x, b.h / 2, b.z], [b.w / 2, b.h / 2, b.d / 2])),
        ),
        gridMaterial({ color, line: G.propLine ?? '#ffffff', cell: 1, width: 0.025, glow: 0.15 }),
      )
      mesh.name = 'blocks'
      mesh.castShadow = mesh.receiveShadow = true
      group.add(mesh)
    }
  } else if (room.blocks?.length) {
    const blocks = new THREE.Mesh(
      pick(['block']),
      new THREE.MeshStandardMaterial({ color: c.block ?? c.wall, roughness: 0.7, metalness: 0.2 }),
    )
    blocks.name = 'blocks'
    group.add(blocks)
  }

  // The trim is an unlit colour, dimmed by trimIntensity; bloom picks up only
  // the brightest of it.
  const trimColor = new THREE.Color(c.trim).multiplyScalar(room.trimIntensity ?? 1)
  const trimParts = trimGeometries(room)
  if (trimParts.length) {
    const trim = new THREE.Mesh(
      mergeGeometries(trimParts),
      new THREE.MeshBasicMaterial({ color: trimColor }),
    )
    trim.name = 'trim'
    group.add(trim)
  }

  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshBasicMaterial({
      map: gridTexture(c.grid),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  grid.material.map.repeat.set(room.width / 2, room.depth / 2) // 2 m cells
  grid.rotation.x = -Math.PI / 2
  grid.position.y = 0.005
  grid.name = 'grid'
  if (room.drawGrid !== false) group.add(grid)

  // A dim ring in the centre: where the opponent will stand once there is a fight.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.85, 3, 96),
    new THREE.MeshBasicMaterial({
      color: trimColor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.01
  ring.name = 'center-ring'
  if (room.centerRing !== false) group.add(ring)

  const motes = dust(room)
  group.add(motes)

  // Light: dark and cold. A faint fill and one dim key light. No shadow maps.
  const L = room.light ?? {}
  group.add(
    new THREE.HemisphereLight(L.sky ?? '#4a62b8', L.ground ?? '#010104', L.skyIntensity ?? 0.55),
  )
  const key = new THREE.DirectionalLight(L.moon ?? '#a9d8ff', L.moonIntensity ?? 0.6)
  key.position.set(...(L.keyFrom ?? [5, 12, 7]))
  if (room.shadows) {
    // Real shadows for the fighters and props: one map over the whole room.
    key.castShadow = true
    const half = Math.max(room.width, room.depth) / 2 + 2
    Object.assign(key.shadow.camera, {
      left: -half,
      right: half,
      top: half,
      bottom: -half,
      near: 1,
      far: 80,
    })
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.03
  }
  group.add(key)
  if (L.fill) {
    // A second, softer key from the other side so nothing falls into black.
    const fill = new THREE.DirectionalLight(L.fill, L.fillIntensity ?? 0.6)
    fill.position.set(-8, 9, -6)
    group.add(fill)
  }

  group.userData.update = (t) => motes.userData.update(t)
  return group
}

// The room's dressing: every piece from its kit file, placed as listed in the
// room file. Pieces that repeat (floor tiles, wall segments) become one
// instanced mesh each, so a whole dungeon is a handful of draw calls. Torches get
// a warm light on every third one (lights are expensive per pixel).
export async function loadRoomDressing(room) {
  const group = new THREE.Group()
  group.name = 'dressing'
  if (room.model) {
    // One whole scene (a scan): drawn as it is, unlit (its light is baked in).
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(room.model)
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return
      o.name = 'room-model'
      // The floor is seen at a grazing angle: anisotropic filtering keeps it sharp.
      if (o.material.map) o.material.map.anisotropy = 8
      if (room.modelTint) o.material.color.set(room.modelTint) // darker than the scan's daylight
    })
    group.add(gltf.scene)
  }
  if (!room.kit || !room.dressing?.length) return group
  const gltf = await new GLTFLoader().loadAsync(room.kit)
  const byPiece = {}
  for (const d of room.dressing) (byPiece[d.piece] ??= []).push(d)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  for (const [piece, list] of Object.entries(byPiece)) {
    const src = gltf.scene.getObjectByName(piece)
    if (!src) continue
    src.updateMatrixWorld(true)
    const rootInv = new THREE.Matrix4().copy(src.matrixWorld).invert()
    src.traverse((o) => {
      if (!o.isMesh) return
      // The mesh's own placement inside the piece.
      const local = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld)
      const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length)
      list.forEach((d, i) => {
        q.setFromAxisAngle(up, d.rot ?? 0)
        const sc = d.scale ?? [1, 1, 1]
        m.compose(new THREE.Vector3(d.x, d.y ?? 0, d.z), q, new THREE.Vector3(...sc))
        inst.setMatrixAt(i, m.multiply(local))
      })
      inst.name = `kit:${piece}`
      group.add(inst)
    })
  }

  const T = room.torchLight
  if (T) {
    room.dressing
      .filter((d) => d.light)
      .forEach((d, i) => {
        if (i % 3) return
        const light = new THREE.PointLight(T.color, T.intensity, T.distance, 2)
        light.position.set(d.x, (d.y ?? 0) + 0.4, d.z)
        group.add(light)
      })
  }
  return group
}
