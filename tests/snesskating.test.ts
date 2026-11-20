import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_AMOUNT_OFF, snesAmountText, type SnesAmount } from '../src/core/sneshacks'
import { snesHackSheet } from '../src/core/hacksheet'

// Skating and the puck on the SNES, as on the Genesis: speed burst, stopping and turning, puck friction.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const snesNames = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const reopen = (p: RomProject) => openRom(buildRom(p))
const same = (a: RomProject, b: RomProject) => Buffer.compare(buildRom(a), buildRom(b))

// A small 65816 run of the friction code: 16-bit A, X and Y, with X the timestep and the stack's return address.
// Returns the friction byte, or 'skip' where the code drops the return and jumps on to .10.
function runFriction(rom: Uint8Array, code: number, timestep: number, frames: number): number | 'skip' {
  const at = (long: number) => ((long >> 16) & 0x7f) * 0x8000 + ((long & 0xffff) - 0x8000)
  let [pc, acc, z] = [code, 0, false]
  // The jsl's return: bank, then high and low bytes.
  const stack = [0x9f, 0x87, 0x77]
  const pull = () => stack.pop()!
  let short = false
  for (let steps = 0; steps < 40; steps++) {
    const op = rom[pc]
    const w = rom[pc + 1] | (rom[pc + 2] << 8)
    switch (op) {
      case 0xbf:
        acc = rom[at(w | (rom[pc + 3] << 16)) + timestep] | (rom[at(w | (rom[pc + 3] << 16)) + timestep + 1] << 8)
        pc += 4
        break
      case 0x48:
        stack.push(acc >> 8, acc & 0xff)
        pc += 1
        break
      case 0xad:
        acc = frames
        pc += 3
        break
      case 0x29:
        acc &= w
        z = acc === 0
        pc += 3
        break
      case 0xf0:
        pc += 2
        if (z) pc += (rom[pc - 1] ^ 0x80) - 0x80
        break
      case 0x68:
        acc = short ? (acc & 0xff00) | pull() : pull() | (pull() << 8)
        pc += 1
        break
      case 0xe2:
      case 0xc2:
        short = op === 0xe2
        pc += 2
        break
      case 0xbb:
        pc += 1
        break
      case 0x5c:
        expect(stack).toEqual([])
        return 'skip'
      case 0x6b:
        expect(stack).toEqual([0x9f, 0x87, 0x77])
        return acc & 0xff
      default:
        throw new Error(`opcode ${op.toString(16)}`)
    }
  }
  throw new Error('runs away')
}

describe.skipIf(!existsSync(path('NHL94.smc')))('skating and the puck, retail NHL94.smc', () => {
  it("stopping and turning: stopna's lda #$0070 at $9E:A55E takes the number", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf255e, 6)).toBe('a97000187de3')
    const on = applySnesHacks(rom, {}, false, { turnRate: 150 })
    expect(hex(on.bytes, 0xf255e, 3)).toBe('a99600')
    expect(detectSnesHacks(on.bytes).amounts!.turnRate).toBe(150)
    expect(detectSnesHacks(on.bytes).choices.turnRate).toBe(true)
    const changed = applySnesHacks(reopen(on), {}, false, { turnRate: 40 })
    expect(hex(changed.bytes, 0xf255e, 3)).toBe('a92800')
    expect(same(applySnesHacks(reopen(changed), {}, false, { turnRate: SNES_AMOUNT_OFF.turnRate }), rom)).toBe(0)
  })

  it("speed burst: burst's jsl Mul16U at $9E:8228 calls code that sets the push", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf0223, 12)).toBe('a5a5a2330222999080a695a5')
    const on = applySnesHacks(rom, {}, false, { speedBurst: 24 })
    expect(on.bytes[0xf0228]).toBe(0x22)
    const code = far(on.bytes, 0xf0228)
    // lda #24 / sta r2+2 / rtl, then jml Mul16U kept for taking it out.
    expect(hex(on.bytes, code, 10)).toBe('a9180085' + '0a' + '6b' + '5c999080')
    expect(detectSnesHacks(on.bytes).amounts!.speedBurst).toBe(24)
    const changed = applySnesHacks(reopen(on), {}, false, { speedBurst: 60 })
    expect(changed.bytes[far(changed.bytes, 0xf0228) + 1]).toBe(60)
    expect(same(applySnesHacks(reopen(changed), {}, false, { speedBurst: 0 }), rom)).toBe(0)
    // With bursts costing nothing, which changes the code before it.
    const both = applySnesHacks(rom, { freeBurst: true }, false, { speedBurst: 30 })
    expect(detectSnesHacks(both.bytes).choices.freeBurst).toBe(true)
    expect(detectSnesHacks(both.bytes).amounts!.speedBurst).toBe(30)
    expect(same(applySnesHacks(reopen(both), { freeBurst: false }, false, { speedBurst: 0 }), rom)).toBe(0)
  })

  it("puck friction: updateplayers' lda.l .22-1,x at $9F:8774 calls code with its own table", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf8774, 9)).toBe('bf6e8b9f29ff0085ad')
    // The original table, .22: by timestep 1-10.
    expect(hex(rom.bytes, 0xf8b6f, 10)).toBe('fffffefefefdfdfdfcfc')
    for (const n of [1, 4, 8, 10, 11, 12]) {
      const on = applySnesHacks(rom, {}, false, { puckFriction: n })
      expect(on.bytes[0xf8774]).toBe(0x22)
      expect(hex(on.bytes, 0xf8778, 5)).toBe('29ff0085ad')
      const code = far(on.bytes, 0xf8774)
      expect(detectSnesHacks(on.bytes).amounts!.puckFriction).toBe(n)
      // The step's friction byte, or skipped, at each timestep and count of frames.
      for (let t = 1; t <= 10; t++) {
        const ran = [0, 1, 2, 3, 4, 5, 6, 7].map((frames) => runFriction(on.bytes, code, t, frames))
        if (n < 9) {
          const want = Math.min(255, Math.max(1, Math.round(256 * (1 - 2 ** -n) ** t)))
          expect(ran).toEqual(new Array(8).fill(want))
        } else {
          const original = rom.bytes[0xf8b6e + t]
          const every = 1 << (n - 9)
          expect(ran).toEqual(ran.map((_, frames) => (frames % every === 0 ? original : 'skip')))
        }
      }
      // The jump goes to .10: lda velstep / sta p0.
      expect(hex(on.bytes, code + 21, 4)).toBe('5c' + '96879f')
      expect(hex(rom.bytes, 0xf8795, 2)).toBe('bbad')
      expect(same(applySnesHacks(reopen(on), {}, false, { puckFriction: 9 }), rom)).toBe(0)
    }
    // 8: 1/256 a frame, twice the original's 1/512.
    const eight = applySnesHacks(rom, {}, false, { puckFriction: 8 })
    expect(runFriction(eight.bytes, far(eight.bytes, 0xf8774), 2, 0)).toBe(0xfe)
  })

  it('goes with choppy ice, in either order', () => {
    const rom = open('NHL94.smc')
    const both = applySnesHacks(rom, { choppyIce: true }, false, { puckFriction: 10 })
    expect(detectSnesHacks(both.bytes).choices.choppyIce).toBe(true)
    expect(detectSnesHacks(both.bytes).amounts!.puckFriction).toBe(10)
    const choppyFirst = applySnesHacks(reopen(applySnesHacks(rom, { choppyIce: true })), {}, false, { puckFriction: 7 })
    expect(detectSnesHacks(choppyFirst.bytes).amounts!.puckFriction).toBe(7)
    const frictionOut = applySnesHacks(reopen(choppyFirst), {}, false, { puckFriction: 9 })
    expect(detectSnesHacks(frictionOut.bytes).choices.choppyIce).toBe(true)
    expect(same(applySnesHacks(reopen(frictionOut), { choppyIce: false }), rom)).toBe(0)
    expect(same(applySnesHacks(reopen(both), { choppyIce: false }, false, { puckFriction: 9 }), rom)).toBe(0)
  })

  it('turned on without a number, as when every hack is chosen', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { speedBurst: true, turnRate: true, puckFriction: true })
    expect(detectSnesHacks(on.bytes).amounts).toMatchObject({ speedBurst: 24, turnRate: 150, puckFriction: 8 })
    expect(same(applySnesHacks(reopen(on), { speedBurst: false, turnRate: false, puckFriction: false }), rom)).toBe(0)
  })

  it('reads in words on the sheet and in changes', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, {}, false, { speedBurst: 20, turnRate: 200, puckFriction: 10 })
    const sheet = snesHackSheet(on.bytes, 'test')
    const skating = sheet.sections.find((section) => section.heading === 'Skating and the puck')!
    expect(skating.items.map((item) => item.title)).toEqual(['Speed burst', 'Stopping and turning', 'Puck friction'])
    expect(skating.items[0].text).toContain('the same push, 20')
    expect(skating.items[1].text).toContain('more sharply')
    expect(skating.items[2].text).toContain('more slowly')
    expect(snesAmountText('speedBurst', 0)).toBe("the original game's")
  })
})

describe.skipIf(snesNames.length === 0)('skating and the puck, every SNES ROM', () => {
  const AMOUNTS: [SnesAmount, number, number][] = [
    ['speedBurst', 24, 50],
    ['turnRate', 150, 60],
    ['puckFriction', 8, 11],
  ]
  snesNames.forEach((name) => {
    it(`${name}: each goes in, changes and comes out`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      for (const [hack, first, second] of AMOUNTS) {
        expect(state.unknown).not.toContain(hack)
        expect(state.choices[hack]).toBe(false)
        expect(state.amounts![hack]).toBe(SNES_AMOUNT_OFF[hack])
        const on = reopen(applySnesHacks(rom, {}, false, { [hack]: first }))
        expect(detectSnesHacks(on.bytes).amounts![hack]).toBe(first)
        const changed = reopen(applySnesHacks(on, {}, false, { [hack]: second }))
        expect(detectSnesHacks(changed.bytes).amounts![hack]).toBe(second)
        expect(same(applySnesHacks(changed, {}, false, { [hack]: SNES_AMOUNT_OFF[hack] }), rom)).toBe(0)
      }
      // All three together, with choppy ice and free bursts.
      const all = reopen(applySnesHacks(rom, { choppyIce: true, freeBurst: true }, false, { speedBurst: 40, turnRate: 180, puckFriction: 12 }))
      expect(detectSnesHacks(all.bytes).amounts).toMatchObject({ speedBurst: 40, turnRate: 180, puckFriction: 12 })
      expect(detectSnesHacks(all.bytes).unknown).toEqual(state.unknown)
      expect(same(applySnesHacks(all, { choppyIce: false, freeBurst: false }, false, { speedBurst: 0, turnRate: SNES_AMOUNT_OFF.turnRate, puckFriction: 9 }), rom)).toBe(0)
    })
  })
})
