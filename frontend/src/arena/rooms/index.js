// Every arena, by slug. ?room=<slug> on /arena picks one; the first is the default.
import trainingRoom from './training-room.js'
import church from './ruined-church.js'
import dungeon from './training-hall.js'

// The church is the boss room (milestone D); the training room is where you land.
export const ROOMS = {
  'training-room': trainingRoom,
  'ruined-church': church,
  'training-hall': dungeon,
}
export const DEFAULT_ROOM = trainingRoom
export const roomBySlug = (slug) => ROOMS[slug] ?? DEFAULT_ROOM
