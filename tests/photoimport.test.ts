import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorRgb, SNES_COLORS } from '../src/core/color'
import { importTeam } from '../src/core/importteam'
import { teamPhotos } from '../src/core/photos'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { snesPhotoPalette, snesTeamPhotos } from '../src/core/snesphotos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const parts = { names: true, roster: true, colours: false, pictures: false, photos: true }

// How each player's SNES photo looks, by name.
const snesLooks = (project: RomProject, team: number) => {
  const palette = snesPhotoPalette(project, team).map((word) => colorRgb(word, SNES_COLORS).join())
  return snesTeamPhotos(project, team)
    .slice(0, project.teams[team].players.length)
    .map((photo, slot) => [project.teams[team].players[slot].name, Array.from(photo.picture.pixels, (p) => (p ? palette[p] : '-')).join(';')])
}

describe.skipIf(!existsSync(path('NHL94_Classic.smc')) || !existsSync(path('nhl94_2026.sfc')))('importing an SNES team with its photos', () => {
  it('brings the Classic team into the 32-team build looking as it did', () => {
    const classic = open('NHL94_Classic.smc')
    const result = importTeam(open('nhl94_2026.sfc'), classic, 1, 1, parts)
    expect(result.notes.some((note) => note.startsWith('Player photos brought in'))).toBe(true)
    const reopened = openRom(buildRom(result.project))
    const want = snesLooks(classic, 1)
    const got = snesLooks(reopened, 1)
    // Every player's photo looks the same, a stand-in too: the Classic stand-ins come with the team.
    expect(got.slice(0, want.length)).toEqual(want)
  })

  it('frees the photos it replaces, so another team brought in over it takes no more room', { timeout: 300000 }, () => {
    const classic = open('NHL94_Classic.smc')
    const build = open('nhl94_2026.sfc')
    const unused = (bytes: Uint8Array) => bytes.reduce((n, v) => n + (v === 0xff ? 1 : 0), 0)
    const direct = importTeam(build, classic, 4, 1, parts).project
    const twice = importTeam(importTeam(build, classic, 1, 1, parts).project, classic, 4, 1, parts).project
    // The first team's own photos, where the second has stand-ins, are given back.
    expect(unused(twice.bytes)).toBeGreaterThanOrEqual(unused(direct.bytes))
    const reopened = openRom(buildRom(twice))
    const want = snesLooks(classic, 4)
    expect(snesLooks(reopened, 1).slice(0, want.length)).toEqual(want)
    // Every other team's photos are as they were.
    build.teams.forEach((_, t) => {
      if (t !== 1) expect(snesLooks(reopened, t), `team ${t}`).toEqual(snesLooks(build, t))
    })
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')) || !local.league30Rom || !existsSync(path(local.league30Rom)))('importing a Genesis team with its photos', () => {
  it("brings a league team's featured players and their photos into the original game", () => {
    const league = open(local.league30Rom!)
    const result = importTeam(open('nhl94.bin'), league, 1, 1, parts)
    const reopened = openRom(buildRom(result.project))
    const theirs = teamPhotos(league, 1)
    const ours = teamPhotos(reopened, 1)
    expect(ours.map((photo) => photo.slot)).toEqual(theirs.map((photo) => photo.slot))
    theirs.forEach((photo, i) => {
      if (!photo.generic) expect(Buffer.from(ours[i].picture.pixels).equals(Buffer.from(photo.picture.pixels))).toBe(true)
      else expect(ours[i].generic).toBe(true)
    })
  })

  it('leaves photos alone without the roster', () => {
    const result = importTeam(open('nhl94.bin'), open('nhl94.bin'), 0, 1, { ...parts, roster: false })
    expect(result.notes).toContain('Player photos were left alone: they come only with the roster, since each is for a place on it.')
  })
})
