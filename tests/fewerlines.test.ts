import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, fewerSkaterLinesFor, fewerSkaterLinesText, NO_HACKS } from '../src/core/hacks'
import { emptyLineSlots } from '../src/core/lines'
import { openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
// Every place the fix changes, as [offset, length].
const SITES: [number, number][] = [
  [0x82f2, 2], [0x8374, 2], [0x837a, 2], [0x8636, 2], [0x879c, 2], [0x8c6e, 2], [0x8c76, 2], [0x8c82, 2],
  ...[0x87a2, 0x87a8, 0x87ae, 0x87b4, 0x87ba, 0x87c0, 0x87c6].map((at): [number, number] => [at, 2]),
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [0x86dc + i * 6, 2]),
  ...[0, 1, 2, 3, 4].map((i): [number, number] => [0x191d2 + i * 4, 2]),
]
const bytesAt = (rom: Uint8Array) => SITES.map(([at, n]) => Buffer.from(rom.subarray(at, at + n)).toString('hex'))
const local: { otherRoms?: string[] } = existsSync(fileURLToPath(new URL('./local.json', import.meta.url)))
  ? JSON.parse(readFileSync(fileURLToPath(new URL('./local.json', import.meta.url)), 'utf8'))
  : {}
const fewer = (local.otherRoms ?? []).filter((name) => existsSync(path(name)) && /2on2|3vs3|1on1/i.test(name))

describe('the positions Edit Lines is fitted to', () => {
  it('follow from the positions a first line leaves empty, where the used ones follow each other', () => {
    // Slot 0 is the goalie, 6 the extra attacker.
    expect(fewerSkaterLinesFor([false, false, false, false, false, false, false])).toBe(0)
    expect(fewerSkaterLinesFor([false, true, false, false, false, true, false])).toBe(23)
    expect(fewerSkaterLinesFor([false, true, true, false, false, true, false])).toBe(32)
    expect(fewerSkaterLinesFor([false, true, true, true, false, true, false])).toBe(41)
    expect(fewerSkaterLinesFor([false, false, true, false, true, false, false])).toBeNull()
    expect(fewerSkaterLinesText(32)).toBe('LW and C')
    expect(fewerSkaterLinesText(23)).toBe('RD, LW and C')
    expect(fewerSkaterLinesText(41)).toBe('C')
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('Edit Lines for fewer skaters', () => {
  it("writes smozoma's 2 on 2 fix for LW and C, with the line-changes-on rows and the penalty kill's fitted too", () => {
    const stock = open('nhl94.bin')
    expect(detectHacks(stock.bytes).choices.fewerSkaterLines).toBe(0)
    expect(bytesAt(stock.bytes).slice(8, 15)).toEqual(['0004', '0004', '0004', '0004', '0004', '0003', '0003'])
    const two = applyHacks(stock, { ...NO_HACKS, fewerSkaterLines: 32 }).bytes
    expect(bytesAt(two)).toEqual([
      // smozoma's, but the penalty kill keeps its C (no subq: the ROM plays no RW).
      '0003', '0003', '0004', '5644', '0001', '0003', '7201', '4e71',
      // Line changes on: two rows on every line.
      '0001', '0001', '0001', '0001', '0001', '0001', '0001',
      '4c57', '4320', '2020', '2020', '2020',
      '4c57', '4300', '4c57', '4300', '5257',
    ])
    expect(detectHacks(two).choices.fewerSkaterLines).toBe(32)
    expect(Buffer.compare(applyHacks({ ...stock, bytes: two }, NO_HACKS).bytes, stock.bytes)).toBe(0)
    // One position: the penalty-kill rows' subq becomes a NOP, so the roster view does not loop.
    const one = applyHacks(stock, { ...NO_HACKS, fewerSkaterLines: 41 }).bytes
    // As Match Viewer's working scratch copy: one row everywhere.
    expect(bytesAt(one).slice(0, 15)).toEqual(['0004', '0004', '0004', '5844', '0000', '0004', '7200', '4e71', '0000', '0000', '0000', '0000', '0000', '0000', '0000'])
    // Playing RW, the penalty kill drops it.
    const wings = applyHacks(stock, { ...NO_HACKS, fewerSkaterLines: 33 }).bytes
    expect(bytesAt(wings).slice(7, 15)).toEqual(['5341', '0002', '0002', '0002', '0002', '0002', '0001', '0001'])
    // smozoma's own version, as in 2on2_update.bin, is recognised, and updated when the hacks are applied.
    const smozoma = two.slice()
    smozoma.set([0x53, 0x41], 0x8c82)
    for (const at of [0x87a2, 0x87a8, 0x87ae, 0x87b4, 0x87ba]) smozoma.set([0, 4], at)
    for (const at of [0x87c0, 0x87c6]) smozoma.set([0, 3], at)
    expect(detectHacks(smozoma).choices.fewerSkaterLines).toBe(32)
    expect(Buffer.compare(applyHacks({ ...stock, bytes: smozoma }, { ...NO_HACKS, fewerSkaterLines: 32 }).bytes, two)).toBe(0)
    expect(() => applyHacks(stock, { ...NO_HACKS, fewerSkaterLines: 46 })).toThrow('follow each other')
  })

  it.skipIf(fewer.length === 0)('reads and fits the fewer-skater ROMs on this computer', () => {
    const stock = open('nhl94.bin')
    for (const name of fewer) {
      const project = open(name)
      const fitted = fewerSkaterLinesFor(emptyLineSlots(project.teams)[0])
      const state = detectHacks(project.bytes)
      expect(state.unknown, name).not.toContain('fewerSkaterLines')
      // A ROM that has the fix has it for the positions it plays.
      if (state.choices.fewerSkaterLines !== 0) expect(state.choices.fewerSkaterLines, name).toBe(fitted)
      if (fitted === null || fitted === 0) continue
      const fixed = applyHacks(project, { ...state.choices, fewerSkaterLines: fitted }).bytes
      expect(detectHacks(fixed).choices.fewerSkaterLines, name).toBe(fitted)
      expect(bytesAt(applyHacks({ ...project, bytes: fixed }, { ...state.choices, fewerSkaterLines: 0 }).bytes), name).toEqual(bytesAt(stock.bytes))
    }
  })
})
