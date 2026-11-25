// Every arena, by slug. ?room=<slug> on /arena picks one; the first is the default.
import openField from './open-field.js'
import trainingRoom from './training-room.js'
import church from './ruined-church.js'
import dungeon from './training-hall.js'

// The open field is where you land; the training room is for testing; the
// church is the boss room.
export const ROOMS = {
  'open-field': openField,
  'training-room': trainingRoom,
  'ruined-church': church,
  'training-hall': dungeon,
}
export const DEFAULT_ROOM = openField
export const roomBySlug = (slug) => ROOMS[slug] ?? DEFAULT_ROOM
