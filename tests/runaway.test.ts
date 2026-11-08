import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { detectHacks, hackRom, NO_HACKS, RUNAWAY_CODE, RUNAWAY_ONETIMER_CODE } from '../src/core/hacks'

const PFLAGS = 0x62
const PFLAGS3 = 0x64

// Runs the new code for a player whose flags are given, decoding the three
// instructions it uses from their bit fields: bclr #n,d16(a3), beq.s and rts.
function run(pflags: number, pflags3: number, code = RUNAWAY_CODE): { pflags: number; pflags3: number } {
  const memory = new Map<number, number>([
    [PFLAGS, pflags],
    [PFLAGS3, pflags3],
  ])
  let z = false
  let pc = 0
  for (let steps = 0; steps < 20; steps++) {
    const op = readU16(code, pc)
    if (op === 0x4e75) return { pflags: memory.get(PFLAGS)!, pflags3: memory.get(PFLAGS3)! }
    if ((op & 0xffc0) === 0x0880 && ((op >> 3) & 7) === 5 && (op & 7) === 3) {
      const bit = readU16(code, pc + 2) & 7
      const at = readU16(code, pc + 4)
      const value = memory.get(at) ?? 0
      z = ((value >> bit) & 1) === 0
      memory.set(at, value & ~(1 << bit))
      pc += 6
    } else if ((op & 0xff00) === 0x6700) {
      pc += 2
      if (z) pc += (op & 0x80 ? (op & 0xff) - 256 : op & 0xff)
    } else {
      throw new Error(`opcode ${op.toString(16)} is not in the interpreter`)
    }
  }
  throw new Error('runs away')
}

describe('the runaway speed fix', () => {
  it('clears the gliding flag as a fall ends, and only then', () => {
    // Getting up from a fall into the boards: both cleared.
    expect(run(0b0000_0001, 0b0010_0000)).toEqual({ pflags: 0, pflags3: 0 })
    // Another animation ending for a skater gliding onto a pass: the glide is kept.
    expect(run(0b0000_0001, 0)).toEqual({ pflags: 0b0000_0001, pflags3: 0 })
    // The other flags are left alone.
    expect(run(0b1111_1111, 0b1111_1111)).toEqual({ pflags: 0b1111_1110, pflags3: 0b1101_1111 })
  })

  it('clears the gliding flag as a one-timer ends, with the one-timer flag', () => {
    // A missed one-timer: pf3onetimer (bit 3) and the leftover pfdoff both cleared, nothing else.
    expect(run(0b0000_0001, 0b0000_1000, RUNAWAY_ONETIMER_CODE)).toEqual({ pflags: 0, pflags3: 0 })
    expect(run(0b1111_1111, 0b1111_1111, RUNAWAY_ONETIMER_CODE)).toEqual({ pflags: 0b1111_1110, pflags3: 0b1111_0111 })
  })
})

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

describe.skipIf(!existsSync(romPath))('the runaway speed fix in the ROM', () => {
  it('sends the pass receiver taken over to the exit that clears the flag, hooks the fall end, and comes out again', () => {
    const rom = new Uint8Array(readFileSync(romPath))
    // asspassrec: btst #pfjoycon,pflags(a3); bne.w assexit. Its own exit is bclr #pfdoff,pflags(a3); bra.w assexit.
    expect(Buffer.from(rom.subarray(0xeb98, 0xeba2)).toString('hex')).toBe('082b0003006266001aa6')
    const assexit = 0xeba0 + 0x1aa6
    expect(Buffer.from(rom.subarray(0xec68, 0xec6e)).toString('hex')).toBe('08ab00000062')
    expect(0xec70 + readU16(rom, 0xec70)).toBe(assexit)

    const hacked = hackRom(rom, { ...NO_HACKS, runawayFix: true })
    expect(0xeba0 + readU16(hacked, 0xeba0)).toBe(0xec68)
    expect(readU16(hacked, 0xaf76)).toBe(0x4eb9)
    const target = readU32(hacked, 0xaf78)
    expect(Buffer.from(hacked.subarray(target, target + RUNAWAY_CODE.length))).toEqual(Buffer.from(RUNAWAY_CODE))
    // The code after the hook is the game's own: btst #0,d1.
    expect(readU16(hacked, 0xaf7c)).toBe(0x0801)
    // EndOneTimer: movem.l d0/a0,-(sp), then the call, then its own bclr #pfalock.
    expect(readU16(hacked, 0xfeff0)).toBe(0x48e7)
    expect(readU16(hacked, 0xfeff4)).toBe(0x4eb9)
    const oneTimer = readU32(hacked, 0xfeff6)
    expect(Buffer.from(hacked.subarray(oneTimer, oneTimer + RUNAWAY_ONETIMER_CODE.length))).toEqual(Buffer.from(RUNAWAY_ONETIMER_CODE))
    expect(Buffer.from(hacked.subarray(0xfeffa, 0xff000)).toString('hex')).toBe('08ab00050062')
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, runawayFix: true }, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
    // Nothing else in the game's own code changes.
    const changed: number[] = []
    const added = (i: number) => (i >= target && i < target + RUNAWAY_CODE.length) || (i >= oneTimer && i < oneTimer + RUNAWAY_ONETIMER_CODE.length)
    for (let i = 0; i < rom.length; i++) if (hacked[i] !== rom[i] && !added(i)) changed.push(i)
    expect(
      changed.every((i) => (i >= 0xeba0 && i < 0xeba2) || (i >= 0xaf76 && i < 0xaf7c) || (i >= 0xfeff4 && i < 0xfeffa) || i === 0x18e || i === 0x18f),
    ).toBe(true)
  })
})

describe.skipIf(!existsSync(romPath))('the penalty shot table fix', () => {
  it('gives each foul its own penalty shot form, and comes out again', () => {
    const rom = new Uint8Array(readFileSync(romPath))
    // PenShotPenalties: a word for each penalty number (a word offset), its penalty shot form or -1.
    const table = (r: Uint8Array) => Array.from({ length: 24 }, (_, i) => readU16(r, 0x1913a + i * 2))
    const formOf = (r: Uint8Array, penalty: number) => table(r)[penalty / 2]
    const hacked = hackRom(rom, { ...NO_HACKS, penaltyShotTableFix: true })
    // Charging $16, slashing $18, roughing $1A, cross-checking $1C, hooking $1E, tripping $20, interference $22, holding $24.
    const own: [number, number][] = [[0x16, 0x38], [0x18, 0x3c], [0x1a, 0x36], [0x1c, 0x3a], [0x1e, 0x2e], [0x20, 0x30], [0x22, 0x34]]
    for (const [penalty, form] of own) expect(formOf(hacked, penalty)).toBe(form)
    expect(formOf(hacked, 0x24)).toBe(0xffff)
    expect(formOf(hacked, 0x14)).toBe(0xffff)
    // The original's: each one place early.
    expect(formOf(rom, 0x16)).toBe(0x3c)
    expect(formOf(rom, 0x22)).toBe(0xffff)
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, penaltyShotTableFix: true }, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
  })
})
