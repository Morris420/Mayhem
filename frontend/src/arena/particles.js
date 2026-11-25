// Particles: the anime battle VFX (impacts, shockwaves, dust, fire, dark aura,
// runes). Render-only, like effects.js: driven by the simulation's events and
// states, never feeding back, so it may use Math.random and real time.
//
// Textures: one atlas (public/textures/fx/atlas.webp) built from Wishforge Games'
// free GDevelop particles library (docs/arena-assets.md). Every particle is a quad
// in one of two instanced meshes (glowing = additive, smoke = normal blending), so
// hundreds of particles cost two draw calls.
import * as THREE from 'three'

// Atlas cells (4 x 4, see scripts/atlas.mjs).
export const FX = {
  glow: 0,
  star: 1,
  streak: 2,
  ring: 3,
  fire: 4,
  smoke: 5,
  fog: 6,
  dark: 7,
  bolt: 8,
  rune: 9,
  cross: 10,
  trail: 11,
}

const MAX = 1500

const vertex = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec4 iData; // size x, size y, rotation, atlas cell
attribute float iFlat; // 1 = lies flat on the floor, 0 = faces the camera
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float c = cos(iData.z), s = sin(iData.z);
  vec2 p = vec2(position.x * iData.x, position.y * iData.y);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec4 mv;
  if (iFlat > 0.5) {
    mv = viewMatrix * vec4(iPos + vec3(p.x, 0.0, p.y), 1.0);
  } else {
    mv = viewMatrix * vec4(iPos, 1.0);
    mv.xy += p;
  }
  gl_Position = projectionMatrix * mv;
  float cell = iData.w;
  vec2 o = vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0)) * 0.25;
  vUv = o + uv * 0.25;
  vColor = iColor;
}`

const fragment = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function makeLayer(tex, blending) {
  const geo = new THREE.InstancedBufferGeometry()
  const quad = new THREE.PlaneGeometry(1, 1)
  geo.index = quad.index
  geo.setAttribute('position', quad.getAttribute('position'))
  geo.setAttribute('uv', quad.getAttribute('uv'))
  const attr = (n, size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * size), size)
    a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute(n, a)
    return a
  }
  const layer = {
    pos: attr('iPos', 3),
    color: attr('iColor', 4),
    data: attr('iData', 4),
    flat: attr('iFlat', 1),
    list: [],
  }
  geo.instanceCount = 0
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // flat ones (runes, rings) are seen from above
    blending,
  })
  layer.mesh = new THREE.Mesh(geo, mat)
  layer.mesh.frustumCulled = false
  layer.mesh.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2
  layer.geo = geo
  return layer
}

const rnd = (a, b) => a + Math.random() * (b - a)
const C = new THREE.Color()

export function createParticles(scene, url = '/textures/fx/atlas.webp') {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  const add = makeLayer(tex, THREE.AdditiveBlending)
  const norm = makeLayer(tex, THREE.NormalBlending)
  scene.add(add.mesh, norm.mesh)

  // p: { x,y,z, vx,vy,vz, g (gravity), drag, life, size, size1, sx (x stretch),
  //      rot, spin, color, alpha, fadeIn, cell, flat, glow (true = additive) }
  function emit(p) {
    const layer = p.glow === false ? norm : add
    if (layer.list.length >= MAX) layer.list.shift()
    C.set(p.color ?? '#ffffff')
    layer.list.push({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0,
      vz: p.vz ?? 0,
      g: p.g ?? 0,
      drag: p.drag ?? 0,
      age: 0,
      life: p.life ?? 0.5,
      size: p.size ?? 0.5,
      size1: p.size1 ?? p.size ?? 0.5,
      sx: p.sx ?? 1,
      rot: p.rot ?? Math.random() * Math.PI * 2,
      spin: p.spin ?? 0,
      r: C.r * (p.bright ?? 1),
      gr: C.g * (p.bright ?? 1),
      b: C.b * (p.bright ?? 1),
      a: p.alpha ?? 1,
      fadeIn: p.fadeIn ?? 0.05,
      cell: p.cell ?? FX.glow,
      flat: p.flat ? 1 : 0,
    })
  }

  function step(layer, dt) {
    const keep = []
    for (const q of layer.list) {
      q.age += dt
      if (q.age >= q.life) continue
      const k = Math.max(0, 1 - q.drag * dt)
      q.vx *= k
      q.vy = q.vy * k - q.g * dt
      q.vz *= k
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.z += q.vz * dt
      q.rot += q.spin * dt
      keep.push(q)
    }
    layer.list = keep
    const n = keep.length
    for (let i = 0; i < n; i++) {
      const q = keep[i]
      const t = q.age / q.life
      const fade = Math.min(1, q.age / q.fadeIn) * (1 - t * t)
      const s = q.size + (q.size1 - q.size) * t
      layer.pos.setXYZ(i, q.x, q.y, q.z)
      layer.color.setXYZW(i, q.r, q.gr, q.b, q.a * fade)
      layer.data.setXYZW(i, s * q.sx, s, q.rot, q.cell)
      layer.flat.setX(i, q.flat)
    }
    layer.geo.instanceCount = n
    for (const a of [layer.pos, layer.color, layer.data, layer.flat]) {
      a.needsUpdate = true
      a.clearUpdateRanges?.()
    }
  }

  // --- presets: what each moment looks like -----------------------------------
  const burst = (n, fn) => {
    for (let i = 0; i < n; i++) emit(fn(i))
  }
  const dir = () => {
    const a = Math.random() * Math.PI * 2
    const u = rnd(-0.6, 0.9)
    const r = Math.sqrt(1 - u * u)
    return [Math.cos(a) * r, u, Math.sin(a) * r]
  }

  const presets = {
    // A punch / slash connecting: a hot flash, star sparks flying out, a ring.
    impact({ x, y, z, color = '#ffd27a', heavy = false }) {
      const k = heavy ? 1.6 : 1
      emit({
        x,
        y,
        z,
        cell: FX.glow,
        size: 1.2 * k,
        size1: 2.2 * k,
        life: 0.16,
        color,
        bright: 2.2,
      })
      emit({
        x,
        y,
        z,
        cell: FX.star,
        size: 0.9 * k,
        size1: 1.5 * k,
        life: 0.14,
        color: '#ffffff',
        bright: 2,
        spin: 6,
      })
      emit({
        x,
        y,
        z,
        cell: FX.ring,
        size: 0.3,
        size1: 2.4 * k,
        life: 0.22,
        color,
        bright: 1.6,
        spin: 4,
      })
      burst(heavy ? 14 : 8, () => {
        const [a, b, c] = dir()
        const v = rnd(5, 11) * k
        return {
          x,
          y,
          z,
          vx: a * v,
          vy: b * v,
          vz: c * v,
          drag: 6,
          g: 6,
          life: rnd(0.2, 0.4),
          cell: FX.star,
          size: rnd(0.12, 0.25) * k,
          size1: 0.02,
          color,
          bright: 2,
        }
      })
    },
    block({ x, y, z, color = '#5fe3f5' }) {
      emit({ x, y, z, cell: FX.ring, size: 0.6, size1: 1.8, life: 0.2, color, bright: 1.8 })
      emit({ x, y, z, cell: FX.glow, size: 0.8, size1: 1.2, life: 0.12, color, bright: 1.6 })
      burst(6, () => {
        const [a, b, c] = dir()
        return {
          x,
          y,
          z,
          vx: a * 6,
          vy: b * 6,
          vz: c * 6,
          drag: 8,
          life: 0.25,
          cell: FX.streak,
          size: 0.4,
          sx: 3,
          size1: 0.1,
          color,
          bright: 1.8,
        }
      })
    },
    guardBreak({ x, y, z, color = '#bdf6ff' }) {
      presets.impact({ x, y, z, color, heavy: true })
      burst(6, (i) => ({
        x,
        y,
        z,
        cell: FX.bolt,
        size: rnd(1.2, 2),
        life: 0.25,
        rot: (i / 6) * Math.PI * 2,
        color,
        bright: 2.4,
      }))
    },
    // Feet hitting the floor: dust rolling out, more for a harder landing.
    dust({ x, y, z, strength = 1, color = '#9aa6b8' }) {
      const n = Math.round(4 + 8 * strength)
      burst(n, (i) => {
        const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2)
        const v = rnd(1.5, 3.5) * strength
        return {
          x,
          y: y + 0.1,
          z,
          vx: Math.cos(a) * v,
          vy: rnd(0.2, 0.8),
          vz: Math.sin(a) * v,
          drag: 3,
          life: rnd(0.45, 0.8),
          cell: FX.smoke,
          size: 0.5,
          size1: 1.3 * (0.6 + strength * 0.5),
          color,
          alpha: 0.45,
          glow: false,
          spin: rnd(-1, 1),
        }
      })
      if (strength > 0.8)
        emit({
          x,
          y: y + 0.03,
          z,
          flat: true,
          cell: FX.ring,
          size: 0.5,
          size1: 3.2 * strength,
          life: 0.3,
          color: '#cfe2ff',
          bright: 1.2,
          alpha: 0.7,
        })
    },
    // A light trail behind a roll or a rush.
    puff({ x, y, z, color = '#9aa6b8', size = 0.7 }) {
      emit({
        x,
        y,
        z,
        vy: 0.4,
        drag: 2,
        life: 0.5,
        cell: FX.smoke,
        size: size * 0.6,
        size1: size * 1.4,
        color,
        alpha: 0.35,
        glow: false,
        spin: rnd(-1, 1),
      })
    },
    fireTrail({ x, y, z }) {
      emit({
        x: x + rnd(-0.06, 0.06),
        y: y + rnd(-0.06, 0.06),
        z: z + rnd(-0.06, 0.06),
        vy: 0.6,
        drag: 2,
        life: rnd(0.25, 0.4),
        cell: FX.fire,
        size: 0.55,
        size1: 0.15,
        color: '#ff8a3d',
        bright: 1.6,
        spin: rnd(-3, 3),
      })
    },
    explosion({ x, y, z }) {
      emit({
        x,
        y,
        z,
        cell: FX.glow,
        size: 1.6,
        size1: 3,
        life: 0.2,
        color: '#ffb066',
        bright: 2.4,
      })
      burst(10, () => {
        const [a, b, c] = dir()
        return {
          x,
          y,
          z,
          vx: a * 4,
          vy: Math.abs(b) * 3,
          vz: c * 4,
          drag: 4,
          life: rnd(0.3, 0.55),
          cell: FX.fire,
          size: rnd(0.6, 1),
          size1: 0.2,
          color: '#ff7a2e',
          bright: 1.8,
          spin: rnd(-4, 4),
        }
      })
      burst(6, () => {
        const [a, , c] = dir()
        return {
          x,
          y,
          z,
          vx: a * 1.5,
          vy: rnd(0.5, 1.4),
          vz: c * 1.5,
          drag: 1.5,
          life: rnd(0.7, 1.1),
          cell: FX.smoke,
          size: 0.6,
          size1: 1.8,
          color: '#3a3438',
          alpha: 0.5,
          glow: false,
          spin: rnd(-1, 1),
        }
      })
    },
    // The Shadow Knight's aura: dark wisps rising off him.
    darkWisp({ x, y, z, strength = 1 }) {
      emit({
        x: x + rnd(-0.45, 0.45),
        y: y + rnd(0, 1.6),
        z: z + rnd(-0.45, 0.45),
        vy: rnd(0.4, 1.1) * strength,
        drag: 0.5,
        life: rnd(0.7, 1.2),
        cell: FX.dark,
        size: rnd(0.4, 0.7),
        size1: rnd(0.9, 1.4) * strength,
        color: '#2a1a48',
        alpha: 0.3 * Math.min(1.5, strength),
        glow: false,
        spin: rnd(-0.8, 0.8),
      })
      if (Math.random() < 0.3 * strength)
        emit({
          x: x + rnd(-0.4, 0.4),
          y: y + rnd(0.3, 1.8),
          z: z + rnd(-0.4, 0.4),
          vy: rnd(0.3, 0.9),
          life: rnd(0.4, 0.8),
          cell: FX.glow,
          size: 0.12,
          size1: 0.02,
          color: '#8a5cff',
          bright: 2,
        })
    },
    // A rune circle on the floor while he charges (t = 0..1 charge).
    runes({ x, z, t, color = '#7a4dff' }) {
      emit({
        x,
        y: 0.04,
        z,
        flat: true,
        cell: FX.rune,
        size: 3.2 + t * 0.6,
        life: 0.06,
        rot: t * 4,
        color,
        bright: 1 + t * 1.5,
        alpha: 0.35 + 0.5 * t,
        fadeIn: 0.001,
      })
    },
    // Blade or fist streak, along a direction.
    slash({ x, y, z, dx, dz, color = '#b8a6ff', size = 2.4 }) {
      emit({
        x,
        y,
        z,
        cell: FX.ring,
        size: size * 0.5,
        size1: size,
        life: 0.18,
        rot: Math.atan2(dz, dx),
        color,
        bright: 2.2,
      })
    },
    sparkle({ x, y, z, color }) {
      emit({
        x: x + rnd(-0.3, 0.3),
        y: y + rnd(-0.3, 0.3),
        z: z + rnd(-0.3, 0.3),
        vy: rnd(0.2, 0.8),
        life: rnd(0.3, 0.6),
        cell: FX.star,
        size: rnd(0.08, 0.18),
        size1: 0.01,
        color,
        bright: 2.2,
        spin: 3,
      })
    },
  }

  return {
    ...presets,
    emit,
    update(dt) {
      step(add, dt)
      step(norm, dt)
    },
    count: () => add.list.length + norm.list.length,
    dispose() {
      scene.remove(add.mesh, norm.mesh)
      for (const l of [add, norm]) {
        l.geo.dispose()
        l.mesh.material.dispose()
      }
      tex.dispose()
    },
  }
}
