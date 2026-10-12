// Draws a banner with a name on it, in the style of the game's own: a frame,
// two stripes in the team's banner colours, and shadowed lettering.

import { colorRgb } from './color'
import { bannerColors, bannerPalette, type BannerKind, type Picture } from './graphics'
import type { RomProject } from './rom'

// Lettering nine pixels tall with strokes two pixels wide, the size and
// weight of the lettering on the game's banners. Every shape here was drawn
// for this project; none is copied from the game.
const GLYPHS: Record<string, string[]> = {
  A: ['..##..', '.####.', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
  B: ['#####.', '######', '##..##', '#####.', '#####.', '##..##', '##..##', '######', '#####.'],
  C: ['.#####', '######', '##....', '##....', '##....', '##....', '##....', '######', '.#####'],
  D: ['####..', '#####.', '##.###', '##..##', '##..##', '##..##', '##.###', '#####.', '####..'],
  E: ['######', '######', '##....', '#####.', '#####.', '##....', '##....', '######', '######'],
  F: ['######', '######', '##....', '#####.', '#####.', '##....', '##....', '##....', '##....'],
  G: ['.#####', '######', '##....', '##....', '##.###', '##.###', '##..##', '######', '.####.'],
  H: ['##..##', '##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
  I: ['####', '####', '.##.', '.##.', '.##.', '.##.', '.##.', '####', '####'],
  J: ['....##', '....##', '....##', '....##', '....##', '....##', '##..##', '######', '.####.'],
  K: ['##..##', '##.###', '#####.', '####..', '###...', '####..', '#####.', '##.###', '##..##'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '##....', '######', '######'],
  M: ['##....##', '###..###', '########', '########', '##.##.##', '##.##.##', '##....##', '##....##', '##....##'],
  N: ['##...##', '###..##', '####.##', '####.##', '##.####', '##.####', '##..###', '##...##', '##...##'],
  O: ['.#####.', '#######', '##...##', '##...##', '##...##', '##...##', '##...##', '#######', '.#####.'],
  P: ['#####.', '######', '##..##', '##..##', '######', '#####.', '##....', '##....', '##....'],
  Q: ['.#####.', '#######', '##...##', '##...##', '##...##', '##.#.##', '##..###', '#######', '.####.#'],
  R: ['#####.', '######', '##..##', '##..##', '#####.', '#####.', '##.##.', '##..##', '##..##'],
  S: ['.#####', '######', '##....', '#####.', '.#####', '....##', '....##', '######', '#####.'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  V: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '.####.', '..##..'],
  W: ['##....##', '##....##', '##....##', '##.##.##', '##.##.##', '########', '########', '###..###', '##....##'],
  X: ['##...##', '##...##', '.##.##.', '..###..', '..###..', '..###..', '.##.##.', '##...##', '##...##'],
  Y: ['##..##', '##..##', '##..##', '.####.', '.####.', '..##..', '..##..', '..##..', '..##..'],
  Z: ['######', '######', '...###', '..###.', '.###..', '###...', '##....', '######', '######'],
  '0': ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  '1': ['.##.', '###.', '###.', '.##.', '.##.', '.##.', '.##.', '####', '####'],
  '2': ['.####.', '######', '##..##', '....##', '..###.', '.###..', '###...', '######', '######'],
  '3': ['#####.', '######', '....##', '..###.', '..###.', '....##', '....##', '######', '#####.'],
  '4': ['##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##'],
  '5': ['######', '######', '##....', '#####.', '######', '....##', '....##', '######', '#####.'],
  '6': ['.#####', '######', '##....', '#####.', '######', '##..##', '##..##', '######', '.####.'],
  '7': ['######', '######', '....##', '...###', '..###.', '..##..', '..##..', '..##..', '..##..'],
  '8': ['.####.', '######', '##..##', '.####.', '.####.', '##..##', '##..##', '######', '.####.'],
  '9': ['.####.', '######', '##..##', '##..##', '######', '.#####', '....##', '######', '#####.'],
  '.': ['..', '..', '..', '..', '..', '..', '..', '##', '##'],
  '-': ['....', '....', '....', '####', '####', '....', '....', '....', '....'],
  "'": ['##', '##', '.#', '..', '..', '..', '..', '..', '..'],
  '!': ['##', '##', '##', '##', '##', '##', '..', '##', '##'],
  '&': ['.###...', '#####..', '##.##..', '.###...', '.###.##', '##.####', '##..##.', '#######', '.###.##'],
  '/': ['...##', '...##', '..##.', '..##.', '.##..', '.##..', '##...', '##...', '##...'],
}

export const BANNER_WIDTH = 88
export const BANNER_HEIGHT = 16
const LETTER_GAP = 1
const SPACE_WIDTH = 3
const TEXT_TOP = 3
// The widest the game's own lettering runs, leaving the frame a little air.
const MAX_TEXT_WIDTH = 82

export interface Lettering {
  // The text as it will be drawn: capitals, and only characters there are shapes for.
  text: string
  // Characters that were left out for want of a shape.
  dropped: string
  width: number
  // How far over the limit the text is, or 0 if it fits.
  tooWide: number
}

export function measureLettering(text: string): Lettering {
  const wanted = text.toUpperCase().replace(/\s+/g, ' ').trim()
  const kept = [...wanted].filter((char) => char === ' ' || GLYPHS[char])
  const dropped = [...new Set([...wanted].filter((char) => char !== ' ' && !GLYPHS[char]))].join('')
  const drawn = kept.join('').replace(/ +/g, ' ').trim()
  const width = [...drawn].reduce((sum, char) => sum + (char === ' ' ? SPACE_WIDTH : GLYPHS[char][0].length) + LETTER_GAP, -LETTER_GAP)
  return { text: drawn, dropped, width: Math.max(0, width), tooWide: Math.max(0, width - MAX_TEXT_WIDTH) }
}

// The colour of each part of a banner, as one of a picture's 16.
interface Roles {
  frame: { outer: number; inner: number; lowerInner: number; lowerOuter: number }
  top: number
  bottom: number
  letters: number
  shadow: number
}

const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

function roles(project: RomProject, kind: BannerKind, team: number): Roles {
  // On the menus the same places hold the same colours for every team: white
  // and black, and the team's two stripe colours.
  if (kind !== 'game') return { frame: { outer: 5, inner: 6, lowerInner: 6, lowerOuter: 5 }, top: 1, bottom: 2, letters: 5, shadow: 6 }

  // During play every team's banner shares 16 colours, so each part takes the
  // nearest there is. In the original game that gives the banners' own look:
  // a grey frame lit from the top left, and pale lettering.
  const palette = bannerPalette(project, kind, team)
  const nearest = (word: number, from: number) => {
    let best = from
    for (let i = from; i < 16; i++) if (distance(colorRgb(palette[i]), colorRgb(word)) < distance(colorRgb(palette[best]), colorRgb(word))) best = i
    return best
  }
  const [top, bottom] = bannerColors(project, team)
  return {
    frame: { outer: nearest(0x0ccc, 1), inner: nearest(0x0888, 1), lowerInner: nearest(0x0444, 1), lowerOuter: nearest(0x0222, 1) },
    top: nearest(top, 1),
    bottom: nearest(bottom, 1),
    letters: nearest(0x0ccc, 1),
    shadow: nearest(0x0222, 1),
  }
}

// A banner reading `text`, for one of a team's banners. Text that is too wide
// is refused; see measureLettering.
export function letterBanner(project: RomProject, kind: BannerKind, team: number, text: string): Picture {
  const lettering = measureLettering(text)
  if (lettering.text === '') throw new Error('There is nothing to put on the banner.')
  if (lettering.tooWide > 0) {
    throw new Error(`"${lettering.text}" is ${lettering.tooWide} pixels too wide for a banner. Try a shorter form of the name.`)
  }
  const role = roles(project, kind, team)
  const [w, h] = [BANNER_WIDTH, BANNER_HEIGHT]
  const pixels = new Uint8Array(w * h)
  const set = (x: number, y: number, color: number) => (pixels[y * w + x] = color)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y)
      const lower = (x === w - 2 && y >= 2) || (y === h - 2 && x >= 2)
      // The frame is lit from the top left: its bottom and right sides are the darker pair.
      if (edge === 0) set(x, y, x === w - 1 || y === h - 1 ? (x === 0 || y === 0 ? role.frame.outer : role.frame.lowerOuter) : role.frame.outer)
      else if (edge === 1) set(x, y, lower ? role.frame.lowerInner : role.frame.inner)
      else set(x, y, y < h / 2 ? role.top : role.bottom)
    }
  }

  const ink = new Uint8Array(w * h)
  let x = Math.floor((w - lettering.width) / 2)
  for (const char of lettering.text) {
    if (char === ' ') {
      x += SPACE_WIDTH + LETTER_GAP
      continue
    }
    const glyph = GLYPHS[char]
    glyph.forEach((row, r) => [...row].forEach((dot, c) => dot === '#' && (ink[(TEXT_TOP + r) * w + x + c] = 1)))
    x += glyph[0].length + LETTER_GAP
  }
  // The shadow falls one pixel down and to the right of the lettering.
  for (let y = TEXT_TOP; y < h - 2; y++) {
    for (let col = 2; col < w - 2; col++) {
      if (ink[y * w + col]) set(col, y, role.letters)
      else if (ink[(y - 1) * w + col - 1]) set(col, y, role.shadow)
    }
  }
  return { width: w, height: h, pixels }
}
