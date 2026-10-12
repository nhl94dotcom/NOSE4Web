import { findGame } from './core/games'
import { graphicsSupported, NO_GRAPHICS_EDITS } from './core/graphics'
import { cleanLeagueRules } from './core/leaguerules'
import type { RomProject } from './core/rom'

// Keeps the work in progress in the browser's own storage on this computer,
// so it can be picked up again after a refresh or a closed tab. Nothing is
// sent anywhere.

const DATABASE = 'nose4web'
const STORE = 'session'
const KEY = 'current'

export interface Session {
  name: string
  project: RomProject
  // Whether there were changes that had not been downloaded.
  unsaved: boolean
  savedAt: number
}

interface StoredSession extends Omit<Session, 'project'> {
  productCode: string
  // Everything but the game's settings, which are looked up again on loading
  // so that a newer version of the editor uses its own.
  project: Omit<RomProject, 'game'>
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

// Storage can be unavailable, in private windows for instance. Keeping a
// session is a convenience, so failures are ignored.
export async function saveSession(session: Session): Promise<void> {
  const { game, ...project } = session.project
  const stored: StoredSession = { ...session, productCode: game.productCode, project }
  await run('readwrite', (store) => store.put(stored, KEY)).catch(() => undefined)
}

export async function loadSession(): Promise<Session | null> {
  const stored = await run<StoredSession | undefined>('readonly', (store) => store.get(KEY)).catch(() => undefined)
  const game = stored && findGame(stored.productCode)
  if (!stored || !game) return null
  // Work stored by an earlier version of the editor has no team pictures.
  const graphics = { ...NO_GRAPHICS_EDITS, ...stored.project.graphics }
  const supported = graphicsSupported(stored.project.bytes, game)
  // Nor has work from before there were free agents any of those.
  const freeAgents = stored.project.freeAgents ?? []
  const leagueRules = cleanLeagueRules(stored.project.leagueRules, stored.project.teams.length)
  return { ...stored, project: { ...stored.project, game, graphics, graphicsSupported: supported, freeAgents, leagueRules } }
}

export async function clearSession(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY)).catch(() => undefined)
}
