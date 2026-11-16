import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { applyNhl95Hacks, detectNhl95Hacks, Nhl95HackError, nhl95HacksSupported } from '../src/core/nhl95hacks'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { changesSince, startSeason } from '../src/core/season'

// NHL '95 (USA) at ../NHL95/NHL_95.bin, and any NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[]; league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const PASS_AT = 0x7c5b8

describe.skipIf(names.length === 0)("NHL '95 hacks", () => {
  it.each(names)('puts the pass direction fix into %s and takes it out again', (name) => {
    const rom = open(name)
    expect(nhl95HacksSupported(rom.game)).toBe(true)
    expect(detectNhl95Hacks(rom.bytes)).toEqual({ choices: { passFix: false }, unknown: [] })
    const on = applyNhl95Hacks(rom, { passFix: true })
    expect(Array.from(on.bytes.subarray(PASS_AT, PASS_AT + 2))).toEqual([0xe5, 0x48])
    // Only the instruction's first byte differs ($E2 to $E5); nothing else changes.
    const changed = on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)
    expect(changed).toBe(1)
    expect(detectNhl95Hacks(on.bytes).choices.passFix).toBe(true)
    // It survives a rebuild, and comes out byte for byte.
    expect(detectNhl95Hacks(buildRom(on)).choices.passFix).toBe(true)
    expect(applyNhl95Hacks(on, { passFix: false }).bytes).toEqual(rom.bytes)
    expect(applyNhl95Hacks(rom, { passFix: false })).toBe(rom)
  })

  it('leaves code it does not know alone, and is for NHL 95 only', () => {
    const rom = open(RETAIL)
    const odd = rom.bytes.slice()
    odd[PASS_AT] = 0x4e
    odd[PASS_AT + 1] = 0x71
    expect(detectNhl95Hacks(odd).unknown).toEqual(['passFix'])
    expect(() => applyNhl95Hacks({ ...rom, bytes: odd }, { passFix: true })).toThrow(Nhl95HackError)
    const nhl94 = path('nhl94.bin')
    if (existsSync(nhl94)) {
      const project = openRom(new Uint8Array(readFileSync(nhl94)))
      expect(nhl95HacksSupported(project.game)).toBe(false)
      expect(() => applyNhl95Hacks(project, { passFix: true })).toThrow(Nhl95HackError)
    }
  })

  it('carries the fix in a project file, lists it in the changes and in a comparison', () => {
    const opened = open(RETAIL)
    const on = applyNhl95Hacks(opened, { passFix: true })
    const text = saveProjectFile(on, opened, 'P')
    expect(JSON.parse(text).nhl95Hacks).toEqual({ passFix: true })
    // Over the same ROM the ROM comes back whole; without that part, the hack is put in.
    expect(detectNhl95Hacks(openProjectFile(opened, text).project.bytes).choices.passFix).toBe(true)
    const result = openProjectFile(opened, JSON.stringify({ ...JSON.parse(text), rom: undefined }))
    expect(result.notes.join(' ')).toContain("The project's hacks were put into this ROM.")
    expect(buildRom(result.project)).toEqual(buildRom(on))

    const season = startSeason(opened, 'S', { clearFreeAgents: false })
    expect(changesSince(applyNhl95Hacks(season, { passFix: true }), season.baseline!).details.find((d) => d.heading === 'Hacks')?.changes).toEqual([
      'Pass direction fix: off to on.',
    ])
    const compared = compareProjects(opened, openRom(buildRom(on)))
    expect(compared.find((s) => s.heading === 'Hacks')?.changes).toEqual(['Pass direction fix: off to on.'])
  })
})
