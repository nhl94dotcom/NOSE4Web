import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { creditsBytes, parseCredits } from '../src/core/credits'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const open = (name = 'nhl94.bin') => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

describe.skipIf(!hasRom)('the title screen credits', () => {
  it("are read from the original game's 934 bytes at $5776, and make the same bytes again", () => {
    const rom = open().bytes
    const credits = parseCredits(rom)!
    expect(credits.room).toBe(934)
    expect(credits.pages).toHaveLength(21)
    expect(credits.pages[0]).toEqual(['$ 1993 Electronic Arts', 'Licensed by', 'Sega Enterprises Ltd.'])
    expect(credits.pages[2]).toEqual(['Programmed by', 'Mark Lesser'])
    expect(Buffer.compare(Buffer.from(creditsBytes(credits.pages)), Buffer.from(rom.subarray(0x5776, 0x5776 + 934)))).toBe(0)
  })

  it('are read in every Genesis ROM on this computer that keeps them in place, and left as they are', () => {
    for (const name of [local.league30Rom, ...(local.otherRoms ?? [])].filter((n): n is string => !!n && existsSync(path(n)))) {
      const project = open(name)
      const credits = project.settings.credits
      if (!credits) continue
      expect(creditsBytes(credits.pages).length, name).toBeLessThanOrEqual(credits.room)
      expect(parseCredits(buildRom(project)), name).toEqual(credits)
    }
  })

  it('are written when changed, the rest of their room cleared, and refused when too long', () => {
    const project = open()
    const credits = project.settings.credits!
    const pages = [credits.pages[0], ['Edited by', 'The Commissioner'], ['']]
    const edited = openRom(buildRom({ ...project, settings: { ...project.settings, credits: { ...credits, pages } } }))
    expect(edited.settings.credits!.pages).toEqual(pages)
    const used = creditsBytes(pages).length
    expect(edited.bytes.subarray(0x5776 + used, 0x5776 + 934).every((byte) => byte === 0)).toBe(true)
    // The table after them is untouched.
    expect(Buffer.compare(Buffer.from(edited.bytes.subarray(0x5776 + 934, 0x5776 + 950)), Buffer.from(project.bytes.subarray(0x5776 + 934, 0x5776 + 950)))).toBe(0)

    const long = { ...project, settings: { ...project.settings, credits: { ...credits, pages: Array.from({ length: 60 }, () => ['A line of credits text']) } } }
    expect(checkProject(long).some((finding) => finding.level === 'problem' && finding.where === 'Title screen credits')).toBe(true)
    // Not written, so the ROM keeps the credits it had.
    expect(openRom(buildRom(long)).settings.credits!.pages).toEqual(credits.pages)
  })
})

describe.skipIf(!hasRom)('the player cards the team setup screen cycles through', () => {
  it("are read from the ROM's cmpi.w at $F8906: six in the original game, more in some league ROMs", async () => {
    const { setupCardCount } = await import('../src/core/photos')
    expect(setupCardCount(open().bytes)).toBe(6)
    if (local.league30Rom && existsSync(path(local.league30Rom))) expect(setupCardCount(open(local.league30Rom).bytes)).toBeGreaterThanOrEqual(6)
    // Not the instruction: the original game's six.
    const other = open().bytes.slice()
    other[0xf8906] = 0
    expect(setupCardCount(other)).toBe(6)
  })
})

describe.skipIf(!hasRom)('the second credits pointer', () => {
  const pagesPointer = (rom: Uint8Array) => ((rom[0xff292] << 24) | (rom[0xff293] << 16) | (rom[0xff294] << 8) | rom[0xff295]) >>> 0

  it("is at $FF290 in the original game, just past the first page, and moves when the first page's length changes", () => {
    const project = open()
    expect(pagesPointer(project.bytes)).toBe(0x57b8)
    const credits = project.settings.credits!
    for (const first of [['NHL 94 League'], ['$ 1993 Electronic Arts', 'Licensed by', 'Sega Enterprises Ltd.', 'Edited for the league']]) {
      const pages = [first, ...credits.pages.slice(1, 5)]
      const bytes = buildRom({ ...project, settings: { ...project.settings, credits: { ...credits, pages } } })
      expect(pagesPointer(bytes)).toBe(0x5776 + creditsBytes([first]).length - 4)
      // What the game prints from there: the second page's first line.
      const at = pagesPointer(bytes)
      expect(String.fromCharCode(...bytes.subarray(at + 2, at + ((bytes[at] << 8) | bytes[at + 1])))).toBe(pages[1][0].padEnd(pages[1][0].length + (pages[1][0].length % 2), '\0'))
      expect(openRom(bytes).settings.credits!.pages).toEqual(pages)
    }
  })

  it('needs a page after the first and a line on every page', () => {
    const project = open()
    const credits = project.settings.credits!
    for (const pages of [[credits.pages[0]], [credits.pages[0], []]]) {
      const only = { ...project, settings: { ...project.settings, credits: { ...credits, pages } } }
      expect(checkProject(only).some((finding) => finding.where === 'Title screen credits' && finding.message.includes('page of credits after the first'))).toBe(true)
      expect(openRom(buildRom(only)).settings.credits!.pages).toEqual(credits.pages)
    }
  })

  it('keeps the whole room when the roster space expansion moves edited credits', async () => {
    const { expandTeamSpace, nextExpansion } = await import('../src/core/expand')
    const project = open()
    const credits = project.settings.credits!
    const pages = [['NHL 94 League'], ...credits.pages.slice(1)]
    const edited = openRom(buildRom({ ...project, settings: { ...project.settings, credits: { ...credits, pages } } }))
    expect(nextExpansion(edited)?.gain).toBe(934)
    const moved = openRom(buildRom(expandTeamSpace(edited)))
    expect(moved.settings.credits!.pages).toEqual(pages)
    const at = (moved.bytes[0xff226] << 24) | (moved.bytes[0xff227] << 16) | (moved.bytes[0xff228] << 8) | moved.bytes[0xff229]
    expect(pagesPointer(moved.bytes)).toBe(at + creditsBytes([pages[0]]).length - 4)
  })
})
