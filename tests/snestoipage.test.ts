import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const latin = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('latin1')

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: time on ice in Player Stats', () => {
  it('adds a seventh sort column, its title, header, sort and rows', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xe07a6, 7)).toBe('adf91dc9050030')
    expect(latin(rom.bytes, 0xe0bce + 70, 14)).toBe('\x0e\x00[ Penalties ')
    const on = applySnesHacks(rom, { timeOnIce: true, timeOnIceShown: true }).bytes
    // The last column, and Penalties' title closed.
    expect(on[0xe07aa]).toBe(6)
    expect(latin(on, 0xe0bce + 70, 14)).toBe('\x0e\x00[ Penalties]')
    // The rows: jsl to code that takes column 6, else jml .3 ($9C:8980).
    expect(on[0xe096d]).toBe(0x22)
    const row = far(on, 0xe096d)
    expect(hex(on, row, 12)).toBe('adf91dc90600f0045c80899c')
    // The game's own skater row up to the points, then the time: column 6's palette, printx 26, ptoi,x*2, PushTime.
    expect(hex(on, row + 12, 8)).toBe('5aa5a948a9ffff22')
    expect(hex(on, row + 12 + 171, 30)).toBe('a9060022178d9ca91a008d0f0dda8a0aaabf00e87e85a5fa22d7a39fa78d')
    // The title: column 6 points a1 at "[Time On Ice", else jml AdvanceStringPtr.
    const title = far(on, 0xe0b92)
    expect(hex(on, title, 4)).toBe('a5a5c906')
    expect(latin(on, title + 22, 14)).toBe('\x0e\x00[Time On Ice')
    // The compare: jsl / bcs .t1x / jmp .8 / nops; the code keeps .t1x and .6 before it.
    expect(hex(on, 0xe0c75 + 4, 7)).toBe('b07a4c118deaea')
    expect(hex(on, far(on, 0xe0c75) - 4, 4)).toBe('f58c038d')
    // The header: its own, the game's control bytes and "  Player         G  A Pt   TOI".
    const header = far(on, 0xe08ae)
    expect(hex(on, 0xe08ae + 4, 6)).toBe('eaeaeaeaeaea')
    expect(latin(on, header + 30, 35)).toBe('\x23\x00\x9f\x01\x09  Player         G  A Pt   TOI')
    const state = detectSnesHacks(on)
    expect(state.choices.timeOnIce).toBe(true)
    expect(state.choices.timeOnIceShown).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { timeOnIce: false, timeOnIceShown: false })), buildRom(rom))).toBe(0)
  })

  it('goes with the checks in Player Stats, and needs the count', () => {
    const rom = open('NHL94.smc')
    const both = applySnesHacks(rom, { bodychecks: true, bodychecksShown: true, timeOnIce: true, timeOnIceShown: true })
    const state = detectSnesHacks(both.bytes)
    expect([state.choices.bodychecksShown, state.choices.timeOnIceShown]).toEqual([true, true])
    expect(() => applySnesHacks(rom, { timeOnIceShown: true })).toThrow()
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out, or is not offered where the build has its own`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      if (state.notOffered?.timeOnIceShown) {
        expect(state.unknown).not.toContain('timeOnIceShown')
        return
      }
      expect(state.unknown).not.toContain('timeOnIceShown')
      const on = openRom(buildRom(applySnesHacks(rom, { timeOnIce: true, timeOnIceShown: true })))
      expect(detectSnesHacks(on.bytes).choices.timeOnIceShown).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { timeOnIce: false, timeOnIceShown: false })), buildRom(rom))).toBe(0)
    })
  })
})
