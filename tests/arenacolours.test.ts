import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { arenaColoursSupported, readArenaColours, RINK_OWN, withArenaColours } from '../src/core/arenacolours'
import { buildRom, openRom } from '../src/core/rom'

// Each home team's rink colours (Genesis NHL 94): line 0's colours 5 and 9, set by HomeTeam after setupIceRinkPal.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hexOf = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

describe.skipIf(!existsSync(path('nhl94.bin')))('each home team’s rink colours', () => {
  it('hooks setupIceRinkPal, sets the two colours from a table by home team, and comes out byte for byte', () => {
    const project = openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
    expect(arenaColoursSupported(project)).toBe(true)
    expect(readArenaColours(project)).toBeNull()
    const colours = project.teams.map((_, t): [number, number] => (t === 0 ? [0x00e, 0x0e0] : t === 1 ? [RINK_OWN, 0xe00] : [RINK_OWN, RINK_OWN]))
    const on = withArenaColours(project, colours)
    const at = 0x16c96
    expect(hexOf(on.bytes, at, 2)).toBe('4ef9')
    const code = readU32(on.bytes, at + 2)
    // The routine as it was (Rinktilelist, palfadenew $BD28), then HomeTeam ($C330) x 4 into the table.
    expect(hexOf(on.bytes, code, 30)).toBe('207c0005605ad1d0700f327cbd2822d851c8fffc3038c330e54841fa0020')
    // colour 5 to palfadenew + 10, colour 9 to + 18, each unless $FFFF.
    expect(hexOf(on.bytes, code + 30, 30)).toBe('0c70ffff0000670631f00000bd320c70ffff0002670631f00002bd3a4e75')
    expect(hexOf(on.bytes, code + 60, 8)).toBe('000e00e0ffff0e00')
    expect(readArenaColours(openRom(buildRom(on)))).toEqual(colours)
    const off = withArenaColours(on, null)
    expect(Buffer.compare(Buffer.from(off.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
    expect(readArenaColours(withArenaColours(project, colours.map(() => [RINK_OWN, RINK_OWN])))).toBeNull()
  })

  it.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("is not offered on NHL '95 (its shared colours not yet known)", () => {
    expect(arenaColoursSupported(openRom(new Uint8Array(readFileSync(path('NHL95/NHL_95.bin')))))).toBe(false)
  })
})
