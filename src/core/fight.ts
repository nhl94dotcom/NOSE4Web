import { FIGHT_BLOCKS, FIGHT_CHANGES } from './fightdata'

// chaos's fighting patch for NHL 94 on the Genesis (github.com/Chaos81/nhl94-patches,
// 94_fight, version 1.01, MIT licence; see fightdata.ts). It brings NHLPA 93's
// fights into the game: its fighting code and fight animations, a main menu
// line Fighting: Off, On or On - Arcade Mode (McMarkis's menu code), the
// players' fighting ratings shown from 0 to 100 on the roster screens, and
// fixes of its own (replays, the shootout line-up). Its code goes past 2 MB, so
// the ROM becomes 3 MB, and the game's save memory, which the console puts at
// 2 MB, is switched in only while the game reads or writes it (94_expand, the
// cartridge's $A130F1). Genesis Plus GX, which the leagues use, honours that.
//
// NOSE4Web puts in the patch as chaos's own build has it for the original game:
// his bytes at the 31 places he changes in its first megabyte, his switching
// code at $1F9A00 and his fighting code from $200100. It leaves out what his
// build also changes for his own ROM: its title screen, credits, name and
// serial number, and the players' fighting ratings, which a league sets on the
// team pages (the H/F column). For now it goes only into a ROM with the
// original game's code at all those places; ROMs with other teams' tables come
// later.

export type FightChoice = 'none' | 'off' | 'on' | 'arcade'

export const FIGHT_TEXTS: Record<FightChoice, string> = {
  none: 'Not in the ROM',
  off: 'In the ROM, menu starts at Off',
  on: 'In the ROM, menu starts at On',
  arcade: 'In the ROM, menu starts at On - Arcade Mode',
}

// loadDefFight's move.w #DefFight,d0: the menu's starting choice, 0 Off, 1 On, 2 Arcade.
const DEFAULT_AT = 0x200ae4
const DEFAULTS: FightChoice[] = ['off', 'on', 'arcade']
export const FIGHT_ROM_SIZE = 0x300000

const decode = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
let data: { changes: { at: number; original: Uint8Array; patched: Uint8Array }[]; blocks: { at: number; bytes: Uint8Array }[] } | null = null
function patch() {
  data ??= {
    changes: FIGHT_CHANGES.map((c) => ({ at: c.at, original: decode(c.original), patched: decode(c.patched) })),
    blocks: FIGHT_BLOCKS.map((b) => ({ at: b.at, bytes: decode(b.bytes) })),
  }
  return data
}

const same = (rom: Uint8Array, at: number, bytes: Uint8Array, skip?: [number, number]) => {
  if (at + bytes.length > rom.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (skip && at + i >= skip[0] && at + i < skip[1]) continue
    if (rom[at + i] !== bytes[i]) return false
  }
  return true
}
const unused = (rom: Uint8Array, at: number, length: number) => {
  for (let i = at; i < at + length; i++) if (i < rom.length && rom[i] !== 0xff) return false
  return true
}

// What the ROM has: the patch with its menu's starting choice; none, where
// nothing is where the patch puts its code (whatever else the ROM has, which
// fightBlocked judges); or undefined where something else is there.
export function fightState(rom: Uint8Array): FightChoice | undefined {
  const { changes, blocks } = patch()
  if (blocks.every((b) => unused(rom, b.at, b.bytes.length))) return 'none'
  const choice = rom.length >= DEFAULT_AT + 2 ? DEFAULTS[(rom[DEFAULT_AT] << 8) | rom[DEFAULT_AT + 1]] : undefined
  if (!choice) return undefined
  const fixed: [number, number] = [DEFAULT_AT, DEFAULT_AT + 2]
  return changes.every((c) => same(rom, c.at, c.patched)) && blocks.every((b) => same(rom, b.at, b.bytes, fixed)) ? choice : undefined
}

// The ROM without the patch: the original game's code back, the added code
// cleared, and the ROM as small as what is left in it allows.
export function withoutFight(rom: Uint8Array): Uint8Array {
  const state = fightState(rom)
  if (state === undefined || state === 'none') return rom
  const { changes, blocks } = patch()
  const out = rom.slice()
  for (const c of changes) out.set(c.original, c.at)
  for (const b of blocks) out.fill(0xff, b.at, b.at + b.bytes.length)
  let length = out.length
  for (const size of [0x200000, 0x100000]) if (length > size && unused(out, size, length - size)) length = size
  return length === out.length ? out : out.slice(0, length)
}

// Why the patch cannot go into this ROM, or null where it can.
export function fightBlocked(rom: Uint8Array): string | null {
  const state = fightState(rom)
  if (state !== undefined && state !== 'none') return null
  const { changes, blocks } = patch()
  const differs = changes.filter((c) => !same(rom, c.at, c.original))
  if (differs.some((c) => c.at === 0x5de7c)) return 'Head bleeding is in this ROM, and it and the fighting patch both add animation frames; the two cannot be in one ROM yet.'
  if (differs.length > 0) {
    return "This ROM's code or animation tables differ from the original game's where the fighting patch goes, as in league ROMs with other teams; for now it goes only into ROMs with the original game's."
  }
  if (rom.length > FIGHT_ROM_SIZE) return 'This ROM is larger than 3 MB.'
  if (!blocks.every((b) => unused(rom, b.at, b.bytes.length))) return 'Something is already in this ROM where the fighting patch puts its code (at 2 MB).'
  return null
}

// The ROM with the patch in, its menu starting at `choice`.
export function withFight(rom: Uint8Array, choice: Exclude<FightChoice, 'none'>): Uint8Array {
  const base = withoutFight(rom)
  const blocked = fightBlocked(base)
  if (blocked) throw new Error(blocked)
  const { changes, blocks } = patch()
  const out = new Uint8Array(Math.max(FIGHT_ROM_SIZE, base.length)).fill(0xff)
  out.set(base)
  for (const c of changes) out.set(c.patched, c.at)
  for (const b of blocks) out.set(b.bytes, b.at)
  const value = DEFAULTS.indexOf(choice)
  out[DEFAULT_AT] = value >> 8
  out[DEFAULT_AT + 1] = value & 0xff
  return out
}
