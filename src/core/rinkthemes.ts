// Ready-made looks for the Genesis NHL 94 rink: the stands, everything more than two squares from the
// ice, drawn again as one of a few themes; the ice, boards, glass beside them, benches and penalty boxes as they are.
// Each is a handful of squares repeated, so it takes less room than the crowd it replaces. Its colours are matched to
// the nearest the rink has (the rink's own, each square in its palette line), so a league's own rink colours serve.
// The crowd that moves (the fans who jump at a goal) are sprites drawn over the stands, not part of the rink, so they
// still show over a theme. NHL '95's rink fills nearly the whole width, its stands thin strips at the ends, so a theme
// would hardly show there: it is not offered.

export const rinkThemesSupported = (project: Pick<RomProject, 'game' | 'bytes'>) =>
  project.game.platform === 'genesis' && project.game.edition !== 95 && (readGenesisRink(project.bytes, 'play')?.height ?? 0) === 113

import { colorRgb } from './color'
import { drawGenesisRink, importGenesisRink, readGenesisRink, type RinkView } from './genesisrink'
import type { RomProject } from './rom'

export type RinkTheme = 'outdoor' | 'empty'
export const RINK_THEMES: { theme: RinkTheme; name: string; note: string }[] = [
  { theme: 'outdoor', name: 'Outdoor', note: 'Snow and rows of pine trees in place of the stands, as a game played outside.' },
  { theme: 'empty', name: 'Empty arena', note: 'Rows of empty seats, with stairs, in place of the crowd.' },
]

type Rgb = [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const SNOW_SHADE: Rgb = [219, 219, 219]
const PINE: Rgb = [36, 73, 0]
const PINE_DARK: Rgb = [0, 36, 0]
const TRUNK: Rgb = [109, 73, 36]
const SEAT: Rgb = [109, 109, 109]
const SEAT_LIGHT: Rgb = [182, 182, 182]
const SEAT_EDGE: Rgb = [73, 73, 73]
const GAP: Rgb = [36, 36, 36]

const PAINT: Record<RinkTheme, (x: number, y: number) => Rgb> = {
  // A tree every 32 pixels across, a row every 48 down; snow with a fleck that repeats every 8 pixels.
  outdoor: (x, y) => {
    const [tx, ty] = [x % 32, y % 48]
    if (ty < 24 && Math.abs(tx - 16) <= Math.floor(ty / 2) + (ty % 8 === 0 ? 1 : 0)) return (tx + ty) % 5 === 0 ? PINE_DARK : PINE
    if (ty >= 24 && ty < 28 && tx >= 15 && tx <= 16) return TRUNK
    return ((x % 8) * 7 + (y % 8) * 13) % 29 === 0 ? SNOW_SHADE : WHITE
  },
  // A row of seat backs every 8 pixels, a stair every 64.
  empty: (x, y) => {
    if (x % 64 < 8) return y % 4 < 2 ? SEAT_LIGHT : SEAT
    const ry = y % 8
    if (ry < 3) return x % 8 === 0 ? GAP : SEAT
    if (ry < 5) return SEAT_EDGE
    return GAP
  },
}

// The rink, in play or the reverse angle's, with its stands in the theme, as a picture to import (the rows the game
// shows).
export function themedRink(rom: Uint8Array, view: RinkView, palette: number[], theme: RinkTheme): { rgba: Uint8ClampedArray; width: number; height: number } | null {
  const rink = readGenesisRink(rom, view)
  const drawn = rink && drawGenesisRink(rom, palette.slice(32, 48), palette.slice(48, 64), view)
  if (!rink || !drawn) return null
  const [across, down] = [rink.width, Math.min(85, rink.height)]
  const [width, height] = [across * 8, down * 8]
  const rgb = palette.map((word) => colorRgb(word))
  const pixel = (x: number, y: number) => drawn.picture.pixels[y * drawn.picture.width + x]
  // The ice: squares mostly see-through (the ice shows the backdrop) or very light.
  const light = (c: number) => c === 0 || rgb[c].every((v) => v >= 180)
  const ice = new Set<number>()
  for (let cell = 0; cell < across * down; cell++) {
    let n = 0
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (light(pixel((cell % across) * 8 + x, Math.floor(cell / across) * 8 + y))) n++
    if (n >= 40) ice.add(cell)
  }
  const nearIce = (cell: number) => {
    const [c, r] = [cell % across, Math.floor(cell / across)]
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (c + dc >= 0 && c + dc < across && ice.has((r + dr) * across + c + dc)) return true
    return false
  }
  // The centre ice logo's block (the last 24 tiles) stays, wherever it is.
  const centreFrom = rink.tileCount - 24
  // The stands: squares neither ice nor within two of it, and reachable from the picture's edge through such squares,
  // so nothing the boards enclose is ever redrawn (Match Viewer found two plain ice squares before each net, darker
  // than the test for ice, painted over by the first build).
  const open = (cell: number) => !ice.has(cell) && !nearIce(cell) && (rink.words[cell] & 0x7ff) < centreFrom
  const stands = new Set<number>()
  const queue: number[] = []
  for (let cell = 0; cell < across * down; cell++) {
    const [c, r] = [cell % across, Math.floor(cell / across)]
    if ((c === 0 || r === 0 || c === across - 1 || r === down - 1) && open(cell)) {
      stands.add(cell)
      queue.push(cell)
    }
  }
  while (queue.length) {
    const cell = queue.pop()!
    const [c, r] = [cell % across, Math.floor(cell / across)]
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nc, nr] = [c + dc, r + dr]
      const next = nr * across + nc
      if (nc < 0 || nr < 0 || nc >= across || nr >= down || stands.has(next) || !open(next)) continue
      stands.add(next)
      queue.push(next)
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = Math.floor(y / 8) * across + Math.floor(x / 8)
      const c = pixel(x, y)
      if (stands.has(cell)) rgba.set([...PAINT[theme](x, y), 255], (y * width + x) * 4)
      else if (c) rgba.set([...rgb[c], 255], (y * width + x) * 4)
    }
  }
  return { rgba, width, height }
}

// The project with a theme put into the rink in play and the reverse angle replay's (where the ROM has one). On NHL
// '95 the two maps share their tiles, so both go in at once (the old crowd's squares freed for both).
export function withRinkTheme(project: RomProject, theme: RinkTheme, palette: number[]): RomProject {
  const [play, reverse] = [readGenesisRink(project.bytes, 'play'), readGenesisRink(project.bytes, 'reverse')]
  const images = { play: themedRink(project.bytes, 'play', palette, theme), reverse: themedRink(project.bytes, 'reverse', palette, theme) }
  if (!play || !images.play) return project
  if (reverse && images.reverse && reverse.tilesAt === play.tilesAt) return { ...project, bytes: importGenesisRink(project.bytes, 'play', images.play, palette, false, images.reverse).rom }
  let rom = importGenesisRink(project.bytes, 'play', images.play, palette).rom
  if (reverse && images.reverse) rom = importGenesisRink(rom, 'reverse', themedRink(rom, 'reverse', palette, theme)!, palette).rom
  return { ...project, bytes: rom }
}
