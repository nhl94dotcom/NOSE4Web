import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectHacks, hackRom, NO_HACKS } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

// The hacks made from the NHL94 Match Viewer project's readings of bugs 13, 20,
// 21 and 25, at the places it gives.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')

describe.skipIf(!existsSync(path('nhl94.bin')))("the Genesis hacks from Match Viewer's readings: sniping, awareness, the centres' defence, the goalie's turn and blade, shot scatter, referees and the crowd", () => {
  const rom = () => new Uint8Array(readFileSync(path('nhl94.bin')))

  it('changes only the bytes given, and reads each back', () => {
    for (const [choice, changes] of [
      [{ snipingFix: true }, { 0xc422: '4e714e71' }],
      [{ awarenessFix: true }, { 0xd0e1: '6a', 0xd2d9: '6a' }],
      [{ centreDefenceFix: true }, { 0xd27a: 'd2424e71' }],
      [{ goalieTurnFix: true }, { 0xdb86: '033c004467000022' }],
      // HotList frames 407-412 and 428-430: the facing-up goalie frames' hot spots, mirrored from the facing-down ones
      [{ goalieBladeFix: true }, { 0xa47f6: '01fa04fbfcff0bfc03fd01fb', 0xa4820: 'f9f9f9f8f802' }],
      [{ shotScatterFix: true }, { 0xc48a: '4a6f00046a0000044e71' }],
      // checkagr's mulu.w #$D,d0 and goalie interference's cmp.w #4,d0
      [{ referees: 'veryLenient' }, { 0x13e32: '001a', 0x13caa: '0002' }],
      [{ referees: 'lenient' }, { 0x13e32: '0011', 0x13caa: '0003' }],
      [{ referees: 'strict' }, { 0x13e32: '0009', 0x13caa: '0006' }],
      [{ referees: 'veryStrict' }, { 0x13e32: '0006', 0x13caa: '000a' }],
      [{ crowdFix: true }, { 0xfef66: '4e714e71' }],
    ] as const) {
      const before = rom()
      const after = hackRom(before, { ...NO_HACKS, ...choice })
      const changed = [...after.keys()].filter((i) => after[i] !== before[i])
      const expected = Object.entries(changes).flatMap(([at, bytes]) => [...Array(bytes.length / 2).keys()].map((i) => Number(at) + i))
      expect(changed.filter((i) => after[i] !== before[i])).toEqual(expected.filter((i) => before[i] !== after[i]))
      for (const [at, bytes] of Object.entries(changes)) expect(hex(after, Number(at), bytes.length / 2)).toBe(bytes)
      expect(detectHacks(after)).toEqual({ choices: { ...NO_HACKS, ...choice }, unknown: [] })
    }
    // The original bytes, as Match Viewer gives them.
    const original = rom()
    expect(hex(original, 0xc422, 4)).toBe('6b000084')
    expect(hex(original, 0xd0de, 6)).toBe('176b006b0040')
    expect(hex(original, 0xd2d6, 6)).toBe('176b006b0040')
    // asscenterd: moveq #-128,d1 / cmp.w #-88,d2 / blt.w .chkgoal / add.w (pucky).w,d1 / asr.w #1,d1
    expect(hex(original, 0xd270, 16)).toBe('7280b47cffa86d000008d278b75ee241')
    // AdjustFacingDirection: btst d1,#$42 / beq.w .add
    expect(hex(original, 0xdb86, 8)).toBe('033c004267000022')
    expect(hex(original, 0xfef66, 4)).toBe('6000000c')
    // doshot: tst.w 4(sp) / bpl.w .ycalc / lsr.w #1,d0 (the bottom net's y adjustment halved)
    expect(hex(original, 0xc48a, 10)).toBe('4a6f00046a000004e248')
    // GetHot: movea.l #HotList,a1
    expect(hex(original, 0x106f4, 6)).toBe('227c000a44c8')
  })

  it('mirrors each facing-up hot spot from its facing-down partner, the glove frames from the other hand', () => {
    const original = rom()
    const after = hackRom(original, { ...NO_HACKS, goalieBladeFix: true })
    const s8 = (b: number) => (b > 127 ? b - 256 : b)
    const spot = (r: Uint8Array, frame: number) => [s8(r[0xa44c8 + 2 * frame]), s8(r[0xa44c8 + 2 * frame + 1])]
    for (const [frame, from] of [[407, 419], [408, 421], [409, 420], [410, 416], [411, 418], [412, 417], [428, 422], [429, 424], [430, 423]]) {
      const [x, y] = spot(original, from)
      expect(spot(after, frame)).toEqual([x, -y])
    }
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('counting stick deflections as shots', () => {
  it("calls Match Viewer's code, byte for byte, from the deflection", () => {
    const before = new Uint8Array(readFileSync(path('nhl94.bin')))
    expect(hex(before, 0x151d6, 8)).toBe('6100af6660000528')
    const after = hackRom(before, { ...NO_HACKS, stickShots: true })
    expect(hex(after, 0x151d6, 2)).toBe('4eb9')
    expect(hex(after, 0x151dc, 2)).toBe('4e71')
    const at = (after[0x151d8] << 24) | (after[0x151d9] << 16) | (after[0x151da] << 8) | after[0x151db]
    expect(hex(after, at, 62)).toBe(
      '4a6a0034662a08380000c2ea662208380004c2ea661a08b80004c2ee6712487a001048e7c0703038bed84ef900012fd04eb90001013e588f4ef900015704',
    )
    expect(detectHacks(after)).toEqual({ choices: { ...NO_HACKS, stickShots: true }, unknown: [] })
    expect(Buffer.compare(hackRom(after, NO_HACKS), before)).toBe(0)
  })
})

// The computer centre's defence fix, in the league ROMs: the same code at the same place in each.
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const leagues = [local.league30Rom, ...(local.otherRoms ?? [])].filter(
  (name): name is string => !!name && !/EVO/.test(name) && existsSync(path(name)),
)
describe.skipIf(leagues.length === 0)("the computer centres' defence fix in league ROMs", () => {
  it.each(leagues)('goes in and comes out of %s at $D27A', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    expect(hex(before, 0xd270, 16)).toBe('7280b47cffa86d000008d278b75ee241')
    expect(detectHacks(before).choices.centreDefenceFix).toBe(false)
    // Other hacks are read and written back as they are, which in some league ROMs moves bytes elsewhere, so
    // only this place is compared.
    const choices = detectHacks(before).choices
    const after = hackRom(before, { ...choices, centreDefenceFix: true })
    expect(hex(after, 0xd270, 16)).toBe('7280b47cffa86d000008d2424e71e241')
    expect(detectHacks(after).choices).toEqual({ ...detectHacks(hackRom(before, choices)).choices, centreDefenceFix: true })
    expect(hex(hackRom(after, { ...choices, centreDefenceFix: false }), 0xd270, 16)).toBe('7280b47cffa86d000008d278b75ee241')
  })
})

// The goalie turning fix, in the league ROMs, EVO included: the same bytes at the same place in each.
const allLeagues = [local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && existsSync(path(name)))
describe.skipIf(allLeagues.length === 0)('the goalie turning fix in league ROMs', () => {
  it.each(allLeagues)('goes in and comes out of %s at $DB86', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    // btst #pfjoycon,pflags(a3) / bne.w .add / btst d1,#$42 / beq.w .add, once in the ROM
    expect(Buffer.from(before).indexOf(Buffer.from('033c004267000022', 'hex'))).toBe(0xdb86)
    expect(Buffer.from(before).indexOf(Buffer.from('033c004267000022', 'hex'), 0xdb87)).toBe(-1)
    expect(hex(before, 0xdb7c, 16)).toBe('082b000300626600002a033c00426700')
    expect(detectHacks(before).choices.goalieTurnFix).toBe(false)
    const choices = detectHacks(before).choices
    const after = hackRom(before, { ...choices, goalieTurnFix: true })
    expect(hex(after, 0xdb86, 8)).toBe('033c004467000022')
    expect(detectHacks(after).choices).toEqual({ ...detectHacks(hackRom(before, choices)).choices, goalieTurnFix: true })
    expect(hex(hackRom(after, { ...choices, goalieTurnFix: false }), 0xdb86, 8)).toBe('033c004267000022')
  })
})

// The referee setting in the league ROMs: EVO v0.4 has its own goalie interference code, so only checkagr changes there.
describe.skipIf(allLeagues.length === 0)('the referee setting in league ROMs', () => {
  it.each(allLeagues)('goes in and comes out of %s', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    const choices = detectHacks(before).choices
    expect(choices.referees).toBe('original')
    expect(hex(before, 0x13e26, 14)).toBe('303c0028902b0073e208c0fc000d')
    const own = hex(before, 0x13c9c, 16) === '303c0028902b00736100d3e0b07c0004'
    const after = hackRom(before, { ...choices, referees: 'veryStrict' })
    expect(hex(after, 0x13e32, 2)).toBe('0006')
    expect(hex(after, 0x13caa, 2)).toBe(own ? '000a' : hex(before, 0x13caa, 2))
    expect(detectHacks(after).choices).toEqual({ ...detectHacks(hackRom(before, choices)).choices, referees: 'veryStrict' })
    const back = hackRom(after, { ...choices, referees: 'original' })
    expect(hex(back, 0x13e26, 14)).toBe('303c0028902b0073e208c0fc000d')
    expect(hex(back, 0x13c9c, 16)).toBe(hex(before, 0x13c9c, 16))
  })
})

// The bottom goalie's stick fix and the shot aim fix in the league ROMs: EVO keeps HotList at $1F9400, found
// through GetHot.
describe.skipIf(allLeagues.length === 0)("the bottom net's stick and aim fixes in league ROMs", () => {
  it.each(allLeagues)('go in and come out of %s', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    const choices = detectHacks(before).choices
    expect(choices.goalieBladeFix).toBe(false)
    expect(choices.shotScatterFix).toBe(false)
    const hotList = Buffer.from(before).readUInt32BE(0x106f6)
    const after = hackRom(before, { ...choices, goalieBladeFix: true, shotScatterFix: true })
    expect(hex(after, hotList + 2 * 407, 12)).toBe('01fa04fbfcff0bfc03fd01fb')
    expect(hex(after, hotList + 2 * 428, 6)).toBe('f9f9f9f8f802')
    expect(hex(after, 0xc48a, 10)).toBe('4a6f00046a0000044e71')
    expect(detectHacks(after).choices).toEqual({ ...detectHacks(hackRom(before, choices)).choices, goalieBladeFix: true, shotScatterFix: true })
    const back = hackRom(after, { ...choices, goalieBladeFix: false, shotScatterFix: false })
    expect(hex(back, hotList + 2 * 407, 12)).toBe(hex(before, hotList + 2 * 407, 12))
    expect(hex(back, hotList + 2 * 428, 6)).toBe(hex(before, hotList + 2 * 428, 6))
    expect(hex(back, 0xc48a, 10)).toBe('4a6f00046a000004e248')
  })
})

const snes: [string, number, number[]][] = [
  ['NHL94.smc', 0xfcffb, [0xf04a0, 0xf0ace]],
  ['nhl94_2026.sfc', 0xfd10b, [0xf04a0, 0xf0ace]],
  ['nhl94snes_2026.sfc', 0xfd039, [0xf04a0, 0xf0ace]],
]

describe('the SNES comeback bonus fix and awareness option', () => {
  for (const [name, comeback, awareness] of snes) {
    it.skipIf(!existsSync(path(name)))(`are at the places Match Viewer gives, in ${name === 'NHL94.smc' ? 'the original' : 'a 2026'} ROM`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(detectSnesHacks(project.bytes).choices).toMatchObject({ comebackFix: false, awarenessFix: false })
      const hacked = applySnesHacks(project, { comebackFix: true, awarenessFix: true }).bytes
      const changed = [...hacked.keys()].filter((i) => hacked[i] !== project.bytes[i])
      expect(changed).toEqual([...awareness, comeback].sort((a, b) => a - b))
      expect(hacked[comeback]).toBe(0x30)
      for (const at of awareness) expect(hacked[at]).toBe(0x23)
      expect(detectSnesHacks(hacked).choices).toMatchObject({ comebackFix: true, awarenessFix: true })
      const back = applySnesHacks({ ...project, bytes: hacked }, { comebackFix: false, awarenessFix: false })
      expect(Buffer.compare(back.bytes, project.bytes)).toBe(0)
    })
  }
})

// Match Viewer's places: the shift of the touches (a2touchpuck), puckstick's
// .t1x and its jump to .3, and ChkShotStat.
const snesStats: [string, number, number, number, number][] = [
  ['NHL94.smc', 0xf4549, 0xf7714, 0xf768b, 0xf213],
  ['nhl94_2026.sfc', 0xf45b1, 0xf7797, 0xf770e, 0xf296],
  ['nhl94snes_2026.sfc', 0xf4591, 0xf7766, 0xf76dd, 0xf265],
]

describe('the SNES second-assist fix and stick deflections option', () => {
  for (const [name, shift, t1x, dot3, chkShotStat] of snesStats) {
    it.skipIf(!existsSync(path(name)))(`are at the places Match Viewer gives, in ${name === 'NHL94.smc' ? 'the original' : 'a 2026'} ROM`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const rom = project.bytes
      expect(detectSnesHacks(rom).choices).toMatchObject({ secondAssist: false, stickShots: false })
      const hacked = applySnesHacks(project, { secondAssist: true, stickShots: true }).bytes
      const call = (at: number) => 0xf0000 + hacked[at + 1] + (hacked[at + 2] << 8) - 0x8000
      const low = name === 'nhl94_2026.sfc' ? 0x77 : 0x17
      // The shift becomes a call to it with the test, and the rest of the 12 bytes do nothing.
      expect(hacked[shift]).toBe(0x20)
      expect([...hacked.slice(shift + 3, shift + 12)]).toEqual(Array(9).fill(0xea))
      const assist = call(shift)
      expect([...hacked.slice(assist, assist + 7)]).toEqual([0xa5, 0xa5, 0xd9, 0x9e, low, 0xf0, 0x06])
      expect([...hacked.slice(assist + 7, assist + 19)]).toEqual([...rom.slice(shift, shift + 12)])
      expect(hacked[assist + 19]).toBe(0x60)
      // .t1x's jump goes to code that counts a goalie's shot, then on to .3.
      const jump = t1x + 8
      expect(rom[jump]).toBe(0x4c)
      expect(call(jump)).not.toBe(dot3)
      const stick = call(jump)
      expect([...hacked.slice(stick, stick + 13)]).toEqual([
        0xb9, rom[t1x - 14], rom[t1x - 13], 0xd0, 0x04, 0x22, chkShotStat & 0xff, chkShotStat >> 8, 0x9e, 0x4c, rom[jump + 1], rom[jump + 2], hacked[stick + 12],
      ])
      expect(0xf0000 + rom[jump + 1] + (rom[jump + 2] << 8) - 0x8000).toBe(dot3)
      expect(detectSnesHacks(hacked).choices).toMatchObject({ secondAssist: true, stickShots: true })
      const back = applySnesHacks({ ...project, bytes: hacked }, { secondAssist: false, stickShots: false })
      expect(Buffer.compare(back.bytes, rom)).toBe(0)
    })
  }
})
