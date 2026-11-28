import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SnesHackError } from '../src/core/sneshacks'
import { SNES_INTREPORT_CODE16, SNES_INTREPORT_CODE24, SNES_INTREPORT_RAM16, SNES_INTREPORT_SA1_RAM_MOVE } from '../src/core/snesintreportcode'
const readWord = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8)
import { expectSameBytes } from './samebytes'
import { otherSnesHacks, snesHackBase } from './sneshelp'

// Match Viewer's intermission report on the SNES (sneshacks.ts, intermissionReport): the seven ROMs Match Viewer
// tested it on, each with the hooks and routine CRC32 of Match Viewer's settings.txt (the routine as assembled at
// $A0:8000), and builds it is not made for.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const offset = (address: number) => loRomOffset(address >> 16, address & 0xffff)
const long = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8)
  return ((c ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

const RETAIL = { hookA: 0x9fa2e6, hookAOriginal: '227aa39f', hookB: 0x9fa393, hookBOriginal: 'ad2f0df022', routine: 'D0705B89' }
const BUILDS: Record<string, typeof RETAIL> = {
  'NHL94.smc': RETAIL,
  'NHL94_Classic.smc': RETAIL,
  'NHL94-2on2-xstioph-fix2.smc': RETAIL,
  'pond_hockey_nhl94_1min.smc': RETAIL,
  'nhl94snes_2026.sfc': { hookA: 0x9fa2f5, hookAOriginal: '2289a39f', hookB: 0x9fa3a2, hookBOriginal: 'ad2f0df022', routine: '9EF78B70' },
  'nhl94_2026.sfc': { hookA: 0x9fa34f, hookAOriginal: '22e3a39f', hookB: 0x9fa3fc, hookBOriginal: 'ad2f6df022', routine: '20138CE9' },
  'nhl94snes_SA1.sfc': { hookA: 0x9fa34f, hookAOriginal: '22e3a39f', hookB: 0x9fa3fc, hookBOriginal: 'ad2f6df022', routine: '88C9C4A6' },
}
const ROUTINE_LENGTH = 2368
// The built ROMs' CRC32s from Match Viewer's assembly of intreport94s_patch.asm on each base, at the code address
// NOSE4Web places it ($9B:F6C0) and its RAM ($7E:EF00, SA-1 $40:5700).
const ASSEMBLED: Record<string, string> = {
  'NHL94.smc': '89D12D73',
  'NHL94_Classic.smc': '809A0BA0',
  'NHL94-2on2-xstioph-fix2.smc': '988B50B2',
  'pond_hockey_nhl94_1min.smc': '4CB8E3E3',
  'nhl94snes_2026.sfc': '9140E179',
  'nhl94_2026.sfc': '012B86D4',
  'nhl94snes_SA1.sfc': 'EDB74B22',
}

// The code at `at` (bank:address `target`) moved back to $A0:8000, where Match Viewer assembled it.
function atA08000(code: Uint8Array, target: number, ramMove: number): Uint8Array {
  const back = code.slice()
  for (const field of SNES_INTREPORT_RAM16) {
    const value = (back[field] | (back[field + 1] << 8)) - ramMove
    back[field] = value & 0xff
    back[field + 1] = (value >> 8) & 0xff
  }
  const moved = (target & 0xffff) - 0x8000
  for (const field of SNES_INTREPORT_CODE16) {
    const value = (back[field] | (back[field + 1] << 8)) - moved
    back[field] = value & 0xff
    back[field + 1] = (value >> 8) & 0xff
  }
  for (const field of SNES_INTREPORT_CODE24) {
    const value = (back[field] | (back[field + 1] << 8)) - moved
    back[field] = value & 0xff
    back[field + 1] = (value >> 8) & 0xff
    expect(back[field + 2]).toBe(target >> 16)
    back[field + 2] = 0xa0
  }
  return back
}

for (const [name, build] of Object.entries(BUILDS)) {
  describe.skipIf(!existsSync(path(name)))(`the SNES intermission report in ${name}`, () => {
    it('is offered, hooks Intermission and IntermissionTick, places the routine for its build, and comes out byte for byte', () => {
      const project = open(name)
      const before = detectSnesHacks(project.bytes)
      expect(before.choices.intermissionReport).toBe(false)
      expect(before.unknown).not.toContain('intermissionReport')
      expect(before.notOffered?.intermissionReport).toBeUndefined()
      const [hookA, hookB] = [offset(build.hookA), offset(build.hookB)]
      expect(hex(project.bytes, hookA, 4)).toBe(build.hookAOriginal)
      expect(hex(project.bytes, hookB, 5)).toBe(build.hookBOriginal)

      const on = applySnesHacks(project, { intermissionReport: true })
      expect(detectSnesHacks(on.bytes).choices).toEqual({ ...before.choices, intermissionReport: true })
      expect(on.bytes[hookA]).toBe(0x22)
      const target = long(on.bytes, hookA + 1)
      expect(hex(on.bytes, hookB, 5)).toBe('5c' + hex(Uint8Array.from([(target + 0x40) & 0xff, ((target + 0x40) >> 8) & 0xff, target >> 16]), 0, 3) + 'ea')
      // In bank $9B or $80 (or the hooks' own), which every build runs code from, all of it in one bank.
      expect([0x9b, 0x80, 0x9f]).toContain(target >> 16)
      expect((target & 0xffff) + ROUTINE_LENGTH).toBeLessThanOrEqual(0x10000)
      const at = offset(target)
      expect(project.bytes.subarray(at, at + ROUTINE_LENGTH).every((byte) => byte === 0xff)).toBe(true)
      // Only the two hooks and the routine change; moved back to $A0:8000, the routine is Match Viewer's.
      const changed = on.bytes.reduce((n, byte, i) => (byte !== project.bytes[i] && (i < at || i >= at + ROUTINE_LENGTH) ? n + 1 : n), 0)
      expect(changed).toBeLessThanOrEqual(4 + 5)
      // The SA-1 builds' RAM block is moved from $40:4800 to $40:5700 (clear of the season shootout's save).
      const ramMove = build.hookBOriginal === 'ad2f6df022' ? SNES_INTREPORT_SA1_RAM_MOVE : 0
      if (ramMove) expect(readWord(on.bytes, at + SNES_INTREPORT_RAM16[0])).toBe(0x5700)
      expect(crc(atA08000(on.bytes.slice(at, at + ROUTINE_LENGTH), target, ramMove))).toBe(build.routine)

      // Built, the ROM is what Match Viewer's own assembly of the patch at this placement gives (2026-11-28: their
      // check found the long table reads left at $A0:8000's offsets, which froze the game at a period's end).
      if (ASSEMBLED[name]) expect(crc(buildRom(on))).toBe(ASSEMBLED[name])

      // Through a rebuild (with a copier header where the ROM has one), and out again.
      const reopened = openRom(buildRom(on))
      expect(detectSnesHacks(reopened.bytes).choices.intermissionReport).toBe(true)
      expectSameBytes(applySnesHacks(on, { intermissionReport: false }).bytes, project.bytes)
      // (A rebuild puts the checksum right.)
      expectSameBytes(buildRom(applySnesHacks(reopened, { intermissionReport: false })), buildRom(project))
    })

    it('goes in with every other hack this ROM takes, and both are recognised', { timeout: 60_000 }, () => {
      const project = open(name)
      const before = detectSnesHacks(project.bytes)
      const others = otherSnesHacks(project, ['intermissionReport', 'showMaxBoost', 'fighting', 'fightMomentum', 'fightOnce', 'seasonShootout', 'barrCoin', 'blockedShotsShown'])
      const all = applySnesHacks(project, Object.fromEntries(others.map((hack) => [hack, true])))
      const both = applySnesHacks(all, { intermissionReport: true })
      const read = detectSnesHacks(both.bytes)
      expect(read.choices).toEqual({ ...detectSnesHacks(all.bytes).choices, intermissionReport: true })
      expect(read.unknown).toEqual(before.unknown)
      expectSameBytes(applySnesHacks(both, { intermissionReport: false }).bytes, all.bytes)
      // And the other way round: the report first, then everything else, and everything out again.
      const first = applySnesHacks(applySnesHacks(project, { intermissionReport: true }), Object.fromEntries(others.map((hack) => [hack, true])))
      expect(detectSnesHacks(first.bytes).choices).toEqual(read.choices)
      expectSameBytes(applySnesHacks(first, before.choices).bytes, project.bytes)
    })
  })
}

describe.skipIf(!existsSync(path('NHL94.smc')))('the SNES intermission report with each other hack', () => {
  it('goes in and out with each, in NHL94.smc', { timeout: 120_000 }, () => {
    const rom = open('NHL94.smc')
    for (const hack of otherSnesHacks(rom, ['intermissionReport'])) {
      const base = snesHackBase(rom, hack)
      const with2 = applySnesHacks(base, { intermissionReport: true })
      const read = detectSnesHacks(with2.bytes)
      expect(read.choices.intermissionReport, hack).toBe(true)
      expect(read.choices[hack], hack).toBe(true)
      expectSameBytes(applySnesHacks(with2, { intermissionReport: false }).bytes, base.bytes, hack)
    }
  })
})

// ROMs made from those builds, whose code is as theirs (SDL16 is the 1 MB game grown, with a copier header; the 1996
// World Cup ROMs and nhl94_SA1_Original are the SA-1 build with nhl94snes_SA1's NewTicker3Pos): offered too.
for (const name of ['SDL16.smc', '1996 World Cup of Hockey.smc', 'nhl94_SA1_Original.sfc', 'nhl94_2026_classic.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`the SNES intermission report in ${name}`, () => {
    it('is offered, and goes in and out', () => {
      const project = open(name)
      expect(detectSnesHacks(project.bytes).notOffered?.intermissionReport).toBeUndefined()
      const on = applySnesHacks(project, { intermissionReport: true })
      expect(detectSnesHacks(on.bytes).choices.intermissionReport).toBe(true)
      expectSameBytes(applySnesHacks(on, { intermissionReport: false }).bytes, project.bytes)
    })
  })
}

// A build whose code has moved (the 60 fps SA-1 league ROM): not offered, and not other code in the way.
for (const name of ['SA1_60fps_league.smc']) {
  describe.skipIf(!existsSync(path(name)))(`the SNES intermission report in ${name}`, () => {
    it('is not offered', () => {
      const project = open(name)
      const state = detectSnesHacks(project.bytes)
      expect(state.choices.intermissionReport).toBe(false)
      expect(state.unknown).not.toContain('intermissionReport')
      expect(state.notOffered?.intermissionReport).toMatch(/not offered/)
      expect(() => applySnesHacks(project, { intermissionReport: true })).toThrow(SnesHackError)
    })
  })
}
