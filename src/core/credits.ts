import { snesCreditsBytes, snesCreditsFit } from './snescredits'

// The credits the Genesis game rolls on its title screen (smozoma's forum
// post, "HOWTO: Edit the game credits"). The title code loads their address
// with movea.l #credits,a1 at $FF224. Each line is a word, its length plus 2,
// then its text, padded with a 00 to an even length (shown as a space); an
// empty line is 0002 alone. A page ends with 0004 FF00, which pauses about a
// second, and two page ends in a row end the credits. In the original game
// they fill $5776 to $5B1C, 934 bytes, with a table straight after, so an
// edit has to fit that room. "$" is the copyright sign in the game's font.
// NOSE's roster space expansion moves them to the end of the ROM, with no
// room to spare, and repoints the game at them; they are found either way.

export interface Credits {
  // Each page's lines, as shown. On the SNES a page is one credit title, then its names.
  pages: string[][]
  // How many bytes they may take.
  room: number
  // The SNES game's credits (snescredits.ts); the Genesis game's otherwise.
  format?: 'snes'
}

const POINTER_CODE_AT = 0xff224
const POINTER_CODE = [0x22, 0x7c]
// The original game's place and room; a ROM that keeps them there keeps the room.
const ORIGINAL_AT = 0x5776
const ORIGINAL_ROOM = 0x3a6
const PAGE_END = [0x00, 0x04, 0xff, 0x00]
// The longest line the original game has, and the most lines on one of its
// pages: what the editor suggests. Some ROMs have more, so neither is a limit.
export const CREDITS_LINE_LENGTH = 25
export const CREDITS_PAGE_LINES = 4
// The letters a line may hold: the game's font has the printable ASCII ones.
export const creditsText = (text: string) => /^[\x20-\x7e]*$/.test(text)

const isPageEnd = (rom: Uint8Array, at: number) => PAGE_END.every((byte, i) => rom[at + i] === byte)

// The credits in a Genesis ROM, or null where they are not found as the original game has them.
export function parseCredits(rom: Uint8Array): Credits | null {
  const found = locateCredits(rom)
  return found && { pages: found.pages, room: found.room }
}

function locateCredits(rom: Uint8Array): (Credits & { at: number }) | null {
  if (rom[POINTER_CODE_AT] !== POINTER_CODE[0] || rom[POINTER_CODE_AT + 1] !== POINTER_CODE[1]) return null
  const at = (rom[POINTER_CODE_AT + 2] << 24) | (rom[POINTER_CODE_AT + 3] << 16) | (rom[POINTER_CODE_AT + 4] << 8) | rom[POINTER_CODE_AT + 5]
  if (at <= 0 || at >= rom.length) return null
  const pages: string[][] = []
  let page: string[] = []
  let o = at
  // No credits run longer than this; anything else is not credits.
  const limit = Math.min(rom.length, at + 0x2000)
  while (o + 4 <= limit) {
    if (isPageEnd(rom, o)) {
      pages.push(page)
      page = []
      o += 4
      if (isPageEnd(rom, o)) {
        const used = o + 4 - at
        const room = at === ORIGINAL_AT ? Math.max(ORIGINAL_ROOM, used) : used
        return pages.length > 0 ? { pages, at, room } : null
      }
      continue
    }
    const length = (rom[o] << 8) | rom[o + 1]
    if (length < 2 || length > 2 + 64 || length % 2 !== 0 || o + length > limit) return null
    const text = String.fromCharCode(...rom.subarray(o + 2, o + length)).replace(/\0+$/, '')
    if (!creditsText(text)) return null
    page.push(text)
    o += length
  }
  return null
}

// The bytes credits take: each line padded to an even length, each page's end, and the final end.
export function creditsBytes(pages: string[][]): Uint8Array {
  const out: number[] = []
  for (const page of pages) {
    for (const line of page) {
      const padded = line.length % 2 === 0 ? line : `${line}\0`
      out.push(0, padded.length + 2, ...Array.from(padded, (char) => char.charCodeAt(0)))
    }
    out.push(...PAGE_END)
  }
  out.push(...PAGE_END)
  return Uint8Array.from(out)
}

// How many bytes they take, in either game's format.
export const creditsUsed = (credits: Credits) => (credits.format === 'snes' ? snesCreditsBytes(credits.pages) : creditsBytes(credits.pages).length)

// Writes the credits in their room, the rest of the room filled with 00. They
// are left as they are if they do not fit or hold what the font cannot show.
export function writeCredits(rom: Uint8Array, credits: Credits): boolean {
  const found = locateCredits(rom)
  if (!found || !creditsFit({ ...credits, room: found.room })) return false
  rom.fill(0, found.at, found.at + found.room)
  rom.set(creditsBytes(credits.pages), found.at)
  return true
}

export function creditsFit(credits: Credits): boolean {
  if (credits.format === 'snes') return snesCreditsFit(credits)
  return credits.pages.length > 0 && credits.pages.every((page) => page.every(creditsText)) && creditsBytes(credits.pages).length <= credits.room
}
