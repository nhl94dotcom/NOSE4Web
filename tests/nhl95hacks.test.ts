import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { FACEOFF_CODE, NHL_SHOOTOUT_CODE, PASS_CODE, RING_CODE, STICK_CODE } from '../src/core/hacks'
import { hackSheetDiscord, hackSheetHtml } from '../src/core/hacksheet'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACKS, NO_NHL95_HACKS, Nhl95HackError, nhl95HackSheet, nhl95HacksForDiscord, nhl95HacksSupported } from '../src/core/nhl95hacks'
import { anyPosition } from '../src/core/anyposition'
import { hasPpPkFix } from '../src/core/ppfix'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { changesSince, startSeason } from '../src/core/season'
import { FIGHT95_AT, FIGHT95_BLOCK } from '../src/core/nhl95fightdata'
import { claimSpace95, NHL95_FIGHT_ROOM } from '../src/core/space'
import { expectSameBytes } from './samebytes'

// NHL '95 (USA) at ../NHL95/NHL_95.bin, and any NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[]; league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const PASS_AT = 0x7c5b8
// The on-or-off options (the others are settings with values of their own).
const SWITCHES = NHL95_HACKS.filter((hack) => typeof NO_NHL95_HACKS[hack] === 'boolean')

describe.skipIf(names.length === 0)("NHL '95 hacks", () => {
  it.each(names)('puts the pass direction fix into %s and takes it out again', (name) => {
    const rom = open(name)
    expect(nhl95HacksSupported(rom.game)).toBe(true)
    expect(detectNhl95Hacks(rom.bytes).unknown).toEqual([])
    const on = applyNhl95Hacks(rom, { passFix: true })
    expect(Array.from(on.bytes.subarray(PASS_AT, PASS_AT + 2))).toEqual([0xe5, 0x48])
    // Only the instruction's first byte differs ($E2 to $E5); nothing else changes.
    const changed = on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)
    expect(changed).toBe(1)
    expect(detectNhl95Hacks(on.bytes).choices.passFix).toBe(true)
    // It survives a rebuild, and comes out byte for byte.
    expect(detectNhl95Hacks(buildRom(on)).choices.passFix).toBe(true)
    expectSameBytes(applyNhl95Hacks(on, { passFix: false }).bytes, rom.bytes)
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
    expectSameBytes(buildRom(result.project), buildRom(on))

    const season = startSeason(opened, 'S', { clearFreeAgents: false })
    expect(changesSince(applyNhl95Hacks(season, { passFix: true }), season.baseline!).details.find((d) => d.heading === 'Hacks')?.changes).toEqual([
      'Pass direction fix: off to on.',
    ])
    const compared = compareProjects(opened, openRom(buildRom(on)))
    expect(compared.find((s) => s.heading === 'Hacks')?.changes).toEqual(['Pass direction fix: off to on.'])
  })

  it("does not turn off a hack the project's ROM did not know, and drops a value out of range", () => {
    const opened = open(RETAIL)
    // The project's ROM has code of its own where the pass fix goes, and the stick shots on.
    const odd = opened.bytes.slice()
    odd[PASS_AT] = 0x4e
    odd[PASS_AT + 1] = 0x71
    const project = applyNhl95Hacks({ ...opened, bytes: odd }, { stickShots: true })
    const file = JSON.parse(saveProjectFile(project, opened, 'P'))
    expect(file.nhl95Unknown).toEqual(['passFix'])
    // Opened over a ROM that has the pass fix on: it stays on, and the stick shots go in.
    const target = applyNhl95Hacks(opened, { passFix: true })
    const result = openProjectFile(target, JSON.stringify({ ...file, rom: undefined }))
    expect(detectNhl95Hacks(result.project.bytes).choices).toMatchObject({ passFix: true, stickShots: true })
    // A file from before the list was kept turns it off, as it always did.
    const older = openProjectFile(target, JSON.stringify({ ...file, rom: undefined, nhl95Unknown: undefined }))
    expect(detectNhl95Hacks(older.project.bytes).choices.passFix).toBe(false)
    // A number out of its range is left out with a note; the rest still goes in.
    const number = NHL95_HACKS.find((hack) => typeof NO_NHL95_HACKS[hack] === 'number')!
    const bad = openProjectFile(target, JSON.stringify({ ...file, rom: undefined, nhl95Hacks: { ...file.nhl95Hacks, [number]: 1e9 } }))
    expect(bad.notes.join(' ')).toContain('could not be read, so it was left as this ROM has it.')
    expect(detectNhl95Hacks(bad.project.bytes).choices).toMatchObject({ passFix: true, stickShots: true, [number]: detectNhl95Hacks(target.bytes).choices[number] })
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
    expect(hackSheetDiscord(sheet)[0]).toContain("- **Pass direction fix**: Passes go to the teammate you're pointing at")
    expect(hackSheetHtml(sheet)).toContain('<dt>Pass direction fix</dt>')
  })

  it.each(names)("puts NHL 94's three assist fixes into %s at NHL '95's places, alone and together, and takes them out", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    expect(detectNhl95Hacks(rom.bytes).unknown).toEqual([])
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const jsrAt = (b: Uint8Array, at: number) => (b[at] === 0x4e && b[at + 1] === 0xb9 ? read32(b, at + 2) : null)
    const all = applyNhl95Hacks(rom, { secondAssist: true, oneTimerAssist: true, regainAssist: true })
    expect(detectNhl95Hacks(all.bytes).choices).toEqual({ ...base, secondAssist: true, oneTimerAssist: true, regainAssist: true })
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
      expectSameBytes(applyNhl95Hacks(one, { [hack]: false }).bytes, rom.bytes)
    }
    expectSameBytes(applyNhl95Hacks(all, { secondAssist: false, oneTimerAssist: false, regainAssist: false }).bytes, rom.bytes)
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
    const base = detectNhl95Hacks(rom.bytes).choices
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const on = applyNhl95Hacks(rom, { rocketFix: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, rocketFix: true })
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
    expectSameBytes(applyNhl95Hacks(on, { rocketFix: false }).bytes, rom.bytes)
    // With every other NHL '95 hack, in and out.
    // Every hack on, but only one way of settling a tie (they exclude each other).
    const allOn = { ...base, ...Object.fromEntries(SWITCHES.map((hack) => [hack, hack !== 'seasonShootout' && hack !== 'seasonShootoutNow' && hack !== 'threeOnThreeAll' && hack !== 'fightingArcade'])) } as typeof NO_NHL95_HACKS
    const every = applyNhl95Hacks(rom, allOn)
    expect(detectNhl95Hacks(buildRom(every)).choices).toEqual(allOn)
    expectSameBytes(applyNhl95Hacks(every, { ...base }).bytes, rom.bytes)
  })

  it.each(names)("puts NHL 94's Aggression, comeback bonus and open-net fixes into %s, each a change in place", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const cases = [
      { hack: 'aggressionFix', at: 0x83c7c, bytes: '6100000ae20b17430073' },
      { hack: 'comebackFix', at: 0x83a2c, bytes: '6d000026' },
      { hack: 'openNetFix', at: 0x84ed2, bytes: '7008b87c002c' },
    ] as const
    for (const { hack, at, bytes } of cases) {
      const on = applyNhl95Hacks(rom, { [hack]: true })
      expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, [hack]: true })
      expect(hex(on.bytes, at, bytes.length / 2)).toBe(bytes)
      // Only those bytes change.
      expect(on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)).toBeLessThanOrEqual(bytes.length / 2)
      expectSameBytes(applyNhl95Hacks(on, { [hack]: false }).bytes, rom.bytes)
    }
    // A ROM whose code around a place differs leaves that fix alone.
    const odd = rom.bytes.slice()
    odd[0x83c77] ^= 1
    expect(detectNhl95Hacks(odd).unknown).toEqual(['aggressionFix'])
  })

  it.each(names)("puts NHL 94's five-hole blind ring fix into %s, with NHL '95's addresses", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    expect(hex(rom.bytes, 0x7b6b8, 8)).toBe('6100024a60000052')
    const on = applyNhl95Hacks(rom, { blindRingFix: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, blindRingFix: true })
    // jsr to the code, then bne.s .exit ($7B710).
    expect(hex(on.bytes, 0x7b6b8, 2)).toBe('4eb9')
    expect(hex(on.bytes, 0x7b6be, 2)).toBe('6650')
    expect(0x7b6c0 + 0x50).toBe(0x7b710)
    const code = read32(on.bytes, 0x7b6ba)
    // NHL 94's code (hacks.ts RING_CODE) with NHL '95's puckc, gmode and puckstick.
    expect(hex(on.bytes, code, 46)).toBe(
      Buffer.from(RING_CODE).toString('hex').replace('4a78b7aa', '4a78b3c2').replace('08380004c2ea', '08380004bef0').replace('4eb9000150e4', '4eb90007b904'),
    )
    expectSameBytes(applyNhl95Hacks(on, { blindRingFix: false }).bytes, rom.bytes)
  })

  it.each(names)('lets a tied regular-season game in %s play overtime until a goal, at both places', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const on = applyNhl95Hacks(rom, { seasonOvertime: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, seasonOvertime: true })
    // PeriodOver's move.w #4,(gsp).w and the end of overtime's beq.s .eog, and nothing else.
    expect(hex(on.bytes, 0x8cb9e, 6)).toBe('4e714e714e71')
    expect(hex(on.bytes, 0x8ccda, 2)).toBe('4e71')
    expect(on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)).toBe(8)
    expectSameBytes(applyNhl95Hacks(on, { seasonOvertime: false }).bytes, rom.bytes)
  })

  it.each(names)('settles a tied regular-season game in %s by a shootout, after overtime or after period 3, and takes it out', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    // After overtime: the end of overtime's beq.s a NOP, PeriodOver's move.w #4,(gsp).w a call to the start code,
    // NextShooter's jmp ExitToOpening a call to the end code.
    const after = applyNhl95Hacks(rom, { seasonShootout: true })
    expect(detectNhl95Hacks(after.bytes).choices).toEqual({ ...base, seasonShootout: true })
    expect(hex(after.bytes, 0x8ccda, 2)).toBe('4e71')
    expect(hex(after.bytes, 0x8cb9e, 2)).toBe('4eb9')
    expect(hex(after.bytes, 0x9dd48, 2)).toBe('4eb9')
    const start = read32(after.bytes, 0x8cba0)
    // HmGoals = AwGoals, not a shootout already; both team structs ($1B3 longs) and ScoreSumbytes kept.
    expect(hex(after.bytes, start, 8)).toBe('3038c294b078c5fa')
    expect(hex(after.bytes, start + 0x28, 4)).toBe('303c01b2')
    const end = read32(after.bytes, 0x9dd4a)
    expect(hex(after.bytes, end + 0x10, 6)).toBe('4ef90008cd02') // Shootout mode's own end, to the title
    expect(hex(after.bytes, end + 0x56, 6)).toBe('4ef900009d18') // PeriodOver_sp
    expectSameBytes(applyNhl95Hacks(after, { seasonShootout: false }).bytes, rom.bytes)
    // After period 3: PeriodOver's tie test a call to code that runs the start code first, in a regular-season game.
    const now = applyNhl95Hacks(rom, { seasonShootoutNow: true })
    expect(detectNhl95Hacks(now.bytes).choices).toEqual({ ...base, seasonShootoutNow: true })
    expect(hex(now.bytes, 0x8ccda, 2)).toBe('67ac')
    expect(hex(now.bytes, 0x8cb9e, 6)).toBe('31fc0004c020')
    expect([hex(now.bytes, 0x8cba4, 2), hex(now.bytes, 0x8cbaa, 2)]).toEqual(['4eb9', '4e71'])
    const nowCode = read32(now.bytes, 0x8cba6)
    expect(hex(now.bytes, read32(now.bytes, nowCode + 0x20), 8)).toBe('3038c294b078c5fa')
    expectSameBytes(applyNhl95Hacks(now, { seasonShootoutNow: false }).bytes, rom.bytes)
    // One way to settle a tie at a time; from one to another directly.
    expect(() => applyNhl95Hacks(rom, { seasonShootout: true, seasonOvertime: true })).toThrow(Nhl95HackError)
    const swapped = applyNhl95Hacks(after, { seasonShootout: false, seasonShootoutNow: true })
    expect(detectNhl95Hacks(swapped.bytes).choices).toEqual({ ...base, seasonShootoutNow: true })
    expectSameBytes(applyNhl95Hacks(swapped, { seasonShootoutNow: false }).bytes, rom.bytes)
    // With every other NHL '95 hack, through a rebuild.
    const every = { ...base, ...Object.fromEntries(SWITCHES.map((hack) => [hack, !hack.startsWith('season') && hack !== 'threeOnThreeAll' && hack !== 'fightingArcade'])) } as typeof NO_NHL95_HACKS
    const all = applyNhl95Hacks(rom, { ...every, seasonShootout: true })
    expect(detectNhl95Hacks(buildRom(all)).choices).toEqual({ ...every, seasonShootout: true })
    expectSameBytes(applyNhl95Hacks(all, { ...base }).bytes, rom.bytes)
  })

  it.each(names)("plays %s's shootouts to the NHL's rule: NHL 94's code with NHL '95's four addresses", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const on = applyNhl95Hacks(rom, { nhlShootout: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, nhlShootout: true })
    // jsr / beq.w .switch / NOPs, then the game's own bset #3,(gmode2).w / jsr EndShootout.
    expect(hex(on.bytes, 0x9dd98, 2)).toBe('4eb9')
    expect(hex(on.bytes, 0x9dd9e, 4)).toBe('67000028')
    expect(hex(on.bytes, 0x9dda2, 22)).toBe('4e71'.repeat(11))
    const code = read32(on.bytes, 0x9dd9a)
    const expected = Buffer.from(NHL_SHOOTOUT_CODE).toString('hex').replace(/d595/g, 'd1a1').replace(/d578/g, 'd184').replace(/d574/g, 'd180').replace(/d576/g, 'd182')
    expect(hex(on.bytes, code, NHL_SHOOTOUT_CODE.length)).toBe(expected)
    expectSameBytes(applyNhl95Hacks(on, { nhlShootout: false }).bytes, rom.bytes)
    // With a regular-season shootout too.
    const both = applyNhl95Hacks(rom, { nhlShootout: true, seasonShootout: true })
    expect(detectNhl95Hacks(both.bytes).choices).toEqual({ ...base, nhlShootout: true, seasonShootout: true })
    expectSameBytes(applyNhl95Hacks(both, { ...base }).bytes, rom.bytes)
  })

  // The fighting patch's own IPS files, where present: for the original game and the WN95HL's Season 18 ROM.
  const FIGHT_IPS: Record<string, string> = { 'NHL95/NHL_95.bin': 'nhl95_fighting.ips', 'NHL95/W18.bin': 'w18_fighting.ips' }
  function ipsRecords(file: string): [number, Uint8Array][] {
    const d = readFileSync(path(file))
    const out: [number, Uint8Array][] = []
    let i = 5
    while (d.toString('latin1', i, i + 3) !== 'EOF') {
      const at = d.readUIntBE(i, 3)
      const n = d.readUInt16BE(i + 3)
      i += 5
      if (n === 0) {
        out.push([at, new Uint8Array(d.readUInt16BE(i)).fill(d[i + 2])])
        i += 3
      } else {
        out.push([at, new Uint8Array(d.subarray(i, i + n))])
        i += n
      }
    }
    return out
  }

  it.each(names)('puts the fighting patch into %s as its own IPS patch does, and takes it out again', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const on = applyNhl95Hacks(rom, { fighting: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, fighting: true })
    expect(detectNhl95Hacks(buildRom(on)).choices.fighting).toBe(true)
    const ips = FIGHT_IPS[name]
    if (ips && existsSync(path(ips))) {
      // The patch's bytes, but its header checksum and the original game's own ROM check sum (that check is off),
      // with Match Viewer's fix: the period-length routine at $1E04D2 uses d2, not d1.
      const patched = rom.bytes.slice()
      for (const [at, bytes] of ipsRecords(ips)) if (at !== 0x18e && at !== 0x1a72dc) patched.set(bytes, at)
      const unfixed = patched.slice()
      patched.set([0x34, 0x38], 0x1e04d2)
      for (const at of [0x1e04d6, 0x1e04e0, 0x1e04ea]) patched.set([0x0c, 0x42], at)
      expectSameBytes(on.bytes, patched)
      expect(on.bytes.reduce((n, b, i) => n + (b !== unfixed[i] ? 1 : 0), 0)).toBe(4)
      // A ROM the patch made itself reads as fighting on; applying puts the fix in, and it comes out.
      const theirs = rom.bytes.slice()
      for (const [at, bytes] of ipsRecords(ips)) theirs.set(bytes, at)
      expect(detectNhl95Hacks(theirs).choices.fighting).toBe(true)
      const upgraded = applyNhl95Hacks({ ...rom, bytes: theirs }, { fighting: true })
      expect(Array.from(upgraded.bytes.subarray(0x1e04d2, 0x1e04d4))).toEqual([0x34, 0x38])
      expect(detectNhl95Hacks(applyNhl95Hacks({ ...rom, bytes: theirs }, { fighting: false }).bytes).choices.fighting).toBe(false)
    }
    expectSameBytes(applyNhl95Hacks(on, { fighting: false }).bytes, rom.bytes)
    // Starting Off: setup_defaults' move.w #1,($FFCC62).w becomes #0, and back; it needs fighting.
    const startOff = applyNhl95Hacks(on, { fightingOff: true })
    expect(detectNhl95Hacks(startOff.bytes).choices).toEqual({ ...base, fighting: true, fightingOff: true })
    expect(Array.from(startOff.bytes.subarray(0x1e0e34, 0x1e0e3a))).toEqual([0x31, 0xfc, 0, 0, 0xcc, 0x62])
    expect(startOff.bytes.reduce((n, b, i) => n + (b !== on.bytes[i] ? 1 : 0), 0)).toBe(1)
    expectSameBytes(applyNhl95Hacks(startOff, { fightingOff: false }).bytes, on.bytes)
    expectSameBytes(applyNhl95Hacks(startOff, { fighting: false, fightingOff: false }).bytes, rom.bytes)
    expect(() => applyNhl95Hacks(rom, { fightingOff: true })).toThrow(Nhl95HackError)
    // Starting in Arcade Mode: #2; and from Off to Arcade directly. One of the three at a time.
    const arcade = applyNhl95Hacks(startOff, { fightingOff: false, fightingArcade: true })
    expect(detectNhl95Hacks(arcade.bytes).choices).toEqual({ ...base, fighting: true, fightingArcade: true })
    expect(Array.from(arcade.bytes.subarray(0x1e0e34, 0x1e0e3a))).toEqual([0x31, 0xfc, 0, 2, 0xcc, 0x62])
    expectSameBytes(applyNhl95Hacks(arcade, { fightingArcade: false }).bytes, on.bytes)
    expect(() => applyNhl95Hacks(on, { fightingOff: true, fightingArcade: true })).toThrow(Nhl95HackError)
    expect(() => applyNhl95Hacks(rom, { fightingArcade: true })).toThrow(Nhl95HackError)
    // With every other NHL '95 hack, their code placed after its own, through a rebuild.
    const every = { ...base, ...Object.fromEntries(SWITCHES.map((hack) => [hack, !hack.startsWith('season') && hack !== 'threeOnThreeAll' && hack !== 'fightingArcade'])) } as typeof NO_NHL95_HACKS
    const all = applyNhl95Hacks(rom, every)
    expect(detectNhl95Hacks(buildRom(all)).choices).toEqual(every)
    expectSameBytes(applyNhl95Hacks(all, { ...base }).bytes, rom.bytes)
    // Not where its place holds something else.
    const taken = rom.bytes.slice()
    taken[0x1e0800] = 0
    expect(() => applyNhl95Hacks({ ...rom, bytes: taken }, { fighting: true })).toThrow(/Fighting needs a part of the ROM/)
  })

  it.each(names)('puts 3 on 3 overtime into %s at its eight places, either way, and takes it out again', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    // Each place: its length, and how the code it calls begins (the replaced instruction, or the overtime tests).
    const places: [number, number, string][] = [
      [0x8966a, 6, '207c00083e16'],
      [0x8a392, 6, '207c00083e16'],
      [0x83790, 6, '207c00083e16'],
      [0x894c6, 16, '08380001bf02'],
      [0x9dcc, 6, '08f80001bf02'],
      [0x888e8, 6, '08380001bf02'],
      [0x9f560, 6, '08380001bf02'],
      [0x83754, 26, '08380001bf02'],
    ]
    for (const [choice, other] of [['threeOnThree', 'threeOnThreeAll'], ['threeOnThreeAll', 'threeOnThree']] as const) {
      const on = applyNhl95Hacks(rom, { [choice]: true })
      expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, [choice]: true })
      expect(detectNhl95Hacks(buildRom(on)).choices[choice]).toBe(true)
      for (const [at, length, begins] of places) {
        expect(hex(on.bytes, at, 2)).toBe('4eb9')
        expect(hex(on.bytes, at + 6, length - 6)).toBe('4e71'.repeat((length - 6) / 2))
        expect(hex(on.bytes, read32(on.bytes, at + 2), 6)).toBe(begins)
      }
      // The playoff test only outside the playoffs: tst.w (OptPlayMode).w in the faceoff's code.
      expect(hex(on.bytes, read32(on.bytes, 0x888ea), 32).includes('4a78cc4c')).toBe(choice === 'threeOnThree')
      // From one to the other directly, and out byte for byte.
      const swapped = applyNhl95Hacks(on, { [choice]: false, [other]: true })
      expect(detectNhl95Hacks(swapped.bytes).choices).toEqual({ ...base, [other]: true })
      expectSameBytes(applyNhl95Hacks(on, { [choice]: false }).bytes, rom.bytes)
      expectSameBytes(applyNhl95Hacks(swapped, { [other]: false }).bytes, rom.bytes)
    }
    expect(() => applyNhl95Hacks(rom, { threeOnThree: true, threeOnThreeAll: true })).toThrow(Nhl95HackError)
    // With overtime until a goal, a shootout and fighting.
    const league = applyNhl95Hacks(rom, { threeOnThree: true, seasonShootout: true, nhlShootout: true, fighting: true, fightingOff: true })
    expect(detectNhl95Hacks(buildRom(league)).choices).toEqual({ ...base, threeOnThree: true, seasonShootout: true, nhlShootout: true, fighting: true, fightingOff: true })
    expectSameBytes(applyNhl95Hacks(league, { ...base }).bytes, rom.bytes)
  })

  it.each(names)("puts NHL 94's runaway, goalie pull, sniping and penalty shot fixes into %s at NHL '95's places", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const fixes = { runawayFix: true, goaliePullFix: true, snipingFix: true, penaltyShotTableFix: true, penaltyShotFixes: true }
    const on = applyNhl95Hacks(rom, fixes)
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, ...fixes })
    expect(detectNhl95Hacks(buildRom(on)).choices).toEqual({ ...base, ...fixes })
    // The switches.
    expect(hex(on.bytes, 0x83674, 12)).toBe('6f00e3e6b07c00026e00e3de')
    expect(hex(on.bytes, 0x84ccc, 4)).toBe('4e714e71')
    expect(hex(on.bytes, 0x8a010, 16)).toBe('ffff0038003c0036003a002e00300034')
    // The runaway fix: each fall end calls its own copy of the code; the one-timer's end, and the branch to .exit.
    const falls = [0xa5c6, 0xa5f2, 0xa60e].map((at) => {
      expect(hex(on.bytes, at, 2)).toBe('4eb9')
      const code = read32(on.bytes, at + 2)
      expect(hex(on.bytes, code, 16)).toBe('08ab0005006467060' + '8ab000000624e75')
      return code
    })
    expect(new Set(falls).size).toBe(3)
    expect(hex(on.bytes, read32(on.bytes, 0x82f66), 14)).toBe('08ab0003006408ab000000624e75')
    expect(hex(on.bytes, 0x81972, 4)).toBe('660000c8')
    // The penalty shot fixes: andi.b #$83,($BEF8).w then NOPs; SetupPenaltyShot's hook clearing the puck's pfnc.
    expect(hex(on.bytes, 0x9e64e, 24)).toBe('02380083bef8' + '4e71'.repeat(9))
    expect(hex(on.bytes, read32(on.bytes, 0x9ed54), 14)).toBe('366a0022780508b80002b3c44e75')
    // Each comes out on its own, and all of them byte for byte.
    for (const fix of Object.keys(fixes)) {
      const without = applyNhl95Hacks(on, { [fix]: false })
      expect(detectNhl95Hacks(without.bytes).choices).toEqual({ ...base, ...fixes, [fix]: false })
    }
    expectSameBytes(applyNhl95Hacks(on, { ...base }).bytes, rom.bytes)
  })

  it.each(names)('keeps the organ song through the pause in %s: its two calls, and out again', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const on = applyNhl95Hacks(rom, { organResume: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, organResume: true })
    expect(detectNhl95Hacks(buildRom(on)).choices.organResume).toBe(true)
    // The save: masks interrupts first, and ends with the btst it replaces and rts.
    expect(hex(on.bytes, 0x7e38c, 2)).toBe('4eb9')
    const save = read32(on.bytes, 0x7e38e)
    expect(hex(on.bytes, save, 6)).toBe('40e746fc2700')
    expect(hex(on.bytes, save + 0x8a, 8)).toBe('08380000bef24e75')
    // The restore: ends its own part with the move it replaces and rts, then its call of SndPutZ80Cmd.
    expect(hex(on.bytes, 0x7e4bc, 2)).toBe('4eb9')
    const restore = read32(on.bytes, 0x7e4be)
    expect(hex(on.bytes, restore + 0x14a, 8)).toBe('31f8ac56ac584e75')
    expect(hex(on.bytes, restore + 0x15e, 6)).toBe('4eb90000b4dc')
    expectSameBytes(applyNhl95Hacks(on, { organResume: false }).bytes, rom.bytes)
  })

  it.each(names)('keeps the fighting patch’s place free in %s: room that would reach it is found after it', (name) => {
    const rom = open(name)
    // The place is the patch's own, as long as its code.
    expect(NHL95_FIGHT_ROOM.start).toBe(FIGHT95_AT)
    expect(NHL95_FIGHT_ROOM.end).toBe(FIGHT95_AT + FIGHT95_BLOCK.length / 2)
    const { start, end } = NHL95_FIGHT_ROOM
    // Small room is where it always was, before the place.
    const small = claimSpace95(rom.bytes, 0x100)!
    expect(small.at + 0x100).toBeLessThanOrEqual(start)
    // A ROM used up to just before the place: small room there would reach into it, so it goes after it.
    const full = rom.bytes.slice()
    full.fill(0x11, small.at, start - 0x40)
    const big = claimSpace95(full, 0x100)!
    expect(big.at).toBeGreaterThanOrEqual(end)
    expect(big.rom.subarray(start, end).every((byte) => byte === 0xff)).toBe(true)
    // Room that ends before the place stays there.
    expect(claimSpace95(full, 0x20)!.at + 0x20).toBeLessThanOrEqual(start)
    // So with data after it, fighting still goes in.
    const filled = big.rom.slice()
    filled.fill(0x11, big.at, big.at + 0x100)
    const fight = applyNhl95Hacks({ ...rom, bytes: filled }, { fighting: true })
    expect(detectNhl95Hacks(fight.bytes).choices.fighting).toBe(true)
    // Once the patch is in, the place is the patch's, and room is found as usual.
    expect(claimSpace95(fight.bytes, 0x100)!.at + 0x100 <= start || claimSpace95(fight.bytes, 0x100)!.at >= end).toBe(true)
  })

  it.each(names)("puts NHL 94's power play, faceoff, awareness and stick-shot fixes into %s at NHL '95's places", (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const fixes = { ppPkFix: true, faceoffFix: true, awarenessFix: true, stickShots: true }
    expect(hasPpPkFix(rom)).toBe(false)
    const on = applyNhl95Hacks(rom, fixes)
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...base, ...fixes })
    expect(detectNhl95Hacks(buildRom(on)).choices).toEqual({ ...base, ...fixes })
    expect(hasPpPkFix(on)).toBe(true)
    // The power play: NHL 94's change, with PPBonus $CAF0 and PKBonus $CAF1.
    expect(hex(on.bytes, 0x839d8, 28)).toBe('10280001e80811c0caf04e716000000e700fc02800014400' + '11c0caf1')
    // Awareness: aidef ($6B) becomes aioff ($6A) at the two forwards' reloads.
    expect([on.bytes[0x80c2f], on.bytes[0x80f37]]).toEqual([0x6a, 0x6a])
    // The faceoff: a call and 40 NOPs, to NHL 94's code with NHL '95's rink and addresses.
    expect(hex(on.bytes, 0x8907a, 2)).toBe('4eb9')
    expect(hex(on.bytes, 0x89080, 80)).toBe('4e71'.repeat(40))
    const faceoff = on.bytes.subarray(read32(on.bytes, 0x8907c), read32(on.bytes, 0x8907c) + 146)
    expect(hex(faceoff, 2, 4)).toBe('327cbfce') // PenBuf
    expect(hex(faceoff, 0x34, 4)).toBe('327cac62') // SortCords
    expect(hex(faceoff, 0x86, 8)).toBe('31c0bb9a31c1bb9c') // fox, foy
    expect(Array.from(faceoff.subarray(0x64, 0x6a))).toEqual([0x70, 0x53, 0x60, 0x02, 0x70, 0xad]) // neutral-zone x +-83, as drawn
    expect(hex(on.bytes, 0x88f5c, 4)).toBe('303c0053') // limitfo's too
    // Where NHL '95's code is NHL 94's, it is the same bytes.
    expect(hex(faceoff, 0x0a, 10)).toBe(hex(FACEOFF_CODE, 0x0a, 10))
    // Stick shots: a call and two NOPs, to NHL 94's code with NHL '95's addresses at their places.
    expect(hex(on.bytes, 0x7ba02, 2)).toBe('4eb9')
    expect(hex(on.bytes, 0x7ba08, 4)).toBe('4e714e71')
    const stick = on.bytes.slice(read32(on.bytes, 0x7ba04), read32(on.bytes, 0x7ba04) + STICK_CODE.length)
    const as94 = stick.slice()
    for (const [at, word] of [[10, 0xc2ea], [18, 0xc2ea], [26, 0xc2ee], [40, 0xbed8]] as const) as94.set([word >> 8, word & 0xff], at)
    for (const [at, long] of [[44, 0x12fd0], [50, 0x1013e], [58, 0x15704]] as const) as94.set([long >>> 24, (long >> 16) & 0xff, (long >> 8) & 0xff, long & 0xff], at)
    expect(hex(as94, 0, as94.length)).toBe(hex(STICK_CODE, 0, STICK_CODE.length))
    // Each comes out on its own, and all of them byte for byte.
    for (const fix of Object.keys(fixes)) {
      const without = applyNhl95Hacks(on, { [fix]: false })
      expect(detectNhl95Hacks(without.bytes).choices).toEqual({ ...base, ...fixes, [fix]: false })
    }
    expectSameBytes(applyNhl95Hacks(on, { ...base }).bytes, rom.bytes)
  })

  it.each(names)('puts every NHL 95 option into %s together, each read back, and takes them all out', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    const left = ['fightingOff', 'fightingArcade', 'seasonOvertime', 'seasonShootout', 'threeOnThree']
    // Every switch on but the few that exclude another, and every setting away from the original game's.
    const all = {
      ...Object.fromEntries(SWITCHES.map((hack) => [hack, !left.includes(hack)])),
      threeStars: 'linesOff',
      bodychecks: 'on',
      penaltySeconds: 40,
      fightSeconds: 90,
      bCheckPenaltiesOff: 'asPenaltiesOn',
      injuries: 'longFall',
      fourthPeriodOvertime: 300,
      energyDrain: 20,
      energyRecovery: 15,
      burstEnergy: 50,
      hitEnergy: 204,
      holdEnergy: 102,
      injuryBonus: 10,
      injuryCap: 50,
      goalieHold: 0,
      goalieWidth: 30,
      goalieOut: 200,
      goalieLine: 150,
      goalieDelay: 20,
      speedBurst: 24,
      turnRate: 120,
      puckFriction: 6,
    } as Partial<typeof NO_NHL95_HACKS>
    const on = applyNhl95Hacks(rom, all)
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base, ...all }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: { ...base, ...all }, unknown: [] })
    expectSameBytes(applyNhl95Hacks(on, { ...base }).bytes, rom.bytes)
  })

  it.each(names)('lets Edit Lines in %s put any skater at any position, a change in place', (name) => {
    const rom = open(name)
    expect(anyPosition(rom)).toBe(false)
    const on = applyNhl95Hacks(rom, { anyPosition: true })
    expect(Buffer.from(on.bytes.subarray(0x95312, 0x95318)).toString('hex')).toBe('4e714e714e71')
    expect(on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)).toBe(6)
    expect(detectNhl95Hacks(buildRom(on)).choices).toEqual({ ...detectNhl95Hacks(rom.bytes).choices, anyPosition: true })
    expect(anyPosition(on)).toBe(true)
    expectSameBytes(applyNhl95Hacks(on, { anyPosition: false }).bytes, rom.bytes)
  })
})
