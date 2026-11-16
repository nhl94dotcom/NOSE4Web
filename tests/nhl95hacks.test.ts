import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { PASS_CODE } from '../src/core/hacks'
import { hackSheetDiscord, hackSheetHtml } from '../src/core/hacksheet'
import { applyNhl95Hacks, detectNhl95Hacks, NO_NHL95_HACKS, Nhl95HackError, nhl95HackSheet, nhl95HacksForDiscord, nhl95HacksSupported } from '../src/core/nhl95hacks'
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
    expect(detectNhl95Hacks(rom.bytes)).toEqual({ choices: { ...NO_NHL95_HACKS }, unknown: [] })
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
    expect(JSON.parse(text).nhl95Hacks).toEqual({ ...NO_NHL95_HACKS, passFix: true })
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

  it('names the fix in a Discord post and explains it in the hack sheet', () => {
    const rom = open(RETAIL)
    expect(nhl95HacksForDiscord(rom.bytes, 'W18')).toBe(['**Hacks in W18**', 'None: it plays as the original game.'].join('\n'))
    expect(nhl95HackSheet(rom.bytes, 'W18').sections).toEqual([])
    const on = applyNhl95Hacks(rom, { passFix: true }).bytes
    expect(nhl95HacksForDiscord(on, 'W18')).toBe(['**Hacks in W18**', '- **Pass direction fix**'].join('\n'))
    const sheet = nhl95HackSheet(on, 'W18')
    expect(sheet.game).toBe("NHL '95 for the Genesis")
    expect(sheet.sections[0].items[0].title).toBe('Pass direction fix')
    expect(hackSheetDiscord(sheet)[0]).toContain('- **Pass direction fix**: A pass goes the way the pad points')
    expect(hackSheetHtml(sheet)).toContain('<dt>Pass direction fix</dt>')
  })

  it.each(names)("puts NHL 94's three assist fixes into %s at NHL '95's places, alone and together, and takes them out", (name) => {
    const rom = open(name)
    expect(detectNhl95Hacks(rom.bytes)).toEqual({ choices: { ...NO_NHL95_HACKS }, unknown: [] })
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const jsrAt = (b: Uint8Array, at: number) => (b[at] === 0x4e && b[at + 1] === 0xb9 ? read32(b, at + 2) : null)
    const all = applyNhl95Hacks(rom, { secondAssist: true, oneTimerAssist: true, regainAssist: true })
    expect(detectNhl95Hacks(all.bytes).choices).toEqual({ ...NO_NHL95_HACKS, secondAssist: true, oneTimerAssist: true, regainAssist: true })
    // a2touchpuck's list move and its compare call the fixes; onetimershot calls the one-timer fix, with the second-assist check.
    const regain = jsrAt(all.bytes, 0x81464)!
    expect(Buffer.from(all.bytes.subarray(regain, regain + 20)).toString('hex')).toBe('b0680018660c08a8000300302ebc000814924e75')
    expect(jsrAt(all.bytes, 0x81476)).not.toBeNull()
    const oneTimer = jsrAt(all.bytes, 0x82f28)!
    expect(Buffer.from(all.bytes.subarray(oneTimer + 14, oneTimer + 20)).toString('hex')).toBe('b068001a6706')
    // Each alone, and all out again byte for byte.
    for (const hack of ['secondAssist', 'oneTimerAssist', 'regainAssist'] as const) {
      const one = applyNhl95Hacks(rom, { [hack]: true })
      expect(detectNhl95Hacks(one.bytes).choices[hack]).toBe(true)
      expect(applyNhl95Hacks(one, { [hack]: false }).bytes).toEqual(rom.bytes)
    }
    expect(applyNhl95Hacks(all, { secondAssist: false, oneTimerAssist: false, regainAssist: false }).bytes).toEqual(rom.bytes)
    // The second-assist fix out with the one-timer fix kept: its check leaves the one-timer code too.
    const kept = applyNhl95Hacks(all, { secondAssist: false })
    expect(detectNhl95Hacks(kept.bytes).choices).toMatchObject({ secondAssist: false, oneTimerAssist: true })
    const kept1 = jsrAt(kept.bytes, 0x82f28)!
    expect(Buffer.from(kept.bytes.subarray(kept1 + 14, kept1 + 18)).toString('hex')).toBe('3168001a')
    // Through a rebuild, as downloaded.
    expect(detectNhl95Hacks(buildRom(all)).choices).toMatchObject({ secondAssist: true, oneTimerAssist: true, regainAssist: true })
  })

  it.each(names)("puts the rocket pass fix into %s with NHL '95's slow flat pass kept, alone and with the rest", (name) => {
    const rom = open(name)
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const on = applyNhl95Hacks(rom, { rocketFix: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, rocketFix: true })
    // A call over the 74 bytes from the time's loop to .5, and NOPs after it.
    expect(hex(on.bytes, 0x847ba, 2)).toBe('4eb9')
    for (let at = 0x847c0; at < 0x84804; at += 2) expect(hex(on.bytes, at, 2)).toBe('4e71')
    const code = read32(on.bytes, 0x847bc)
    // NHL 94's code up to the lift, then NHL '95's end on puckvz $B38E with GameFlags bit 1.
    expect(on.bytes.subarray(code, code + 0x48)).toEqual(PASS_CODE.subarray(0, 0x48))
    // The original's whole eighths in d1, the slow pass's four times, the lift as NHL '95 makes it, then at $78 the
    // receiver's wait: the original's where over 127 (a signed byte, so he gives up as there), else the exact, at most 127.
    expect(hex(on.bytes, code + 0x48, 0x10)).toBe('3202e64908380001bf086704e542e541')
    expect(hex(on.bytes, code + 0x58, 0x20)).toBe('3002e64811c0b38eb07c000c6d1211fc000cb38e08380001bf0867044278b38e')
    expect(hex(on.bytes, code + 0x78, 0x20)).toBe('e7410441000ab27c007f6e1030020440000ab07c007f6f02707f4e7530014e75')
    expect([hex(on.bytes, 0x84804, 8), hex(on.bytes, 0x8481c, 2), hex(on.bytes, 0x8482c, 2), hex(on.bytes, 0x8483a, 4)]).toEqual([
      '4e714e714e714e71',
      'e880',
      'e881',
      'c4fc000f',
    ])
    expect(applyNhl95Hacks(on, { rocketFix: false }).bytes).toEqual(rom.bytes)
    // With every other NHL '95 hack, in and out.
    const allOn = Object.fromEntries(Object.keys(NO_NHL95_HACKS).map((hack) => [hack, true])) as typeof NO_NHL95_HACKS
    const every = applyNhl95Hacks(rom, allOn)
    expect(detectNhl95Hacks(buildRom(every)).choices).toEqual(allOn)
    expect(applyNhl95Hacks(every, { ...NO_NHL95_HACKS }).bytes).toEqual(rom.bytes)
  })

  it.each(names)("puts NHL 94's Aggression, comeback bonus and open-net fixes into %s, each a change in place", (name) => {
    const rom = open(name)
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const cases = [
      { hack: 'aggressionFix', at: 0x83c7c, bytes: '6100000ae20b17430073' },
      { hack: 'comebackFix', at: 0x83a2c, bytes: '6d000026' },
      { hack: 'openNetFix', at: 0x84ed2, bytes: '7008b87c002c' },
    ] as const
    for (const { hack, at, bytes } of cases) {
      const on = applyNhl95Hacks(rom, { [hack]: true })
      expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, [hack]: true })
      expect(hex(on.bytes, at, bytes.length / 2)).toBe(bytes)
      // Only those bytes change.
      expect(on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)).toBeLessThanOrEqual(bytes.length / 2)
      expect(applyNhl95Hacks(on, { [hack]: false }).bytes).toEqual(rom.bytes)
    }
    // A ROM whose code around a place differs leaves that fix alone.
    const odd = rom.bytes.slice()
    odd[0x83c77] ^= 1
    expect(detectNhl95Hacks(odd).unknown).toEqual(['aggressionFix'])
  })
})

