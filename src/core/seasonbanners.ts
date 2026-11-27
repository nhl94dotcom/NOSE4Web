import { isGenesis94 } from './games'
import { expandPictureSpace, NoRoomError, pictureSpace, withBanner, writeGraphics, type BannerKind, type GraphicsEdits } from './graphics'
import { letterBanner, measureLettering } from './lettering'
import { pictureEditable, pictureKinds, pictureSharedWith, type PictureKind } from './pictureset'
import type { RomProject } from './rom'
import { teamDisplayName } from './team'

// The Real NHL season page puts a season's team where its franchise is in the ROM, so a team of another city (the
// 1987-88 Minnesota North Stars where the original game has the Dallas Stars) keeps that place's banners and logo
// (Match Viewer, 2026-11-26). On NHL 94 for the Genesis, whose banners NOSE4Web can letter in the game's own
// lettering (lettering.ts, as the team page's Banner lettering does), those teams' banners are lettered with their
// city; elsewhere, and for the logos, which NOSE4Web does not draw, the page says which teams to change.

const BANNERS: { kind: PictureKind; banner: BannerKind }[] = [
  { kind: 'menuBanner', banner: 'menu' },
  { kind: 'visitorBanner', banner: 'visitor' },
  { kind: 'gameBanner', banner: 'game' },
  { kind: 'pauseBanner', banner: 'pause' },
]

export interface SeasonBanners {
  project: RomProject
  // The teams whose banners were lettered, and those whose banners or logo are still another city's.
  lettered: string[]
  bannersLeft: string[]
  logosLeft: string[]
  // Whether the logos and banners were given more room for the lettering (as the team page's button does), and the
  // ROM's size then where it grew.
  roomGiven: { grew: number | null } | null
}

// `cities`: each brought-in slot's location before (the ROM's team there) and now (the season's).
export function letterSeasonBanners(project: RomProject, cities: { slot: number; before: string; now: string }[]): SeasonBanners {
  const moved = cities.filter((c) => c.before.trim().toLowerCase() !== c.now.trim().toLowerCase())
  const result: SeasonBanners = { project, lettered: [], bannersLeft: [], logosLeft: moved.map((c) => teamDisplayName(project.teams[c.slot])), roomGiven: null }
  if (moved.length === 0) return result
  const kinds = isGenesis94(project.game) ? pictureKinds(project) : []
  if (!BANNERS.some((b) => kinds.includes(b.kind))) {
    result.bannersLeft = moved.map((c) => teamDisplayName(project.teams[c.slot]))
    return result
  }
  let base = project
  let graphics: GraphicsEdits = project.graphics
  for (const { slot, now } of moved) {
    const name = teamDisplayName(project.teams[slot])
    // Only banners of this team's own: one it shares with other teams would be lettered for them too.
    const shared = BANNERS.some((b) => kinds.includes(b.kind) && pictureSharedWith(project, slot, b.kind).length > 1)
    const targets = shared ? [] : BANNERS.filter((b) => kinds.includes(b.kind) && pictureEditable(project, b.kind))
    const lettering = measureLettering(now)
    if (targets.length === 0 || lettering.text.length === 0 || lettering.tooWide > 0) {
      result.bannersLeft.push(name)
      continue
    }
    const letter = (from: RomProject) => {
      let next = graphics
      for (const t of targets) next = withBanner({ ...from, graphics: next }, t.banner, slot, letterBanner({ ...from, graphics: next }, t.banner, slot, now))
      writeGraphics(from.bytes.slice(), from.game, next)
      return next
    }
    try {
      try {
        graphics = letter(base)
      } catch (e) {
        // Out of room: once, the room the team page's "more room" button gives, then again; kept only if it lets
        // the lettering in.
        const space = pictureSpace({ ...base, graphics })
        if (!(e instanceof NoRoomError) || result.roomGiven || !space) throw e
        const roomier = expandPictureSpace({ ...base, graphics })
        graphics = letter(roomier)
        base = roomier
        result.roomGiven = { grew: space.grows ? space.romSize : null }
      }
      result.lettered.push(name)
    } catch {
      // No room for the pictures, or a banner the lettering cannot be drawn on: left for the team's page.
      result.bannersLeft.push(name)
    }
  }
  result.project = { ...base, graphics }
  return result
}
