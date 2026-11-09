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

// Room to spare when the names are moved, so a few more letters fit later
// without moving them again.
const SPARE = 32

// Room the names must leave alone: the team data's overflow, the unused room
// at the end of the teams' bank that rosters grow into (in the original game
// the same bank as the names, and nearly all its unused room).
export type Avoid = { start: number; end: number } | undefined

// The longest run of unused bytes in the names' bank after their table, which
// the names can be moved to: [start, end), a byte left unused at each side.
function freeRun(rom: Uint8Array, p: Places, teamCount: number, avoid: Avoid): { start: number; end: number } | null {
  const bankStart = Math.floor(p.table / 0x8000) * 0x8000
  let best: { start: number; end: number } | null = null
  let start = -1
  for (let i = p.table + teamCount * 2; i <= bankStart + 0x8000; i++) {
    if (i < bankStart + 0x8000 && i < rom.length && rom[i] === 0xff && !(avoid && i >= avoid.start && i < avoid.end)) {
      if (start < 0) start = i
      continue
    }
    if (start >= 0 && (!best || i - start > best.end - best.start)) best = { start, end: i }
    start = -1
  }
  return best && best.end - best.start > 2 ? { start: best.start + 1, end: best.end - 1 } : null
}

// How many bytes the names take, and how many the ROM has room for: where
// they lie, or, if more, the unused room in their bank they can move to.
export function snesPlaceNameRoom(rom: Uint8Array, names: string[], avoid?: Avoid): { used: number; room: number } | null {
  const p = places(rom, names.length)
  if (!p) return null
  const free = freeRun(rom, p, names.length, avoid)
  return { used: names.reduce((sum, name) => sum + name.length + 1, 0), room: Math.max(p.end - p.start, free ? free.end - free.start : 0) }
}

// Writes the names, packed into their room. Where they have outgrown it, they
// move to unused room in their bank (the code reads them from its own bank),
// with some to spare, and their old room is freed. False, writing nothing,
// where they do not fit either way. The last name ends where the room does,
// so that the room, which is read again from where the names lie, is all
// still there after names are shortened: any to spare lies before it.
export function writeSnesPlaceNames(rom: Uint8Array, names: string[], avoid?: Avoid): boolean {
  let p = places(rom, names.length)
  if (!p) return false
  const used = names.reduce((sum, name) => sum + name.length + 1, 0)
  if (used > p.end - p.start) {
    const free = freeRun(rom, p, names.length, avoid)
    if (!free || used > free.end - free.start) return false
    rom.fill(0xff, p.start, p.end)
    p = { ...p, start: free.start, end: free.start + Math.min(used + SPARE, free.end - free.start) }
    found.delete(rom)
  }
  rom.fill(0, p.start, p.end)
  let at = p.start
  names.forEach((name, i) => {
    if (i === names.length - 1) at = p.end - (name.length + 1)
    rom[p.table + i * 2] = loRomAddress(at) & 0xff
    rom[p.table + i * 2 + 1] = loRomAddress(at) >> 8
    for (let k = 0; k < name.length; k++) rom[at + k] = name.charCodeAt(k) & 0x7f
    rom[at + name.length] = 0
    at += name.length + 1
  })
  return true
}
