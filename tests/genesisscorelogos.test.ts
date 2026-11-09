import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import {
  canAddGenesisScoreLogos,
  genesisScoreLogo,
  genesisScoreLogoFromImage,
  hasGenesisScoreLogos,
  SCORE_BACKGROUND,
  withGenesisScoreLogo,
  withGenesisScoreLogosAdded,
  withGenesisScoreLogosTakenOut,
  withoutGenesisScoreLogo,
} from '../src/core/genesisscorelogos'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

describe.skipIf(!existsSync(path('nhl94.bin')))('Genesis score logos', () => {
  it('puts the code into the places the score box, the team graphics and the line change box call', () => {
    const project = open('nhl94.bin')
    expect(canAddGenesisScoreLogos(project)).toBe(true)
    const added = withGenesisScoreLogosAdded(project)
    const rom = added.bytes
    // The score box: frame at y $15, 7 rows; the visitors' row at y $17; both team calls jsr new code.
    expect(rom[0x12c74 + 8]).toBe(0x15)
    expect(rom[0x12c74 + 13]).toBe(0x07)
    expect(rom[0x12c74 + 44]).toBe(0x17)
    expect(readU16(rom, 0x12c74 + 28)).toBe(0x4eb9)
    expect(readU16(rom, 0x12c74 + 46)).toBe(0x4eb9)
    // LoadHomeTeamGfx's call, and SetLCmode2's bset, call new code too.
    expect(readU16(rom, 0xfea52 + 24)).toBe(0x4eb9)
    expect(readU16(rom, 0xb93c)).toBe(0x4eb9)
    const home = readU32(rom, 0x12c74 + 30)
    expect(readU16(rom, home)).toBe(0x347c) // movea.w #tmstruct,a2, as the place had
    // Every team has a home and an away logo, on the black background.
    for (let team = 0; team < added.teams.length; team++) {
      const logo = genesisScoreLogo(added, team)!
      expect(logo.home.pixels.slice(13 * 24).every((p) => p === SCORE_BACKGROUND)).toBe(true)
      expect(logo.home.pixels.some((p) => p !== SCORE_BACKGROUND)).toBe(true)
    }
    expect(hasGenesisScoreLogos(openRom(buildRom(added)))).toBe(true)
  })

  it('takes the code out, leaving the game as it was', () => {
    const project = open('nhl94.bin')
    const out = withGenesisScoreLogosTakenOut(withoutGenesisScoreLogo(withGenesisScoreLogosAdded(project), 3))
    // The ROM grew to 2 MB for them; the original part is the original, NOSE's end mark back where it was, and the rest unused.
    expect(out.bytes.subarray(0, project.bytes.length)).toEqual(project.bytes)
    expect(out.bytes.subarray(project.bytes.length).every((b) => b === 0xff)).toBe(true)
    expect(canAddGenesisScoreLogos(out)).toBe(true)
  })

  it('imports a logo in the home colours, and makes the away one from it', () => {
    const added = withGenesisScoreLogosAdded(open('nhl94.bin'))
    const palette = added.teams[1].palette
    const exported = genesisScoreLogo(added, 1)!
    const made = genesisScoreLogoFromImage(pictureToImage(exported.home, palette.slice(0, 16)), 24, 16, palette)
    const set = withGenesisScoreLogo(added, 2, made)
    expect(Buffer.from(genesisScoreLogo(set, 2)!.home.pixels).equals(Buffer.from(made.home.pixels))).toBe(true)
    expect(() => genesisScoreLogoFromImage(new Uint8Array(48 * 32 * 4), 48, 32, palette)).toThrow('24 pixels wide')
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))('works in a 30-team league ROM, and not in EVO', () => {
    const league = open(local.league30Rom!)
    expect(canAddGenesisScoreLogos(league)).toBe(true)
    const added = withGenesisScoreLogosAdded(league)
    expect(added.bytes.length).toBe(league.bytes.length)
    expect(hasGenesisScoreLogos(openRom(buildRom(added)))).toBe(true)
    const evo = local.otherRoms?.find((name) => / EVO /.test(name))
    if (evo && existsSync(path(evo))) expect(canAddGenesisScoreLogos(open(evo))).toBe(false)
  })
})
