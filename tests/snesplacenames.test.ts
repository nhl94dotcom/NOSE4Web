import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { SNES_COLORS } from '../src/core/color'
import { pictureToImage } from '../src/core/graphics'
import { importTeam } from '../src/core/importteam'
import { buildRom, openRom } from '../src/core/rom'
import { snesBlockColours } from '../src/core/snesblockcolours'
import { snesPlaceNameRoom } from '../src/core/snesplacenames'
import { centreIceInOwnColours, NO_SNES_PICTURE_EDITS, snesCentreIce, snesCentreIceFromImage, withSnesCentreIceColours } from '../src/core/snespictures'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const both = existsSync(path('NHL94_Classic.smc')) && existsSync(path('nhl94_2026.sfc'))

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES banner names', () => {
  it("reads each team's, follows a rename, and writes them packed into their room", () => {
    const project = open('NHL94.smc')
    expect(project.teams.map((team) => team.placeName).slice(0, 4)).toEqual(['Anaheim', 'Boston', 'Buffalo', 'Calgary'])
    expect(project.teams[26].placeName).toBe('All Stars E.')
    const renamed = { ...project, teams: project.teams.map((team, t) => (t === 9 ? { ...team, placeName: 'Carolina' } : team)) }
    const reopened = openRom(buildRom(renamed))
    expect(reopened.teams[9].placeName).toBe('Carolina')
    expect(reopened.teams.map((team) => team.placeName).filter((_, t) => t !== 9)).toEqual(project.teams.map((team) => team.placeName).filter((_, t) => t !== 9))
    // A name shortened keeps the room, so a longer one fits again later.
    const before = snesPlaceNameRoom(project.bytes, project.teams.map((team) => team.placeName!))!
    const shortened = openRom(buildRom({ ...project, teams: project.teams.map((team, t) => (t === 0 ? { ...team, placeName: 'A' } : team)) }))
    expect(snesPlaceNameRoom(shortened.bytes, shortened.teams.map((team) => team.placeName!))!.room).toBe(before.room)
    const longer = openRom(buildRom({ ...shortened, teams: shortened.teams.map((team, t) => (t === 0 ? { ...team, placeName: 'Anaheim' } : team)) }))
    expect(longer.teams[0].placeName).toBe('Anaheim')
    expect(longer.teams.slice(1).map((team) => team.placeName)).toEqual(project.teams.slice(1).map((team) => team.placeName))
    // Too long for their room: not written, and Check ROM says so.
    const long = { ...project, teams: project.teams.map((team) => ({ ...team, placeName: 'A very long place name' })) }
    expect(checkProject(long).some((finding) => finding.where === 'Banner names' && finding.level === 'problem')).toBe(true)
    expect(openRom(buildRom(long)).teams[0].placeName).toBe('Anaheim')
  })
})

describe.skipIf(!both)('a Classic team brought into the 32-team build', () => {
  it('brings its banner name, banner colours and overall shown', () => {
    const classic = open('NHL94_Classic.smc')
    const result = importTeam(open('nhl94_2026.sfc'), classic, 4, 4, { names: true, roster: true, colours: true, pictures: false })
    const reopened = openRom(buildRom(result.project))
    expect(reopened.teams[4].placeName).toBe('Chicago')
    expect(reopened.teams[4].shownOverall).toBe(classic.teams[4].shownOverall)
    expect(snesBlockColours(reopened, 4)).toEqual(snesBlockColours(classic, 4))
    expect(result.notes).toContain('Its name banner colours brought in.')
  })

  it("takes a centre ice logo of another size, where its squares fit the map's room", () => {
    const classic = open('NHL94_Classic.smc')
    let project = open('nhl94_2026.sfc')
    const theirs = snesCentreIce(classic.bytes, classic.teams.length, NO_SNES_PICTURE_EDITS, 11, classic.rinkPalette)
    const ours = snesCentreIce(project.bytes, project.teams.length, NO_SNES_PICTURE_EDITS, 11, project.rinkPalette)
    expect([ours.picture.width, ours.picture.height]).toEqual([48, 48])
    expect([theirs.picture.width, theirs.picture.height]).toEqual([64, 32])
    const picture = snesCentreIceFromImage(pictureToImage(theirs.picture, theirs.palette, SNES_COLORS), 64, 32, ours)
    project = { ...project, snesPictures: { logos: {}, centreIce: { 11: picture } } }
    const reopened = openRom(buildRom(project))
    const now = snesCentreIce(reopened.bytes, reopened.teams.length, NO_SNES_PICTURE_EDITS, 11, reopened.rinkPalette)
    expect([now.picture.width, now.picture.height]).toEqual([64, 32])
    expect(Buffer.from(now.picture.pixels).equals(Buffer.from(picture.pixels))).toBe(true)
    // In the team's own centre ice colours, those the Classic logo shows: it looks as it does there.
    const own = centreIceInOwnColours(theirs.picture, theirs.palette)
    const bytes = project.bytes.slice()
    expect(withSnesCentreIceColours(bytes, project.teams.length, 11, own.colours)).toBe(true)
    const coloured = openRom(buildRom({ ...project, bytes, snesPictures: { logos: {}, centreIce: { 11: own.picture } } }))
    const look = (ice: { picture: { pixels: Uint8Array }; palette: number[] }) => Array.from(ice.picture.pixels, (v) => (v ? ice.palette[v] & 0x7fff : -1))
    expect(look(snesCentreIce(coloured.bytes, coloured.teams.length, NO_SNES_PICTURE_EDITS, 11, coloured.rinkPalette))).toEqual(look(theirs))
    // Too many squares for the room is refused.
    expect(() => snesCentreIceFromImage(new Uint8Array(80 * 64 * 4), 80, 64, ours)).toThrow('no more of them (36)')
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('the power play and penalty kill ratings, imported', () => {
  it('swaps their halves where only one of the two ROMs has the fix, so the team plays as it did', async () => {
    const { applySnesHacks } = await import('../src/core/sneshacks')
    const plain = open('NHL94.smc')
    const fixed = applySnesHacks(open('NHL94.smc'), { ppPkFix: true })
    const before = plain.teams[11].teamBytes
    const swap = (byte: number) => ((byte & 0x0f) << 4) | (byte >> 4)
    const into = importTeam(fixed, plain, 11, 11, { names: false, roster: true, colours: false, pictures: false })
    expect(into.project.teams[11].teamBytes).toEqual([before[0], swap(before[1]), before[2]])
    expect(into.notes.some((note) => note.includes('were swapped to play as they did'))).toBe(true)
    // Both alike: as stored.
    const same = importTeam(plain, plain, 11, 4, { names: false, roster: true, colours: false, pictures: false })
    expect(same.project.teams[4].teamBytes).toEqual(before)
    expect(same.notes.some((note) => note.includes('power play and penalty kill'))).toBe(false)
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('the power play and penalty kill ratings, imported on the Genesis', () => {
  it('swaps their halves where only one of the two ROMs has the fix', async () => {
    const { applyHacks, hackState } = await import('../src/core/hacks')
    const plain = open('nhl94.bin')
    const fixed = applyHacks(open('nhl94.bin'), { ...hackState(plain)!.choices, ppPkFix: true })
    const before = plain.teams[11].teamBytes
    const into = importTeam(fixed, plain, 11, 11, { names: false, roster: true, colours: false, pictures: false })
    expect(into.project.teams[11].teamBytes).toEqual([before[0], ((before[1] & 0x0f) << 4) | (before[1] >> 4), before[2]])
    const back = importTeam(plain, fixed, 11, 11, { names: false, roster: true, colours: false, pictures: false })
    expect(back.project.teams[11].teamBytes).toEqual(fixed.teams[11].teamBytes.map((byte, i) => (i === 1 ? ((byte & 0x0f) << 4) | (byte >> 4) : byte)))
  })
})
