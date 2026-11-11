import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset, snesCodeInPlace } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES injury risk from knockdowns', () => {
  it('counts at FallDown .2, adds to the roll, clears each game and halves each intermission', () => {
    const project = open('NHL94.smc')
    expect(hex(project.bytes, 0xf1bd4, 3)).toBe('a97800')
    expect(hex(project.bytes, 0xf1dce, 3)).toMatch(/^f9/)
    const on = applySnesHacks(project, {}, false, { injuryBonus: 4 })
    // .2's lda #$0078 and the roll's sbc impact,y become jsr into one block in FallDown's bank.
    expect(on.bytes[0xf1bd4]).toBe(0x20)
    const block = loRomOffset(0x9e, on.bytes[0xf1bd5] | (on.bytes[0xf1bd6] << 8))
    expect(on.bytes[0xf1dce]).toBe(0x20)
    expect(loRomOffset(0x9e, on.bytes[0xf1dcf] | (on.bytes[0xf1dd0] << 8))).toBe(block + 54)
    // Count: a skater hit by a player, +1 to at most 255, at $7E:F034 + 64 for the away team + 2 x roster number; then lda #$0078.
    expect(hex(on.bytes, block, 54)).toMatch(/^daadd615d02bb9....f026e01800b021b9....29ff000aaab9....f0068a18694000aabf34f07ec9ff00b0051a9f34f07efaa9780060$/)
    // Roll: count x 4, at most 20, taken off as the impact is; the result in A for the bpl.
    expect(hex(on.bytes, block + 54, 21)).toMatch(/^48dab9....29ff000aaab9....f0068a18694000aa$/)
    expect(hex(on.bytes, block + 54 + 21, 44)).toBe('bf34f07eaaa90000e00000f00718690400ca80f4c914009003a91400fa48a30338f9' + hex(project.bytes, 0xf1dcf, 2) + '38e3018303686860')
    // Each game and each intermission go through the block, then on to restoreteams and forcefade.
    const start = 0xf8376 + 10
    const period = 0xf8cb1
    expect(hex(on.bytes, start, 1) + hex(on.bytes, period, 1)).toBe('2222')
    expect(hex(on.bytes, block + 119, 26)).toBe(`08c23048daa27e00a900009f34f07ecaca10f8fa68285c${hex(project.bytes, start + 1, 3)}`)
    expect(hex(on.bytes, block + 145, 28)).toBe(`08c23048daa27e00bf34f07e4a9f34f07ecaca10f3fa68285c${hex(project.bytes, period + 1, 3)}`)
    const again = openRom(buildRom(on))
    expect(detectSnesHacks(again.bytes).amounts).toMatchObject({ injuryBonus: 4 })
    // A new bonus in place, and out again.
    expect(detectSnesHacks(applySnesHacks(again, {}, false, { injuryBonus: 2 }).bytes).amounts).toMatchObject({ injuryBonus: 2 })
    expect(applySnesHacks(on, {}, false, { injuryBonus: 0 }).bytes).toEqual(project.bytes)
    expect(() => applySnesHacks(project, {}, false, { injuryBonus: 21 })).toThrow('from 0 to 20')
    // With the energy options too.
    const all = applySnesHacks(project, {}, false, { injuryBonus: 4, hitEnergy: 204, holdEnergy: 102 })
    expect(detectSnesHacks(openRom(buildRom(all)).bytes).amounts).toEqual({ injuryBonus: 4, hitEnergy: 204, holdEnergy: 102, penaltyTime: 60, fighting: -1, injuries: 0 })
    expect(applySnesHacks(all, {}, false, { injuryBonus: 0, hitEnergy: 0, holdEnergy: 0 }).bytes).toEqual(project.bytes)
  })

  it.each(names)('in %s goes in and out where the code is in place, and is not offered elsewhere', (name) => {
    const project = open(name)
    const state = detectSnesHacks(project.bytes)
    if (!snesCodeInPlace(project.bytes)) {
      expect(state.unknown).toContain('injuryBonus')
      return
    }
    expect(state.unknown).not.toContain('injuryBonus')
    const on = applySnesHacks(project, {}, false, { injuryBonus: 4 })
    expect(detectSnesHacks(openRom(buildRom(on)).bytes).amounts).toMatchObject({ injuryBonus: 4 })
    expect(applySnesHacks(on, {}, false, { injuryBonus: 0 }).bytes).toEqual(project.bytes)
  })
})
