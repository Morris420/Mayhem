// Hit effects: sparks where hits land and a short camera shake on heavy ones.
// Render-only, driven by the simulation's events; nothing here feeds back into
// the game, so it can use Math.sin, real time, whatever looks good.
import * as THREE from 'three'

function sparkTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // A few rays, for the anime impact look.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(size / 2 + Math.cos(a) * 6, size / 2 + Math.sin(a) * 6)
    ctx.lineTo(size / 2 + Math.cos(a) * 30, size / 2 + Math.sin(a) * 30)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(canvas)
}

const COLORS = { hit: '#ffcf6e', ko: '#ffffff', block: '#5fe3f5' }

export function createEffects(scene) {
  const tex = sparkTexture()
  const live = []
  let shake = 0
  let shakePower = 0

  return {
    // e: an event from the simulation ({ type, heavy, x, y, z, ... }).
    spawn(e) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: COLORS[e.type] ?? COLORS.hit,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.position.set(e.x, e.y, e.z)
      sprite.renderOrder = 2
      scene.add(sprite)
      const big = e.type === 'ko' ? 2.2 : e.heavy ? 1.6 : e.type === 'block' ? 0.8 : 1.1
      live.push({ sprite, age: 0, life: e.type === 'ko' ? 0.35 : 0.2, big })
      if (e.heavy || e.type === 'ko') {
        shake = e.type === 'ko' ? 0.3 : 0.16
        shakePower = e.type === 'ko' ? 0.16 : 0.08
      }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i]
        s.age += dt
        const t = s.age / s.life
        if (t >= 1) {
          scene.remove(s.sprite)
          s.sprite.material.dispose()
          live.splice(i, 1)
          continue
        }
        s.sprite.scale.setScalar(s.big * (0.4 + t * 0.9))
        s.sprite.material.opacity = 1 - t
      }
      shake = Math.max(0, shake - dt)
    },
    // A small offset to add to the camera position this frame.
    shakeOffset(time) {
      if (shake <= 0) return { x: 0, y: 0 }
      const k = shakePower * (shake / 0.3)
      return { x: Math.sin(time * 91) * k, y: Math.cos(time * 77) * k }
    },
    count: () => live.length,
    dispose() {
      for (const s of live) {
        scene.remove(s.sprite)
        s.sprite.material.dispose()
      }
      live.length = 0
      tex.dispose()
    },
  }
}
