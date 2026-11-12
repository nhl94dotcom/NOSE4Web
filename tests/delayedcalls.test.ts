import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, hacksSupported } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const at = (bytes: Uint8Array, offset: number, count: number) => Buffer.from(bytes.subarray(offset, offset + count)).toString('hex')

describe.skipIf(!existsSync(path('nhl94.bin')))('calls during a delayed penalty (known bug 12)', () => {
  it("checkagr's pending-penalty test becomes a branch to its rts", () => {
    const rom = open('nhl94.bin')
    // .teamchk: btst #2,DelayedPen; bne; bra .end; btst #1,DelayedPen; beq .end; move.w #$7F,d0; rts.
    expect(at(rom.bytes, 0x13ec4, 30)).toBe('08380002c300660000106000001008380001c30067000006303c007f4e75')
    const on = applyHacks(rom, { ...detectHacks(rom.bytes).choices, delayedCalls: true })
    expect(at(on.bytes, 0x13ec4, 4)).toBe('6000001a')
    // bra.w lands on the rts: $13EC6 + $1A.
    expect(at(on.bytes, 0x13ec6 + 0x1a, 2)).toBe('4e75')
    expect(detectHacks(on.bytes).choices.delayedCalls).toBe(true)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out, leaving the ROM as its own hacks make it`, () => {
      const rom = open(name)
      if (!hacksSupported(rom.game)) return
      const state = detectHacks(rom.bytes)
      expect(state.unknown).not.toContain('delayedCalls')
      expect(state.choices.delayedCalls).toBe(false)
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, delayedCalls: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, delayedCalls: true })
      // Off again, it is the ROM as its own hacks put back make it (a league ROM's are rewritten when applied).
      const off = applyHacks(on, { ...detectHacks(on.bytes).choices, delayedCalls: false })
      expect(Buffer.compare(buildRom(off), buildRom(applyHacks(rom, state.choices)))).toBe(0)
      expect(at(buildRom(off), 0x13ec4, 4)).toBe('08380002')
    })
  })
})
