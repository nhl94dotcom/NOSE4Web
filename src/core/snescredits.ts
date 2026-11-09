import { readU16LE, writeU16LE } from './bytes'
import type { Credits } from './credits'
import { findCode, findCodeAll, loRomAddress, loRomOffset } from './snes'

// The credits the SNES game rolls on its title screen (RollCredits, in the
// disassembly's StartCredits.asm). CreditTitles is a list of word pointers to
// the titles, ended by $0000; CreditNames is one list of word pointers for
// each title, each ended by $0000, all in one run. Every string ends in a
// zero. The game shows a title with its first name, then each next name, then
// goes on to the next title, so every title needs a name. Tables and strings
// are all in bank $80, read with lda.l CreditTitles,x / lda.l CreditNames,x
// and the bank from lda #CreditTitles>>16. In the original game they follow
// the two copyright lines, which the editor leaves alone, and take 949 bytes
// up to TitleSampleList; rebuilt ROMs have them elsewhere in bank $80, so they
// are found by that code. The editor writes the tables first and the strings
// at the end of the room, so a ROM it has edited is read back with the same
// room, and points the four loads at the tables.

// RollCredits' next entry: lda.l CreditNames,x; bne; inc CreditTitleIdx; lda CreditTitleIdx; asl; tax; lda.l CreditTitles,x; beq.
const NEXT_ENTRY = 'bf(....)80d0..ee....ad....0aaabf(....)80f0'
const NAMES_AT = 1
const TITLES_AT = 15
// Its drawing: lda.l CreditTitles,x (then CreditNames,x); sta a1; lda #$0080, the bank.
const DRAW = 'bf(....)80858da98000'
const BANK = 0x80
// No credits have more than these; anything else is not credits.
const MOST_TITLES = 64
const MOST_NAMES = 64
const MOST_LETTERS = 64

// The longest line the original game has and the most names under one title:
// what the editor suggests. Neither is a limit.
export const SNES_CREDITS_LINE_LENGTH = 22
export const SNES_CREDITS_PAGE_LINES = 10
// What the game's letters are: A to Z (lower case shows as upper), 0 to 9,
// space, "." and "@", the copyright sign. Anything else shows a wrong letter.
export const snesCreditsText = (text: string) => /^[A-Za-z0-9 .@]*$/.test(text)

interface Found {
  pages: string[][]
  // Where the tables and strings are, and how many bytes from there.
  at: number
  room: number
  // The four operands that point at the tables.
  titlePointers: number[]
  namePointers: number[]
}

function locate(rom: Uint8Array): Found | null {
  const next = findCode(rom, NEXT_ENTRY)
  const draws = findCodeAll(rom, DRAW)
  if (!next || draws.length !== 2) return null
  const [names, titles] = next.groups
  if (draws[0].groups[0] !== titles || draws[1].groups[0] !== names || titles < 0x8000 || names < 0x8000) return null
  const offset = (address: number) => loRomOffset(BANK, address)
  const covered = new Set<number>()
  const cover = (at: number, size: number) => {
    for (let i = 0; i < size; i++) covered.add(at + i)
  }
  const readString = (address: number): string | null => {
    if (address < 0x8000) return null
    const at = offset(address)
    let end = at
    while (end < rom.length && rom[end] !== 0 && end - at < MOST_LETTERS) end++
    if (end >= rom.length || rom[end] !== 0) return null
    const text = String.fromCharCode(...rom.subarray(at, end))
    if (!snesCreditsText(text)) return null
    cover(at, end + 1 - at)
    return text
  }

  const titleTable = offset(titles)
  const titleTexts: string[] = []
  let o = titleTable
  for (; readU16LE(rom, o) !== 0; o += 2) {
    const text = titleTexts.length < MOST_TITLES ? readString(readU16LE(rom, o)) : null
    if (text === null) return null
    titleTexts.push(text)
  }
  cover(titleTable, o + 2 - titleTable)
  if (titleTexts.length === 0) return null

  const nameTable = offset(names)
  o = nameTable
  const pages: string[][] = []
  for (const title of titleTexts) {
    const page = [title]
    for (; readU16LE(rom, o) !== 0; o += 2) {
      const text = page.length <= MOST_NAMES ? readString(readU16LE(rom, o)) : null
      if (text === null) return null
      page.push(text)
    }
    o += 2
    if (page.length < 2) return null
    pages.push(page)
  }
  cover(nameTable, o - nameTable)

  // The room is everything they take, and the zeros between, but nothing else.
  const start = Math.min(...covered)
  const end = Math.max(...covered) + 1
  for (let i = start; i < end; i++) if (!covered.has(i) && rom[i] !== 0) return null
  if (Math.floor(start / 0x8000) !== Math.floor((end - 1) / 0x8000)) return null
  return {
    pages,
    at: start,
    room: end - start,
    titlePointers: [next.at + TITLES_AT, draws[0].at + 1],
    namePointers: [next.at + NAMES_AT, draws[1].at + 1],
  }
}

// The SNES game's credits, or null where they are not found as the original game has them.
export function parseSnesCredits(rom: Uint8Array): Credits | null {
  const found = locate(rom)
  return found && { pages: found.pages, room: found.room, format: 'snes' }
}

// The strings once each: the same text twice is stored once.
const uniqueStrings = (pages: string[][]) => [...new Set(pages.flat())]

// How many bytes the credits take: the two tables and the strings.
export function snesCreditsBytes(pages: string[][]): number {
  const names = pages.reduce((sum, page) => sum + page.length - 1, 0)
  return (pages.length + 1) * 2 + (names + pages.length) * 2 + uniqueStrings(pages).reduce((sum, text) => sum + text.length + 1, 0)
}

export function snesCreditsFit(credits: Credits): boolean {
  return (
    credits.pages.length > 0 &&
    credits.pages.length <= MOST_TITLES &&
    credits.pages.every((page) => page.length >= 2 && page.length <= MOST_NAMES + 1 && page.every((line) => snesCreditsText(line) && line.length <= MOST_LETTERS)) &&
    snesCreditsBytes(credits.pages) <= credits.room
  )
}

// Writes the credits in their room: the titles table, the names table, zeros,
// then the strings, ending where the room ends. They are left as they are if
// they do not fit or hold what the game cannot show.
export function writeSnesCredits(rom: Uint8Array, credits: Credits): boolean {
  const found = locate(rom)
  if (!found || !snesCreditsFit({ ...credits, room: found.room })) return false
  const { pages } = credits
  const end = found.at + found.room
  rom.fill(0, found.at, end)
  const strings = uniqueStrings(pages)
  const stringsSize = strings.reduce((sum, text) => sum + text.length + 1, 0)
  const where = new Map<string, number>()
  let o = end - stringsSize
  for (const text of strings) {
    where.set(text, loRomAddress(o))
    for (let i = 0; i < text.length; i++) rom[o + i] = text.charCodeAt(i)
    o += text.length + 1
  }
  const titleTable = found.at
  pages.forEach((page, i) => writeU16LE(rom, titleTable + i * 2, where.get(page[0])!))
  const nameTable = titleTable + (pages.length + 1) * 2
  o = nameTable
  for (const page of pages) {
    for (const name of page.slice(1)) {
      writeU16LE(rom, o, where.get(name)!)
      o += 2
    }
    o += 2
  }
  for (const at of found.titlePointers) writeU16LE(rom, at, loRomAddress(titleTable))
  for (const at of found.namePointers) writeU16LE(rom, at, loRomAddress(nameTable))
  return true
}
