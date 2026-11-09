import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, withSnesHackChoice } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES 99-minute overtime on the fourth period length', () => {
  it('jumps from ResetClock to its code, which keeps the playoffs and the Clock as they were', () => {
    const project = open('NHL94.smc')
    const choices = withSnesHackChoice(detectSnesHacks(project.bytes).choices, 'fourthPeriodOvertime', true)
    // It needs the menu's fourth length, which the 30-second periods hack offers.
    expect(choices.thirtySecondPeriods).toBe(true)
    const on = applySnesHacks(project, choices)
    const site = Buffer.from(project.bytes).indexOf(Buffer.from('c90300300baf', 'hex')) + 5
    expect(hex(project.bytes, site, 11)).toMatch(/^af......d005a92c0185a5$/)
    expect(hex(on.bytes, site + 3, 8)).toBe('eaeaeaa92c0185a5')
    expect(on.bytes[site]).toBe(0x4c)
    const code = loRomOffset(Math.floor(site / 0x8000) | 0x80, on.bytes[site + 1] | (on.bytes[site + 2] << 8))
    const back = (site % 0x8000) + 0x8000
    const word = (value: number) => Buffer.from([value & 0xff, value >> 8]).toString('hex')
    // lda.l OptPlayMode; bne keep; lda.l Optperlen; cmp #3; bne normal; lda #5940; sta d0; keep: jmp .1; normal: jmp lda #300.
    expect(hex(on.bytes, code, 26)).toBe(`${hex(project.bytes, site, 4)}d00eafc2347ec90300d008a9341785a54c${word(back + 11)}4c${word(back + 6)}`)
    const again = openRom(buildRom(on))
    expect(detectSnesHacks(again.bytes).choices).toMatchObject({ fourthPeriodOvertime: true, thirtySecondPeriods: true })
    // The Clock's overtime is still found, and edited where it was.
    expect(again.settings.overtimeSeconds).toBe(300)
    const clock = openRom(buildRom({ ...again, settings: { ...again.settings, overtimeSeconds: 240 } }))
    expect(clock.settings.overtimeSeconds).toBe(240)
    expect(detectSnesHacks(clock.bytes).choices.fourthPeriodOvertime).toBe(true)
    // Out again: the original game.
    expect(applySnesHacks(on, { ...choices, fourthPeriodOvertime: false, thirtySecondPeriods: false }).bytes).toEqual(project.bytes)
  })

  it.each(names)('goes into %s and comes out again', (name) => {
    const project = open(name)
    const before = detectSnesHacks(project.bytes)
    expect(before.unknown).not.toContain('fourthPeriodOvertime')
    expect(before.choices.fourthPeriodOvertime).toBe(false)
    const choices = withSnesHackChoice(before.choices, 'fourthPeriodOvertime', true)
    const on = applySnesHacks(project, choices)
    const again = openRom(buildRom(on))
    expect(detectSnesHacks(again.bytes).choices.fourthPeriodOvertime).toBe(true)
    expect(again.settings.overtimeSeconds).toBe(project.settings.overtimeSeconds)
    expect(again.settings.shootoutSeconds).toBe(project.settings.shootoutSeconds)
    expect(applySnesHacks(on, before.choices).bytes).toEqual(project.bytes)
  })
})
