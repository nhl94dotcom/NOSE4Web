import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { resetSettingsPart } from '../src/core/reset'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import {
  parseScouting,
  type Scouting,
  scoutingFromGame,
  scoutingLineProblem,
  scoutingPreview,
  scoutingToGame,
  scoutingUsed,
  writeScouting,
} from '../src/core/scouting'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const ascii = (bytes: Uint8Array, at: number, count: number) => String.fromCharCode(...bytes.subarray(at, at + count))
// The lines with one changed, by the line's number in the script.
const withLine = (project: RomProject, n: number, text: string): RomProject => {
  const scouting = project.settings.scouting!
  const first = scouting.platform === 'snes' ? 28 : 26
  return { ...project, settings: { ...project.settings, scouting: { ...scouting, lines: scouting.lines.map((line, i) => (i === n - first ? { ...line, text } : line)) } } }
}
const line = (scouting: Scouting, n: number) => scouting.lines[n - (scouting.platform === 'snes' ? 28 : 26)]

describe('stand-ins', () => {
  it('turn into labels and back, on both systems', () => {
    expect(scoutingFromGame('genesis', 'And in goal tonight, [ for { and ] for }.')).toBe('And in goal tonight, {home goalie} for {home city} and {visitors goalie} for {visitors city}.')
    expect(scoutingToGame('genesis', 'Tonight, {home goalie} for {Home City}.')).toBe('Tonight, [ for {.')
    // The original's other codes for the cities.
    expect(scoutingFromGame('genesis', 'the + and _')).toBe('the {visitors city} and {home city}')
    expect(scoutingFromGame('snes', ' %t been playing %ewell recently.')).toBe(' {hotter team has} been playing {extremely}well recently.')
    expect(scoutingToGame('snes', 'For {home name} {home hot player 1}.')).toBe('For %H %0.')
    expect(scoutingToGame('snes', 'For {visitors cold player 3}.')).toBe('For %b.')
  })

  it('a line starting with one gets a space, as the game needs', () => {
    expect(scoutingToGame('snes', '{hotter team has} been hot.')).toBe(' %t been hot.')
    expect(scoutingToGame('genesis', '{home city} is at home.')).toBe(' { is at home.')
  })

  it('problems: an unknown label, a stray brace, a character the game uses for a stand-in, a word too long', () => {
    expect(scoutingLineProblem('genesis', 'Hi {home town}')).toMatch(/not one of the stand-ins/)
    expect(scoutingLineProblem('genesis', 'Hi {home city')).toMatch(/only for a stand-in/)
    expect(scoutingLineProblem('genesis', 'It costs $5.')).toMatch(/"\$".*stand-ins/)
    expect(scoutingLineProblem('genesis', '50% of the time')).toMatch(/"%"/)
    expect(scoutingLineProblem('snes', '50% of the time')).toMatch(/"%"/)
    expect(scoutingLineProblem('snes', 'It costs $5 (or #3).')).toBeNull()
    expect(scoutingLineProblem('snes', 'Supercalifragilisticexpialidocious')).toMatch(/longer than the box/)
    expect(scoutingLineProblem('genesis', 'café')).toMatch(/can't show "é"/)
    expect(scoutingToGame('genesis', 'It costs $5.')).toBeNull()
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('the Genesis matchup screen text', () => {
  let opened: RomProject | undefined
  const retail = () => (opened ??= open('nhl94.bin'))
  const SCRIPT = 0x4b5c0
  const END = 0x4b7a0
  // The ROM as built with nothing changed: buildRom puts the checksum right.
  let unchanged: Uint8Array | undefined
  const plain = () => (unchanged ??= buildRom(retail()))

  it('reads the original: ten lines from line 26, what each is for, the room', () => {
    const scouting = retail().settings.scouting!
    expect(scouting.lines).toHaveLength(10)
    expect(line(scouting, 27).text).toBe("Hi, I'm Ron Barr for EA Sports.")
    expect(line(scouting, 27).role).toMatch(/greeting/)
    expect(line(scouting, 28).role).toMatch(/Not shown/)
    expect(line(scouting, 29).blank).toBe(true)
    expect(line(scouting, 33).text).toMatch(/^Hit the start button/)
    expect(scouting.room).toBe(scoutingUsed(scouting))
  })

  it('writes nothing when nothing changed', () => {
    expect(Buffer.compare(plain().subarray(0x200), retail().bytes.subarray(0x200))).toBe(0)
  })

  it('writes a changed line in place, the room kept, the menu picture after it untouched', () => {
    const empty = withLine(retail(), 28, '')
    const edited = withLine(empty, 27, "Hi, I'm Ace for NHL94.com. Tonight, {home goalie} for {home city}.")
    const built = buildRom(edited)
    expect(Buffer.compare(built.subarray(END), retail().bytes.subarray(END))).toBe(0)
    // All but the checksum, which the text changes.
    expect(Buffer.compare(built.subarray(0x200, SCRIPT), plain().subarray(0x200, SCRIPT))).toBe(0)
    const again = parseScouting(built, 'genesis')!
    expect(line(again, 27).text).toBe("Hi, I'm Ace for NHL94.com. Tonight, {home goalie} for {home city}.")
    expect(line(again, 28).text).toBe('')
    expect(line(again, 33).text).toBe(line(retail().settings.scouting!, 33).text)
    expect(again.room).toBe(retail().settings.scouting!.room)
    expect(ascii(built, SCRIPT + 26, 10)).toBe("Welcome to")
    // Line 27 is still the 28th: 26 empty lines, then the welcome, then it.
    const lines = ascii(built, SCRIPT, END - SCRIPT).split('\r')
    expect(lines[27]).toBe("Hi, I'm Ace for NHL94.com. Tonight, [ for {.")
    // The rest of the room: empty lines.
    expect(built[END - 1]).toBe(0x0d)
  })

  it('too long: not written, and the check says why', () => {
    const long = withLine(retail(), 27, 'Hello there. '.repeat(10))
    expect(Buffer.compare(buildRom(long), plain())).toBe(0)
    expect(checkProject(long).some((f) => f.level === 'problem' && /room for 444/.test(f.message))).toBe(true)
  })

  it('in the list of changes, through a project file, and reset', () => {
    const edited = withLine(retail(), 27, "Hi, I'm Ace.")
    expect(compareProjects(retail(), edited).find((d) => /Ron Barr/.test(d.heading))?.changes).toEqual(["Line 2: Hi, I'm Ace."])
    const back = openProjectFile(retail(), saveProjectFile(edited, retail(), 'test')).project
    expect(line(back.settings.scouting!, 27).text).toBe("Hi, I'm Ace.")
    const reset = resetSettingsPart(edited.settings, retail().settings, 'scouting')
    expect(line(reset.scouting!, 27).text).toBe("Hi, I'm Ron Barr for EA Sports.")
  })

  it('the preview wraps at 30 with the example names, the empty line between paragraphs', () => {
    const rows = scoutingPreview(retail().settings.scouting!)!
    expect(rows[0]).toBe("Hi, I'm Ron Barr for EA Sports.".slice(0, 30).replace(/ \S*$/, ''))
    expect(rows.every((row) => row.length <= 30)).toBe(true)
    expect(rows.join(' ')).toMatch(/Patrick Roy|Montreal Forum/)
  })
})

describe.skipIf(!existsSync(path('CDL_Season_12.bin')))('a ROM whose lines moved (CDL)', () => {
  it('the line the game shows between paragraphs has text: a note, nothing changed', () => {
    const cdl = open('CDL_Season_12.bin')
    const scouting = cdl.settings.scouting!
    expect(line(scouting, 29).blank).toBe(true)
    expect(line(scouting, 29).text).toMatch(/^For \{home city\}/)
    expect(checkProject(cdl).some((f) => f.level === 'note' && /between paragraphs/.test(f.message))).toBe(true)
    expect(Buffer.compare(buildRom(cdl).subarray(0x4b5c0, 0x4b7a0), cdl.bytes.subarray(0x4b5c0, 0x4b7a0))).toBe(0)
  })
})

describe.skipIf(!existsSync(path('NHL 94 [h] EVO v0.4.0 - 2026 10 28.bin')))("a ROM with its own matchup code (EVO)", () => {
  // NOSE4Web leaves EVO's game settings alone, so the page doesn't offer its lines; reading and writing them still works.
  it('every line kept, no roles, written in its room', () => {
    const evo = open('NHL 94 [h] EVO v0.4.0 - 2026 10 28.bin')
    expect(evo.settings.scouting).toBeUndefined()
    const scouting = parseScouting(evo.bytes, 'genesis')!
    expect(scouting.lines.every((l) => l.role === null)).toBe(true)
    expect(scouting.lines[0].text).toMatch(/^Hi, I'm Ron Barr/)
    expect(scoutingPreview(scouting)).toBeNull()
    const built = evo.bytes.slice()
    expect(writeScouting(built, { ...scouting, lines: scouting.lines.map((l, i) => (i === 0 ? { ...l, text: "Hi, I'm Ace." } : l)) })).toBe(true)
    const again = parseScouting(built, 'genesis')!
    expect(again.lines[0].text).toBe("Hi, I'm Ace.")
    expect(again.lines.slice(1).map((l) => l.text)).toEqual(scouting.lines.slice(1).map((l) => l.text))
    // Every line the code may show is still there, empty ones too.
    const before = String.fromCharCode(...evo.bytes.subarray(0x4b5c0, 0x4b5c0 + 2000)).split('\r').length
    expect(String.fromCharCode(...built.subarray(0x4b5c0, 0x4b5c0 + 2000)).split('\r').length).toBeGreaterThanOrEqual(before)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('the SNES scouting report text', () => {
  let opened: RomProject | undefined
  const retail = () => (opened ??= open('NHL94.smc'))
  const SCRIPT = 0xb88dc

  it('reads the original: six lines from line 28; the team places before them are room', () => {
    const scouting = retail().settings.scouting!
    expect(scouting.lines).toHaveLength(6)
    expect(line(scouting, 29).text).toBe("Hi, I'm Ron Barr for EA Sports.")
    expect(line(scouting, 30).text).toBe(' {hotter team has} been playing {extremely}well recently.')
    expect(scouting.room).toBeGreaterThan(scoutingUsed(scouting)! + 200)
    expect(Buffer.compare(buildRom(retail()), retail().bytes)).toBe(0)
  })

  it('a longer greeting: the team places emptied for room, the music after the script untouched', () => {
    const scouting = retail().settings.scouting!
    const end = SCRIPT + ascii(retail().bytes, SCRIPT, 2000).lastIndexOf('\r', ascii(retail().bytes, SCRIPT, 2000).indexOf('\u0001')) + 1
    const greeting = "Hi, I'm Ace for NHL94.com, with tonight's game. ".repeat(4).trim()
    const built = buildRom(withLine(retail(), 29, greeting))
    expect(Buffer.compare(built.subarray(end, end + 0x400), retail().bytes.subarray(end, end + 0x400))).toBe(0)
    expect(ascii(built, SCRIPT, 28)).toBe('\r'.repeat(28))
    const again = parseScouting(built, 'snes')!
    expect(line(again, 29).text).toBe(greeting)
    expect(line(again, 28).text).toBe(line(scouting, 28).text)
    expect(again.room).toBe(scouting.room)
  })

  it('a short change keeps the team places', () => {
    const built = buildRom(withLine(retail(), 29, "Hi, I'm Ace."))
    expect(ascii(built, SCRIPT, 8)).toBe('Anahiem\r')
  })
})

describe.skipIf(!existsSync(path('CDL_Season_12.bin')))('a script with a line taken out (CDL)', () => {
  it('keeps the lines it has, fits as it is, and the check says a line is missing', () => {
    const cdl = open('CDL_Season_12.bin')
    const scouting = cdl.settings.scouting!
    expect(scouting.missing).toBe(1)
    expect(scouting.lines).toHaveLength(9)
    expect(scoutingUsed(scouting)).toBeLessThanOrEqual(scouting.room)
    expect(checkProject(cdl).some((f) => f.level === 'note' && /one line fewer/.test(f.message))).toBe(true)
    expect(checkProject(cdl).some((f) => f.level === 'problem' && /Ron Barr/.test(f.where))).toBe(false)
  })
})
