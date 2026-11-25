// Keyboard to controls. WASD or arrows to move, Shift sprint, Space jump,
// J light attack, K heavy attack, L block (hold), C dash.
// Only the engine's real-time mode listens to the keyboard. In test mode the
// keyboard is ignored entirely, so a stray key press can never make a test flaky.
// Controllers (Xbox, Switch) come last, through the Gamepad API, behind the same
// controls() shape.

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
  KeyL: 'block',
  KeyC: 'dash',
}

// Buttons where a tap matters (as opposed to holding).
const TAPS = ['jump', 'light', 'heavy', 'dash']

export function createKeyboard(target = window) {
  const held = new Set()
  // A tap pressed and released between two reads still counts once.
  const tapped = { jump: false, light: false, heavy: false, dash: false }

  // Don't steal keys while the user is typing in a form field somewhere.
  const typing = (e) => {
    const el = e.target
    return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function down(e) {
    const key = KEYS[e.code]
    if (!key || typing(e)) return
    if (TAPS.includes(key) && !e.repeat) tapped[key] = true
    held.add(key)
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

  target.addEventListener('keydown', down)
  target.addEventListener('keyup', up)
  target.addEventListener('blur', clear)

  return {
    // Read once per simulation tick batch:
    // { x, y, sprint, jump, light, heavy, block, dash }.
    controls() {
      const out = {
        x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        y: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
        sprint: held.has('sprint'),
        block: held.has('block'),
      }
      for (const k of TAPS) {
        out[k] = held.has(k) || tapped[k]
        tapped[k] = false
      }
      return out
    },
    dispose() {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', clear)
      held.clear()
    },
  }
}
