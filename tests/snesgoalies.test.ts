import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_AMOUNT_OFF, SNES_HACK_TITLES, type SnesAmount } from '../src/core/sneshacks'
import { snesHackSheet } from '../src/core/hacksheet'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const changes = (a: Uint8Array, b: Uint8Array) => a.reduce((list, byte, i) => (byte !== b[i] ? [...list, i] : list), [] as number[])
const GOALIES: SnesAmount[] = ['goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine']

// Just enough of the 65816 (16-bit A, as the game runs here) to run the new code: lda abs,x / # / dp, sta dp,
// cmp #, sec, sbc dp, the branches and rtl. `ram` holds words by address (abs,x reads at address + x).
function run(code: Uint8Array, a: number, x: number, ram: Map<number, number>) {
  let pc = 0
  let n = false
  let z = false
  let c = false
  const set = (value: number) => {
    a = value & 0xffff
    n = (a & 0x8000) !== 0
    z = a === 0
  }
  const u16 = () => code[pc + 1] | (code[pc + 2] << 8)
  for (let steps = 0; steps < 100; steps++) {
    const op = code[pc]
    if (op === 0x6b) return { a, n, z, c }
    if (op === 0xbd) {
      set(ram.get(u16() + x) ?? 0)
      pc += 3
    } else if (op === 0xa9) {
      set(u16())
      pc += 3
    } else if (op === 0xa5) {
      set(ram.get(code[pc + 1]) ?? 0)
      pc += 2
    } else if (op === 0x85) {
      ram.set(code[pc + 1], a)
      pc += 2
    } else if (op === 0x38) {
      c = true
      pc += 1
    } else if (op === 0xe5) {
      const r = a - (ram.get(code[pc + 1]) ?? 0) - (c ? 0 : 1)
      set(r)
      c = r >= 0
      pc += 2
    } else if (op === 0xc9) {
      const r = a - u16()
      n = (r & 0x8000) !== 0
      z = (r & 0xffff) === 0
      c = r >= 0
      pc += 3
    } else {
      const taken = { 0x30: n, 0x10: !n, 0x90: !c, 0xb0: c, 0xf0: z, 0xd0: !z, 0x80: true }[op]
      if (taken === undefined) throw new Error(`opcode ${op.toString(16)}`)
      const by = code[pc + 1] >= 0x80 ? code[pc + 1] - 0x100 : code[pc + 1]
      pc += 2 + (taken ? by : 0)
    }
  }
  throw new Error('no rtl')
}
const signed = (v: number) => (v >= 0x8000 ? v - 0x10000 : v)

describe('SNES goalie settings', () => {
  it('are off at the original game', () => {
    expect([SNES_AMOUNT_OFF.goalieHold, SNES_AMOUNT_OFF.goalieWidth, SNES_AMOUNT_OFF.goalieOut, SNES_AMOUNT_OFF.goalieLine]).toEqual([140, 48, 228, 187])
    expect(GOALIES.map((hack) => SNES_HACK_TITLES[hack])).toEqual(['Goalie hold time', 'Goalie range to each side', 'Goalie range up the ice', 'Goalie whistle line'])
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES goalie settings in the original game', () => {
  const rom = existsSync(path('NHL94.smc')) ? open('NHL94.smc') : (undefined as never)
  // playerpad $19D4, Xpos $0D55, temp5 $1083, d7 $C1, r0 $00.
  const ram = (pad: number, values: Record<number, number>) => new Map<number, number>([[0x19d4, pad], ...Object.entries(values).map(([k, v]) => [Number(k), v] as [number, number])])

  it('the places are where the disassembly has them', () => {
    expect(hex(rom.bytes, 0xf1ad7, 9)).toBe('a491a98c00998310b9')
    expect(hex(rom.bytes, 0xf5485, 26)).toBe('bdb70dc9bb001013c945ff300e9e83108009a9ffff9d83108015')
    expect(hex(rom.bytes, 0xf54a0, 6)).toBe('bd831038e5c1')
    expect(hex(rom.bytes, 0xf5368, 6)).toBe('bd550dc9d0ff')
    expect(hex(rom.bytes, 0xf5381, 5)).toBe('8500c9e400')
  })

  it('the hold time is its frames, and no whistle is the new code for a person\'s goalie', () => {
    const on = applySnesHacks(rom, {}, false, { goalieHold: 300 }).bytes
    expect(changes(on, rom.bytes)).toEqual([0xf1ada, 0xf1adb])
    expect(hex(on, 0xf1ada, 2)).toBe('2c01')
    const never = applySnesHacks(rom, {}, false, { goalieHold: 0 }).bytes
    expect(hex(never, 0xf1ada, 2)).toBe('8c00')
    expect(hex(never, 0xf54a0, 6)).toMatch(/^22......eaea$/)
    const code = never.slice(far(never, 0xf54a0), far(never, 0xf54a0) + 40)
    // A person's goalie: his count stays above 5, and runs out from 5 or below (the whistle line's 0, a dive's 5).
    for (const count of [0, 3, 5, 6, 100, 140]) {
      const out = run(code, 0x1234, 0, ram(0, { 0x1083: count, 0xc1: 2 }))
      expect([out.a, out.n]).toEqual(count > 5 ? [count, false] : [(count - 2) & 0xffff, count < 2])
    }
    // The computer's: counted down as before.
    for (const count of [0, 6, 140]) expect(run(code, 0, 0, ram(0xffff, { 0x1083: count, 0xc1: 1 })).a).toBe((count - 1) & 0xffff)
  })

  it('the whistle line is its two numbers', () => {
    const on = applySnesHacks(rom, {}, false, { goalieLine: 150 }).bytes
    expect(changes(on, rom.bytes)).toEqual([0xf5489, 0xf548e])
    expect(hex(on, 0xf5488, 8)).toBe('c99600' + '1013' + 'c96aff')
  })

  it("the range changes the box for a person's goalie only", () => {
    for (const width of [0, 20, 48, 60, 124]) {
      const on = applySnesHacks(rom, {}, false, { goalieWidth: width === 48 ? 47 : width }).bytes
      const w = width === 48 ? 47 : width
      expect(hex(on, 0xf5368, 6)).toMatch(/^22......eaea$/)
      const code = on.slice(far(on, 0xf5368), far(on, 0xf5368) + 60)
      for (let x = -130; x <= 130; x++) {
        for (const pad of [0, 0xffff]) {
          const out = run(code, 0, 0, ram(pad, { 0x0d55: x & 0xffff }))
          // Then bmi .4 / cmp #$0031 / bpl .4: outside the box.
          const outside = out.n || signed(out.a) - 0x31 >= 0
          const limit = pad === 0 ? w : 48
          expect(outside).toBe(x < -limit || x > limit)
        }
      }
    }
    const on = applySnesHacks(rom, {}, false, { goalieOut: 200 }).bytes
    expect(hex(on, 0xf5381, 5)).toMatch(/^22......ea$/)
    const code = on.slice(far(on, 0xf5381), far(on, 0xf5381) + 30)
    for (let depth = 150; depth <= 300; depth++) {
      for (const pad of [0, 0xffff]) {
        const r = ram(pad, {})
        const out = run(code, depth, 0, r)
        expect(r.get(0)).toBe(depth)
        expect(out.n).toBe(depth < (pad === 0 ? 200 : 228))
      }
    }
  })
})

describe.skipIf(names.length === 0)('SNES goalie settings in every ROM', () => {
  it.each(names)('%s: each reads back, changes, goes with the others and comes out', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    for (const hack of GOALIES) {
      expect(before.unknown).not.toContain(hack)
      expect(before.choices[hack]).toBe(false)
      expect(before.amounts?.[hack]).toBe(SNES_AMOUNT_OFF[hack])
    }
    const amounts: Record<SnesAmount, number[]> = { goalieHold: [0, 300, 1], goalieWidth: [70, 0], goalieOut: [180, 255], goalieLine: [120, 210, 0] } as Record<SnesAmount, number[]>
    for (const hack of GOALIES) {
      for (const amount of amounts[hack]) {
        const on = applySnesHacks(rom, {}, false, { [hack]: amount })
        const read = detectSnesHacks(openRom(buildRom(on)).bytes)
        expect(read.choices[hack]).toBe(true)
        expect(read.amounts?.[hack]).toBe(amount)
        expect(read.unknown).toEqual(before.unknown)
        // Another amount over it, then the original again, by amount and by off.
        const other = applySnesHacks(on, {}, false, { [hack]: amounts[hack][(amounts[hack].indexOf(amount) + 1) % amounts[hack].length] })
        expect(detectSnesHacks(other.bytes).amounts?.[hack]).toBe(amounts[hack][(amounts[hack].indexOf(amount) + 1) % amounts[hack].length])
        expect(Buffer.compare(buildRom(applySnesHacks(other, {}, false, { [hack]: SNES_AMOUNT_OFF[hack] })), buildRom(rom))).toBe(0)
        expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom(on)), { [hack]: false })), buildRom(rom))).toBe(0)
      }
    }
    // All four with the goalie poke (whose code finds puckglue's hold too), and out again.
    const all = applySnesHacks(rom, { goaliePoke: !before.choices.goaliePoke ? true : undefined }, false, { goalieHold: 0, goalieWidth: 70, goalieOut: 200, goalieLine: 150 })
    const read = detectSnesHacks(openRom(buildRom(all)).bytes)
    expect(GOALIES.map((hack) => read.amounts?.[hack])).toEqual([0, 70, 200, 150])
    expect(read.choices.goaliePoke).toBe(true)
    expect(read.unknown).toEqual(before.unknown)
    const sheet = snesHackSheet(all.bytes, name).sections.find((section) => section.heading === 'Goalies')
    expect(sheet?.items.map((item) => item.title)).toEqual(expect.arrayContaining(GOALIES.map((hack) => SNES_HACK_TITLES[hack])))
    const off = applySnesHacks(all, { goaliePoke: before.choices.goaliePoke ? undefined : false, goalieHold: false, goalieWidth: false, goalieOut: false, goalieLine: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
    // Hold time 300 with the goalie poke: both found.
    const both = detectSnesHacks(applySnesHacks(all, {}, false, { goalieHold: 300 }).bytes)
    expect([both.amounts?.goalieHold, both.choices.goaliePoke]).toEqual([300, true])
  })
})
