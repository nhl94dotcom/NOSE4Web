// How a team's banner colours look on NHL 94's in-game banners (Genesis), and
// a way to give those banners a colour they lack.
//
// The menu banners take the team's two stripe colours (graphics.ts). The
// in-game banners (Teamblocksmap: the pause scoreboard, the period and game
// stats, the penalty box and the shootout) are drawn in palette line 1, which
// during play holds the arena's 16 colours, the same for every team, so a
// banner lettered here takes the nearest of those (lettering.ts). The SNES
// game draws every banner in the team's own 16 block colours, and NHL '95's
// in-game banners are pictures in colours each screen repeats, so neither
// takes the stripe colours and neither is offered this.
//
// Line 1 holds more than the banners. What else is drawn in it during play,
// read from the ROM (abdulahmad/NHL94Genesis: setupice, the sprite frames,
// the maps' palette bits) and the rink screens the Rink colours page shows:
//   1-4, 7  the greys and black of the frames, the menus, the replay panel
//   5, 6    the replay panel's letters and the replay marker (orange)
//   8       the score digits (BigFont)
//   9       player 1's arrow and face-off pad
//   10      the arrows of pads 3 and 4, and a net or puck in the crowd's colours
//   12, 13  the EA logo, the line energy bars, the blood (genesisblood.ts)
//   14, 15  the referee's face and hands (RefMap2, the face-off sprites)
// Colour 11 (the dark green $020) is the crowd's alone, with some teams'
// in-game banners and two pixels of the net or puck in the crowd's colours.
// So it is the one offered.

import { colorRgb } from './color'
import { isGenesis94 } from './games'
import { banner, bannerKindSupported, bannerPalette, gameBannerLine } from './graphics'
import { nearestBannerColour } from './lettering'
import type { RomProject } from './rom'

// The arena colours (0-15 of the arena's 16) that may be given another colour.
export const SPARE_ARENA_COLOURS = [11]
const ARENA_START = 16
// How far (in 0-255 red, green and blue) a colour may be from the one shown before it reads as another.
const CLOSE = 64

// Whether the in-game banners take the nearest of the arena colours, as NHL 94's do.
export function gameBannerColoursShown(project: RomProject): boolean {
  if (!isGenesis94(project.game) || project.rinkPalette.length !== 32 || !project.graphicsSupported) return false
  try {
    return bannerKindSupported(project, 'game') && gameBannerLine(project) === 1
  } catch {
    return false
  }
}

export interface InGameColour {
  // Which of the arena's 16 it is, and the colour.
  slot: number
  word: number
  // Whether it is noticeably another colour than the one asked for.
  far: boolean
}

// The colour a stripe colour is drawn in on the in-game banners.
export function inGameColour(project: RomProject, word: number): InGameColour {
  const palette = bannerPalette(project, 'game', 0)
  const slot = nearestBannerColour(palette, word)
  const [a, b] = [colorRgb(palette[slot]), colorRgb(word)]
  const far = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 > CLOSE * CLOSE
  return { slot, word: palette[slot], far }
}

// The teams whose in-game banner shows one of the arena colours.
export function teamsShowingArenaColour(project: RomProject, slot: number): number[] {
  return project.teams.flatMap((_, team) => (banner(project, 'game', team).pixels.includes(slot) ? [team] : []))
}

// The spare arena colour to give up: the one fewest in-game banners show.
export function spareArenaColour(project: RomProject): number {
  const uses = SPARE_ARENA_COLOURS.map((slot) => teamsShowingArenaColour(project, slot).length)
  return SPARE_ARENA_COLOURS[uses.indexOf(Math.min(...uses))]
}

// The work with one spare arena colour changed. It is written with the other
// rink colours (rom.ts), and saved in project files with them.
export function withArenaColour(project: RomProject, slot: number, word: number): RomProject {
  if (!SPARE_ARENA_COLOURS.includes(slot)) throw new Error('That arena colour is used by more than the crowd and the banners.')
  const rinkPalette = project.rinkPalette.slice()
  rinkPalette[ARENA_START + slot] = word
  return { ...project, rinkPalette }
}

// A plain name for a colour, for notes.
export function colourName(word: number): string {
  const [r, g, b] = colorRgb(word)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 30 || max - min < Math.max(24, max / 5)) return max < 40 ? 'black' : min > 210 ? 'white' : max < 100 ? 'dark grey' : max > 170 ? 'light grey' : 'grey'
  const hue = max === r ? (((g - b) / (max - min)) * 60 + 360) % 360 : max === g ? ((b - r) / (max - min)) * 60 + 120 : ((r - g) / (max - min)) * 60 + 240
  const names: [number, string][] = [[15, 'red'], [40, 'orange'], [70, 'yellow'], [160, 'green'], [200, 'teal'], [260, 'blue'], [320, 'purple'], [345, 'pink'], [360, 'red']]
  const name = names.find(([upTo]) => hue < upTo)![1]
  return max < 110 ? `dark ${name}` : min > 150 ? `light ${name}` : name
}
