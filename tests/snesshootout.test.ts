import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')
const offset = (bank: number, address: number) => ((bank & 0x7f) << 15) | (address & 0x7fff)

describe.skipIf(!existsSync(path('NHL94.smc')))('the SNES shootout for tied regular-season games', () => {
  // Opened when a test runs, so that the tests skip where the ROMs are not.
  let opened: ReturnType<typeof open> | undefined
  const retail = () => (opened ??= open('NHL94.smc'))
  // PeriodOver's lda #4 / sta gsp after overtime ($9F:8D6A), its tie test ($9F:8D70), clockcont_0's beq .7.
  const AFTER = 0xf8d51 + 25
  const TIE = 0xf8d51 + 31
  const CLOCK = 0xf8c96 + 12

  it('after one overtime: the hook, its code, every branch landing where it should, and out again', () => {
    expect(hex(retail().bytes, AFTER, 6)).toBe('a904008d3016')
    const on = applySnesHacks(retail(), {}, false, { seasonShootout: 1 })
    expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(1)
    expect(on.bytes[AFTER]).toBe(0x22)
    expect(hex(on.bytes, AFTER + 4, 2)).toBe('eaea')
    expect(hex(on.bytes, CLOCK, 2)).toBe('eaea')
    expect(hex(on.bytes, TIE, 6)).toBe('ad8e17cd9017')
    const a = offset(on.bytes[AFTER + 3], on.bytes[AFTER + 1] | (on.bytes[AFTER + 2] << 8))
    // A: bne +$0E from 9 to the mark's clearing at 23; bne +$0D from 17 to lda #4 / sta gsp at 30; rtl at 36.
    expect(hex(on.bytes, a + 7, 2)).toBe('d00e')
    expect(hex(on.bytes, a + 23, 3)).toBe('a90000')
    expect(hex(on.bytes, a + 15, 2)).toBe('d00d')
    expect(hex(on.bytes, a + 30, 7)).toBe('a904008d30166b')
    // RUN, at 37: rep #$30; phb; phx; ... jsl PlayShootout ($80:C81C) ... jml PeriodOver ($9F:8CB1).
    const run = a + 37
    expect(hex(on.bytes, run, 4)).toBe('c2308bda')
    const code = hex(on.bytes, run, 160)
    expect(code).toContain('221cc880')
    expect(code).toContain('5cb18c9f')
    // The winner: bcs +3 over ldx #2.
    expect(code).toContain('b003a20200da')
    // Exit Shootout locked: PauseExitGame's jsl AskExitGame ($9F:F00B, at $9F:E74B) goes to the stub after RUN,
    // which with the mark set answers No (lda #0 / rtl) and else is AskExitGame (beq +4 to jml $9F:F00B).
    const EXIT = 0xfe74b
    expect(hex(retail().bytes, EXIT, 4)).toBe('220bf09f')
    expect(on.bytes[EXIT]).toBe(0x22)
    const lock = offset(on.bytes[EXIT + 3], on.bytes[EXIT + 1] | (on.bytes[EXIT + 2] << 8))
    expect(hex(on.bytes, lock, 17)).toBe('aff0f07e29ff00f004a900006b5c0bf09f')
    // Out: the original game.
    expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { seasonShootout: 0 })), buildRom(retail()))).toBe(0)
  })

  it('after period 3: the tie test becomes the call, which does the test after, and the choices switch', () => {
    const on = applySnesHacks(retail(), {}, false, { seasonShootout: 2 })
    expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(2)
    expect(hex(on.bytes, AFTER, 6)).toBe('a904008d3016')
    expect(hex(on.bytes, CLOCK, 2)).toBe('f09f')
    expect(on.bytes[TIE]).toBe(0x22)
    const b = offset(on.bytes[TIE + 3], on.bytes[TIE + 1] | (on.bytes[TIE + 2] << 8))
    // B: bne +$1C from 9 to the mark's clearing at 37; bne +$1D from 15, +$15 from 23, +$0D from 31 to the test at 44.
    expect(hex(on.bytes, b + 7, 2)).toBe('d01c')
    expect(hex(on.bytes, b + 37, 3)).toBe('a90000')
    expect(hex(on.bytes, b + 13, 2)).toBe('d01d')
    expect(hex(on.bytes, b + 21, 2)).toBe('d015')
    expect(hex(on.bytes, b + 29, 2)).toBe('d00d')
    expect(hex(on.bytes, b + 44, 7)).toBe('ad8e17cd90176b')
    // Switched to after one overtime, and back to none.
    const one = applySnesHacks(on, {}, false, { seasonShootout: 1 })
    expect(detectSnesHacks(one.bytes).amounts?.seasonShootout).toBe(1)
    expect(Buffer.compare(buildRom(applySnesHacks(one, {}, false, { seasonShootout: 0 })), buildRom(retail()))).toBe(0)
  })

  it('does not go with overtime until a goal', () => {
    expect(() => applySnesHacks(retail(), { seasonOvertime: true }, false, { seasonShootout: 1 })).toThrow(/and a shootout for tied regular-season games cannot both be on/)
    // Either shootout shows overtime until a goal as off, not unknown, and the one can be swapped for the other at once.
    for (const choice of [1, 2]) {
      const shootout = applySnesHacks(retail(), {}, false, { seasonShootout: choice })
      expect(detectSnesHacks(shootout.bytes).unknown).not.toContain('seasonOvertime')
      const swapped = applySnesHacks(shootout, { seasonOvertime: true }, false, { seasonShootout: 0 })
      expect(detectSnesHacks(swapped.bytes).choices).toMatchObject({ seasonOvertime: true, seasonShootout: false })
      const back = applySnesHacks(swapped, { seasonOvertime: false }, false, { seasonShootout: choice })
      expect(detectSnesHacks(back.bytes).amounts?.seasonShootout).toBe(choice)
      expect(Buffer.compare(buildRom(applySnesHacks(back, {}, false, { seasonShootout: 0 })), buildRom(retail()))).toBe(0)
    }
  })

  names.forEach((name, n) => {
    it(`SNES ROM ${n + 1}: both choices go in and out, on every build`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('seasonShootout')
      for (const choice of [1, 2]) {
        const on = openRom(buildRom(applySnesHacks(rom, {}, false, { seasonShootout: choice })))
        expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(choice)
        expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { seasonShootout: 0 })), buildRom(rom))).toBe(0)
      }
    })
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('the new SNES choices in a project file', () => {
  it('fighting with its bonus, the injuries choice and the shootout come back over another copy of the ROM', () => {
    const fresh = () => openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    const made = applySnesHacks(fresh(), { fighting: true }, false, { fighting: 4, injuries: 5, seasonShootout: 2 })
    const text = saveProjectFile(made, fresh(), 'Work')
    // Another copy: one byte of it differs, so the file is played over it, not patched.
    const other = new Uint8Array(readFileSync(path('NHL94.smc')))
    other[other.length - 1] ^= 1
    const { project } = openProjectFile(openRom(other), text)
    const state = detectSnesHacks(project.bytes)
    expect(state.amounts).toMatchObject({ fighting: 4, injuries: 5, seasonShootout: 2 })
    expect(state.choices).toMatchObject({ fighting: true, injuries: true, seasonShootout: true })
  })

  // The SA-1 builds: their low variables in BW-RAM at $6000 on and bank $7E's game state in bank $40, so the state is
  // saved to $40:4810 up; the mark stays in WRAM ($7E:F0F0), which the game clears when it starts.
  const sa1 = names.find((name) => /SA1/.test(name))
  it.skipIf(!sa1)('on the SA-1 build: the state saved in BW-RAM, the mark in WRAM', () => {
    const rom = open(sa1!)
    const on = applySnesHacks(rom, {}, false, { seasonShootout: 1 })
    const tail = findCodeAll(on.bytes, 'ee....ad....c90300f0..90..a903008d....af........06')[0].at
    const hook = tail + 25
    expect(on.bytes[hook]).toBe(0x22)
    const code = offset(on.bytes[hook + 3], on.bytes[hook + 1] | (on.bytes[hook + 2] << 8))
    const all = hex(on.bytes, code, 37 + 160)
    // A reads and clears the mark in WRAM.
    expect(hex(on.bytes, code, 4)).toBe('aff0f07e')
    // RUN: gsp ($7630) and the scores ($778E) are the SA-1's; low $75D3 to $40:4810, $30F4 to $40:4F90, both in bank $40;
    // lastperiod ($40:7EAD) to $40:5318; back the other way.
    expect(all).toContain('a97f07a2d375a0104854' + '4040')
    expect(all).toContain('a98703a2f430a0904f544040')
    expect(all).toContain('afad7e408f185340')
    expect(all).toContain('a97f07a21048a0d37554' + '4040')
    expect(all).toContain('af1853408fad7e40')
    expect(all).toContain('bf8e7740' + '1a' + '9f8e7740')
    expect(all).toContain('8f307640')
    expect(all).not.toContain('7e7e')
    // Its own player stats (Match Viewer): checks for $40:E788 to the time on ice's end, $E868 ($E0 bytes), to
    // $40:5320 after the game state, and back.
    const more = hex(on.bytes, code, 37 + 160)
    expect(more).toContain('a9df00a288e7a02053544040')
    expect(more).toContain('a9df00a22053a088e7544040')
    expect(detectSnesHacks(buildRom(on)).amounts?.seasonShootout).toBe(1)
  })

  // The LoROM 32-team build: checks and posts ($7E:E788-$E7F3, no time on ice) to $7E:FC10; the 1 MB game has none.
  it.skipIf(!names.includes('nhl94snes_2026.sfc'))("on the 32-team LoROM build: its checks and posts saved; the original game's code as before", () => {
    const on = applySnesHacks(open('nhl94snes_2026.sfc'), {}, false, { seasonShootout: 1 })
    const all = Buffer.from(on.bytes).toString('hex')
    expect(all).toContain('a96b00a288e7a010fc547e7e')
    expect(all).toContain('a96b00a210fca088e7547e7e')
    const plain = Buffer.from(applySnesHacks(open('NHL94.smc'), {}, false, { seasonShootout: 1 }).bytes).toString('hex')
    expect(plain).not.toContain('a288e7')
  })
})
