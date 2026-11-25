// Every arena, by slug. ?room=<slug> on /arena picks one; the first is the default.
import church from './ruined-church.js'
import dungeon from './training-hall.js'

export const ROOMS = { 'ruined-church': church, 'training-hall': dungeon }
export const DEFAULT_ROOM = church
export const roomBySlug = (slug) => ROOMS[slug] ?? DEFAULT_ROOM
