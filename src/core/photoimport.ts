import { photoLayout, photoPicture, photosSupported, withPhoto, withPhotoEntries, type PhotoEntry } from './photos'
import type { RomProject } from './rom'
import { snesPhotoPalette, snesPhotoRow, snesPhotosSupported, snesTeamPhotos, withSnesPhoto, withSnesPhotoPalette, withSnesPhotoRow } from './snesphotos'
import { goalieCount } from './team'

// A team's player photos brought in from another ROM of the same game, with
// its roster (a photo is for a place on the roster). A player with a generic
// picture there gets this ROM's generic picture; one with his own gets a copy
// of it. On the SNES the team's 16 photo colours come too, which all its
// photos are drawn in.
export function importPhotos(project: RomProject, other: RomProject, from: number, to: number, notes: string[]): RomProject {
  if (project.game.platform !== other.game.platform) {
    notes.push('Player photos were left alone: the two games keep them in different ways.')
    return project
  }
  try {
    if (project.game.platform === 'snes') {
      if (!snesPhotosSupported(project) || !snesPhotosSupported(other)) throw new Error('one of the two ROMs keeps them in a way the editor cannot read')
      return importSnes(project, other, from, to, notes)
    }
    if (!photosSupported(project) || !photosSupported(other)) throw new Error('one of the two ROMs keeps them in a way the editor cannot read')
    return importGenesis(project, other, from, to, notes)
  } catch (e) {
    notes.push(`Player photos were left alone: ${e instanceof Error ? e.message : String(e)}.`)
    return project
  }
}

function importGenesis(project: RomProject, other: RomProject, from: number, to: number, notes: string[]): RomProject {
  const theirs = photoLayout(other.bytes, other.teams.length)!
  const ours = photoLayout(project.bytes, project.teams.length)!
  const goalies = goalieCount(project.teams[to])
  const own: { index: number; at: number }[] = []
  const entries = theirs.lists[from].entries.map((entry, index): PhotoEntry => {
    const kind = theirs.generic.indexOf(entry.at)
    if (kind >= 0) return { at: ours.generic[kind], slot: entry.slot }
    own.push({ index, at: entry.at })
    return { at: ours.generic[entry.slot < goalies ? 1 : 3], slot: entry.slot }
  })
  let next = withPhotoEntries(project, to, entries)
  for (const { index, at } of own) next = withPhoto(next, to, index, photoPicture(other.bytes, theirs, at))
  notes.push(
    `Player photos brought in: ${entries.length} featured players, ${own.length} with photos of their own.` +
      (next.bytes.length > project.bytes.length ? ` The ROM grew to ${next.bytes.length / 0x100000} MB to make room for them.` : ''),
  )
  return next
}

function importSnes(project: RomProject, other: RomProject, from: number, to: number, notes: string[]): RomProject {
  const theirs = snesTeamPhotos(other, from)
  const players = other.teams[from].players.length
  let next = withSnesPhotoPalette(project, to, snesPhotoPalette(other, from))
  // A generic picture there: the generic one this place has here, or the one most places here share.
  const row = snesPhotoRow(next, to)
  const key = (address: Uint8Array) => Array.from(address).join(',')
  const uses = new Map<string, number>()
  for (const t of project.teams.keys()) for (const address of snesPhotoRow(next, t)) uses.set(key(address), (uses.get(key(address)) ?? 0) + 1)
  const commonest = [...uses].sort((a, b) => b[1] - a[1])[0][0]
  const generic = project.teams
    .flatMap((_, t) => snesPhotoRow(next, t))
    .find((address) => key(address) === commonest)!
  next = withSnesPhotoRow(
    next,
    to,
    row.map((address, slot) => (slot < players && theirs[slot].shared > 0 ? ((uses.get(key(address)) ?? 0) > 1 ? address : generic) : address)),
  )
  let copied = 0
  theirs.forEach((photo, slot) => {
    if (slot >= players || photo.shared > 0) return
    next = withSnesPhoto(next, to, slot, photo.picture)
    copied++
  })
  notes.push(`Player photos brought in, with the team's photo colours: ${copied} of its players have photos of their own.`)
  return next
}
