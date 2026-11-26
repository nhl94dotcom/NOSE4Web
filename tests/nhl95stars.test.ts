import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16 } from '../src/core/bytes'
import { applyNhl95Hacks, detectNhl95Hacks, NO_NHL95_HACKS, nhl95ThreeStarsOutdated } from '../src/core/nhl95hacks'
import { openRom } from '../src/core/rom'

// NHL '95's three stars weigh a shot faced 900 / 1,170, as the SNES and NHL 94 options; the first version's 4,000 /
// 4,500 (a goalie first star nearly every game) reads as an earlier version and is replaced at any Apply.

const path = fileURLToPath(new URL('../../NHL95/NHL_95.bin', import.meta.url))
const opened = () => openRom(new Uint8Array(readFileSync(path)))
const STARS_AT = 0x95c8a
// The shot-faced weight: the last muls.w #w of the routine.
const shotFaced = (rom: Uint8Array) => {
  let found = -1
  for (let at = STARS_AT; at < STARS_AT + 200; at += 2) if (readU16(rom, at) === 0xc4fc) found = at + 2
  return found
}

describe.skipIf(!existsSync(path))("NHL '95 three stars", () => {
  it('weighs a shot faced 900 / 1,170, and puts that in for the first version', () => {
    for (const [choice, now, earlier] of [['linesOff', 900, 4000], ['linesOn', 1170, 4500]] as const) {
      const rom = applyNhl95Hacks(opened(), { ...NO_NHL95_HACKS, threeStars: choice })
      const at = shotFaced(rom.bytes)
      expect(readU16(rom.bytes, at)).toBe(now)
      expect(nhl95ThreeStarsOutdated(rom.bytes)).toBe(false)
      // The first version.
      const old = rom.bytes.slice()
      old[at] = earlier >> 8
      old[at + 1] = earlier & 0xff
      expect(nhl95ThreeStarsOutdated(old)).toBe(true)
      const state = detectNhl95Hacks(old)
      expect(state.choices.threeStars).toBe(choice)
      expect(state.unknown).not.toContain('threeStars')
      const again = applyNhl95Hacks({ ...rom, bytes: old }, state.choices)
      expect(readU16(again.bytes, at)).toBe(now)
      expect(nhl95ThreeStarsOutdated(again.bytes)).toBe(false)
      expect(Buffer.compare(applyNhl95Hacks({ ...rom, bytes: old }, { threeStars: 'original' }).bytes, opened().bytes)).toBe(0)
    }
  })
})
