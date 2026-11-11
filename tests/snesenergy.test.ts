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
  it("can let energy take all of a skater's speed, in every build", () => {
    const project = open('NHL94.smc')
    // playeracc: lda d0 / lsr / clc / adc #$800 / tax / pla / asl x4 / jsl Mul16x8U.
    expect(hex(project.bytes, 0xf2803, 14)).toBe('a5a54a18690008aa680a0a0a0a22')
    // Goalies never go to the bench, so it needs skating to cost nothing (Match Viewer).
    expect(() => applySnesHacks(project, { energySpeed: true })).toThrow('needs the skating costs no energy on')
    const on = applySnesHacks(project, { energySpeed: true, noSkatingDrain: true })
    expect(hex(on.bytes, 0xf2803, 14)).toBe('a5a5eaeaeaeaeaaa680a0a0a0a22')
    expect(detectSnesHacks(on.bytes).choices.energySpeed).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom(on)), { energySpeed: false, noSkatingDrain: false })), buildRom(project))).toBe(0)
    for (const name of names) expect(detectSnesHacks(open(name).bytes).unknown, name).not.toContain('energySpeed')
  })

  it('can make skating and speed bursts cost no energy, in every build', () => {
    const project = open('NHL94.smc')
    // playeracc's drain: lda seed / and #$3F / bne past it at $9E:A867; burst's sbc #$CC at $9E:820C.
    expect(hex(project.bytes, 0xf2861, 8)).toBe('ad9207293f00d01f')
    expect(hex(project.bytes, 0xf020b, 4)).toBe('38e9cc00')
    const on = applySnesHacks(project, { noSkatingDrain: true, freeBurst: true }, false, { hitEnergy: 1365, holdEnergy: 683 })
    expect(hex(on.bytes, 0xf2867, 2)).toBe('801f')
    expect(hex(on.bytes, 0xf020c, 3)).toBe('e90000')
    const state = detectSnesHacks(on.bytes)
    expect(state.choices).toMatchObject({ noSkatingDrain: true, freeBurst: true, hitEnergy: true, holdEnergy: true })
    expect(state.amounts).toMatchObject({ hitEnergy: 1365, holdEnergy: 683 })
    // Off again, the ROM is as it was.
    const off = applySnesHacks(openRom(buildRom(on)), { noSkatingDrain: false, freeBurst: false, hitEnergy: false, holdEnergy: false })
    expect(Buffer.compare(buildRom(off), buildRom(project))).toBe(0)
    // Found in the other builds too.
    for (const name of names) expect(detectSnesHacks(open(name).bytes).unknown, name).not.toContain('noSkatingDrain')
    for (const name of names) expect(detectSnesHacks(open(name).bytes).unknown, name).not.toContain('freeBurst')
    expect(() => applySnesHacks(project, {}, false, { hitEnergy: 4097 })).toThrow('from 0 to 4096')
  })

  it('jsr from FallDown and holdcheck to code that takes the amounts, with line changes on', () => {
    const project = open('NHL94.smc')
    expect(detectSnesHacks(project.bytes).amounts).toEqual({ hitEnergy: 0, holdEnergy: 0, injuryBonus: 0, penaltyTime: 60 })
    const on = applySnesHacks(project, {}, false, { hitEnergy: 100, holdEnergy: 50 })
    // FallDown's .t2 at $9E:9BB3: lda.w position,x becomes jsr, the beq after it kept.
    const t2 = 0xf1bb3
    expect(hex(project.bytes, t2, 5)).toBe('bd430ff0' + hex(project.bytes, t2 + 4, 1))
    expect(on.bytes[t2]).toBe(0x20)
    expect(hex(on.bytes, t2 + 3, 2)).toBe(hex(project.bytes, t2 + 3, 2))
    // Save X, Y, a2, d0, d1; lda.l OptLine; beq; cpx #$18; bcs; ldy a2; lda position,y; beq; tyx; jsl getpde; sbc #100; jsl setpde; restore; lda position,x; rts.
    expect(hex(on.bytes, target(on.bytes, t2), 66)).toBe(
      'da5aa59148a5a548a5a948' + 'add615d023' + 'afc6347ef01de01800b018a491b9430ff011bb22b2dc9fa5a538e9640085a522d3dc9f6885a96885a5688591' + '7afabd430f60',
    )
    // holdcheck's lda.w #SPAflail becomes jsr; the code takes 50 off X, then loads SPAflail.
    const hold = 0xf2361
    expect(on.bytes[hold]).toBe(0x20)
    const flail = hex(project.bytes, hold + 1, 2)
    expect(hex(on.bytes, target(on.bytes, hold), 53)).toBe(
      'da5aa59148a5a548a5a948' + 'add615d016' + 'afc6347ef01022b2dc9fa5a538e9320085a522d3dc9f6885a96885a5688591' + `7afaa9${flail}60`,
    )
    const again = openRom(buildRom(on))
    const state = detectSnesHacks(again.bytes)
    expect(state.choices).toMatchObject({ hitEnergy: true, holdEnergy: true })
    expect(state.amounts).toMatchObject({ hitEnergy: 100, holdEnergy: 50 })
    expect(snesHacksForDiscord(again.bytes, 'Test')).toContain('**Energy lost when knocked down**: 100')
    // A new amount replaces the old in place; 0 takes it out.
    const more = applySnesHacks(again, {}, false, { hitEnergy: 204 })
    expect(detectSnesHacks(more.bytes).amounts).toMatchObject({ hitEnergy: 204, holdEnergy: 50 })
    expect(snesHackDifferences(again.bytes, more.bytes)).toEqual(['Energy lost when knocked down: 100 to 204.'])
    expect(applySnesHacks(on, {}, false, { hitEnergy: 0, holdEnergy: 0 }).bytes).toEqual(project.bytes)
    expect(() => applySnesHacks(project, {}, false, { hitEnergy: 4097 })).toThrow('from 0 to 4096')
    // NOSE4Web's first version (41def89), which took energy after the whistle: recognised as an earlier version, and replaced on request.
    const first = on.bytes.slice()
    const code = target(on.bytes, t2)
    const current = on.bytes.slice(code, code + 66)
    first.fill(0xff, code, code + 66)
    first.set([...current.subarray(0, 11), ...current.subarray(16)], code)
    const earlier = detectSnesHacks(first)
    expect(earlier.choices.hitEnergy).toBe(true)
    expect(earlier.amounts).toMatchObject({ hitEnergy: 100 })
    expect(earlier.vaultVersions).toContain('hitEnergy')
    const renewed = applySnesHacks(openRom(first), { hitEnergy: true }, true)
    expect(detectSnesHacks(renewed.bytes).vaultVersions).not.toContain('hitEnergy')
    expect(detectSnesHacks(renewed.bytes).amounts).toMatchObject({ hitEnergy: 100 })
    expect(hex(renewed.bytes, target(renewed.bytes, t2) + 11, 5)).toBe('add615d023')
    // A project file keeps the amounts.
    const reopened = openProjectFile(project, saveProjectFile(again, project, 'test')).project
    expect(detectSnesHacks(reopened.bytes).amounts).toMatchObject({ hitEnergy: 100, holdEnergy: 50 })
  })

  it.each(names)('goes into %s and comes out again', (name) => {
    const project = open(name)
    const before = detectSnesHacks(project.bytes)
    expect(before.unknown).not.toContain('hitEnergy')
    expect(before.unknown).not.toContain('holdEnergy')
    const on = applySnesHacks(project, {}, false, { hitEnergy: 100, holdEnergy: 50 })
    expect(detectSnesHacks(openRom(buildRom(on)).bytes).amounts).toMatchObject({ hitEnergy: 100, holdEnergy: 50 })
    expect(applySnesHacks(on, {}, false, { hitEnergy: 0, holdEnergy: 0 }).bytes).toEqual(project.bytes)
  })
})
