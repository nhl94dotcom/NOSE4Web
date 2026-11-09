import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { creditsFit, creditsUsed } from '../src/core/credits'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { parseSnesCredits, snesCreditsBytes } from '../src/core/snescredits'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const file = (name: string) => new Uint8Array(readFileSync(path(name)))
const open = (name: string) => openRom(file(name))
const withPages = (project: RomProject, pages: string[][]): RomProject => ({
  ...project,
  settings: { ...project.settings, credits: { ...project.settings.credits!, pages } },
})
// Where two ROMs differ, but for the header's checksum.
const differing = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i] && !(i >= 0x7fdc && i < 0x7fe0))

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES title screen credits', () => {
  it('are read as the disassembly has them: 17 titles, each with its names', () => {
    const credits = open('NHL94.smc').settings.credits!
    expect(credits.format).toBe('snes')
    expect(credits.pages).toHaveLength(17)
    expect(credits.pages[0]).toEqual(['DESIGN ADAPTED BY', 'MICHAEL BROOK'])
    expect(credits.pages[1]).toEqual(['PROGRAMMING', 'AMORY WONG', 'ROBERT WHITE', 'ROD REDDEKOPP'])
    expect(credits.pages[16].at(-1)).toBe('KYRA WOODY')
    // From the titles table at $80:E30C up to TitleSampleList at $80:E6C1.
    expect(credits.room).toBe(0x66c1 - 0x630c)
    // Less than the room: a few names are in the original twice, which the editor stores once.
    expect(creditsUsed(credits)).toBeLessThan(credits.room)
    expect(creditsFit(credits)).toBe(true)
  })

  it.each(names)('are found in %s, and saving it unchanged keeps every byte', (name) => {
    const project = open(name)
    const credits = project.settings.credits!
    expect(credits.pages.length).toBeGreaterThan(0)
    expect(credits.pages.every((page) => page.length >= 2)).toBe(true)
    expect(snesCreditsBytes(credits.pages)).toBeLessThanOrEqual(credits.room)
    // The ROMs without any copier header: the checksum, put right on saving, is then where differing leaves it out.
    expect(differing(openRom(buildRom(project)).bytes, project.bytes)).toEqual([])
  })

  it.each(names)('in %s, are written in their room with the loads pointed at the tables, and read back the same', (name) => {
    const project = open(name)
    const credits = project.settings.credits!
    const pages = [['NOSE4WEB LEAGUE', 'COMMISSIONER', 'SEASON 12'], ...credits.pages.slice(1, 5), ['THANKS TO', 'MATCH VIEWER', 'MCMARKIS']]
    const bytes = buildRom(withPages(project, pages))
    const original = file(name)
    const again = openRom(bytes)
    expect(again.settings.credits).toEqual({ ...credits, pages })
    // Only bytes in the room and the four pointers changed; the copyright lines are as they were.
    const room = parseSnesCredits(project.bytes)!
    expect(room.room).toBe(credits.room)
    const copyright = Buffer.from(original).indexOf('@ 1993 ELECTRONIC ARTS')
    expect(copyright).toBeGreaterThan(0)
    const changed = differing(bytes, original)
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.filter((i) => i >= copyright && i < copyright + 44)).toEqual([])
    // And back to the original credits, which then fit exactly as before.
    expect(openRom(buildRom(withPages(again, credits.pages))).settings.credits!.pages).toEqual(credits.pages)
  })

  it('are not written when too long or with a title that has no name, and Check says why', () => {
    const project = open('NHL94.smc')
    const credits = project.settings.credits!
    const tooLong = withPages(project, [...credits.pages, ['ONE MORE TITLE', 'AND A NAME', 'AND ANOTHER NAME']])
    expect(creditsFit(tooLong.settings.credits!)).toBe(false)
    expect(differing(buildRom(tooLong), project.bytes)).toEqual([])
    expect(checkProject(tooLong).some((f) => f.level === 'problem' && /more room/.test(f.message))).toBe(true)
    const nameless = withPages(project, [['A TITLE'], ...credits.pages.slice(1)])
    expect(creditsFit(nameless.settings.credits!)).toBe(false)
    expect(differing(buildRom(nameless), project.bytes)).toEqual([])
    expect(checkProject(nameless).some((f) => f.level === 'problem' && /no name/.test(f.message))).toBe(true)
    // A letter the game does not have.
    expect(creditsFit(withPages(project, [['A TITLE', 'NAME!'], ...credits.pages.slice(1)]).settings.credits!)).toBe(false)
  })

  it('store a line used twice once, and come back from a project file and in Compare ROMs', () => {
    const project = open('NHL94.smc')
    const pages = [['MADE BY', 'THE LEAGUE'], ['TESTED BY', 'THE LEAGUE']]
    expect(snesCreditsBytes(pages)).toBe(3 * 2 + 4 * 2 + 'MADE BY.THE LEAGUE.TESTED BY.'.length)
    const changed = withPages(project, pages)
    expect(openProjectFile(project, saveProjectFile(changed, project, 'test')).project.settings.credits).toEqual(changed.settings.credits)
    const compared = compareProjects(project, openRom(buildRom(changed))).flatMap((section) => section.changes)
    expect(compared).toContain('Page 1: MADE BY / THE LEAGUE.')
  })
})
