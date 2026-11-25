// Keyboard to stick. WASD or the arrow keys; diagonals are normalised by the player.
// Only the engine's real-time mode listens to the keyboard. In test mode the
// keyboard is ignored entirely, so a stray key press can never make a test flaky.

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

export function createKeyboard(target = window) {
  const held = new Set()

  // Don't steal keys while the user is typing in a form field somewhere.
  const typing = (e) => {
    const el = e.target
    return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function down(e) {
    const dir = KEYS[e.code]
    if (!dir || typing(e)) return
    held.add(dir)
    e.preventDefault() // arrow keys would otherwise scroll the page
  }
  function up(e) {
    const dir = KEYS[e.code]
    if (dir) held.delete(dir)
  }
  // Alt-tab with a key held would otherwise leave it "stuck down" forever.
  function clear() {
    held.clear()
  }

  target.addEventListener('keydown', down)
  target.addEventListener('keyup', up)
  target.addEventListener('blur', clear)

  return {
    stick() {
      return {
        x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        y: (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
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
