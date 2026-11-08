import { readU16LE as readU16, writeU16LE as writeU16 } from './bytes'
import type { MenuItem } from './settings'
import { findCode, loRomOffset } from './snes'

// The SNES game's Game Setup menu: the choice each line starts on when the
// game is switched on. DefaultMenus copies a table of words into the option
// block (play mode, home, visitor, period, penalties, line changes, goalie,
// then a controller word that is no menu line). The 32-team builds add an
// eighth line, Fighting, whose starting choice is set by code just after the
// copy. setoptions keeps how many choices each line has, and where its texts
// are. Everything is found by the code that uses it, so it is found in ROMs
// whose code has moved.

// lda #$FFFF; sta.l notdemo; a0 = the option block; a1 = the table; ldx #count-1; copy loop.
const DEFAULT_MENUS = 'a9ffff8fcc34..a9..00858ba9bc348589a9(..)00858fa9(....)858da00000a2(..)00b78d9789c8c8ca10f7'
// The 32-team builds then set the Fighting line: lda #value; sta.l address.
const FIGHTING_DEFAULT = 'a9(....)8f(....)..'
// setoptions: a3 = the table of choice counts; stz d5.
const CHOICE_COUNTS = 'a9(..)008597a9(....)859564b9'
// setoptions: a0 = the table of where each line's texts start.
const CHOICE_TEXTS = 'a9(..)00858ba9(....)85891877898589'
// setoptions: the Fighting line's values sit in another block (cpy #$000E; bne; lda #base; sta a2).
const FIGHTING_BLOCK = 'c00e00d005a9(....)8591'

export const SNES_MENU_CAPTIONS = ['Play Mode', 'Home', 'Visitor', 'Period', 'Penalties', 'Line Changes', 'Goalie', 'Fighting']
export const SNES_MENU_TEAM_ITEMS = [1, 2]

interface Places {
  // Where each line's starting choice is in the ROM.
  values: number[]
  counts: number
  texts: number
}

function places(rom: Uint8Array): Places | null {
  const defaults = findCode(rom, DEFAULT_MENUS)
  const counts = findCode(rom, CHOICE_COUNTS)
  const texts = findCode(rom, CHOICE_TEXTS)
  if (!defaults || !counts || !texts) return null
  const [bank, address, last] = defaults.groups
  // The table has a word for each of the seven lines and the controller word.
  if (last !== 7) return null
  const table = loRomOffset(bank, address)
  const values = [0, 1, 2, 3, 4, 5, 6].map((line) => table + line * 2)
  const countsAt = loRomOffset(counts.groups[0], counts.groups[1])
  const textsAt = loRomOffset(texts.groups[0], texts.groups[1])
  const lines = (textsAt - countsAt) / 2
  if (lines === 8) {
    // The Fighting line's starting choice is stored where setoptions reads it.
    const after = defaults.at + DEFAULT_MENUS.replace(/\(|\)/g, '').length / 2
    const fighting = findCode(rom.subarray(after, after + 7), FIGHTING_DEFAULT)
    const block = findCode(rom, FIGHTING_BLOCK)
    if (!fighting || fighting.at !== 0 || !block || fighting.groups[1] !== ((block.groups[0] + 0x0e) & 0xffff)) return null
    values.push(after + 1)
  } else if (lines !== 7) return null
  return { values, counts: countsAt, texts: textsAt }
}

// The menu's lines and the choice each starts on, or none where the menu is not found.
export function parseSnesMenu(rom: Uint8Array): MenuItem[] {
  const at = places(rom)
  if (!at) return []
  return at.values.map((place, line) => {
    const value = readU16(rom, place)
    // The team lines' choices are the teams.
    if (SNES_MENU_TEAM_ITEMS.includes(line)) return { caption: SNES_MENU_CAPTIONS[line], options: null, value }
    const count = readU16(rom, at.counts + line * 2)
    let text = at.texts + readU16(rom, at.texts + line * 2)
    const options: string[] = []
    for (let i = 0; i < count; i++) {
      const size = readU16(rom, text)
      if (size < 2 || size > 40) break
      options.push(String.fromCharCode(...rom.subarray(text + 2, text + size)).trimEnd())
      text += size
    }
    return { caption: SNES_MENU_CAPTIONS[line], options, value }
  })
}

// The menu's lines as the ROM now has them (a hack can change how many
// choices a line has), each starting on the choice in `menu`.
export function refreshSnesMenu(rom: Uint8Array, menu: MenuItem[]): MenuItem[] {
  const now = parseSnesMenu(rom)
  return now.length === menu.length ? now.map((item, i) => ({ ...item, value: menu[i].value })) : menu
}

export function writeSnesMenu(rom: Uint8Array, menu: MenuItem[]): void {
  const at = places(rom)
  if (!at || at.values.length !== menu.length) return
  menu.forEach((item, line) => writeU16(rom, at.values[line], item.value))
}

// Where `count` texts of a line's list of choices are, each a length word and
// the text, or none where they are not found. The Period line's list has a
// fourth, 30 seconds, after the three the menu offers.
export function snesChoiceTextPlaces(rom: Uint8Array, line: number, count: number): number[] {
  const texts = findCode(rom, CHOICE_TEXTS)
  if (!texts) return []
  const table = loRomOffset(texts.groups[0], texts.groups[1])
  const places: number[] = []
  let at = table + readU16(rom, table + line * 2)
  for (let i = 0; i < count; i++) {
    const size = readU16(rom, at)
    if (size < 3 || size > 40 || at + size > rom.length) return []
    places.push(at)
    at += size
  }
  return places
}

// Where setoptions' table of how many choices each line has is (a word a
// line), or -1 where it is not found.
export function snesChoiceCountsPlace(rom: Uint8Array): number {
  const counts = findCode(rom, CHOICE_COUNTS)
  return counts ? loRomOffset(counts.groups[0], counts.groups[1]) : -1
}

// Where the Period line's choice count is (a word: 3, or 4 with the
// 30-second periods hack), where its list has the fourth text to show.
export function snesPeriodCountPlace(rom: Uint8Array): number {
  const counts = findCode(rom, CHOICE_COUNTS)
  if (!counts || snesChoiceTextPlaces(rom, 3, 4).length !== 4) return -1
  return loRomOffset(counts.groups[0], counts.groups[1]) + 3 * 2
}
