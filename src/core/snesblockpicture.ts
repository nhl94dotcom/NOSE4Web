// The SNES game's team block, the name banner of the menus, drawn as the game
// draws it: TeamBlocksTiles laid out by Teamblocksmap (9 tiles by 2) in the
// team's block colours, with its place name on it in the letter sprites of
// PrintTeamSprites. For showing the banner while its colours are changed.
// (abdulahmad/NHL94SNES: DrawTeamBlocks, PrintTeamSprites, LetterWidths.)

import { readU16LE } from './bytes'
import type { Picture } from './graphics'
import { isHuffman, unpackHuffman } from './huffman'
import { findCode, findCodeAll, loRomOffset, snesSpriteFrameDots, tilePixel } from './snes'

const COLUMNS = 9
const ROWS = 2
export const SNES_BLOCK_SIZE = { width: COLUMNS * 8, height: ROWS * 8 }
// Letters take colours of their own: SetupScreen's sprite palette 4, after the block's 16. They use
// its 15 ($FFFF, the letter) and 1 ($1D47, the edge), as Match Viewer measured on every banner screen
// but Game Setup, where setoptions makes the edge $14A5 (a dark grey); the pause scoreboard's
// horizontal blocks use sprite palettes 6 and 7, which hold the same two.
export const SNES_BLOCK_LETTERS = 16

// DrawTeamBlocks: lda #Teamblocksmap>>16; sta a2+2; lda #Teamblocksmap+6; sta a2; lda printy; asl x5;
// adc printx; asl; adc printm; tax; lda #9; sta tmp0; sta tmp1; lda [a2],y; clc; adc.l scorechars.
const MAP_CODE = 'a9(..)0085..a9(....)85..ad....0a0a0a0a0a6d....0a6d....aaa9090085..85..b7..186f(......)'
// A screen setup unpacking the block tiles: lda #TeamBlocksTiles (p0), lda #unpackbuf (p1), jsl Decompress,
// txa, lsr x5, adc.l scorechars. Other tile sets are unpacked the same way to other places.
const TILES_CODE = 'a9(..)0085..a9(....)85..a9..0085..a9....85..22......8a4a4a4a4a4a6f(......)'
// SetupScreen: lda #UnusedSetupSpritePalette (p0); ldy #$00C0; ldx #$0010; jsl SetColours.
const LETTER_COLOURS_CODE = 'a9(..)0085..a9(....)85..a0c000a2100022'
// The big font's first frame (A), then B to Z, '.', '(c)' and 0 to 9.
const FONT_FRAME = 929
const LETTER_WIDTHS = [
  7, 7, 6, 7, 6, 6, 7, 6, 2, 5, 7, 5, 8, 7, 8, 6, 8, 6, 5, 6, 6, 7, 8, 6, 6, 5, 3, 5, 5, 4, 6, 6, 6, 5, 5, 6, 5, 5,
]
// Where the name sits on the block: centred 36 pixels in, 3 down.
const NAME_X = 0x24
const NAME_Y = 3

interface Block {
  map: number[]
  tiles: Uint8Array
  letters: number[]
}

const found = new WeakMap<Uint8Array, Block | null>()

function block(rom: Uint8Array): Block | null {
  if (found.has(rom)) return found.get(rom)!
  let result: Block | null = null
  const code = findCode(rom, MAP_CODE)
  if (code && code.groups[1] >= 0x8000) {
    const at = loRomOffset(code.groups[0], code.groups[1])
    const map = Array.from({ length: COLUMNS * ROWS }, (_, i) => readU16LE(rom, at + i * 2) & 0x3ff)
    const most = Math.max(...map) + 1
    for (const candidate of findCodeAll(rom, TILES_CODE)) {
      if (candidate.groups[2] !== code.groups[2] || candidate.groups[1] < 0x8000) continue
      const packed = loRomOffset(candidate.groups[0], candidate.groups[1])
      if (!isHuffman(rom, packed)) continue
      try {
        const tiles = unpackHuffman(rom, packed).data
        if (tiles.length < most * 32) continue
        const colours = findCode(rom, LETTER_COLOURS_CODE)
        const letters = colours && colours.groups[1] >= 0x8000 ? Array.from({ length: 16 }, (_, i) => readU16LE(rom, loRomOffset(colours.groups[0], colours.groups[1]) + i * 2)) : []
        result = { map, tiles, letters }
        break
      } catch {
        // Not the block tiles.
      }
    }
  }
  found.set(rom, result)
  return result
}

export function snesBlockPictureSupported(rom: Uint8Array): boolean {
  return block(rom) !== null
}

// The letter for a character of the name, as PrintTeamSprites picks it: its index in the font, or -1 for a gap.
function letterOf(c: string): number {
  if (c === '.') return 0x1a
  if (c === '@') return 0x1b
  if (c >= '0' && c <= '9') return 0x1c + c.charCodeAt(0) - 0x30
  const index = (c.charCodeAt(0) & 0xdf) - 0x41
  return index >= 0 && index < 26 ? index : -1
}

// What is wrong with a banner name, or null. PrintTeamSprites (the banners) knows only A to Z (either case), 0 to 9,
// space, "." and "@"; for any other character it takes a letter number below A's, so it draws some other sprite frame
// of the game's in its place (Match Viewer saw a whole skater over the banner and the matchup screen's Overall).
// RenderBigText, which draws the same names in the playoff bracket and Game Setup's team select, knows only A to Z,
// space and ".": a digit or "@" there gives a stray tile too. A name wider than the block (72 pixels; the
// original's widest is All Stars W., 67) runs off both its ends.
export function snesBannerNameProblem(name: string): { level: 'problem' | 'note'; message: string } | null {
  const bad = [...new Set([...name].filter((c) => c !== ' ' && c !== '.' && !/[A-Za-z]/.test(c)))]
  if (bad.length > 0) {
    return { level: 'problem', message: `has ${bad.map((c) => `"${c}"`).join(', ')}, which the game cannot draw on every screen: in its place it draws a stray picture on the team's banners (the matchup screen, Game Setup) or in the playoff bracket. Only letters, spaces and "." can be used.` }
  }
  const width = snesBannerNameWidth(name)
  if (width > SNES_BLOCK_SIZE.width) return { level: 'note', message: `is ${width} pixels wide, wider than the banner (${SNES_BLOCK_SIZE.width}), so it runs off both ends.` }
  return null
}

// How wide the game draws a banner name: each letter's width, a space 5 pixels (a first one nothing), "." 3.
export function snesBannerNameWidth(name: string): number {
  return [...name].reduce((sum, c, i) => sum + (c === ' ' ? (i === 0 ? 0 : 5) : c === '.' ? 3 : letterOf(c) >= 0 ? LETTER_WIDTHS[letterOf(c)] : 0), 0)
}

// The block with `name` on it. Colours 0 to 15 are the block's, 16 to 31 the
// letters'; `palette` gives both, the block's as given and the letters' from the ROM.
export function snesBlockPicture(rom: Uint8Array, colours: number[], name: string): { picture: Picture; palette: number[] } | null {
  const b = block(rom)
  if (!b) return null
  const { width, height } = SNES_BLOCK_SIZE
  const pixels = new Uint8Array(width * height)
  b.map.forEach((tile, i) => {
    const [left, top] = [(i % COLUMNS) * 8, Math.floor(i / COLUMNS) * 8]
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pixels[(top + y) * width + left + x] = tilePixel(b.tiles, tile * 32, x, y)
  })
  if (b.letters.length > 0) {
    // Its width first, then each letter drawn from the left: a space is 5 pixels, a first space nothing.
    const widthOf = (c: string, i: number) => (c === ' ' ? (i === 0 ? 0 : 5) : c === '.' ? 3 : letterOf(c) >= 0 ? LETTER_WIDTHS[letterOf(c)] : 0)
    const chars = [...name]
    let x = NAME_X - (snesBannerNameWidth(name) >> 1)
    chars.forEach((c, i) => {
      const letter = letterOf(c)
      if (c !== ' ' && letter >= 0) {
        for (const [dx, dy, colour] of snesSpriteFrameDots(rom, FONT_FRAME + letter, true) ?? []) {
          const [px, py] = [x + dx, NAME_Y + dy]
          if (px >= 0 && px < width && py >= 0 && py < height) pixels[py * width + px] = SNES_BLOCK_LETTERS + colour
        }
      }
      x += widthOf(c, i)
    })
  }
  return { picture: { width, height, pixels }, palette: [...colours.slice(0, 16), ...(b.letters.length ? b.letters : new Array(16).fill(0))] }
}
