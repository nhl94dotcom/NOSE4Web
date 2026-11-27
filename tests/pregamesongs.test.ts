import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PREGAME_SILENCE, pregameOwnSong, pregameSongsSupported, readPregameSongs, withPregameSongs } from '../src/core/pregamesongs'
import { buildRom, openRom } from '../src/core/rom'

// A pre-game song for each home team, on the matchup screen (Genesis NHL 94 and NHL '95).

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

for (const [name, own, site] of [['nhl94.bin', 0x7a, 0xfcc86], ['NHL95/NHL_95.bin', 3, 0x9f5e4]] as const) {
  describe.skipIf(!existsSync(path(name)))(`pre-game songs on ${name}`, () => {
    it('hooks the matchup screen, a table of songs by home team, and comes out byte for byte', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(pregameSongsSupported(project)).toBe(true)
      expect(pregameOwnSong(project)).toBe(own)
      expect(readPregameSongs(project)).toBeNull()
      const songs = project.teams.map((_, team) => (team === 0 ? 0x78 : team === 1 ? PREGAME_SILENCE : own))
      const on = withPregameSongs(project, songs)
      // The push and jsr became jsr to the code, then two nops.
      expect(Buffer.from(on.bytes.subarray(site, site + 2)).toString('hex')).toBe('4eb9')
      expect(Buffer.from(on.bytes.subarray(site + 6, site + 10)).toString('hex')).toBe('4e714e71')
      const code = readU32(on.bytes, site + 2)
      // movem.l d0/a0,-(sp); move.w (HomeTeam).w,d0
      expect(Buffer.from(on.bytes.subarray(code, code + 6)).toString('hex')).toBe(name.includes('95') ? '48e780803038bf54'.slice(0, 12) : '48e780803038c330'.slice(0, 12))
      expect(readPregameSongs(on)).toEqual(songs)
      const again = openRom(buildRom(on))
      expect(readPregameSongs(again)).toEqual(songs)
      // Changed, and all back to the game's own.
      const changed = withPregameSongs(on, songs.map((s, t) => (t === 2 ? 0x79 : s)))
      expect(readPregameSongs(changed)![2]).toBe(0x79)
      const off = withPregameSongs(changed, null)
      expect(Buffer.compare(Buffer.from(off.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
      expect(readPregameSongs(off)).toBeNull()
      // Every team on the game's own song is the same as none.
      expect(readPregameSongs(withPregameSongs(project, project.teams.map(() => own)))).toBeNull()
    })
  })
}

it.skipIf(!existsSync(path('NHL94.smc')))('is not offered on the SNES', () => {
  expect(pregameSongsSupported(openRom(new Uint8Array(readFileSync(path('NHL94.smc')))))).toBe(false)
})
