// Keyboard + mouse to controls.
//
//   WASD / arrows  move (relative to the camera)     Shift  sprint
//   Space          jump; again in the air = double jump
//   Mouse          look around (click the arena first: it captures the mouse,
//                  Esc lets go). Wheel = zoom.
//   Left click     light attack (J)                  Right click  heavy attack (K)
//   Wheel click    guard, hold (also F or L)         C            dash
//   Q / E / R      abilities 1-3 (what you unlocked: GET /api/arena/loadout)
//   X              crouch, hold                      T            emote
//
// Only the engine's real-time mode listens. In test mode input is ignored
// entirely, so a stray key press can never make a test flaky. Controllers (Xbox,
// Switch) come last, through the Gamepad API, behind the same controls() shape.

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyJ: 'light',
  KeyK: 'heavy',
  KeyF: 'block',
  KeyL: 'block',
  KeyC: 'dash',
  KeyQ: 'ability1',
  KeyE: 'ability2',
  KeyR: 'ability3',
  KeyT: 'emote',
  KeyX: 'crouch',
}

// Buttons where a tap matters (as opposed to holding).
const TAPS = ['jump', 'light', 'heavy', 'dash', 'ability1', 'ability2', 'ability3', 'emote']
// 1 = the wheel pressed in: guard while held (Morrison, 25 Nov).
const MOUSE_BUTTONS = { 0: 'light', 1: 'block', 2: 'heavy' }

export function createControls(target = window, surface = null) {
  const held = new Set()
  // A tap pressed and released between two reads still counts once.
  const tapped = Object.fromEntries(TAPS.map((k) => [k, false]))
  // Mouse movement since the last look() read.
  const look = { dx: 0, dy: 0, wheel: 0 }
  const locked = () => surface && document.pointerLockElement === surface

  // Don't steal keys while the user is typing in a form field somewhere.
  const typing = (e) => {
    const el = e.target
    return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function press(key, repeat = false) {
    if (TAPS.includes(key) && !repeat) tapped[key] = true
    held.add(key)
  }

  function down(e) {
    const key = KEYS[e.code]
    // Leave browser shortcuts alone (Ctrl/Cmd + R reloads, + F finds).
    if (!key || typing(e) || e.ctrlKey || e.metaKey) return
    press(key, e.repeat)
    e.preventDefault() // arrows and space would otherwise scroll the page
  }
  function up(e) {
    const key = KEYS[e.code]
    if (key) held.delete(key)
  }
  // Alt-tab with a key held would otherwise leave it "stuck down" forever.
  function clear() {
    held.clear()
  }

  // The first click captures the mouse (it is not an attack); after that,
  // left/right click attack.
  function mouseDown(e) {
    if (!surface) return
    if (e.button === 1) e.preventDefault() // no autoscroll on a wheel click
    if (!locked()) {
      surface.requestPointerLock?.()
      return
    }
    const key = MOUSE_BUTTONS[e.button]
    if (key) {
      press(key)
      e.preventDefault()
    }
  }
  function mouseUp(e) {
    const key = MOUSE_BUTTONS[e.button]
    if (key) held.delete(key)
  }
  function mouseMove(e) {
    if (!locked()) return
    look.dx += e.movementX
    look.dy += e.movementY
  }
  function wheel(e) {
    if (!surface) return
    look.wheel += Math.sign(e.deltaY)
    e.preventDefault()
  }
  const noMenu = (e) => e.preventDefault()

  target.addEventListener('keydown', down)
  target.addEventListener('keyup', up)
  target.addEventListener('blur', clear)
  if (surface) {
    surface.addEventListener('mousedown', mouseDown)
    target.addEventListener('mouseup', mouseUp)
    target.addEventListener('mousemove', mouseMove)
    surface.addEventListener('wheel', wheel, { passive: false })
    surface.addEventListener('contextmenu', noMenu)
  }

  return {
    // Read once per simulation tick batch:
    // { x, y, sprint, jump, light, heavy, block, dash }.
    controls() {
      const out = {
        x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        y: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
        sprint: held.has('sprint'),
        crouch: held.has('crouch'),
        block: held.has('block'),
      }
      for (const k of TAPS) {
        out[k] = held.has(k) || tapped[k]
        tapped[k] = false
      }
      return out
    },
    // Mouse movement (pixels) and wheel steps since the last call.
    look() {
      const out = { ...look }
      look.dx = look.dy = look.wheel = 0
      return out
    },
    locked,
    dispose() {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', clear)
      if (surface) {
        surface.removeEventListener('mousedown', mouseDown)
        target.removeEventListener('mouseup', mouseUp)
        target.removeEventListener('mousemove', mouseMove)
        surface.removeEventListener('wheel', wheel)
        surface.removeEventListener('contextmenu', noMenu)
        if (locked()) document.exitPointerLock?.()
      }
      held.clear()
    },
  }
}

// Kept for older imports.
export const createKeyboard = createControls
