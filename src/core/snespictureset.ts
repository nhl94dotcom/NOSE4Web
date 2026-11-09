// The SNES game's team pictures as a set of image files, as pictureset.ts has
// the Genesis game's: each team's logo, its centre ice logo, and in a ROM
// with score box logos its score logo, named so an import knows where each
// goes. The files are the ones the team page exports one at a time.

import { SNES_COLORS } from './color'
import { pictureToImage, type Picture } from './graphics'
import type { ImageData, PictureSetOptions, PictureSetResult } from './pictureset'
import type { RomProject } from './rom'
import { scoreLogoFromImage, snesScoreLogo, snesScoreLogosSupported, withSnesScoreLogo } from './snesscorelogos'
import {
  NO_SNES_PICTURE_EDITS,
  snesCentreIce,
  snesCentreIceFromImage,
  snesCentreIceSharedWith,
  snesLogo,
  snesLogoFromImage,
  snesPicturesSupported,
  writeSnesPictures,
  type SnesPictureEdits,
} from './snespictures'
import { teamDisplayName } from './team'

export type SnesPictureKind = 'logo' | 'centreIce' | 'scoreLogo'

const KINDS: { kind: SnesPictureKind; file: string; title: string }[] = [
  { kind: 'logo', file: 'logo', title: 'Team logo' },
  { kind: 'centreIce', file: 'centre_ice', title: 'Centre ice logo' },
  { kind: 'scoreLogo', file: 'score_logo', title: 'Score logo' },
]

export function snesPictureKinds(project: RomProject): SnesPictureKind[] {
  if (project.game.platform !== 'snes') return []
  const pictures = snesPicturesSupported(project.bytes, project.teams.length)
  return KINDS.map((k) => k.kind).filter((kind) => (kind === 'scoreLogo' ? snesScoreLogosSupported(project) : pictures))
}

export const snesPictureTitle = (kind: SnesPictureKind) => KINDS.find((k) => k.kind === kind)!.title

const cleanName = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

// "02_Boston_Bruins_centre_ice.png". The number is what an import goes by.
export function snesPictureFileName(project: RomProject, team: number, kind: SnesPictureKind): string {
  return `${String(team + 1).padStart(2, '0')}_${cleanName(teamDisplayName(project.teams[team]))}_${KINDS.find((k) => k.kind === kind)!.file}.png`
}

export function identifySnesPictureFile(fileName: string): { team: number; name: string; kind: SnesPictureKind } | null {
  const base = fileName.replace(/^.*[\\/]/, '')
  // The longer endings first, so "score_logo" is not read as a team named "..._score" and its logo.
  const match = /^(\d+)_(?:(.*?)_)??(score_logo|centre_ice|logo)\.png$/i.exec(base)
  if (!match) return null
  return { team: Number(match[1]) - 1, name: match[2] ?? '', kind: KINDS.find((k) => k.file === match[3].toLowerCase())!.kind }
}

const edits = (project: RomProject): SnesPictureEdits => project.snesPictures ?? NO_SNES_PICTURE_EDITS

// A team's picture as it stands, and its colours; null for a team whose score box shows its letters.
export function currentSnesPicture(project: RomProject, team: number, kind: SnesPictureKind): { picture: Picture; palette: number[] } | null {
  const teams = project.teams.length
  if (kind === 'logo') return snesLogo(project.bytes, teams, edits(project), team)
  if (kind === 'centreIce') return snesCentreIce(project.bytes, teams, edits(project), team, project.rinkPalette)
  return snesScoreLogo(project, team)
}

// The teams whose picture changes with this one's: only centre ice logos are shared so.
const sharedWith = (project: RomProject, team: number, kind: SnesPictureKind) =>
  kind === 'centreIce' ? [team, ...snesCentreIceSharedWith(project.bytes, project.teams.length, team)] : [team]

// Every team's pictures, named for a set; a centre ice logo several teams share is in it once, under the first.
export function snesPictureSet(project: RomProject): { name: string; picture: Picture; palette: number[] }[] {
  const kinds = snesPictureKinds(project)
  return project.teams.flatMap((_, team) =>
    kinds.flatMap((kind) => {
      if (Math.min(...sharedWith(project, team, kind)) !== team) return []
      const current = currentSnesPicture(project, team, kind)
      return current ? [{ name: snesPictureFileName(project, team, kind), ...current }] : []
    }),
  )
}

const look = (p: { picture: Picture; palette: number[] }) => pictureToImage(p.picture, p.palette, SNES_COLORS)
const sameLook = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i])

// A team's picture made from an image, in the project.
function withImage(project: RomProject, team: number, kind: SnesPictureKind, image: ImageData): RomProject {
  const teams = project.teams.length
  const now = edits(project)
  if (kind === 'logo') {
    const made = snesLogoFromImage(image.rgba, image.width, image.height)
    return { ...project, snesPictures: { ...now, logos: { ...now.logos, [team]: { picture: made.picture, palette: made.palette } } } }
  }
  if (kind === 'centreIce') {
    const picture = snesCentreIceFromImage(image.rgba, image.width, image.height, snesCentreIce(project.bytes, teams, now, team, project.rinkPalette))
    const centreIce = { ...now.centreIce }
    for (const other of sharedWith(project, team, kind)) centreIce[other] = picture
    return { ...project, snesPictures: { ...now, centreIce } }
  }
  const current = snesScoreLogo(project, team)
  if (!current) throw new Error('This team shows its letters in the score box. Give it a score logo on its page first.')
  const made = scoreLogoFromImage(image.rgba, image.width, image.height, current.palette)
  return withSnesScoreLogo(project, team, made.picture, made.palette)
}

// Throws where the logos no longer fit the room the game has for them.
const fits = (project: RomProject) => {
  writeSnesPictures(project.bytes.slice(), project.teams.length, edits(project))
  return project
}

// Brings in a set of picture files, as importPictureSet does on the Genesis:
// a file showing what the editor has already is skipped.
export function importSnesPictureSet(project: RomProject, files: ({ name: string } & ImageData)[], options: PictureSetOptions = {}): PictureSetResult {
  const problems: string[] = []
  const kinds = snesPictureKinds(project)
  const named = project.teams.map((team) => cleanName(teamDisplayName(team)).toLowerCase())
  let unchanged = 0
  const changes: { team: number; kind: SnesPictureKind; image: ImageData; title: string; name: string }[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const found = identifySnesPictureFile(file.name)
    if (!found) {
      problems.push(`${file.name}: the name does not say which team and picture it is. It should look like 02_Team_logo.png.`)
      continue
    }
    const { kind } = found
    let { team } = found
    if (options.byName) {
      const matches = named.flatMap((name, index) => (name === found.name.toLowerCase() ? [index] : []))
      if (matches.length === 0 || (matches.length > 1 && !matches.includes(team))) {
        const what = found.name.replace(/_/g, ' ')
        problems.push(
          matches.length === 0
            ? `${file.name}: this ROM has no team called ${what || '(no name)'}.`
            : `${file.name}: this ROM has more than one team called ${what}, and the file's number is not one of them.`,
        )
        continue
      }
      if (!matches.includes(team)) team = matches[0]
    }
    if (team < 0 || team >= project.teams.length) {
      problems.push(`${file.name}: this ROM has no team ${team + 1}.`)
      continue
    }
    if (!kinds.includes(kind)) {
      problems.push(`${file.name}: this ROM has no ${snesPictureTitle(kind).toLowerCase()}s the editor can change.`)
      continue
    }
    if (seen.has(`${team} ${kind}`)) {
      problems.push(`${file.name}: there is more than one file for this picture. The first was used.`)
      continue
    }
    seen.add(`${team} ${kind}`)
    const title = `${teamDisplayName(project.teams[team])}: ${snesPictureTitle(kind)}`
    try {
      // Judged against the pictures as they were before any of the set came in.
      const before = currentSnesPicture(project, team, kind)
      const after = currentSnesPicture(withImage(project, team, kind, file), team, kind)
      if (before && after && sameLook(look(before), look(after))) unchanged++
      else changes.push({ team, kind, image: file, title, name: file.name })
    } catch (e) {
      problems.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const apply = (onto: RomProject, change: (typeof changes)[number]) => withImage(onto, change.team, change.kind, change.image)
  let next = project
  const replaced: string[] = []
  try {
    next = fits(changes.reduce(apply, project))
    replaced.push(...changes.map((change) => change.title))
  } catch {
    // Each in turn then, keeping all that fit.
    for (const change of changes) {
      try {
        next = fits(apply(next, change))
        replaced.push(change.title)
      } catch (e) {
        problems.push(`${change.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return { project: next, replaced, unchanged, problems }
}
