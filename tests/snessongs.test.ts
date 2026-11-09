import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { importTeam } from '../src/core/importteam'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { SNES_RANDOM_SONG, snesSongChoices, snesSongName } from '../src/core/snessongs'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const BOSTON = 1
const byName = (project: RomProject, name: string) => snesSongChoices(project.bytes).find((choice) => choice.name === name)!.pointer
const setSong = (project: RomProject, team: number, slot: number, value: number): RomProject => ({
  ...project,
  teams: project.teams.map((t, i) => (i === team ? { ...t, snesSongs: t.snesSongs!.map((v, s) => (s === slot ? value : v)) } : t)),
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES organ songs', () => {
  it("are read from TeamSongs and named by their data: Boston's as the disassembly has them", () => {
    const project = open('NHL94.smc')
    expect(project.teams[BOSTON].snesSongs!.map((s) => snesSongName(project.bytes, s))).toEqual([
      'Here We Go',
      'Charge [E-flat]',
      'Go Team Go [E-flat]',
      'Random',
      'Defense [C]',
      'Here We Go',
    ])
    expect(snesSongChoices(project.bytes)).toHaveLength(53)
  })

  it('are written when changed, four bytes a song, and come back from a project file and in Compare ROMs', () => {
    const project = open('NHL94.smc')
    // Boston's home goal: Brass Bonanza, where it plays one of the random songs.
    const bonanza = byName(project, 'Brass Bonanza')
    const changed = setSong(project, BOSTON, 3, bonanza)
    const bytes = buildRom(changed)
    const differing = [...bytes.keys()].filter((i) => bytes[i] !== project.bytes[i] && !(i >= 0x7fdc && i < 0x7fe0))
    expect(differing).toHaveLength(4)
    expect(openRom(bytes).teams[BOSTON].snesSongs![3]).toBe(bonanza)
    expect(openProjectFile(project, saveProjectFile(changed, project, 'test')).project.teams[BOSTON].snesSongs).toEqual(changed.teams[BOSTON].snesSongs)
    const compared = compareProjects(project, openRom(bytes)).flatMap((section) => section.changes)
    expect(compared).toContain('Organ song, home goal: Random to Brass Bonanza.')
    // And back to random.
    expect(openRom(buildRom(setSong(changed, BOSTON, 3, SNES_RANDOM_SONG))).teams[BOSTON].snesSongs![3]).toBe(SNES_RANDOM_SONG)
  })

  it.skipIf(!existsSync(path('nhl94_2026.sfc')))('come with a team imported from another build as the same songs there', () => {
    const retail = open('NHL94.smc')
    const build = open('nhl94_2026.sfc')
    const names = (project: RomProject, team: number) => project.teams[team].snesSongs!.map((s) => snesSongName(project.bytes, s))
    // Hartford's, from retail, into the 2 MB build's team 5.
    const hartford = retail.teams.findIndex((t) => t.names.some((n) => /Hartford/.test(n)))
    const result = importTeam(build, retail, hartford, 5, { names: true, roster: false, colours: false, pictures: false })
    expect(names(result.project, 5)).toEqual(names(retail, hartford))
    expect(names(result.project, 5)).toContain('Brass Bonanza')
  })
})
