// Keyboard to controls. WASD or arrows to move, Shift to sprint, Space to jump.
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
}

export function createKeyboard(target = window) {
  const held = new Set()
  // A jump tapped and released between two reads still counts once.
  let jumpTapped = false

  // Don't steal keys while the user is typing in a form field somewhere.
  const typing = (e) => {
    const el = e.target
    return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function down(e) {
    const key = KEYS[e.code]
    if (!key || typing(e)) return
    if (key === 'jump' && !e.repeat) jumpTapped = true
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
    // Read once per simulation tick batch: { x, y, sprint, jump }.
    controls() {
      const jump = held.has('jump') || jumpTapped
      jumpTapped = false
      return {
        x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        y: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
        sprint: held.has('sprint'),
        jump,
      }
    },
    dispose() {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', clear)
      held.clear()
    },
  }
}
