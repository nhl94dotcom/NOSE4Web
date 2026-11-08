import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'

// The SNES game's team place names (TeamPlaceNames), which it draws as letter
// sprites on the team blocks (the name banners of Game Setup, Player Select,
// the matchups, the horizontal scoreboard, the player card's team page) and
// in the playoff bracket. They are a table of their own, a word address a
// team in the same bank, then the names, each ended by 0, and not the team's
// names in its own data, so a team renamed there keeps its old name on screen
// unless these are changed too. (abdulahmad/NHL94SNES: PrintTeamSprites,
// DrawSelectTeam, PlayoffScreen.)

// PrintTeamSprites: phb; phk; plb; stx letterx; sty lettery; stz r3; stz r3+2;
// lda d1; pha; bmi; asl; tay; lda.w TeamPlaceNames,y; sta d1.
const LOADER = '8b4bab8e....8c....641464..a5..4830..0aa8b9(....)85..'

interface Places {
  table: number
  bank: number
  // The room the names take: from the first to the end of the last.
  start: number
  end: number
}

const found = new WeakMap<Uint8Array, Places | null>()

function places(rom: Uint8Array, teamCount: number): Places | null {
  if (found.has(rom)) return found.get(rom)!
  let result: Places | null = null
  const code = findCode(rom, LOADER)
  if (code && code.groups[0] >= 0x8000) {
    const bank = loRomBank(code.at, 0x80)
    const table = loRomOffset(bank, code.groups[0])
    const at = Array.from({ length: teamCount }, (_, i) => rom[table + i * 2] | (rom[table + i * 2 + 1] << 8))
    if (at.every((address) => address >= 0x8000)) {
      const offsets = at.map((address) => loRomOffset(bank, address))
      const ends = offsets.map((o) => {
        let end = o
        while (end < rom.length && rom[end] !== 0 && end - o < 32) end++
        return rom[end] === 0 ? end + 1 : -1
      })
      const start = Math.min(...offsets)
      // The names lie together after the table, and each is plain text.
      if (ends.every((e) => e > 0) && start >= table + teamCount * 2 && offsets.every((o, i) => Array.from(rom.subarray(o, ends[i] - 1)).every((c) => c >= 0x20 && c < 0x7f))) {
        result = { table, bank, start, end: Math.max(...ends) }
      }
    }
  }
  found.set(rom, result)
  return result
}

export function readSnesPlaceNames(rom: Uint8Array, teamCount: number): string[] | null {
  const p = places(rom, teamCount)
  if (!p) return null
  return Array.from({ length: teamCount }, (_, i) => {
    let o = loRomOffset(p.bank, rom[p.table + i * 2] | (rom[p.table + i * 2 + 1] << 8))
    let text = ''
    while (rom[o] !== 0) text += String.fromCharCode(rom[o++])
    return text
  })
}

// How many bytes the names take, and how many the ROM has room for.
export function snesPlaceNameRoom(rom: Uint8Array, names: string[]): { used: number; room: number } | null {
  const p = places(rom, names.length)
  if (!p) return null
  return { used: names.reduce((sum, name) => sum + name.length + 1, 0), room: p.end - p.start }
}

// Writes the names, packed into their room. False, writing nothing, where
// they do not fit.
export function writeSnesPlaceNames(rom: Uint8Array, names: string[]): boolean {
  const p = places(rom, names.length)
  if (!p) return false
  const room = snesPlaceNameRoom(rom, names)!
  if (room.used > room.room) return false
  rom.fill(0, p.start, p.end)
  let at = p.start
  names.forEach((name, i) => {
    rom[p.table + i * 2] = loRomAddress(at) & 0xff
    rom[p.table + i * 2 + 1] = loRomAddress(at) >> 8
    for (let k = 0; k < name.length; k++) rom[at + k] = name.charCodeAt(k) & 0x7f
    rom[at + name.length] = 0
    at += name.length + 1
  })
  return true
}
