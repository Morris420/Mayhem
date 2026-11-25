// What projectiles look like: a hot glowing orb with a fading trail. Render-only:
// it reads the simulation's `projectiles` list each frame and never writes back,
// so it may use any maths.
import * as THREE from 'three'

const LOOK = {
  fire_bolt: { core: '#fff1d6', glow: '#ff7a2e', size: 0.2, glowSize: 1.1, trail: 9 },
}

function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export function createBolts(scene) {
  const tex = glowTexture()
  const coreGeo = new THREE.SphereGeometry(1, 16, 12)
  const live = new Map() // projectile id -> { group, core, glow, trail: [sprite], history: [Vector3] }

  function make(p) {
    const look = LOOK[p.kind] ?? LOOK.fire_bolt
    const group = new THREE.Group()
    const core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(look.core).multiplyScalar(2.2) }),
    )
    core.scale.setScalar(look.size)
    const glowMat = new THREE.SpriteMaterial({
      map: tex,
      color: look.glow,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.setScalar(look.glowSize)
    group.add(core, glow)
    scene.add(group)
    const trail = []
    for (let i = 0; i < look.trail; i++) {
      const s = new THREE.Sprite(glowMat.clone())
      s.visible = false
      scene.add(s)
      trail.push(s)
    }
    return { group, core, glow, trail, history: [], look, age: 0 }
  }

  function remove(b) {
    scene.remove(b.group)
    b.core.material.dispose()
    b.glow.material.dispose()
    for (const s of b.trail) {
      scene.remove(s)
      s.material.dispose()
    }
  }

  return {
    // Match the drawn bolts to the simulation's list.
    sync(projectiles) {
      const seen = new Set()
      for (const p of projectiles) {
        seen.add(p.id)
        let b = live.get(p.id)
        if (!b) live.set(p.id, (b = make(p)))
        const at = new THREE.Vector3(p.x, p.y, p.z)
        const last = b.history[0]
        if (!last || last.distanceToSquared(at) > 1e-6) {
          b.history.unshift(at)
          if (b.history.length > b.trail.length + 1) b.history.pop()
        }
        b.group.position.copy(at)
        // The trail: older positions, smaller and dimmer.
        b.trail.forEach((s, i) => {
          const h = b.history[i + 1]
          s.visible = !!h
          if (!h) return
          const k = 1 - (i + 1) / (b.trail.length + 1)
          s.position.copy(h)
          s.scale.setScalar(b.look.glowSize * (0.35 + 0.5 * k))
          s.material.opacity = 0.75 * k
        })
      }
      for (const [id, b] of live) {
        if (!seen.has(id)) {
          remove(b)
          live.delete(id)
        }
      }
    },
    // A little flicker, so it reads as fire rather than a lamp.
    update(dt, time) {
      for (const b of live.values()) {
        b.age += dt
        const f = 1 + 0.12 * Math.sin(time * 47 + b.age * 13)
        b.glow.scale.setScalar(b.look.glowSize * f)
      }
    },
    count: () => live.size,
    dispose() {
      for (const b of live.values()) remove(b)
      live.clear()
      coreGeo.dispose()
      tex.dispose()
    },
  }
}
