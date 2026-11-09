// A player's own photo carried with him when he is copied and pasted, as an
// image, so that it goes to another team (whose SNES photo colours may differ)
// or to another ROM open in a second tab.

import { GENESIS_COLORS, SNES_COLORS } from './color'
import { pictureToImage } from './graphics'
import { colourPhotoFromImage, photoFromImage, photoLayout, photoPalette, photosSupported, teamPhotos, withPhoto, withPhotoAdded, withPhotoEntries } from './photos'
import type { RomProject } from './rom'
import { snesPhotoPalette, snesPhotoRgbs, snesPhotoRow, snesPhotosSupported, snesTeamPhotos, withSnesPhoto, withSnesPhotoPointed } from './snesphotos'

export interface PlayerPhoto {
  width: number
  height: number
  // RGBA, 4 bytes a pixel, in base 64.
  rgba: string
}

const toBase64 = (bytes: Uint8ClampedArray) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
const fromBase64 = (text: string) => Uint8ClampedArray.from(atob(text), (char) => char.charCodeAt(0))

export function playerPhotosSupported(project: RomProject): boolean {
  return project.game.platform === 'snes' ? snesPhotosSupported(project) : photosSupported(project)
}

// The photo of `team`'s player in `slot`, if he has one of his own; null for
// a stand-in, or none.
export function playerPhoto(project: RomProject, team: number, slot: number): PlayerPhoto | null {
  if (!playerPhotosSupported(project)) return null
  if (project.game.platform === 'snes') {
    const photo = snesTeamPhotos(project, team)[slot]
    if (!photo || photo.generic) return null
    return { width: photo.picture.width, height: photo.picture.height, rgba: toBase64(pictureToImage(photo.picture, snesPhotoPalette(project, team), SNES_COLORS)) }
  }
  const photo = teamPhotos(project, team).find((p) => p.slot === slot)
  if (!photo || photo.generic) return null
  return { width: photo.picture.width, height: photo.picture.height, rgba: toBase64(pictureToImage(photo.picture, photoPalette(project), GENESIS_COLORS)) }
}

export function isPlayerPhoto(value: unknown): value is PlayerPhoto {
  const p = value as PlayerPhoto | null
  return (
    !!p &&
    Number.isInteger(p.width) &&
    Number.isInteger(p.height) &&
    p.width > 0 &&
    p.height > 0 &&
    p.width * p.height <= 0x10000 &&
    typeof p.rgba === 'string' &&
    p.rgba.length === Math.ceil((p.width * p.height * 4) / 3) * 4
  )
}

// Each pasted row given the photo of the player pasted onto it: his own, or,
// for one who had none, the stand-in the game gives a player without one.
export function withPlayerPhotos(project: RomProject, team: number, rows: { slot: number; goalie: boolean; photo: PlayerPhoto | null }[]): { project: RomProject; notes: string[] } {
  if (!playerPhotosSupported(project)) return { project, notes: [] }
  let next = project
  const notes: string[] = []
  for (const { slot, goalie, photo } of rows) {
    try {
      next = photo ? withOwn(next, team, slot, goalie, photo) : withStandIn(next, team, slot, goalie)
    } catch (e) {
      notes.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { project: next, notes }
}

function withOwn(project: RomProject, team: number, slot: number, goalie: boolean, photo: PlayerPhoto): RomProject {
  const rgba = fromBase64(photo.rgba)
  if (project.game.platform === 'snes') {
    return withSnesPhoto(project, team, slot, colourPhotoFromImage(rgba, photo.width, photo.height, snesPhotoRgbs(project, team)))
  }
  // On the Genesis, a player with no photo is added to the featured players first.
  let next = project
  let index = teamPhotos(next, team).findIndex((p) => p.slot === slot)
  if (index < 0) {
    next = withPhotoAdded(next, team, slot, goalie)
    index = teamPhotos(next, team).findIndex((p) => p.slot === slot)
  }
  return withPhoto(next, team, index, photoFromImage(rgba, photo.width, photo.height, photoPalette(next)))
}

// A row whose new player has no photo of his own does not keep the old one's.
function withStandIn(project: RomProject, team: number, slot: number, goalie: boolean): RomProject {
  if (project.game.platform === 'snes') {
    const photos = snesTeamPhotos(project, team)
    if (!photos[slot] || photos[slot].generic) return project
    // A stand-in this team shows already, else any in the ROM.
    const rowOf = (t: number) => snesPhotoRow(project, t)
    const found =
      photos.findIndex((p) => p.generic) >= 0
        ? rowOf(team)[photos.findIndex((p) => p.generic)]
        : project.teams.map((_, t) => ({ t, i: snesTeamPhotos(project, t).findIndex((p) => p.generic) })).filter(({ i }) => i >= 0).map(({ t, i }) => rowOf(t)[i])[0]
    return found ? withSnesPhotoPointed(project, team, slot, found) : project
  }
  const layout = photoLayout(project.bytes, project.teams.length)!
  const photos = teamPhotos(project, team)
  const index = photos.findIndex((p) => p.slot === slot)
  if (index < 0 || photos[index].generic) return project
  const entries = layout.lists[team].entries.map((entry, i) => (i === index ? { ...entry, at: layout.generic[goalie ? 1 : 3] } : entry))
  return withPhotoEntries(project, team, entries)
}
