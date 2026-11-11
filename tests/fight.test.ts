import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { FIGHT_BLOCKS, FIGHT_CHANGES } from '../src/core/fightdata'
import { canAddGenesisBlood, withGenesisBloodAdded } from '../src/core/genesisblood'
import { applyHacks, detectHacks, NO_HACKS, RECOMMENDED_FIXES } from '../src/core/hacks'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const GENESIS = path('nhl94.bin')
const fresh = () => openRom(new Uint8Array(readFileSync(GENESIS)))
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const leagues = [local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && existsSync(path(name)))

describe.skipIf(!existsSync(GENESIS))("chaos's fighting patch", () => {
  it("goes into the original game as chaos's build has it, and comes out again", () => {
    const opened = fresh()
    const fighting = applyHacks(opened, { ...NO_HACKS, fighting: 'on' })
    expect(fighting.bytes.length).toBe(0x300000)
    expect(detectHacks(fighting.bytes).choices.fighting).toBe('on')
    // chaos's bytes at each place, but for the five menu pointers the editor points at the menu it makes.
    const pointers = [0xf807c, 0xf7bba, 0xf79ac, 0xf79ba]
    for (const change of FIGHT_CHANGES) {
      const patched = decode(change.patched)
      patched.forEach((byte, i) => {
        if (!pointers.some((p) => change.at + i >= p && change.at + i < p + 4)) expect(fighting.bytes[change.at + i]).toBe(byte)
      })
    }
    for (const block of FIGHT_BLOCKS) expect(fighting.bytes[block.at]).toBe(decode(block.bytes)[0])
    // The menu's starting choice: 0 Off, 1 On, 2 Arcade, in loadDefFight.
    for (const [choice, value] of [['off', 0], ['on', 1], ['arcade', 2]] as const) {
      const rom = applyHacks(opened, { ...NO_HACKS, fighting: choice }).bytes
      expect((rom[0x200ae4] << 8) | rom[0x200ae5]).toBe(value)
      expect(detectHacks(rom).choices.fighting).toBe(choice)
    }
    // The downloaded ROM opens as the same, with the menu read as the original's.
    const again = openRom(buildRom(fighting))
    expect(detectHacks(again.bytes)).toEqual({ choices: { ...NO_HACKS, fighting: 'on' }, unknown: [] })
    expect(again.settings.menu.map((item) => item.options)).toEqual(opened.settings.menu.map((item) => item.options))
    expect(again.settings.periodLengths.map((p) => p.text)).toEqual(opened.settings.periodLengths.map((p) => p.text))
    expect(checkProject(again).filter((f) => f.level === 'problem')).toEqual([])
    // Taken out, the ROM is the original again, 1 MB.
    const out = applyHacks(again, NO_HACKS)
    expect(out.bytes.length).toBe(0x100000)
    expect(same(buildRom(out), buildRom(opened))).toBe(true)
  })

  it("keeps the other hacks' code below 2 MB, and goes with them", () => {
    const both = applyHacks(fresh(), { ...NO_HACKS, ...RECOMMENDED_FIXES, repeatCheckFix: true, fighting: 'arcade' })
    expect(detectHacks(both.bytes)).toEqual({ choices: { ...NO_HACKS, ...RECOMMENDED_FIXES, repeatCheckFix: true, fighting: 'arcade' }, unknown: [] })
    const target = (both.bytes[0x140aa] << 24) | (both.bytes[0x140ab] << 16) | (both.bytes[0x140ac] << 8) | both.bytes[0x140ad]
    expect(target).toBeLessThan(0x1f9a00)
    // Changing the others leaves fighting as it is.
    const fewer = applyHacks(both, { ...NO_HACKS, fighting: 'arcade' })
    expect(detectHacks(fewer.bytes).choices).toEqual({ ...NO_HACKS, fighting: 'arcade' })
  })

  it('a menu choice edited in the editor is written where the patched menu reads it', () => {
    const fighting = applyHacks(fresh(), { ...NO_HACKS, fighting: 'on' })
    const periodLengths = fighting.settings.periodLengths.map((p, i) => (i === 0 ? { ...p, text: '4 Minutes' } : p))
    const again = openRom(buildRom({ ...fighting, settings: { ...fighting.settings, periodLengths } }))
    expect(again.settings.periodLengths[0].text).toBe('4 Minutes')
    // The menu reads the copy the editor made, where the cmpa.l at $F7BB8 points.
    const periods = (again.bytes[0xf7bba] << 24) | (again.bytes[0xf7bbb] << 16) | (again.bytes[0xf7bbc] << 8) | again.bytes[0xf7bbd]
    expect(periods).toBeGreaterThan(0x209640)
    expect(new TextDecoder().decode(again.bytes.subarray(periods + 2, periods + 11))).toBe('4 Minutes')
  })

  it('does not go with head bleeding yet, either way round', () => {
    const blood = withGenesisBloodAdded(fresh())
    expect(() => applyHacks(blood, { ...detectHacks(blood.bytes).choices, fighting: 'on' })).toThrow(/Head bleeding/)
    expect(canAddGenesisBlood(applyHacks(fresh(), { ...NO_HACKS, fighting: 'on' }))).toBe(false)
  })

  it('is kept in a project file', () => {
    const fighting = applyHacks(fresh(), { ...NO_HACKS, fighting: 'off' })
    const { project } = openProjectFile(fresh(), saveProjectFile(fighting, fresh(), 'Fights'))
    expect(detectHacks(project.bytes).choices.fighting).toBe('off')
    expect(same(buildRom(project), buildRom(fighting))).toBe(true)
  })
})

describe.skipIf(leagues.length === 0)("chaos's fighting patch in the ROMs on this computer", () => {
  // Numbered, so that no ROM's name appears in the test results.
  leagues.forEach((name, n) => {
    it(`ROM ${n + 1}: goes in with the league's own menu kept, or says why not`, () => {
      const opened = openRom(new Uint8Array(readFileSync(path(name))))
      const choices = detectHacks(opened.bytes).choices
      let fighting
      try {
        fighting = applyHacks(opened, { ...choices, fighting: 'arcade' })
      } catch (e) {
        expect((e as Error).message).toMatch(/\./)
        return
      }
      const again = openRom(buildRom(fighting))
      expect(detectHacks(again.bytes).choices.fighting).toBe('arcade')
      // The menu as the league has it: captions, choices, starting values, the teams offered and the period lengths.
      expect(again.settings.menu).toEqual(opened.settings.menu)
      expect(again.settings.menuTeams).toEqual(opened.settings.menuTeams)
      expect(again.settings.periodLengths).toEqual(opened.settings.periodLengths)
      expect(again.teams.map((t) => t.names.join())).toEqual(opened.teams.map((t) => t.names.join()))
      // Taken out, the ROM is as it is with its hacks put in again without it.
      const out = applyHacks(again, choices)
      expect(same(buildRom(out), buildRom(applyHacks(opened, choices)))).toBe(true)
    })
  })
})
