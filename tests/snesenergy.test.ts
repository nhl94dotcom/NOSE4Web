import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, snesHackDifferences, snesHacksForDiscord } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')
const target = (rom: Uint8Array, site: number) => loRomOffset(Math.floor(site / 0x8000) | 0x80, rom[site + 1] | (rom[site + 2] << 8))

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES energy lost to hits', () => {
  it('jsr from FallDown and holdcheck to code that takes the amounts, with line changes on', () => {
    const project = open('NHL94.smc')
    expect(detectSnesHacks(project.bytes).amounts).toEqual({ hitEnergy: 0, holdEnergy: 0 })
    const on = applySnesHacks(project, {}, false, { hitEnergy: 100, holdEnergy: 50 })
    // FallDown's .t2 at $9E:9BB3: lda.w position,x becomes jsr, the beq after it kept.
    const t2 = 0xf1bb3
    expect(hex(project.bytes, t2, 5)).toBe('bd430ff0' + hex(project.bytes, t2 + 4, 1))
    expect(on.bytes[t2]).toBe(0x20)
    expect(hex(on.bytes, t2 + 3, 2)).toBe(hex(project.bytes, t2 + 3, 2))
    // Save X, Y, a2, d0, d1; lda.l OptLine; beq; cpx #$18; bcs; ldy a2; lda position,y; beq; tyx; jsl getpde; sbc #100; jsl setpde; restore; lda position,x; rts.
    expect(hex(on.bytes, target(on.bytes, t2), 61)).toBe(
      'da5aa59148a5a548a5a948afc6347ef01de01800b018a491b9430ff011bb22b2dc9fa5a538e9640085a522d3dc9f6885a96885a5688591' + '7afabd430f60',
    )
    // holdcheck's lda.w #SPAflail becomes jsr; the code takes 50 off X, then loads SPAflail.
    const hold = 0xf2361
    expect(on.bytes[hold]).toBe(0x20)
    const flail = hex(project.bytes, hold + 1, 2)
    expect(hex(on.bytes, target(on.bytes, hold), 48)).toBe(
      'da5aa59148a5a548a5a948afc6347ef01022b2dc9fa5a538e9320085a522d3dc9f6885a96885a5688591' + `7afaa9${flail}60`,
    )
    const again = openRom(buildRom(on))
    const state = detectSnesHacks(again.bytes)
    expect(state.choices).toMatchObject({ hitEnergy: true, holdEnergy: true })
    expect(state.amounts).toEqual({ hitEnergy: 100, holdEnergy: 50 })
    expect(snesHacksForDiscord(again.bytes, 'Test')).toContain('**Energy lost when knocked down**: 100')
    // A new amount replaces the old in place; 0 takes it out.
    const more = applySnesHacks(again, {}, false, { hitEnergy: 204 })
    expect(detectSnesHacks(more.bytes).amounts).toEqual({ hitEnergy: 204, holdEnergy: 50 })
    expect(snesHackDifferences(again.bytes, more.bytes)).toEqual(['Energy lost when knocked down: 100 to 204.'])
    expect(applySnesHacks(on, {}, false, { hitEnergy: 0, holdEnergy: 0 }).bytes).toEqual(project.bytes)
    expect(() => applySnesHacks(project, {}, false, { hitEnergy: 1025 })).toThrow('from 0 to 1024')
    // A project file keeps the amounts.
    const reopened = openProjectFile(project, saveProjectFile(again, project, 'test')).project
    expect(detectSnesHacks(reopened.bytes).amounts).toEqual({ hitEnergy: 100, holdEnergy: 50 })
  })

  it.each(names)('goes into %s and comes out again', (name) => {
    const project = open(name)
    const before = detectSnesHacks(project.bytes)
    expect(before.unknown).not.toContain('hitEnergy')
    expect(before.unknown).not.toContain('holdEnergy')
    const on = applySnesHacks(project, {}, false, { hitEnergy: 100, holdEnergy: 50 })
    expect(detectSnesHacks(openRom(buildRom(on)).bytes).amounts).toEqual({ hitEnergy: 100, holdEnergy: 50 })
    expect(applySnesHacks(on, {}, false, { hitEnergy: 0, holdEnergy: 0 }).bytes).toEqual(project.bytes)
  })
})
