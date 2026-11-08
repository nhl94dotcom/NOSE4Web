import { GENESIS_COLORS, SNES_COLORS, type ColorFormat } from './color'
import type { Picture } from './graphics'
import { colourPhotoFromImage, photoFromImage, photoPalette, photosSupported, teamPhotos, withPhoto, withPhotoAdded } from './photos'
import type { RomProject } from './rom'
import { snesPhotoPalette, snesPhotoRgbs, snesPhotosSupported, snesTeamPhotos, withSnesPhoto } from './snesphotos'
import { goalieCount, teamDisplayName } from './team'

// Player photos in a picture set: a folder for each team, a file for each
// player with a photo of his own, named after him, so that a set comes back
// to the same players however the rosters have been reordered since, and
// carries to next season's ROM. Players with a generic picture have no file.

const cleanName = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export function anyPhotos(project: RomProject): boolean {
  return project.game.platform === 'snes' ? snesPhotosSupported(project) : photosSupported(project)
}

const teamFolder = (project: RomProject, team: number) => `photos/${String(team + 1).padStart(2, '0')}_${cleanName(teamDisplayName(project.teams[team]))}`

export function photoSet(project: RomProject): { name: string; picture: Picture; palette: number[]; format: ColorFormat }[] {
  if (!anyPhotos(project)) return []
  return project.teams.flatMap((team, t) => {
    const folder = teamFolder(project, t)
    const named = new Set<string>()
    const file = (slot: number) => {
      const name = cleanName(team.players[slot]?.name ?? '')
      if (!name || named.has(name)) return null
      named.add(name)
      return `${folder}/${name}.png`
    }
    if (project.game.platform === 'snes') {
      const palette = snesPhotoPalette(project, t)
      return snesTeamPhotos(project, t).flatMap((photo, slot) => {
        const name = slot < team.players.length && photo.shared === 0 ? file(slot) : null
        return name ? [{ name, picture: photo.picture, palette, format: SNES_COLORS }] : []
      })
    }
    const palette = photoPalette(project)
    return teamPhotos(project, t).flatMap((photo) => {
      const name = !photo.generic ? file(photo.slot) : null
      return name ? [{ name, picture: photo.picture, palette, format: GENESIS_COLORS }] : []
    })
  })
}

// Whether a file of a set is a photo, and whose: the team by its number and
// name, the player by his.
export function identifyPhotoFile(fileName: string): { team: number; teamName: string; player: string } | null {
  const match = /(?:^|[\\/])photos[\\/](\d+)_?([^\\/]*)[\\/]([^\\/]+)\.png$/i.exec(fileName)
  return match ? { team: Number(match[1]) - 1, teamName: match[2], player: match[3] } : null
}

export interface PhotoSetResult {
  project: RomProject
  replaced: string[]
  unchanged: number
  problems: string[]
}

const samePixels = (a: Picture, b: Picture) => a.pixels.every((p, i) => p === b.pixels[i])

export function importPhotoSet(
  project: RomProject,
  files: { name: string; rgba: Uint8Array | Uint8ClampedArray; width: number; height: number }[],
  byName = false,
): PhotoSetResult {
  const result: PhotoSetResult = { project, replaced: [], unchanged: 0, problems: [] }
  if (!anyPhotos(project)) {
    if (files.length > 0) result.problems.push(`${files.length} photo files were left out: this ROM keeps its player photos in a way the editor cannot read.`)
    return result
  }
  const teamNames = project.teams.map((team) => cleanName(teamDisplayName(team)).toLowerCase())
  for (const file of files) {
    const found = identifyPhotoFile(file.name)!
    const team = byName ? teamNames.indexOf(found.teamName.toLowerCase()) : found.team
    if (team < 0 || team >= project.teams.length) {
      result.problems.push(`${file.name}: this ROM has no ${byName ? `team called ${found.teamName}` : `team ${found.team + 1}`}.`)
      continue
    }
    const roster = result.project.teams[team].players
    const slots = roster.flatMap((player, slot) => (cleanName(player.name).toLowerCase() === found.player.toLowerCase() ? [slot] : []))
    if (slots.length !== 1) {
      result.problems.push(`${file.name}: ${teamDisplayName(project.teams[team])} has ${slots.length === 0 ? 'no player' : 'more than one player'} called ${found.player.replace(/_/g, ' ')}.`)
      continue
    }
    const slot = slots[0]
    const title = `${teamDisplayName(project.teams[team])}: ${roster[slot].name}`
    try {
      const before = result.project
      if (project.game.platform === 'snes') {
        const picture = colourPhotoFromImage(file.rgba, file.width, file.height, snesPhotoRgbs(before, team))
        const current = snesTeamPhotos(before, team)[slot]
        if (current.shared === 0 && samePixels(current.picture, picture)) {
          result.unchanged++
          continue
        }
        result.project = withSnesPhoto(before, team, slot, picture)
      } else {
        const picture = photoFromImage(file.rgba, file.width, file.height, photoPalette(before))
        let photos = teamPhotos(before, team)
        let index = photos.findIndex((photo) => photo.slot === slot)
        if (index >= 0 && !photos[index].generic && samePixels(photos[index].picture, picture)) {
          result.unchanged++
          continue
        }
        let next = before
        if (index < 0) {
          next = withPhotoAdded(next, team, slot, slot < goalieCount(project.teams[team]))
          photos = teamPhotos(next, team)
          index = photos.length - 1
        }
        result.project = withPhoto(next, team, index, picture)
      }
      result.replaced.push(title)
    } catch (e) {
      result.problems.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return result
}
