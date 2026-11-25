// The Shadow Knight's katana, built from a few boxes (no model to license): a
// long dark blade with a faint violet edge, a guard and a wrapped grip. Attached
// to the figure's right hand bone so it follows every animation.
import * as THREE from 'three'

// How the katana sits in the hand, in the hand bone's own axes (found by eye
// against the idle and slash poses).
export const GRIP = {
  bone: 'J_Bip_R_Hand',
  offset: [-0.07, -0.02, 0.0], // metres from the wrist joint, into the palm
  rotation: [0, 0, Math.PI / 2], // radians: blade out past the thumb, along the forearm's line
}

export function buildKatana() {
  const g = new THREE.Group()
  g.name = 'katana'
  const steel = new THREE.MeshStandardMaterial({
    color: '#1b1a22',
    metalness: 0.9,
    roughness: 0.25,
  })
  const edge = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8f6bff').multiplyScalar(1.6),
  })
  const wrap = new THREE.MeshStandardMaterial({ color: '#2a1630', roughness: 0.8 })
  const gold = new THREE.MeshStandardMaterial({ color: '#6b5530', metalness: 0.7, roughness: 0.4 })
  const box = (w, h, d, mat, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.y = y
    g.add(m)
    return m
  }
  // The grip is centred on the hand (y = 0); the blade runs up from the guard.
  box(0.035, 0.26, 0.03, wrap, 0)
  box(0.1, 0.012, 0.085, gold, 0.135)
  box(0.03, 0.95, 0.008, steel, 0.62)
  box(0.006, 0.93, 0.0095, edge, 0.62).position.x = 0.013
  // A slight tip.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4), steel)
  tip.position.y = 1.135
  tip.scale.z = 0.3
  g.add(tip)
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  return g
}

// Put a katana in `root`'s right hand. Returns the katana group (or null).
export function attachKatana(root, grip = GRIP) {
  const hand = root.getObjectByName(grip.bone)
  if (!hand) return null
  root.updateMatrixWorld(true)
  const k = buildKatana()
  // The bone's world scale includes the model's fit-to-height scale (and the
  // armature's centimetres): undo it so the katana is in metres.
  const s = new THREE.Vector3()
  hand.getWorldScale(s)
  k.scale.set(1 / s.x, 1 / s.y, 1 / s.z)
  k.position.set(grip.offset[0] / s.x, grip.offset[1] / s.y, grip.offset[2] / s.z)
  k.rotation.set(...grip.rotation)
  hand.add(k)
  return k
}
