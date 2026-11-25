// What the fighters look like. In M1 the hunter is a capsule; M2 replaces it with
// the neon humanoid in this same module, and nothing else has to change.
//
// The look is the dashboard physique figure's trick in 3D: an almost-black body
// with a bright edge. Here the edge is an "inverted hull" — a slightly larger copy
// of the mesh, drawn inside-out in cyan, so only its rim shows round the body.
import * as THREE from 'three'
import { FOOT_OFFSET, MOVE } from './player.js'

// A soft round shadow texture, drawn once on a canvas. Far cheaper than a shadow
// map and it reads fine in a dark room (playbook §6).
function blobTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.85)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // A faint cyan contact ring: a black shadow alone vanishes on the dark floor,
  // and this is what shows you are in the air (it shrinks and fades as you rise).
  ctx.strokeStyle = 'rgba(34,211,238,0.55)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createCapsuleFigure({ edge = '#22d3ee' } = {}) {
  const root = new THREE.Group()
  root.name = 'player'

  // The body turns with the player; the shadow stays flat on the floor.
  const body = new THREE.Group()
  root.add(body)

  const geo = new THREE.CapsuleGeometry(MOVE.radius, MOVE.halfHeight * 2, 8, 24)
  const skin = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#05070d', roughness: 0.5, metalness: 0.3 }),
  )
  skin.name = 'player-body'
  body.add(skin)

  const hull = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: edge, side: THREE.BackSide, toneMapped: false }),
  )
  hull.scale.setScalar(1.07)
  hull.name = 'player-edge'
  body.add(hull)

  // A visor on the front so you can see which way it faces.
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.07, 0.08),
    new THREE.MeshBasicMaterial({ color: edge, toneMapped: false }),
  )
  // Just outside the body's surface: any deeper and the body hides it.
  visor.position.set(0, MOVE.halfHeight + 0.05, MOVE.radius + 0.02)
  visor.name = 'player-visor'
  body.add(visor)

  const shadowMat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.renderOrder = 1
  shadow.name = 'player-shadow'
  root.add(shadow)

  // pos = capsule centre (as the physics reports it), yaw = facing.
  function place(pos, yaw) {
    root.position.set(pos.x, pos.y, pos.z)
    body.rotation.y = yaw
    // Shadow sits on the floor (y = 0) and fades/shrinks as you rise above it.
    const height = Math.max(0, pos.y - FOOT_OFFSET)
    shadow.position.y = -pos.y + 0.015
    const k = 1 / (1 + height * 0.6)
    shadow.scale.setScalar(k)
    shadowMat.opacity = k
  }

  return { object: root, place }
}
