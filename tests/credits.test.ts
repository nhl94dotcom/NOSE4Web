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
