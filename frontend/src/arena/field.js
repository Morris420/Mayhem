// The Open Field: rolling hills of grass to the horizon under a warm sun.
// Render-only, like world.js: the fight still happens on the flat meadow the
// room file describes (collision is its boxes). Everything here is generated in
// code: no models, no textures to download.
//
//   sky        a dome with a gradient, the sun and soft painted clouds (shader)
//   terrain    a big displaced plane: flat where you fight, hills beyond, colour
//              painted from noise (greens, sunlit yellow, a dirt path, rock)
//   grass      ~90k instanced blades that sway in gusts of wind and part
//              around the fighters (shader on top of three's lambert material,
//              so they still get the sun, shadows and fog)
//   flowers    little white and yellow dots in the grass
//   mountains  a hazy ring of peaks with snow, far away
//   trees      a few stylised trees on the slopes
import * as THREE from 'three'

// --- noise (render-only, so Math.sin hashing is fine) --------------------------
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash(xi, zi)
  const b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1)
  const d = hash(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function fbm(x, z, oct = 5) {
  let s = 0
  let a = 0.5
  let f = 1
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f)
    f *= 2.03
    a *= 0.5
  }
  return s
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// --- the shape of the land -----------------------------------------------------
// How far a point is outside the flat meadow (metres; 0 inside).
function outside(x, z, F) {
  const dx = Math.max(0, Math.abs(x) - F.flatX)
  const dz = Math.max(0, Math.abs(z) - F.flatZ)
  return Math.sqrt(dx * dx + dz * dz)
}
// The winding dirt path: distance from a point to the path's centre line.
function pathDistance(x, z) {
  const cx = Math.sin(z * 0.035) * 14 + Math.sin(z * 0.011 + 1.3) * 22 + 6
  return Math.abs(x - cx)
}
export function heightAt(x, z, F) {
  const o = outside(x, z, F)
  // Gentle swells nearby, real hills further out, big rises far away.
  const rolling = (fbm(x * 0.012, z * 0.012, 4) - 0.45) * 22
  const far = smooth(60, 380, Math.sqrt(x * x + z * z)) * fbm(x * 0.004 + 7, z * 0.004 - 3, 3) * 70
  let h = Math.max(-2, rolling) * smooth(0, 45, o) + far
  // The path sinks a little into the land.
  h -= (1 - smooth(1.5, 4, pathDistance(x, z))) * 0.25 * smooth(0, 10, o)
  return h
}

// --- sky ------------------------------------------------------------------------
function buildSky(F) {
  const geo = new THREE.SphereGeometry(900, 48, 24)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: F.sunDir.clone() },
      zenith: { value: new THREE.Color(F.sky.zenith) },
      horizon: { value: new THREE.Color(F.sky.horizon) },
      glow: { value: new THREE.Color(F.sky.glow) },
      cloud: { value: new THREE.Color(F.sky.cloud) },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, zenith, horizon, glow, cloud;
      uniform float time;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, -0.2, 1.0);
        // Gradient: warm at the horizon, clear blue overhead.
        vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.75, up), 0.7));
        // The sun: a bright disk, a wide warm glow, and light spilling along the horizon.
        float s = max(dot(d, sunDir), 0.0);
        col += glow * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 0.6) * (0.6 + 0.4 * (1.0 - up));
        col += vec3(1.0, 0.96, 0.85) * smoothstep(0.9993, 0.9998, s) * 6.0;
        // Clouds: soft fbm on a dome, thicker towards the horizon, lit by the sun.
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(time * 0.004, time * 0.0015);
          float c = fbm(uv);
          c = smoothstep(0.48, 0.82, c) * smoothstep(0.0, 0.25, d.y);
          vec3 lit = mix(cloud * 0.82, cloud * 1.15 + glow * 0.25, pow(s, 3.0));
          col = mix(col, lit, c * 0.85);
        }
        // Below the horizon (hidden by the land, but never black).
        col = mix(col, horizon * 0.9, smoothstep(0.0, -0.15, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const sky = new THREE.Mesh(geo, mat)
  sky.name = 'sky'
  sky.frustumCulled = false
  sky.renderOrder = -1
  return sky
}

// --- terrain --------------------------------------------------------------------
function buildTerrain(F) {
  const size = F.terrainSize
  const seg = 260
  const geo = new THREE.PlaneGeometry(size, size, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position')
  // Denser near the middle: pull vertices towards the centre (more detail where
  // you look), keeping the edges at the edges.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.max(Math.abs(x), Math.abs(z)) / (size / 2)
    const k = r < 1e-6 ? 1 : Math.pow(r, 1.8) / r
    pos.setX(i, x * k)
    pos.setZ(i, z * k)
  }
  const colors = new Float32Array(pos.count * 3)
  const C = F.ground
  const c = new THREE.Color()
  const mix = (a, b, t) => c.copy(a).lerp(b, t)
  const grass = new THREE.Color(C.grass)
  const lush = new THREE.Color(C.lush)
  const sunny = new THREE.Color(C.sunny)
  const dirt = new THREE.Color(C.dirt)
  const rock = new THREE.Color(C.rock)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = heightAt(x, z, F)
    pos.setY(i, h)
    // Paint: patches of deeper and sunnier green, the dirt path, rock up high.
    const n = fbm(x * 0.03 + 11, z * 0.03 - 4, 4)
    const m = fbm(x * 0.008 - 2, z * 0.008 + 5, 3)
    mix(lush, grass, smooth(0.35, 0.6, n))
    c.lerp(sunny, smooth(0.5, 0.75, m) * 0.7)
    const p = 1 - smooth(1.2, 3.2, pathDistance(x, z) + (vnoise(x * 0.4, z * 0.4) - 0.5) * 1.5)
    if (p > 0) c.lerp(dirt, p * smooth(0, 6, outside(x, z, F) + 3))
    c.lerp(rock, smooth(28, 70, h) * 0.7)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'terrain'
  mesh.receiveShadow = true
  return mesh
}

// --- grass ----------------------------------------------------------------------
// One blade: a tapered strip, 4 segments, pivoting at its root. Normals point up
// so a field of blades lights like one soft surface (the classic stylised look).
function bladeGeometry() {
  const segs = 4
  const pos = []
  const uv = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const w = 0.5 * (1 - t) * (1 - t * 0.2)
    pos.push(-w, t, 0, w, t, 0)
    uv.push(0, t, 1, t)
  }
  pos.push(0, 1.08, 0)
  uv.push(0.5, 1.08)
  const idx = []
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const top = segs * 2
  idx.push(top, top + 1, top + 2)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]),
      3,
    ),
  )
  g.setIndex(idx)
  return g
}

function buildGrass(F, uniforms) {
  const geo = bladeGeometry()
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, color: '#ffffff' })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float time;
uniform vec3 wind;       // x, z direction and strength
uniform vec4 pushers[4]; // fighters: x, z, radius, strength
varying float vH;
varying float vPatch;
float gh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float gn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y);
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vH = uv.y;
  vec3 root = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  // Big soft patches of lighter and deeper grass, like brush strokes.
  vPatch = gn(root.xz * 0.045) * 0.65 + gn(root.xz * 0.17 + 3.0) * 0.35;
  float bendAmt = uv.y * uv.y;
  // Gusts: big slow waves of wind rolling across the field, plus a flutter.
  vec2 wdir = normalize(wind.xy);
  float gust = gn(root.xz * 0.08 - wdir * time * 1.6) ;
  float flutter = sin(time * 3.1 + root.x * 1.7 + root.z * 1.3) * 0.15;
  float sway = (gust * 1.1 + 0.25 + flutter) * wind.z;
  vec3 bend = vec3(wdir.x, 0.0, wdir.y) * sway;
  // Fighters part the grass around them.
  for (int i = 0; i < 4; i++) {
    vec2 d = root.xz - pushers[i].xy;
    float l = length(d);
    float k = (1.0 - smoothstep(0.0, pushers[i].z, l)) * pushers[i].w;
    bend.xz += (l > 0.001 ? d / l : vec2(0.0)) * k * 1.4;
    bend.y -= k * 0.5;
  }
  // The blade's own space is scaled by the instance; apply the bend in world
  // metres by undoing the instance scale.
  float sx = length(instanceMatrix[0].xyz);
  float sy = length(instanceMatrix[1].xyz);
  mat3 rot = mat3(instanceMatrix[0].xyz / sx, instanceMatrix[1].xyz / sy, instanceMatrix[2].xyz / length(instanceMatrix[2].xyz));
  vec3 local = transpose(rot) * bend;
  transformed.x += local.x / sx * bendAmt;
  transformed.z += local.z / sx * bendAmt;
  transformed.y += local.y / sy * bendAmt;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vH;
varying float vPatch;
uniform vec3 grassBase;
uniform vec3 grassTip;
uniform vec3 grassSun;`,
      )
      .replace(
        // Both sides of a blade face the sky: no dark backs (one soft surface).
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
  normal = normalize(vNormal);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  // Dark at the root, light at the tip: depth in the field for free.
  vec3 g = mix(grassBase, grassTip, smoothstep(0.0, 1.0, vH));
  // Sunlit patches turn warm and golden at the tips.
  g = mix(g, grassSun, smoothstep(0.45, 0.85, vPatch) * smoothstep(0.3, 1.0, vH) * 0.7);
  g *= 0.88 + vPatch * 0.25;
  diffuseColor.rgb *= g;`,
      )
  }
  // Fewer blades on small screens (phones): the field still reads, the GPU breathes.
  const small =
    typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700
  const count = Math.round(F.grassCount * (small ? 0.35 : 1))
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const tilt = new THREE.Quaternion()
  const col = new THREE.Color()
  const tint = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#dff3b0'),
    new THREE.Color('#c8e6a0'),
    new THREE.Color('#f2f7c8'),
  ]
  let n = 0
  const R = F.grassRadius
  let tries = 0
  while (n < count && tries < count * 4) {
    tries++
    // Denser near the middle: radius drawn with a bias.
    const a = Math.random() * Math.PI * 2
    const r = R * Math.pow(Math.random(), 0.75)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.9
    // Clumps: thin out where the noise says so, never on the path.
    const clump = fbm(x * 0.18, z * 0.18, 3)
    if (Math.random() > smooth(0.2, 0.5, clump) * 0.55 + 0.45) continue
    if (pathDistance(x, z) < 1.6 + vnoise(x, z) * 0.8) continue
    const y = heightAt(x, z, F)
    // Shorter towards the edge of the grass, so it melts into the painted hills.
    const edge = 1 - smooth(R * 0.7, R, r) * 0.75
    const h = (0.2 + Math.random() * 0.3) * (0.7 + clump * 0.6) * edge
    const w = 0.06 + Math.random() * 0.05
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2)
    tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * 0.35)
    q.multiply(tilt)
    m.compose(new THREE.Vector3(x, y - 0.02, z), q, new THREE.Vector3(w, h, w))
    mesh.setMatrixAt(n, m)
    col.copy(tint[n % tint.length]).multiplyScalar(0.85 + Math.random() * 0.3)
    mesh.setColorAt(n, col)
    n++
  }
  mesh.count = n
  mesh.name = 'grass'
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  return mesh
}

// --- flowers --------------------------------------------------------------------
function buildFlowers(F, uniforms) {
  const geo = new THREE.IcosahedronGeometry(0.045, 0)
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#332a10' })
  const count = F.flowerCount
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const m = new THREE.Matrix4()
  const col = new THREE.Color()
  const palette = ['#ffffff', '#fff3a8', '#ffd1e0', '#fffbe6', '#c9d8ff']
  let n = 0
  for (let i = 0; i < count * 3 && n < count; i++) {
    const x = (Math.random() - 0.5) * F.grassRadius * 1.8
    const z = (Math.random() - 0.5) * F.grassRadius * 1.6
    if (fbm(x * 0.09 + 30, z * 0.09, 3) < 0.55) continue // they grow in drifts
    if (pathDistance(x, z) < 2) continue
    m.makeTranslation(x, heightAt(x, z, F) + 0.18 + Math.random() * 0.2, z)
    mesh.setMatrixAt(n, m)
    mesh.setColorAt(n, col.set(palette[n % palette.length]))
    n++
  }
  void uniforms
  mesh.count = n
  mesh.name = 'flowers'
  return mesh
}

// --- mountains ------------------------------------------------------------------
function buildMountains(F) {
  const group = new THREE.Group()
  group.name = 'mountains'
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  const snow = new THREE.Color(F.mountains.snow)
  const stone = new THREE.Color(F.mountains.stone)
  const c = new THREE.Color()
  for (let i = 0; i < F.mountains.count; i++) {
    const a = (i / F.mountains.count) * Math.PI * 2 + hash(i, 3) * 0.3
    const r = F.mountains.distance + hash(i, 7) * 160
    const h = 90 + hash(i, 11) * 170
    const geo = new THREE.ConeGeometry(h * (0.9 + hash(i, 5) * 0.6), h, 9, 6, true)
    const p = geo.getAttribute('position')
    const colors = new Float32Array(p.count * 3)
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k)
      const y = p.getY(k)
      const z = p.getZ(k)
      const j = fbm(x * 0.02 + i * 3, z * 0.02 + y * 0.02, 3) - 0.5
      const t = (y + h / 2) / h // 0 base .. 1 tip
      p.setXYZ(k, x * (1 + j * 0.5), y + j * h * 0.15, z * (1 + j * 0.5))
      c.copy(stone).lerp(snow, smooth(0.62, 0.8, t + j * 0.3))
      colors.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(Math.cos(a) * r, h / 2 - 25, Math.sin(a) * r)
    mesh.rotation.y = hash(i, 13) * Math.PI
    group.add(mesh)
  }
  return group
}

// --- trees ----------------------------------------------------------------------
function buildTrees(F) {
  const group = new THREE.Group()
  group.name = 'trees'
  const spots = []
  for (let i = 0; spots.length < F.treeCount && i < 400; i++) {
    const a = hash(i, 21) * Math.PI * 2
    const r = 45 + hash(i, 23) * 120
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (pathDistance(x, z) < 5) continue
    spots.push([x, heightAt(x, z, F), z, 0.8 + hash(i, 29) * 0.7])
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6)
  trunkGeo.translate(0, 1.5, 0)
  const leafGeo = new THREE.IcosahedronGeometry(1.8, 1)
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ color: '#6b4a32' }),
    spots.length,
  )
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }),
    spots.length * 3,
  )
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const col = new THREE.Color()
  spots.forEach(([x, y, z, s], i) => {
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s))
    trunks.setMatrixAt(i, m)
    for (let k = 0; k < 3; k++) {
      const ox = (hash(i, k + 40) - 0.5) * 1.8 * s
      const oz = (hash(i, k + 50) - 0.5) * 1.8 * s
      const oy = (3.2 + k * 0.9) * s
      const ls = s * (1.1 - k * 0.18)
      m.compose(new THREE.Vector3(x + ox, y + oy, z + oz), q, new THREE.Vector3(ls, ls * 0.85, ls))
      leaves.setMatrixAt(i * 3 + k, m)
      leaves.setColorAt(i * 3 + k, col.set(F.ground.tree).multiplyScalar(0.85 + k * 0.12))
    }
  })
  trunks.castShadow = leaves.castShadow = true
  group.add(trunks, leaves)
  return group
}

// --- all of it ------------------------------------------------------------------
export function buildField(room) {
  const F = room.field
  F.sunDir = new THREE.Vector3(...F.sun).normalize()
  const group = new THREE.Group()
  group.name = 'field'
  const uniforms = {
    time: { value: 0 },
    wind: { value: new THREE.Vector3(F.wind[0], F.wind[1], F.wind[2]) },
    pushers: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) },
    grassBase: { value: new THREE.Color(F.ground.grassBase) },
    grassTip: { value: new THREE.Color(F.ground.grassTip) },
    grassSun: { value: new THREE.Color(F.ground.grassSun) },
  }
  const sky = buildSky(F)
  group.add(
    sky,
    buildTerrain(F),
    buildGrass(F, uniforms),
    buildFlowers(F, uniforms),
    buildMountains(F),
    buildTrees(F),
  )
  group.userData.update = (t, fighters = []) => {
    uniforms.time.value = t
    sky.material.uniforms.time.value = t
    for (let i = 0; i < 4; i++) {
      const f = fighters[i]
      const p = uniforms.pushers.value[i]
      if (f) p.set(f.x, f.z, 1.1, f.y < 2.2 ? 1 : 0)
      else p.set(0, 0, 1, 0)
    }
  }
  return group
}
