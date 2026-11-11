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
// team pages (the H/F column). It goes into a ROM with the original game's
// code at all those places, as every league ROM the editor has seen has.
//
// Two things a league's ROM has of its own are carried over. McMarkis's menu
// code has its own copy of the main menu (its captions, choices and how many
// choices each line has, Fighting's among them), which in chaos's build is
// the original game's: on a league's ROM it would offer 28 teams and three
// period lengths whatever the league has set. So the editor makes the menu
// afresh from the ROM's own, with the Fighting line added, puts it after the
// patch, and points the five places that read it there: the captions
// (movea.l at $F807A), the choices (the movea.l in ReadNewMenuRam2), the
// period lengths' (cmpa.l at $F7BB8) and the two tables of how many choices
// (movea.l at $F79AA and $F79B8). And the patch moves the sprites' colours to
// follow the fight frames, writing the original game's; it is given the
// ROM's own.

export type FightChoice = 'none' | 'off' | 'on' | 'arcade'

export const FIGHT_TEXTS: Record<FightChoice, string> = {
  none: 'Not in the ROM',
  off: 'In the ROM, menu starts at Off',
  on: 'In the ROM, menu starts at On',
  arcade: 'In the ROM, menu starts at On - Arcade Mode',
}

// loadDefFight's move.w #DefFight,d0: the menu's starting choice, 0 Off, 1 On, 2 Arcade.
const DEFAULT_AT = 0x200ae4
// The menu's pointers, as above, and where the patch has Fighting's caption and choices.
const CAPTIONS_AT = 0xf807c
const CHOICES_AT = 0x209638
const PERIODS_AT = 0xf7bba
const LIMITS_AT = [0xf79ac, 0xf79ba]
const FIGHT_CAPTION = 0x2091ea
const FIGHT_CHOICES = 0x20956c
const CAPTION_BYTES = 16
const CHOICE_BYTES = 22
const FIGHT_CHOICE_COUNT = 3
// Where the editor puts the menu it makes: just after the patch.
const MENU_AT = 0x209640
// The original game's menu, as the patch reads it: nine lines.
const LINES = 9
const ORIGINAL_CHOICES_AT = 0xf7bb0
// The sprites' colours: SprTbl's first long is their distance from it.
const SPRITE_TABLE = 0x5de7a
const SPRITE_COLOURS = 0x80
// What may differ in a ROM with the patch: the starting choice, the menu's pointers and the sprites' colours.
const SKIPPED: [number, number][] = [
  [DEFAULT_AT, DEFAULT_AT + 2],
  [CHOICES_AT, CHOICES_AT + 4],
  [CAPTIONS_AT, CAPTIONS_AT + 4],
  [PERIODS_AT, PERIODS_AT + 4],
  ...LIMITS_AT.map((at): [number, number] => [at, at + 4]),
]
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

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put16 = (rom: Uint8Array, at: number, v: number) => rom.set([(v >> 8) & 0xff, v & 0xff], at)
const put32 = (rom: Uint8Array, at: number, v: number) => rom.set([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff], at)

const same = (rom: Uint8Array, at: number, bytes: Uint8Array, skips: [number, number][] = []) => {
  if (at + bytes.length > rom.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (skips.some(([from, to]) => at + i >= from && at + i < to)) continue
    if (rom[at + i] !== bytes[i]) return false
  }
  return true
}

// Where the patched ROM keeps the sprites' colours.
const coloursAt = (rom: Uint8Array) => SPRITE_TABLE + u32(rom, SPRITE_TABLE)
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
  const choice = rom.length >= DEFAULT_AT + 2 ? DEFAULTS[u16(rom, DEFAULT_AT)] : undefined
  if (!choice) return undefined
  const skips: [number, number][] = [...SKIPPED, [coloursAt(rom), coloursAt(rom) + SPRITE_COLOURS]]
  return changes.every((c) => same(rom, c.at, c.patched, skips)) && blocks.every((b) => same(rom, b.at, b.bytes, skips)) ? choice : undefined
}

// The ROM without the patch: the original game's code back, the added code
// cleared, and the ROM as small as what is left in it allows.
export function withoutFight(rom: Uint8Array): Uint8Array {
  const state = fightState(rom)
  if (state === undefined || state === 'none') return rom
  const { changes, blocks } = patch()
  const out = rom.slice()
  const menuEnd = Math.max(...LIMITS_AT.map((at) => u32(rom, at) + (LINES + 1) * 2))
  // The size the ROM had, which the editor noted after its menu.
  const noted = menuEnd + SIZE_MARK.length + 4 <= rom.length && SIZE_MARK.every((b, i) => rom[menuEnd + i] === b) ? u32(rom, menuEnd + SIZE_MARK.length) : 0
  for (const c of changes) out.set(c.original, c.at)
  for (const b of blocks) out.fill(0xff, b.at, b.at + b.bytes.length)
  if (menuEnd > MENU_AT && menuEnd + SIZE_MARK.length + 4 <= out.length) out.fill(0xff, MENU_AT, menuEnd + SIZE_MARK.length + 4)
  let length = out.length
  if (noted > 0 && noted < length && unused(out, noted, length - noted)) length = noted
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
  if (differs.length > 0) return "This ROM's code differs from the original game's where the fighting patch goes, so the patch would not fit it."
  if (!ownMenu(rom)) return "This ROM's main menu is not as the original game has it, so the fighting patch's menu could not be made from it."
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
  const colours = base.slice(coloursAt(base), coloursAt(base) + SPRITE_COLOURS)
  const menu = ownMenu(base)!
  for (const c of changes) out.set(c.patched, c.at)
  for (const b of blocks) out.set(b.bytes, b.at)
  put16(out, DEFAULT_AT, DEFAULTS.indexOf(choice))
  out.set(colours, coloursAt(out))
  const end = writeMenu(out, menu)
  // The ROM's size before the patch, so that taking it out gives it back.
  out.set(SIZE_MARK, end)
  put32(out, end + SIZE_MARK.length, base.length)
  return out
}

interface OwnMenu {
  captions: Uint8Array
  // The choices table's words and the texts after them, and where the period lengths' start in it.
  offsets: number[]
  texts: Uint8Array
  periods: number
  limits: number[][]
}

// The ROM's own main menu, as the original game's code reads it; null where it is not found.
function ownMenu(rom: Uint8Array): OwnMenu | null {
  if (u16(rom, CAPTIONS_AT - 2) !== 0x227c || u16(rom, ORIGINAL_CHOICES_AT - 2) !== 0x207c || u16(rom, PERIODS_AT - 2) !== 0xb1fc) return null
  if (LIMITS_AT.some((at) => u16(rom, at - 2) !== 0x267c)) return null
  const captionsAt = u32(rom, CAPTIONS_AT)
  let end = captionsAt
  for (let i = 0; i < LINES; i++) {
    const size = u16(rom, end)
    if (size < 3 || size > 40) return null
    end += size
  }
  // The four bytes after the last caption, as the original game has them.
  const captions = rom.slice(captionsAt, end + 4)
  const table = u32(rom, ORIGINAL_CHOICES_AT)
  if (table + LINES * 2 > rom.length || u16(rom, table) !== LINES * 2) return null
  const offsets = Array.from({ length: LINES }, (_, i) => u16(rom, table + i * 2))
  const starts = offsets.map((o) => table + o)
  const size = u16(rom, Math.min(...starts))
  if (size !== CHOICE_BYTES) return null
  let last = Math.max(...starts)
  while (last + 2 <= rom.length && u16(rom, last) === size) last += size
  const periods = u32(rom, PERIODS_AT) - table
  if (periods < LINES * 2 || table + periods >= last) return null
  const limits = LIMITS_AT.map((at) => {
    const limitsAt = u32(rom, at)
    return Array.from({ length: LINES }, (_, i) => u16(rom, limitsAt + i * 2))
  })
  return { captions, offsets, texts: rom.slice(table + LINES * 2, last), periods, limits }
}

// After the menu: 'N4WF' and the ROM's size before the patch.
const SIZE_MARK = [0x4e, 0x34, 0x57, 0x46]

// The menu made from the ROM's own with the Fighting line, after the patch,
// and the patch's code pointed at it. Where it ends.
function writeMenu(rom: Uint8Array, menu: OwnMenu): number {
  const even = (at: number) => at + (at & 1)
  // Captions: the ROM's nine, Fighting's, then the four bytes that end them.
  const captionsAt = MENU_AT
  const nine = menu.captions.length - 4
  rom.set(menu.captions.subarray(0, nine), captionsAt)
  rom.set(rom.slice(FIGHT_CAPTION, FIGHT_CAPTION + CAPTION_BYTES), captionsAt + nine)
  rom.set(menu.captions.subarray(nine), captionsAt + nine + CAPTION_BYTES)
  // Choices: ten offsets, the ROM's texts moved on by the tenth's two bytes, then Fighting's.
  const choicesAt = even(captionsAt + menu.captions.length + CAPTION_BYTES)
  const words = (LINES + 1) * 2
  menu.offsets.forEach((o, i) => put16(rom, choicesAt + i * 2, o + 2))
  put16(rom, choicesAt + LINES * 2, words + menu.texts.length)
  rom.set(menu.texts, choicesAt + words)
  rom.set(rom.slice(FIGHT_CHOICES, FIGHT_CHOICES + FIGHT_CHOICE_COUNT * CHOICE_BYTES), choicesAt + words + menu.texts.length)
  // How many choices each line has, the ROM's, and Fighting's three.
  let at = even(choicesAt + words + menu.texts.length + FIGHT_CHOICE_COUNT * CHOICE_BYTES)
  const limitsAt: number[] = []
  for (const limits of menu.limits) {
    limitsAt.push(at)
    limits.forEach((n, i) => put16(rom, at + i * 2, n))
    put16(rom, at + LINES * 2, FIGHT_CHOICE_COUNT)
    at += (LINES + 1) * 2
  }
  put32(rom, CAPTIONS_AT, captionsAt)
  put32(rom, CHOICES_AT, choicesAt)
  put32(rom, PERIODS_AT, choicesAt + menu.periods + 2)
  LIMITS_AT.forEach((pointer, i) => put32(rom, pointer, limitsAt[i]))
  return at
}
