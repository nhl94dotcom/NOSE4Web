import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { canAddGenesisBlood, hasGenesisBlood, withGenesisBloodAdded, withGenesisBloodTakenOut } from '../src/core/genesisblood'
import { hasGenesisScoreLogos, withGenesisScoreLogosAdded, withGenesisScoreLogosTakenOut } from '../src/core/genesisscorelogos'
import { pictureItems } from '../src/core/hacksheet'
import { claimSpace } from '../src/core/space'
import { buildRom, openRom, type RomProject } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// The original game's sprite header, HotList and SPAinjuryfall lists.
const SPRITES = 0x5de7a
const HOT = 0xa44c8
const FALL = 0x6f8a

// Each frame's pieces, as addframe2 reads them.
function frames(rom: Uint8Array, sprites = SPRITES): Uint8Array[] {
  const table = sprites + readU32(rom, sprites + 4)
  const count = readU16(rom, table + 2) / 2
  const at = (frame: number) => table + ((readU16(rom, table + frame * 2) << 16) >> 16)
  return Array.from({ length: count - 1 }, (_, frame) => (frame === 0 ? new Uint8Array() : rom.slice(at(frame), at(frame + 1))))
}

function sameAsBefore(after: RomProject, before: RomProject) {
  const rom = after.bytes
  expect(rom.subarray(0, before.bytes.length)).toEqual(before.bytes)
  expect(rom.subarray(before.bytes.length).every((b) => b === 0xff)).toBe(true)
}

describe.skipIf(!existsSync(path('nhl94.bin')))('head bleeding', () => {
  it('gives the game injury fall two bleeding lying frames and leaves every other frame as it was', () => {
    const project = open('nhl94.bin')
    expect(readU16(project.bytes, FALL)).toBe(0x111)
    expect(canAddGenesisBlood(project)).toBe(true)
    expect(hasGenesisBlood(project)).toBe(false)
    const added = withGenesisBloodAdded(project)
    const rom = added.bytes
    expect(rom.length).toBe(0x200000)
    expect(hasGenesisBlood(added)).toBe(true)
    expect(canAddGenesisBlood(added)).toBe(false)
    const before = frames(project.bytes)
    const after = frames(rom)
    expect(after.length).toBe(before.length)
    const slots = [369, 370, 371, 372]
    after.forEach((pieces, frame) => {
      if (!slots.includes(frame)) expect(pieces).toEqual(before[frame])
    })
    // Each new frame: one piece of blood in the arena colours (line 1), then the lying frame's own pieces.
    const lying = [275, 275, 291, 291]
    slots.forEach((frame, i) => {
      const pieces = after[frame]
      expect(pieces.subarray(8)).toEqual(before[lying[i]])
      expect(readU16(pieces, 6) & 0xe000).toBe(0x2000)
      // Its tiles hold only the two dark reds.
      const tile = readU16(pieces, 4)
      const columns = ((pieces[7] >> 2) & 3) + 1
      const tiles = rom.subarray(SPRITES + 10 + tile * 32, SPRITES + 10 + (tile + columns) * 32)
      const colours = new Set(Array.from(tiles).flatMap((b) => [b >> 4, b & 15]))
      expect([...colours].every((c) => c === 0 || c === 12 || c === 13)).toBe(true)
      expect(colours.size).toBe(3)
      expect(readU16(rom, HOT + frame * 2)).toBe(readU16(project.bytes, HOT + lying[i] * 2))
    })
    // The fall: landing on the first bleeding frame for 30 sixtieths, then lying on the second.
    // Tiles read unsigned: mulu.w #32,d2.
    expect(readU32(rom, 0x16866)).toBe(0xc4fc0020)
    expect([8, 12, 24, 28].map((o) => readU16(rom, FALL + o))).toEqual(slots)
    expect([10, 14, 26, 30].map((o) => readU16(rom, FALL + o))).toEqual([0x1e, 0xfc00, 0x1e, 0xfc00])
    // The old table is untouched; only the header points elsewhere.
    const changed = new Set([0x16866, 0x16867, 0x16868, 0x16869, ...[4, 5, 6, 7].map((o) => SPRITES + o), ...slots.flatMap((f) => [HOT + f * 2, HOT + f * 2 + 1]), ...[8, 9, 12, 13, 24, 25, 28, 29].map((o) => FALL + o)])
    // Up to NOSE's end mark, where the added room starts.
    let ends = project.bytes.length - 1
    while (project.bytes[ends] === 0xff) ends--
    ends -= 1
    const differs = []
    for (let i = 0; i < ends; i++) if (rom[i] !== project.bytes[i] && !changed.has(i)) differs.push(i)
    expect(differs).toEqual([])
    // Kept through saving.
    expect(hasGenesisBlood(openRom(buildRom(added)))).toBe(true)
    expect(pictureItems(added).map((item) => item.title)).toContain('Head bleeding')
  })

  it('is taken out again leaving the ROM as it was, but for its size', () => {
    const project = open('nhl94.bin')
    const out = withGenesisBloodTakenOut(withGenesisBloodAdded(project))
    sameAsBefore(out, project)
    expect(hasGenesisBlood(out)).toBe(false)
    expect(canAddGenesisBlood(out)).toBe(true)
  })

  it('when taken out, leaves alone what was added after it', () => {
    // A ROM without NOSE's end mark, so that what comes next starts just past the last byte written.
    const project = open('nhl94.bin')
    const bytes = project.bytes.slice()
    bytes[0xffac0] = bytes[0xffac1] = 0xff
    const added = withGenesisBloodAdded({ ...project, bytes })
    const after = claimSpace(added.bytes, 16)!
    after.rom.fill(0xab, after.at, after.at + 16)
    const out = withGenesisBloodTakenOut({ ...added, bytes: after.rom })
    expect(Array.from(out.bytes.subarray(after.at, after.at + 16))).toEqual(new Array(16).fill(0xab))
    expect(frames(out.bytes)).toEqual(frames(project.bytes))
  })

  it('goes with score logos, either added first, and each comes out alone', () => {
    const project = open('nhl94.bin')
    const both = withGenesisScoreLogosAdded(withGenesisBloodAdded(project))
    expect(hasGenesisBlood(both) && hasGenesisScoreLogos(both)).toBe(true)
    const other = withGenesisBloodAdded(withGenesisScoreLogosAdded(project))
    expect(hasGenesisBlood(other) && hasGenesisScoreLogos(other)).toBe(true)
    const logosOnly = withGenesisBloodTakenOut(other)
    expect(hasGenesisBlood(logosOnly)).toBe(false)
    expect(hasGenesisScoreLogos(logosOnly)).toBe(true)
    expect(frames(logosOnly.bytes)).toEqual(frames(project.bytes))
    const bloodOnly = withGenesisScoreLogosTakenOut(both)
    expect(hasGenesisBlood(bloodOnly)).toBe(true)
    expect(hasGenesisScoreLogos(bloodOnly)).toBe(false)
    // Each taken out, whichever goes first: the ROM is as it was, the room between them given back too.
    sameAsBefore(withGenesisBloodTakenOut(bloodOnly), project)
    sameAsBefore(withGenesisScoreLogosTakenOut(logosOnly), project)
  })
})

const leagueRoms = [local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && /\.bin$/i.test(name) && existsSync(path(name)))

describe.skipIf(leagueRoms.length === 0)('head bleeding in league ROMs', () => {
  it('adds and takes out cleanly wherever it can be added', { timeout: 300000 }, () => {
    for (const name of leagueRoms) {
      const project = open(name)
      if (!canAddGenesisBlood(project)) continue
      // A 4 MB ROM such as EVO's has no room left for it.
      if (project.bytes.length > 0x200000) {
        expect(() => withGenesisBloodAdded(project), name).toThrow('no room')
        continue
      }
      const added = withGenesisBloodAdded(project)
      expect(frames(added.bytes).filter((_, f) => f < 369 || f > 372), name).toEqual(frames(project.bytes).filter((_, f) => f < 369 || f > 372))
      expect(hasGenesisBlood(added), name).toBe(true)
      const out = withGenesisBloodTakenOut(added)
      expect(out.bytes.subarray(0, project.bytes.length), name).toEqual(project.bytes)
    }
  })
})
