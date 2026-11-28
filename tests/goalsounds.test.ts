import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GOAL_SIREN, goalSoundsSupported, readGoalSounds, withGoalSounds } from '../src/core/goalsounds'
import { buildRom, openRom } from '../src/core/rom'

// A goal sound for each home team (Genesis NHL 94 and NHL '95).

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const hexOf = (b: Uint8Array) => Buffer.from(b).toString('hex')

for (const [name, site, sfx, gmode, home, nops] of [
  ['nhl94.bin', 0x1484a, 0x11132, 0xc2ea, 0xc330, '4e71'],
  ['NHL95/NHL_95.bin', 0x8c3b0, 0x677ac, 0xbef0, 0xbf54, '4e714e71'],
] as const) {
  describe.skipIf(!existsSync(path(name)))(`goal sounds on ${name}`, () => {
    it('hooks the goal siren, a table by home team and one for visitors, and comes out byte for byte', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(goalSoundsSupported(project)).toBe(true)
      expect(readGoalSounds(project)).toBeNull()
      const sounds = { home: project.teams.map((_, t) => (t === 0 ? 4 : t === 1 ? 0xb : t === 2 ? 0xffff : GOAL_SIREN)), visitors: 0xffff }
      const on = withGoalSounds(project, sounds)
      expect(hexOf(on.bytes.subarray(site, site + 2))).toBe('4eb9')
      expect(hexOf(on.bytes.subarray(site + 6, site + 6 + nops.length / 2))).toBe(nops)
      const code = readU32(on.bytes, site + 2)
      expect(code % 2).toBe(0)
      const w = (n: number) => n.toString(16).padStart(4, '0')
      const g = w(gmode)
      // Every instruction, as the comment in goalsounds.ts has it.
      expect(hexOf(on.bytes.subarray(code, code + 62))).toBe(
        '48e78080' + '4a6b0014' + '6a0a' + '08380001' + g + '6610' + '6008' + '08380001' + g + '6706' + '303a0060' + '600e' + '3038' + w(home) + 'd040' + '41fa0014' + '30300000' + '3f00' + '4eb9' + sfx.toString(16).padStart(8, '0') + '4cdf0101' + '4e75',
      )
      // The away word, read by move.w d16(pc): its extension word at 30, 30 + $60 = the table's 33rd word.
      expect(code + 30 + 0x60).toBe(code + 62 + 64)
      expect(readGoalSounds(on)).toEqual(sounds)
      const again = openRom(buildRom(on))
      expect(readGoalSounds(again)).toEqual(sounds)
      // Changed, then back to the siren everywhere.
      const changed = withGoalSounds(on, { ...sounds, visitors: GOAL_SIREN })
      expect(readGoalSounds(changed)!.visitors).toBe(GOAL_SIREN)
      const off = withGoalSounds(changed, null)
      expect(Buffer.compare(Buffer.from(off.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
      expect(readGoalSounds(off)).toBeNull()
      expect(readGoalSounds(withGoalSounds(project, { home: project.teams.map(() => GOAL_SIREN), visitors: GOAL_SIREN }))).toBeNull()
    })
  })
}

it.skipIf(!existsSync(path('NHL94.smc')))('is not offered on the SNES', () => {
  expect(goalSoundsSupported(openRom(new Uint8Array(readFileSync(path('NHL94.smc')))))).toBe(false)
})
