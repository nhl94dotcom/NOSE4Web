import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { overallRating } from '../src/core/rating'
import { buildRom, openRom } from '../src/core/rom'
import { goalieCount, teamSpace } from '../src/core/team'

// The ROM is copyrighted and is not part of the project. Put your own copy
// one folder above the project to run these tests.
const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

function differingOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const offsets: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) offsets.push(i)
  return offsets
}

describe.skipIf(!hasRom)('NHL 94 base ROM', () => {
  it('is recognised and parsed', () => {
    const project = openRom(original)
    expect(project.game.title).toBe('NHL 94')
    expect(project.wasSmd).toBe(false)
    expect(project.teams).toHaveLength(28)
    expect(project.teams.map((t) => t.names[0]).slice(0, 3)).toEqual(['Anaheim', 'Boston', 'Buffalo'])
    expect(project.teams[0].names).toEqual(['Anaheim', 'ANH', 'Mighty Ducks', 'Pond'])
    expect(project.teams[26].players[0].name).toBe('Patrick Roy')
    expect(project.teams[26].players[0].jersey).toBe(0x33)
  })

  it('has rosters that agree with their goalie, forward and defence counts', () => {
    const project = openRom(original)
    for (const team of project.teams) {
      expect(goalieCount(team) + team.forwards + team.defense).toBe(team.players.length)
      expect(team.freeBytes).toBe(0)
      for (const line of team.lines) {
        for (const slot of line.slice(0, 7)) expect(slot).toBeLessThanOrEqual(team.players.length)
      }
    }
  })

  it('rebuilds an unedited ROM with the team data byte for byte the same', () => {
    const project = openRom(original)
    const built = buildRom(project)
    expect(built.length).toBe(original.length)

    const routine = readU32(original, 0x302)
    const allowed = (o: number) =>
      (o >= 0x18e && o <= 0x18f) || // header checksum
      (o >= 0x300 && o <= 0x305) || // call to the self-check routine
      o >= routine // the self-check routine itself
    const unexpected = differingOffsets(original, built).filter((o) => !allowed(o))
    expect(unexpected).toEqual([])
  })

  it('writes a header checksum that matches the ROM contents', () => {
    const built = buildRom(openRom(original))
    let sum = 0
    for (let o = 0x200; o < built.length; o += 2) sum = (sum + readU16(built, o)) & 0xffff
    expect(readU16(built, 0x18e)).toBe(sum)
    expect(readU32(built, 0x1a4)).toBe(built.length - 1)
  })

  it('reopens its own output and rebuilds it identically', () => {
    const first = buildRom(openRom(original))
    const second = buildRom(openRom(first))
    expect(differingOffsets(first, second)).toEqual([])
  })

  it('keeps every other team intact when a name gets shorter', () => {
    const project = openRom(original)
    const before = structuredClone(project.teams)
    project.teams[1].players[0].name = project.teams[1].players[0].name.slice(0, -2)

    const reopened = openRom(buildRom(project))
    const expected = structuredClone(before)
    expected[1].players[0].name = project.teams[1].players[0].name
    // The two bytes saved become free bytes on the last team in the ROM, Anaheim.
    expected[0].freeBytes = 2
    expect(reopened.teams).toEqual(expected)
    expect(reopened.layout).toEqual(project.layout)
  })

  it('refuses to build when the team data no longer fits', () => {
    const project = openRom(original)
    const space = teamSpace(project.teams, project.layout)
    expect(space.used).toBe(space.available)
    project.teams[1].players[0].name += 'xx'
    expect(() => buildRom(project)).toThrow(/2 bytes too large/)
  })

  it('reads a Super Magic Drive dump as the same ROM', () => {
    const smd = new Uint8Array(512 + original.length)
    smd[8] = 0xaa
    smd[9] = 0xbb
    smd[10] = 0x06
    for (let block = 0; block < original.length / 16384; block++) {
      for (let i = 0; i < 8192; i++) {
        smd[512 + block * 16384 + 8192 + i] = original[block * 16384 + i * 2]
        smd[512 + block * 16384 + i] = original[block * 16384 + i * 2 + 1]
      }
    }
    const project = openRom(smd)
    expect(project.wasSmd).toBe(true)
    expect(differingOffsets(project.bytes, openRom(original).bytes)).toEqual([])
  })
})

describe('overall rating', () => {
  it('follows the NHL 94 formula', () => {
    // Goalie: 6*2.25 + 4*2.25 + 6*2.25 + (5+5+6+6)*0.5 = 47, plus 22 bonus, plus 25 base.
    expect(overallRating([6, 6, 4, 4, 4, 6, 0, 1, 0, 0, 5, 5, 6, 6], true)).toBe(94)
    // An odd 2.25-weighted goalie attribute loses a quarter point.
    expect(overallRating([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], true)).toBe(27)
    expect(overallRating([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], false)).toBe(25)
  })
})
