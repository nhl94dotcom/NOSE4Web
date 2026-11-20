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

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES real-time clock and no icing', () => {
  // The original game's places: Gameloop's and the highlights' sbc #$0AAA at $9F:85B5 and $9F:9052,
  // a2touchpuck's lda #ifok / tsb iflags / rtl at $9E:C5E9.
  const CLOCKS = [0xf85b5, 0xf9052]
  const ICING = 0xf45e9

  it('the real-time clock takes $0444 a frame where the original takes $0AAA', () => {
    const rom = open('NHL94.smc')
    for (const at of CLOCKS) expect(hex(rom.bytes, at - 1, 6)).toBe('38e9aa0a8d34')
    const on = applySnesHacks(rom, { realTime: true }).bytes
    for (const at of CLOCKS) expect(hex(on, at, 3)).toBe('e94404')
    expect(detectSnesHacks(on).choices.realTime).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { realTime: false })), buildRom(rom))).toBe(0)
  })

  it("the real-time clock counts the penalty box's second in 60 frames, and brings the first version up to date", () => {
    // updatepentime: lda Penaltytimer / sec / sbc d7 / sta / bpl / adc #$0018 at $9E:BF65.
    const BOX = 0xf3f66
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, BOX - 1, 6)).toBe('6918008d2216')
    const SHOT = 0xfb062
    expect(hex(rom.bytes, SHOT - 1, 4)).toBe('a9e8038d')
    const on = applySnesHacks(rom, { realTime: true })
    expect(hex(on.bytes, BOX, 2)).toBe('3c00')
    expect(hex(on.bytes, SHOT, 2)).toBe('c409')
    expect(detectSnesHacks(on.bytes).vaultVersions ?? []).not.toContain('realTime')
    // The first version: the clock only.
    const first = rom.bytes.slice()
    for (const at of CLOCKS) first.set([0x44, 0x04], at + 1)
    const read = detectSnesHacks(first)
    expect(read.choices.realTime).toBe(true)
    expect(read.unknown).not.toContain('realTime')
    expect(read.vaultVersions).toContain('realTime')
    const updated = applySnesHacks({ ...rom, bytes: first }, { realTime: true }, true)
    expect(Buffer.compare(updated.bytes, on.bytes)).toBe(0)
    expect(Buffer.compare(applySnesHacks({ ...rom, bytes: first }, { realTime: false }).bytes, rom.bytes)).toBe(0)
    // The version with the box but not the penalty shot's limit.
    const second = on.bytes.slice()
    second.set([0xe8, 0x03], SHOT)
    expect(detectSnesHacks(second).vaultVersions).toContain('realTime')
    expect(Buffer.compare(applySnesHacks({ ...rom, bytes: second }, { realTime: true }, true).bytes, on.bytes)).toBe(0)
    // Another number in the box's place is not ours.
    const odd = on.bytes.slice()
    odd[BOX] = 0x20
    expect(detectSnesHacks(odd).unknown).toContain('realTime')
  })

  it('the real-time clock goes with clutch time, which calls its code at the dec gameclock after it', () => {
    const rom = open('NHL94.smc')
    for (const order of [['clutchTime', 'realTime'], ['realTime', 'clutchTime']] as const) {
      const both = applySnesHacks(applySnesHacks(rom, { [order[0]]: true }), { [order[1]]: true })
      const read = detectSnesHacks(both.bytes)
      expect(read.choices.realTime && read.choices.clutchTime).toBe(true)
      expect(detectSnesHacks(applySnesHacks(both, { clutchTime: false }).bytes).choices.realTime).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(both, { realTime: false, clutchTime: false })), buildRom(rom))).toBe(0)
    }
  })

  it('no icing: the arming sets nothing', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, ICING, 7)).toBe('a904000cf10c6b')
    const on = applySnesHacks(rom, { noIcing: true }).bytes
    expect(hex(on, ICING, 7)).toBe('a900000cf10c6b')
    expect(detectSnesHacks(on).choices.noIcing).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { noIcing: false })), buildRom(rom))).toBe(0)
  })

  it('a ROM with another number in a place is left alone', () => {
    const rom = open('NHL94.smc')
    const odd = rom.bytes.slice()
    odd[CLOCKS[0] + 1] = 0x00
    odd[ICING + 1] = 0x05
    const state = detectSnesHacks(odd)
    expect(state.unknown).toContain('realTime')
    expect(state.unknown).toContain('noIcing')
  })

  it.each(names)('%s: both go in and come out with the icing options, byte for byte', (name) => {
    const rom = open(name)
    const state = detectSnesHacks(rom.bytes)
    expect(state.unknown).not.toContain('realTime')
    expect(state.unknown).not.toContain('noIcing')
    expect(state.choices.realTime).toBe(false)
    expect(state.choices.noIcing).toBe(false)
    const icing = { creaseIcing: !state.unknown.includes('creaseIcing'), hybridIcing: !state.unknown.includes('hybridIcing') }
    const on = openRom(buildRom(applySnesHacks(rom, { ...state.choices, realTime: true, noIcing: true, ...icing })))
    const read = detectSnesHacks(on.bytes)
    expect(read.choices).toEqual({ ...state.choices, realTime: true, noIcing: true, ...icing })
    const one = applySnesHacks(on, { ...read.choices, noIcing: false })
    expect(detectSnesHacks(one.bytes).choices).toEqual({ ...state.choices, realTime: true, ...icing })
    expect(Buffer.compare(buildRom(applySnesHacks(on, state.choices)), buildRom(rom))).toBe(0)
  })
})
