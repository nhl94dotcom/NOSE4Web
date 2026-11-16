import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { NHL_SHOOTOUT_CODE, PASS_CODE, RING_CODE } from '../src/core/hacks'
import { hackSheetDiscord, hackSheetHtml } from '../src/core/hacksheet'
import { applyNhl95Hacks, detectNhl95Hacks, NO_NHL95_HACKS, Nhl95HackError, nhl95HackSheet, nhl95HacksForDiscord, nhl95HacksSupported } from '../src/core/nhl95hacks'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { changesSince, startSeason } from '../src/core/season'
import { expectSameBytes } from './samebytes'

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
    expectSameBytes(applyNhl95Hacks(on, { rocketFix: false }).bytes, rom.bytes)
    // With every other NHL '95 hack, in and out.
    // Every hack on, but only one way of settling a tie (they exclude each other).
    const allOn = Object.fromEntries(Object.keys(NO_NHL95_HACKS).map((hack) => [hack, hack !== 'seasonShootout' && hack !== 'seasonShootoutNow'])) as typeof NO_NHL95_HACKS
    const every = applyNhl95Hacks(rom, allOn)
    expect(detectNhl95Hacks(buildRom(every)).choices).toEqual(allOn)
    expectSameBytes(applyNhl95Hacks(every, { ...NO_NHL95_HACKS }).bytes, rom.bytes)
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
      expectSameBytes(applyNhl95Hacks(on, { [hack]: false }).bytes, rom.bytes)
    }
    // A ROM whose code around a place differs leaves that fix alone.
    const odd = rom.bytes.slice()
    odd[0x83c77] ^= 1
    expect(detectNhl95Hacks(odd).unknown).toEqual(['aggressionFix'])
  })

  it.each(names)("puts NHL 94's five-hole blind ring fix into %s, with NHL '95's addresses", (name) => {
    const rom = open(name)
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    expect(hex(rom.bytes, 0x7b6b8, 8)).toBe('6100024a60000052')
    const on = applyNhl95Hacks(rom, { blindRingFix: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, blindRingFix: true })
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
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const on = applyNhl95Hacks(rom, { seasonOvertime: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, seasonOvertime: true })
    // PeriodOver's move.w #4,(gsp).w and the end of overtime's beq.s .eog, and nothing else.
    expect(hex(on.bytes, 0x8cb9e, 6)).toBe('4e714e714e71')
    expect(hex(on.bytes, 0x8ccda, 2)).toBe('4e71')
    expect(on.bytes.reduce((n, b, i) => n + (b !== rom.bytes[i] ? 1 : 0), 0)).toBe(8)
    expectSameBytes(applyNhl95Hacks(on, { seasonOvertime: false }).bytes, rom.bytes)
  })

  it.each(names)('settles a tied regular-season game in %s by a shootout, after overtime or after period 3, and takes it out', (name) => {
    const rom = open(name)
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    // After overtime: the end of overtime's beq.s a NOP, PeriodOver's move.w #4,(gsp).w a call to the start code,
    // NextShooter's jmp ExitToOpening a call to the end code.
    const after = applyNhl95Hacks(rom, { seasonShootout: true })
    expect(detectNhl95Hacks(after.bytes).choices).toEqual({ ...NO_NHL95_HACKS, seasonShootout: true })
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
    expect(detectNhl95Hacks(now.bytes).choices).toEqual({ ...NO_NHL95_HACKS, seasonShootoutNow: true })
    expect(hex(now.bytes, 0x8ccda, 2)).toBe('67ac')
    expect(hex(now.bytes, 0x8cb9e, 6)).toBe('31fc0004c020')
    expect([hex(now.bytes, 0x8cba4, 2), hex(now.bytes, 0x8cbaa, 2)]).toEqual(['4eb9', '4e71'])
    const nowCode = read32(now.bytes, 0x8cba6)
    expect(hex(now.bytes, read32(now.bytes, nowCode + 0x20), 8)).toBe('3038c294b078c5fa')
    expectSameBytes(applyNhl95Hacks(now, { seasonShootoutNow: false }).bytes, rom.bytes)
    // One way to settle a tie at a time; from one to another directly.
    expect(() => applyNhl95Hacks(rom, { seasonShootout: true, seasonOvertime: true })).toThrow(Nhl95HackError)
    const swapped = applyNhl95Hacks(after, { seasonShootout: false, seasonShootoutNow: true })
    expect(detectNhl95Hacks(swapped.bytes).choices).toEqual({ ...NO_NHL95_HACKS, seasonShootoutNow: true })
    expectSameBytes(applyNhl95Hacks(swapped, { seasonShootoutNow: false }).bytes, rom.bytes)
    // With every other NHL '95 hack, through a rebuild.
    const every = Object.fromEntries(Object.keys(NO_NHL95_HACKS).map((hack) => [hack, !hack.startsWith('season')])) as typeof NO_NHL95_HACKS
    const all = applyNhl95Hacks(rom, { ...every, seasonShootout: true })
    expect(detectNhl95Hacks(buildRom(all)).choices).toEqual({ ...every, seasonShootout: true })
    expectSameBytes(applyNhl95Hacks(all, { ...NO_NHL95_HACKS }).bytes, rom.bytes)
  })

  it.each(names)("plays %s's shootouts to the NHL's rule: NHL 94's code with NHL '95's four addresses", (name) => {
    const rom = open(name)
    const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
    const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
    const on = applyNhl95Hacks(rom, { nhlShootout: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, nhlShootout: true })
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
    expect(detectNhl95Hacks(both.bytes).choices).toEqual({ ...NO_NHL95_HACKS, nhlShootout: true, seasonShootout: true })
    expectSameBytes(applyNhl95Hacks(both, { ...NO_NHL95_HACKS }).bytes, rom.bytes)
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
    const on = applyNhl95Hacks(rom, { fighting: true })
    expect(detectNhl95Hacks(on.bytes).choices).toEqual({ ...NO_NHL95_HACKS, fighting: true })
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
    // With every other NHL '95 hack, their code placed after its own, through a rebuild.
    const every = Object.fromEntries(Object.keys(NO_NHL95_HACKS).map((hack) => [hack, !hack.startsWith('season')])) as typeof NO_NHL95_HACKS
    const all = applyNhl95Hacks(rom, every)
    expect(detectNhl95Hacks(buildRom(all)).choices).toEqual(every)
    expectSameBytes(applyNhl95Hacks(all, { ...NO_NHL95_HACKS }).bytes, rom.bytes)
    // Not where its place holds something else.
    const taken = rom.bytes.slice()
    taken[0x1e0800] = 0
    expect(() => applyNhl95Hacks({ ...rom, bytes: taken }, { fighting: true })).toThrow(/1E0800/)
  })
})

