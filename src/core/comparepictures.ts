import { colorRgb, SNES_COLORS, type ColorFormat } from './color'
import type { Picture } from './graphics'
import { PHOTO_BLOCK_MOST_BYTES, photoLayout, photoPalette, photosSupported, teamPhotos } from './photos'
import { loRomOffset } from './snes'
import { SNES_PHOTO_MOST_BYTES, snesPhotoPalette, snesPhotoRow, snesPhotosSupported, snesTeamPhotos } from './snesphotos'
import { snesScoreLogo, snesScoreLogosSupported } from './snesscorelogos'
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

// ------------------------------------------------------- photos and score logos

// How each player's own photo looks, by his name: colours where solid, '-' where see-through.
function photoLooks(project: RomProject, team: number): { looks: Map<string, string>; featured: string[] } | null {
  const players = project.teams[team].players
  const look = (picture: Picture, palette: number[], format?: ColorFormat) =>
    Array.from(picture.pixels, (p) => (p ? colorRgb(palette[p], format).join() : '-')).join(';')
  if (project.game.platform === 'snes') {
    if (!snesPhotosSupported(project)) return null
    const palette = snesPhotoPalette(project, team)
    const looks = new Map<string, string>()
    snesTeamPhotos(project, team).forEach((photo, slot) => {
      if (slot < players.length && photo.shared === 0) looks.set(players[slot].name, look(photo.picture, palette, SNES_COLORS))
    })
    return { looks, featured: [] }
  }
  if (!photosSupported(project)) return null
  const palette = photoPalette(project)
  const photos = teamPhotos(project, team)
  const looks = new Map<string, string>()
  for (const photo of photos) {
    const name = players[photo.slot]?.name
    if (name !== undefined && !looks.has(name)) looks.set(name, photo.generic ? 'generic' : look(photo.picture, palette))
  }
  return { looks, featured: photos.map((photo) => players[photo.slot]?.name ?? '') }
}

// Where a team's photos and score logo are stored: places in the ROM and
// how many bytes from each, and the numbers stored beside them (slots,
// colours, the score logo's addresses), to tell quickly whether they changed.
function storedPhotos(project: RomProject, team: number): { spans: [number, number][]; numbers: number[] } {
  const spans: [number, number][] = []
  const numbers: number[] = []
  if (project.game.platform === 'snes') {
    if (snesPhotosSupported(project)) {
      numbers.push(...snesPhotoPalette(project, team))
      for (const address of snesPhotoRow(project, team)) {
        const word = address[0] | (address[1] << 8)
        numbers.push(word, address[2])
        if (word >= 0x8000) spans.push([loRomOffset(address[2], word), SNES_PHOTO_MOST_BYTES])
      }
    }
    if (snesScoreLogosSupported(project)) {
      const logo = snesScoreLogo(project, team)
      numbers.push(...(logo ? [...logo.picture.pixels, ...logo.palette] : [-1]))
    }
  } else {
    const layout = photoLayout(project.bytes, project.teams.length)
    for (const entry of layout?.lists[team].entries ?? []) {
      numbers.push(entry.slot)
      spans.push([entry.at, PHOTO_BLOCK_MOST_BYTES])
    }
  }
  return { spans, numbers }
}

function sameStoredPhotos(before: RomProject, b: number, after: RomProject, a: number): boolean {
  if (before.bytes === after.bytes && b === a) return true
  const [x, y] = [storedPhotos(before, b), storedPhotos(after, a)]
  if (x.numbers.length !== y.numbers.length || x.numbers.some((n, i) => n !== y.numbers[i]) || x.spans.length !== y.spans.length) return false
  return x.spans.every(([at, size], i) => {
    const [other] = y.spans[i]
    for (let k = 0; k < size; k++) if (before.bytes[at + k] !== after.bytes[other + k]) return false
    return true
  })
}

// How team `b` of `before` and team `a` of `after` differ in their players'
// photos (by player, so a player who moved is not counted) and score logos.
export function photoDifferences(before: RomProject, b: number, after: RomProject, a: number): string[] {
  // Nothing to decode where the players and the stored photos are as they were.
  const [wasPlayers, nowPlayers] = [before.teams[b].players, after.teams[a].players]
  const samePlayers = wasPlayers === nowPlayers || (wasPlayers.length === nowPlayers.length && wasPlayers.every((player, i) => player.name === nowPlayers[i].name))
  if (samePlayers && sameStoredPhotos(before, b, after, a)) return []
  const out: string[] = []
  const was = photoLooks(before, b)
  const now = photoLooks(after, a)
  if (was && now) {
    const players = new Set(after.teams[a].players.map((player) => player.name))
    for (const [name, look] of now.looks) {
      const old = was.looks.get(name)
      if (old === undefined) {
        if (after.game.platform !== 'snes') out.push(`${name} added to the featured players${look === 'generic' ? '' : ', with a photo'}.`)
        else if (before.teams[b].players.some((player) => player.name === name)) out.push(`Photo of ${name} changed.`)
      } else if (old !== look) out.push(`Photo of ${name} changed.`)
    }
    if (after.game.platform !== 'snes') {
      for (const name of was.looks.keys()) if (!now.looks.has(name) && players.has(name)) out.push(`${name} taken off the featured players.`)
      const kept = (list: string[], other: Map<string, string>) => list.filter((name) => other.has(name)).slice(0, 6).join('|')
      if (kept(was.featured, now.looks) !== kept(now.featured, was.looks)) out.push('The featured players shown on the setup screen are in another order.')
    } else {
      for (const name of was.looks.keys()) if (!now.looks.has(name) && players.has(name)) out.push(`Photo of ${name} changed to a generic one.`)
    }
  }
  if (snesScoreLogosSupported(before) && snesScoreLogosSupported(after)) {
    const [old, next] = [snesScoreLogo(before, b), snesScoreLogo(after, a)]
    const look = (logo: { picture: Picture; palette: number[] }) => Array.from(logo.picture.pixels, (p) => (p ? colorRgb(logo.palette[p], SNES_COLORS).join() : '-')).join(';')
    if (old && !next) out.push('Score logo taken away: the score box shows the letters.')
    else if (!old && next) out.push('Score logo added.')
    else if (old && next && look(old) !== look(next)) out.push('Score logo changed.')
  }
  return out
}
