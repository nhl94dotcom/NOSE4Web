import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
// A league's SA-1 ROM with NOSE4Web's goalie pull from before 12 November 2026 (the pad read from the table).
const WCOH = '1996 WCOH lines (5).smc'

describe.skipIf(!existsSync(path(WCOH)))("SNES: NOSE4Web's earlier goalie pull in an SA-1 build", () => {
  it('is recognised as an earlier version, and updated to work the pad out from the team', () => {
    const rom = openRom(new Uint8Array(readFileSync(path(WCOH))))
    const before = detectSnesHacks(rom.bytes)
    expect(before.unknown).not.toContain('manualPullGoalie')
    expect(before.choices.manualPullGoalie).toBe(true)
    expect(before.vaultVersions).toContain('manualPullGoalie')
    // The check code at $9E:FF74 reads the team absolute (ldy $6091) and the pad from its table (lda $FFC7,y).
    expect(Buffer.from(rom.bytes.subarray(0xf7f77, 0xf7f7a)).toString('hex')).toBe('ac9160')
    expect(Buffer.from(rom.bytes.subarray(0xf7f74 + 15, 0xf7f74 + 18)).toString('hex')).toBe('b9c7ff')

    const updated = openRom(buildRom(applySnesHacks(rom, { manualPullGoalie: true }, true)))
    const after = detectSnesHacks(updated.bytes)
    expect(after.choices.manualPullGoalie).toBe(true)
    expect(after.vaultVersions ?? []).not.toContain('manualPullGoalie')
    // The hook (jsr at $9E:D142 file $F5142) calls the new code, in the same bank: ldy $91 / nop, and tya / lsr / inc.
    const at = 0xf0000 | ((updated.bytes[0xf5143] | (updated.bytes[0xf5144] << 8)) & 0x7fff)
    expect(updated.bytes[0xf5142]).toBe(0x20)
    expect(Buffer.from(updated.bytes.subarray(at + 3, at + 6)).toString('hex')).toBe('a491ea')
    expect(Buffer.from(updated.bytes.subarray(at + 15, at + 18)).toString('hex')).toBe('984a1a')
    // The other hacks as they were.
    expect(after.choices).toEqual(before.choices)
    expect(after.unknown).toEqual(before.unknown.filter((hack) => hack !== 'manualPullGoalie'))
  })
})
