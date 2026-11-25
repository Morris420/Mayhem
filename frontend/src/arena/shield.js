// The guard shield: a see-through sphere around a fighter while they block. Its
// size shows the guard meter: full guard = full sphere, and it shrinks as the
// meter drains. A blocked hit makes it flash. Render-only.
import * as THREE from 'three'
import { FOOT_OFFSET } from './player.js'

const RADIUS = 1.2 // metres at full guard

// Bright at the rim, faint in the middle: the "bubble" look.
function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(color, opacity * (0.12 + 0.88 * rim * rim));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function createShield(color) {
  const mat = shieldMaterial(color)
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(RADIUS, 4), mat)
  mesh.name = 'shield'
  mesh.renderOrder = 3
  mesh.visible = false
  let shown = 0 // 0..1, eased
  let flash = 0

  return {
    object: mesh,
    // p = the fighter's state from the simulation, pos = its interpolated centre.
    update(p, pos, dt) {
      const up = p.combat === 'block' || p.combat === 'blockstun'
      shown = dt === 0 ? (up ? 1 : 0) : shown + ((up ? 1 : 0) - shown) * Math.min(1, dt * 14)
      flash = Math.max(0, flash - dt * 4)
      mesh.visible = shown > 0.01
      if (!mesh.visible) return
      const g = p.guardMax ? p.guard / p.guardMax : 1
      mesh.scale.setScalar(Math.max(0.05, (0.3 + 0.7 * g) * (0.85 + 0.15 * shown)))
      mesh.position.set(pos.x, pos.y - FOOT_OFFSET + 0.95, pos.z)
      mat.uniforms.opacity.value = shown * (0.55 + flash)
    },
    hit() {
      flash = 1
    },
    // Fraction of full size, for tests: 0 when hidden.
    size: () => (mesh.visible ? mesh.scale.x : 0),
    dispose() {
      mesh.geometry.dispose()
      mat.dispose()
    },
  }
}
