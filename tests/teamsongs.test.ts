import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { readTeamSongs, songName, teamSongsRoom, withRoomForTeamSongs } from '../src/core/teamsongs'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name = 'nhl94.bin') => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const BOSTON = 1
const setSong = (project: RomProject, team: number, slot: number, value: number): RomProject => ({
  ...project,
  teams: project.teams.map((t, i) => (i === team ? { ...t, songs: t.songs!.map((v, s) => (s === slot ? value : v)) } : t)),
})

describe.skipIf(!existsSync(path('nhl94.bin')))('organ songs', () => {
  it("are read from TeamSongs, six for each team: Boston's as Match Viewer gave them", () => {
    const project = open()
    expect(teamSongsRoom(project.bytes, project.teams.length)).toBe(28)
    expect(project.teams[BOSTON].songs).toEqual([49, 50, 48, 0, 90, 49])
    expect(songName(0x40)).toBe('17. Brass Bonanza (HFD)')
    expect(songName(0)).toBe('one of the random songs')
    expect(songName(0x80)).toBe('no song')
  })

  it('are written when changed, and come back from a project file and in Compare ROMs', () => {
    const project = open()
    // Boston's home goal: Brass Bonanza.
    const changed = setSong(project, BOSTON, 3, 0x40)
    const bytes = buildRom(changed)
    const differing = bytes.findIndex((b, i) => b !== project.bytes[i] && !(i >= 0x18e && i < 0x190))
    expect(differing).toBe(0xfe5b0 + BOSTON * 6 + 3)
    expect(openRom(bytes).teams[BOSTON].songs).toEqual([49, 50, 48, 0x40, 90, 49])
    const reopened = openProjectFile(project, saveProjectFile(changed, project, 'test')).project
    expect(reopened.teams[BOSTON].songs).toEqual(changed.teams[BOSTON].songs)
    const compared = compareProjects(project, openRom(bytes)).flatMap((section) => section.changes)
    expect(compared).toContain('Organ song, home goal: one of the random songs to 17. Brass Bonanza (HFD).')
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))('move to free room in a 30-team ROM so that teams 28 and 29 have their own', () => {
    const project = open(local.league30Rom)
    expect(project.teams).toHaveLength(30)
    expect(teamSongsRoom(project.bytes, 30)).toBe(28)
    const before = readTeamSongs(project.bytes, 30)!
    const moved = withRoomForTeamSongs(project.bytes, 30)!
    expect(teamSongsRoom(moved, 30)).toBe(30)
    // Every team plays what it did, and the old table and RandomSongs are left alone.
    expect(readTeamSongs(moved, 30)).toEqual(before)
    expect(Buffer.compare(Buffer.from(moved.subarray(0xfe5b0, 0xfe660)), Buffer.from(project.bytes.subarray(0xfe5b0, 0xfe660)))).toBe(0)
    expect(Buffer.compare(Buffer.from(moved.subarray(0xfe57a, 0xfe57e)), Buffer.from(project.bytes.subarray(0xfe57a, 0xfe57e)))).toBe(0)
    const given = setSong({ ...project, bytes: moved }, 29, 0, 0x60)
    expect(openRom(buildRom(given)).teams[29].songs![0]).toBe(0x60)
  })
})
