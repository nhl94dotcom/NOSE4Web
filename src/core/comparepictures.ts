import type { Picture } from './graphics'
import { currentPicture, ownColours, pictureKinds, pictureTitle, type PictureKind } from './pictureset'
import type { RomProject } from './rom'
import { snesCentreIce, snesLogo, snesPicturesSupported } from './snespictures'

// How a team's logos and banners differ between two ROMs, a line for each
// picture: its pixels, and the colours that are the picture's own (a Genesis
// menu logo's, an SNES team logo's). Colours a picture shares with the team,
// such as its home colours, are compared with the team's colours already.

interface Drawn {
  title: string
  picture: Picture
  // The picture's own colours, or none.
  own: number[]
}

const samePicture = (a: Picture, b: Picture) => a.width === b.width && a.height === b.height && a.pixels.every((pixel, i) => pixel === b.pixels[i])
const sameColours = (a: number[], b: number[]) => a.length === b.length && a.every((colour, i) => colour === b[i])

// The pictures that differ between team `b` of `before` and team `a` of
// `after`, by title, in the order the Picture files page has them.
export function pictureDifferences(before: RomProject, b: number, after: RomProject, a: number): string[] {
  const was = drawnPictures(before, b)
  const now = drawnPictures(after, a)
  if (!was || !now) return []
  const out: string[] = []
  for (const [key, picture] of now) {
    const old = was.get(key)
    if (!old) continue
    if (!samePicture(old.picture, picture.picture) || !sameColours(old.own, picture.own)) out.push(`${picture.title} changed.`)
  }
  return out
}

// Whether the pictures can differ at all between two moments of one opened
// ROM: only where its picture edits do, team by team.
export function picturesMayDiffer(before: RomProject, after: RomProject, team: number): boolean {
  if (before.bytes !== after.bytes) return true
  if (before.game.platform === 'snes') {
    const [x, y] = [before.snesPictures, after.snesPictures]
    return x?.logos[team] !== y?.logos[team] || x?.centreIce[team] !== y?.centreIce[team]
  }
  const [x, y] = [before.graphics, after.graphics]
  return (
    x.rinkLogos[team] !== y.rinkLogos[team] ||
    x.menuLogos[team] !== y.menuLogos[team] ||
    x.menuPalettes[team] !== y.menuPalettes[team] ||
    x.menuBanners[team] !== y.menuBanners[team] ||
    x.visitorBanners[team] !== y.visitorBanners[team] ||
    x.gameBanners[team] !== y.gameBanners[team]
  )
}

function drawnPictures(project: RomProject, team: number): Map<string, Drawn> | null {
  const teams = project.teams.length
  if (project.game.platform === 'snes') {
    if (!snesPicturesSupported(project.bytes, teams)) return null
    const edits = project.snesPictures ?? { logos: {}, centreIce: {} }
    const logo = snesLogo(project.bytes, teams, edits, team)
    const ice = snesCentreIce(project.bytes, teams, edits, team, project.rinkPalette)
    // A centre ice logo with colours of its own (the SA-1 build) keeps them in its row.
    const iceOwn = ice.ownColours ? ice.palette.slice(ice.rows[0] * 16, ice.rows[0] * 16 + 16) : []
    return new Map([
      ['logo', { title: 'Team logo', picture: logo.picture, own: logo.palette }],
      ['centreIce', { title: 'Centre ice logo', picture: ice.picture, own: iceOwn }],
    ])
  }
  if (!project.graphicsSupported) return null
  return new Map(
    pictureKinds(project).map((kind: PictureKind): [string, Drawn] => {
      const { picture, palette } = currentPicture(project, team, kind)
      return [kind, { title: pictureTitle(project, kind), picture, own: ownColours(kind).map((colour) => palette[colour]) }]
    }),
  )
}
