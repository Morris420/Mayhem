// The fixed-timestep clock. The simulation only ever moves forward in whole steps
// of exactly STEP_MS, whatever the monitor's refresh rate, which is what makes it
// deterministic and what lets a test drive it by hand (window.__arena.step).

export const STEP_MS = 1000 / 60
export const STEP_S = STEP_MS / 1000

// Longest real frame we will catch up on. Background a tab for ten seconds and,
// without this, the next frame would try to run 600 physics steps at once.
export const MAX_FRAME_MS = 100

export function createFixedStep({ stepMs = STEP_MS, maxFrameMs = MAX_FRAME_MS } = {}) {
  let acc = 0
  return {
    // Feed real elapsed time; returns how many fixed steps to run now.
    advance(deltaMs) {
      acc += Math.min(Math.max(deltaMs, 0), maxFrameMs)
      const steps = Math.floor(acc / stepMs)
      acc -= steps * stepMs
      return steps
    },
    // How far we are into the next step (0..1): used to interpolate rendering.
    alpha() {
      return acc / stepMs
    },
    reset() {
      acc = 0
    },
  }
}

// For tests: "advance 1000 ms" means exactly 60 steps, never 59 or 61 because of
// floating point. Rounds to the nearest whole step.
export function stepsFor(ms, stepMs = STEP_MS) {
  return Math.max(0, Math.round(ms / stepMs))
}
