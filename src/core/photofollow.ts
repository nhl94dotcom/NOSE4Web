import { FEWEST_PHOTOS, photoLayout, withPhotoEntries, type PhotoEntry } from './photos'
import type { RomProject } from './rom'
import { snesPhotoRow, snesPhotosSupported, withSnesPhotoRow } from './snesphotos'
import { goalieCount, type Player } from './team'

// Photos follow their players. The game ties a photo to a place on a team's
// roster, not to a player, so moving players (a trade, a new order, a player
// let go or signed) would leave photos on the wrong faces. After every edit,
// each player who has moved takes his photo along: on the Genesis his entry
// in the team's featured players, on the SNES his place's photo. A team whose
// photos the edit itself changed is left as the edit made it.
//
// A player is followed by the editor's own record of him, which a move keeps.
// An edited player is a new record in the same place, taken for the same man
// when the old record is gone.

interface Place {
  team: number
  slot: number
}

// Where each player of `after` was in `before`, or null for a new one.
function sources(before: RomProject, after: RomProject): (Place | null)[][] {
  const was = new Map<Player, Place>()
  before.teams.forEach((team, t) => team.players.forEach((player, slot) => was.set(player, { team: t, slot })))
  const still = new Set<Player>()
  after.teams.forEach((team) => team.players.forEach((player) => still.add(player)))
  return after.teams.map((team, t) =>
    team.players.map((player, slot) => {
      const found = was.get(player)
      if (found) return found
      const there = before.teams[t]?.players[slot]
      return there && !still.has(there) ? { team: t, slot } : null
    }),
  )
}

const unmoved = (from: (Place | null)[][], before: RomProject) =>
  from.every(
    (row, t) => row.length === before.teams[t]?.players.length && row.every((place, slot) => place !== null && place.team === t && place.slot === slot),
  )

export function photosFollowPlayers(before: RomProject, after: RomProject): RomProject {
  if (before.teams === after.teams || before.game !== after.game || before.teams.length !== after.teams.length) return after
  const from = sources(before, after)
  if (unmoved(from, before)) return after
  if (after.game.platform === 'snes') return snesFollow(before, after, from)
  return genesisFollow(before, after, from)
}

const sameEntries = (a: PhotoEntry[], b: PhotoEntry[]) => a.length === b.length && a.every((e, i) => e.at === b[i].at && e.slot === b[i].slot)

function genesisFollow(before: RomProject, after: RomProject, from: (Place | null)[][]): RomProject {
  const old = photoLayout(before.bytes, before.teams.length)
  const now = photoLayout(after.bytes, after.teams.length)
  if (!old || !now) return after
  const untouched = old.lists.map((list, t) => sameEntries(list.entries, now.lists[t].entries))
  // Where each player of `before` went.
  const to = new Map<string, Place>()
  from.forEach((row, t) => row.forEach((place, slot) => place && to.set(`${place.team} ${place.slot}`, { team: t, slot })))
  const lists: (PhotoEntry | null)[][] = old.lists.map((list) => list.entries.slice())
  const incoming: PhotoEntry[][] = old.lists.map(() => [])
  old.lists.forEach((list, t) => {
    if (!untouched[t]) return
    list.entries.forEach((entry, i) => {
      if (entry.slot >= before.teams[t].players.length) return
      const went = to.get(`${t} ${entry.slot}`)
      if (went && went.team === t) lists[t][i] = { at: entry.at, slot: went.slot }
      else {
        lists[t][i] = null
        if (went && untouched[went.team]) incoming[went.team].push({ at: entry.at, slot: went.slot })
      }
    })
  })
  let project = after
  old.lists.forEach((list, t) => {
    if (!untouched[t]) return
    const goalies = goalieCount(after.teams[t])
    const kept = [...lists[t], ...incoming[t]]
    const listed = new Set(kept.flatMap((entry) => (entry ? [entry.slot] : [])))
    // A player who has left keeps his place in the list only while the setup
    // screen needs six: it goes to a player with no photo in the list, with
    // the generic picture.
    let needed = FEWEST_PHOTOS - listed.size
    const unlisted = after.teams[t].players.map((_, slot) => slot).filter((slot) => !listed.has(slot))
    const entries = kept.flatMap((entry): PhotoEntry[] => {
      if (entry) return [entry]
      if (needed <= 0 || unlisted.length === 0) return []
      needed--
      const slot = unlisted.shift()!
      return [{ at: old.generic[slot < goalies ? 1 : 3], slot }]
    })
    if (!sameEntries(entries, list.entries) && entries.length >= FEWEST_PHOTOS) project = withPhotoEntries(project, t, entries)
  })
  return project
}

function snesFollow(before: RomProject, after: RomProject, from: (Place | null)[][]): RomProject {
  if (!snesPhotosSupported(before) || !snesPhotosSupported(after)) return after
  const key = (address: Uint8Array) => Array.from(address).join(',')
  const oldRows = before.teams.map((_, t) => snesPhotoRow(before, t))
  const nowRows = after.teams.map((_, t) => snesPhotoRow(after, t))
  const untouched = oldRows.map((row, t) => row.every((address, slot) => key(address) === key(nowRows[t][slot])))
  // The generic photos: the one most places share, for goalies and for skaters.
  const commonest = (goalie: boolean) => {
    const counts = new Map<string, { address: Uint8Array; count: number }>()
    oldRows.forEach((row, t) =>
      before.teams[t].players.forEach((_, slot) => {
        if (slot < goalieCount(before.teams[t]) !== goalie) return
        const k = key(row[slot])
        counts.set(k, { address: row[slot], count: (counts.get(k)?.count ?? 0) + 1 })
      }),
    )
    const best = [...counts.values()].sort((a, b) => b.count - a.count)[0]
    return best && best.count > 1 ? best.address : null
  }
  const uses = new Map<string, number>()
  for (const address of oldRows.flat()) uses.set(key(address), (uses.get(key(address)) ?? 0) + 1)
  // Where every player has his own (the 32-team builds), the one the empty places share.
  const anyShared = oldRows.flat().find((address) => uses.get(key(address)) === Math.max(...uses.values()) && Math.max(...uses.values()) > 1) ?? null
  const generic = { goalie: commonest(true) ?? anyShared, skater: commonest(false) ?? anyShared }
  let project = after
  after.teams.forEach((team, t) => {
    if (!untouched[t]) return
    const goalies = goalieCount(team)
    const row = oldRows[t].map((address, slot) => {
      if (slot >= team.players.length) return address
      const place = from[t][slot]
      if (place) return oldRows[place.team][place.slot]
      // A new player: the generic photo his place has, or the generic one for his position.
      if ((uses.get(key(address)) ?? 0) > 1) return address
      return (slot < goalies ? generic.goalie : generic.skater) ?? address
    })
    if (row.some((address, slot) => key(address) !== key(oldRows[t][slot]))) project = withSnesPhotoRow(project, t, row)
  })
  return project
}
