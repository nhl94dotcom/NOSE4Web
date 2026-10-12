// Team pictures as image files: one at a time, or every team's as a set.

import {
  banner,
  bannerPalette,
  bannerSharedWith,
  bannersEditable,
  LOGO_COLORS,
  menuLogo,
  menuLogoFromImage,
  menuLogoPalette,
  menuLogoStart,
  NoRoomError,
  pictureFromImage,
  pictureToImage,
  rinkLogo,
  rinkLogoSharedWith,
  visitorBannersApart,
  withBanner,
  withRinkLogo,
  writeGraphics,
  type BannerKind,
  type GraphicsEdits,
  type Picture,
} from './graphics'
import type { RomProject } from './rom'
import { teamDisplayName } from './team'

export type PictureKind = 'rinkLogo' | 'menuLogo' | 'menuBanner' | 'visitorBanner' | 'gameBanner'

// `file` ends the name of a picture's file, as "_players" does a spreadsheet's.
const KINDS: { kind: PictureKind; file: string }[] = [
  { kind: 'rinkLogo', file: 'rink_logo' },
  { kind: 'menuLogo', file: 'menu_logo' },
  { kind: 'menuBanner', file: 'menu_banner' },
  { kind: 'visitorBanner', file: 'visitor_banner' },
  { kind: 'gameBanner', file: 'game_banner' },
]

const BANNER_KINDS: Partial<Record<PictureKind, BannerKind>> = { menuBanner: 'menu', visitorBanner: 'visitor', gameBanner: 'game' }
const ALL_COLORS = Array.from({ length: 15 }, (_, i) => i + 1)
// A menu banner leaves colours 3 and 4 to the other team's banner beside it.
const MENU_BANNER_COLORS = ALL_COLORS.filter((color) => color !== 3 && color !== 4)

// The kinds of picture this ROM has for each team.
export function pictureKinds(project: RomProject): PictureKind[] {
  return KINDS.map((k) => k.kind).filter((kind) => kind !== 'visitorBanner' || visitorBannersApart(project))
}

export function pictureTitle(project: RomProject, kind: PictureKind): string {
  const apart = visitorBannersApart(project)
  return {
    rinkLogo: 'Centre-ice logo',
    menuLogo: 'Menu logo',
    menuBanner: apart ? 'Menu banner (home)' : 'Menu banner',
    visitorBanner: 'Menu banner (visitor)',
    gameBanner: 'In-game banner',
  }[kind]
}

export function pictureEditable(project: RomProject, kind: PictureKind): boolean {
  const bannerKind = BANNER_KINDS[kind]
  return bannerKind ? bannersEditable(project, bannerKind) : true
}

// The teams a picture is replaced for along with this one.
export function pictureSharedWith(project: RomProject, team: number, kind: PictureKind): number[] {
  const bannerKind = BANNER_KINDS[kind]
  if (bannerKind) return bannerSharedWith(project, bannerKind, team)
  return kind === 'rinkLogo' ? rinkLogoSharedWith(project, team) : [team]
}

// A team's picture as it stands, and the 16 colours it is drawn with.
export function currentPicture(project: RomProject, team: number, kind: PictureKind): { picture: Picture; palette: number[] } {
  const bannerKind = BANNER_KINDS[kind]
  if (bannerKind) return { picture: banner(project, bannerKind, team), palette: bannerPalette(project, bannerKind, team) }
  if (kind === 'menuLogo') return { picture: menuLogo(project, team), palette: menuLogoPalette(project, team) }
  return { picture: rinkLogo(project, team), palette: project.teams[team].palette.slice(0, 16) }
}

export interface ImageData {
  rgba: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

// The edits with a team's picture replaced by an image, and anything worth
// telling the user about how the image was fitted to the game's limits.
export function withPictureFromImage(
  project: RomProject,
  team: number,
  kind: PictureKind,
  image: ImageData,
): { graphics: GraphicsEdits; note: string } {
  const { picture: old, palette } = currentPicture(project, team, kind)
  if (image.width !== old.width || image.height !== old.height) {
    throw new Error(`The image is ${image.width} by ${image.height} pixels. This picture has to be ${old.width} by ${old.height}.`)
  }
  const bannerKind = BANNER_KINDS[kind]
  if (bannerKind) {
    const colors = bannerKind === 'game' ? ALL_COLORS : MENU_BANNER_COLORS
    const picture = pictureFromImage(image.rgba, old.width, old.height, palette, colors, old)
    return { graphics: withBanner(project, bannerKind, team, picture), note: '' }
  }
  if (kind === 'rinkLogo') {
    const picture = pictureFromImage(image.rgba, old.width, old.height, palette, ALL_COLORS, old)
    return { graphics: withRinkLogo(project, team, picture), note: 'Matched to the home colours.' }
  }
  const logo = menuLogoFromImage(image.rgba, old.width, old.height, menuLogoStart(project, team))
  return {
    graphics: {
      ...project.graphics,
      menuLogos: { ...project.graphics.menuLogos, [team]: logo.picture },
      menuPalettes: { ...project.graphics.menuPalettes, [team]: logo.palette },
    },
    note:
      logo.colorsFound > LOGO_COLORS
        ? `Besides white and black the image had ${logo.colorsFound} colours, and a logo can hold ${LOGO_COLORS}; the least used were merged into the nearest.`
        : '',
  }
}

// ----------------------------------------------------------------- the set

const cleanName = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

// "03_Buffalo_Sabres_menu_logo.png". The number is what an import goes by,
// so a team can be renamed without its pictures going astray.
export function pictureFileName(project: RomProject, team: number, kind: PictureKind): string {
  const file = KINDS.find((k) => k.kind === kind)!.file
  return `${String(team + 1).padStart(2, '0')}_${cleanName(teamDisplayName(project.teams[team]))}_${file}.png`
}

export function identifyPictureFile(fileName: string): { team: number; kind: PictureKind } | null {
  const base = fileName.replace(/^.*[\\/]/, '')
  const match = /^(\d+)_(?:.*_)?(rink_logo|menu_logo|menu_banner|visitor_banner|game_banner)\.png$/i.exec(base)
  if (!match) return null
  const kind = KINDS.find((k) => k.file === match[2].toLowerCase())!.kind
  return { team: Number(match[1]) - 1, kind }
}

// Every team's pictures, named for a set. A picture several teams share is
// in the set once, under the first of them, so that it has one file to edit
// and no stale copies to undo the edit when the set is brought back in.
export function pictureSet(project: RomProject): { name: string; picture: Picture; palette: number[] }[] {
  const kinds = pictureKinds(project)
  return project.teams.flatMap((_, team) =>
    kinds
      .filter((kind) => pictureSharedWith(project, team, kind)[0] === team)
      .map((kind) => ({ name: pictureFileName(project, team, kind), ...currentPicture(project, team, kind) })),
  )
}

export interface PictureSetResult {
  project: RomProject
  // Titles of what was replaced, such as "Boston Bruins: Menu logo".
  replaced: string[]
  // Files whose picture is the same as the one in the editor already.
  unchanged: number
  // Files that could not be used, and why.
  problems: string[]
}

const sameLook = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i])

// Brings in a set of picture files. A file that shows what the editor has
// already is skipped, so an exported set comes back in without changing
// anything, and only the pictures that were edited are replaced.
export function importPictureSet(project: RomProject, files: ({ name: string } & ImageData)[]): PictureSetResult {
  const problems: string[] = []
  const kinds = pictureKinds(project)
  let unchanged = 0
  const changes: { team: number; kind: PictureKind; image: ImageData; title: string; name: string }[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const found = identifyPictureFile(file.name)
    if (!found) {
      problems.push(`${file.name}: the name does not say which team and picture it is. It should look like 03_Team_menu_logo.png.`)
      continue
    }
    const { team, kind } = found
    if (team < 0 || team >= project.teams.length) {
      problems.push(`${file.name}: this ROM has no team ${team + 1}.`)
      continue
    }
    if (!kinds.includes(kind)) {
      problems.push(`${file.name}: this ROM has no separate banner for the visiting team.`)
      continue
    }
    if (seen.has(`${team} ${kind}`)) {
      problems.push(`${file.name}: there is more than one file for this picture. The first was used.`)
      continue
    }
    seen.add(`${team} ${kind}`)
    const title = `${teamDisplayName(project.teams[team])}: ${pictureTitle(project, kind)}`
    try {
      // Judged against the pictures as they were before any of the set came
      // in, so one changed file among a team's shared pictures is not undone
      // by the unchanged files of the teams that share it.
      const made = withPictureFromImage(project, team, kind, file)
      const before = currentPicture(project, team, kind)
      const after = currentPicture({ ...project, graphics: made.graphics }, team, kind)
      if (sameLook(pictureToImage(before.picture, before.palette), pictureToImage(after.picture, after.palette))) unchanged++
      else if (!pictureEditable(project, kind)) problems.push(`${file.name}: this ROM keeps that picture in a way the editor cannot change.`)
      else changes.push({ team, kind, image: file, title, name: file.name })
    } catch (e) {
      problems.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const fits = (candidate: RomProject) => {
    writeGraphics(candidate.bytes.slice(), candidate.game, candidate.graphics)
    return candidate
  }
  const apply = (onto: RomProject, change: (typeof changes)[number]): RomProject => ({
    ...onto,
    graphics: withPictureFromImage(onto, change.team, change.kind, change.image).graphics,
  })

  let next = project
  const replaced: string[] = []
  try {
    // Usually everything fits, and one check of the lot is enough.
    next = fits(changes.reduce(apply, project))
    replaced.push(...changes.map((change) => change.title))
  } catch {
    // Otherwise each is tried in turn, to keep all that do fit.
    for (const change of changes) {
      try {
        next = fits(apply(next, change))
        replaced.push(change.title)
      } catch (e) {
        const hint = e instanceof NoRoomError ? ' Give the logos and banners more room on any team\'s page, then import again.' : ''
        problems.push(`${change.name}: ${e instanceof Error ? e.message : String(e)}${hint}`)
      }
    }
  }
  return { project: next, replaced, unchanged, problems }
}
