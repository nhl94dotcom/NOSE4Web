// McMarkis's fighting for NHL '94 on the SNES (see snesfightdata.ts): the
// NHLPA 93 SNES fights, with their frames, sounds' use, penalties and box.
//
// It changes a few places in the original game's first megabyte (its hooks,
// the sprite frame table and the ROM size) and adds one block, the fight
// frames and code, to a bank of the second megabyte ($A0 to $BF), which it
// grows the ROM to. A league ROM may already use bank $A0 (SDL16 does), so
// the block goes in the first bank whose room for it is unused; the bytes
// that hold its bank (relocFirst, relocBlock) are moved with it. Only for
// ROMs with the original game's code in place: the SA-1 builds are another
// program.
//
// Its one setting: the bonus added to each player's fighting rating (stored
// 0 to 14, even) before the game asks for 10 to fight. McMarkis's default is
// 2, as the 94 rosters rate fighters about 2 lower than NHLPA 93's.
//
// After the block a mark, 'N4WF', the ROM's length before and its header's
// ROM size, so that taking the fights out gives the ROM back as it was.

import { snesCodeInPlace } from './snes'
import { SNES_FIGHT } from './snesfightdata'

export const SNES_FIGHT_BONUS_DEFAULT = 2
export const SNES_FIGHT_BONUS_RANGE: [number, number] = [0, 8]

const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const CHANGES = SNES_FIGHT.changes.map((c) => ({ at: c.at, original: decode(c.original), patched: decode(c.patched) }))
const BLOCK = decode(SNES_FIGHT.block)
const RELOC_FIRST = new Set<number>(SNES_FIGHT.relocFirst)
const RELOC_BLOCK = new Set<number>(SNES_FIGHT.relocBlock)
const BONUS: readonly number[] = SNES_FIGHT.bonus
const BASE_BANK = 0xa0
const LAST_BANK = 0xbf
const SECOND_MB = 0x100000
const FULL_SIZE = 0x200000
const SIZE_BYTE = 0x7fd7
const MARK = [0x4e, 0x34, 0x57, 0x46] // 'N4WF'
const MARK_SIZE = 4 + 4 + 1

const bankAt = (bank: number) => SECOND_MB + (bank - BASE_BANK) * 0x8000
// The block's bytes for a bank, with a bonus.
function blockFor(bank: number, bonus: number): Uint8Array {
  const out = BLOCK.slice()
  for (const i of RELOC_BLOCK) out[i] = (out[i] + bank - BASE_BANK) & 0xff
  for (const at of BONUS) {
    out[at] = bonus & 0xff
    out[at + 1] = (bonus >> 8) & 0xff
  }
  return out
}
// A change's patched bytes for a bank.
const patchedFor = (change: (typeof CHANGES)[number], bank: number) =>
  change.patched.map((byte, i) => (RELOC_FIRST.has(change.at + i) ? (byte + bank - BASE_BANK) & 0xff : byte))

const same = (rom: Uint8Array, at: number, bytes: Uint8Array, skip: (i: number) => boolean = () => false) =>
  at + bytes.length <= rom.length && bytes.every((byte, i) => skip(i) || rom[at + i] === byte)

export type SnesFightState = { kind: 'none' } | { kind: 'in'; bank: number; bonus: number }

// FallDown's place where a check is counted ($9E:9BD2), which the fights and the SNES injury risk both hook.
// With both, the fights' jml goes instead to the injury risk's stub, which jumps on to F_countcheck (sneshacks.ts).
export const SNES_FIGHT_SHARED_SITE = 0xf1bd2
// The fights' 5 bytes there for a bank: jml F_countcheck, nop.
export function snesFightCountJump(bank: number): Uint8Array {
  return patchedFor(CHANGES.find((c) => c.at === SNES_FIGHT_SHARED_SITE)!, bank)
}

// Whether the fights are in, and their bank and bonus; undefined where the ROM's code there is something else.
// `ignore`: places another hack may hold (the injury risk's hook), for telling that the fights are out.
export function snesFightState(rom: Uint8Array, ignore: number[] = []): SnesFightState | undefined {
  if (rom.length < SECOND_MB || !snesCodeInPlace(rom)) return undefined
  if (CHANGES.every((c) => ignore.includes(c.at) || same(rom, c.at, c.original))) return { kind: 'none' }
  const probe = SNES_FIGHT.relocFirst[0]
  const change = CHANGES.find((c) => probe >= c.at && probe < c.at + c.patched.length)!
  const bank = BASE_BANK + ((rom[probe] - change.patched[probe - change.at]) & 0xff)
  if (bank > LAST_BANK) return undefined
  if (!CHANGES.every((c) => ignore.includes(c.at) || same(rom, c.at, patchedFor(c, bank)))) return undefined
  const at = bankAt(bank)
  const bonus = rom[at + BONUS[0]] | (rom[at + BONUS[0] + 1] << 8)
  const expected = blockFor(bank, bonus)
  if (!same(rom, at, expected) || !markAt(rom, at + BLOCK.length)) return undefined
  return { kind: 'in', bank, bonus }
}

const markAt = (rom: Uint8Array, at: number) => MARK.every((byte, i) => rom[at + i] === byte)

// The first bank of the second megabyte with room for the block and its mark unused, or beyond the ROM's end.
function freeBank(rom: Uint8Array): number {
  for (let bank = BASE_BANK; bank <= LAST_BANK; bank++) {
    const at = bankAt(bank)
    let free = true
    for (let i = at; i < at + BLOCK.length + MARK_SIZE && i < rom.length; i++) {
      if (rom[i] !== 0xff) {
        free = false
        break
      }
    }
    if (free) return bank
  }
  return -1
}

export class SnesFightError extends Error {}

// Why the fights cannot go into this ROM, or null if they can.
export function snesFightBlocked(rom: Uint8Array): string | null {
  if (!snesCodeInPlace(rom)) return "This ROM's game code is not laid out as the original game's (as in the SA-1 builds), so the fighting patch would not fit it."
  if (rom.length > FULL_SIZE) return 'This ROM is bigger than 2 MB.'
  const state = snesFightState(rom)
  if (state === undefined) return "This ROM's code differs from the original game's where the fighting patch goes."
  if (state.kind === 'none' && freeBank(rom) < 0) return 'This ROM has no bank left in its second megabyte with room for the fight frames and code.'
  return null
}

// The ROM with the fights in, or with their bonus changed if they are in already.
export function withSnesFight(rom0: Uint8Array, bonus = SNES_FIGHT_BONUS_DEFAULT): Uint8Array {
  if (!Number.isInteger(bonus) || bonus < SNES_FIGHT_BONUS_RANGE[0] || bonus > SNES_FIGHT_BONUS_RANGE[1]) {
    throw new SnesFightError(`The fighting bonus must be a whole number from ${SNES_FIGHT_BONUS_RANGE[0]} to ${SNES_FIGHT_BONUS_RANGE[1]}.`)
  }
  const blocked = snesFightBlocked(rom0)
  if (blocked) throw new SnesFightError(blocked)
  const state = snesFightState(rom0)!
  if (state.kind === 'in') {
    const rom = rom0.slice()
    rom.set(blockFor(state.bank, bonus).subarray(BONUS[0], BONUS[0] + 2), bankAt(state.bank) + BONUS[0])
    rom.set(blockFor(state.bank, bonus).subarray(BONUS[1], BONUS[1] + 2), bankAt(state.bank) + BONUS[1])
    return rom
  }
  const bank = freeBank(rom0)
  const rom = new Uint8Array(Math.max(rom0.length, FULL_SIZE)).fill(0xff)
  rom.set(rom0)
  const at = bankAt(bank)
  rom.set(blockFor(bank, bonus), at)
  const mark = at + BLOCK.length
  rom.set(MARK, mark)
  new DataView(rom.buffer).setUint32(mark + 4, rom0.length, true)
  rom[mark + 8] = rom0[SIZE_BYTE]
  for (const c of CHANGES) rom.set(patchedFor(c, bank), c.at)
  return rom
}

// The ROM with the fights taken out: the game as it was, and its length.
export function withoutSnesFight(rom0: Uint8Array): Uint8Array {
  const state = snesFightState(rom0)
  if (state?.kind !== 'in') return rom0
  const rom = rom0.slice()
  for (const c of CHANGES) rom.set(c.original, c.at)
  const at = bankAt(state.bank)
  const mark = at + BLOCK.length
  const length = new DataView(rom.buffer).getUint32(mark + 4, true)
  rom[SIZE_BYTE] = rom0[mark + 8]
  rom.fill(0xff, at, mark + MARK_SIZE)
  // Back to its length, if nothing else has been put past it since.
  if (length >= SECOND_MB && length < rom.length && rom.subarray(length).every((byte) => byte === 0xff)) return rom.slice(0, length)
  return rom
}
