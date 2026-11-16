import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatCsv, type Cell } from '../src/core/csv'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { SNES_RANDOM_SONG } from '../src/core/snessongs'
import { CSV_TABLES, CsvImportError, identifyCsvFile, importCsv, importCsvSet, tablesFor } from '../src/core/tables'
import { teamSongsRoom } from '../src/core/teamsongs'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const songs = CSV_TABLES.find((t) => t.id === 'songs')!
const songList = CSV_TABLES.find((t) => t.id === 'songlist')!
const BOSTON = 1
const edit = (project: RomProject, change: (rows: Cell[][]) => Cell[][]) => importCsv(songs, project, formatCsv(change(songs.rows(project))))

describe.skipIf(!existsSync(path('nhl94.bin')))('organ songs as a spreadsheet file (Genesis)', () => {
  it("lists each team's six songs by the forum list's numbers, 0 for Random, and the list names them", () => {
    const project = open('nhl94.bin')
    const rows = songs.rows(project)
    expect(rows[0]).toEqual(['Team', 'Team name', 'Period start', 'Home team on the power play', 'Faceoff (once a period, and the shootout)', 'Home goal', 'Home team on the penalty kill', 'Late in the third period'])
    // Boston: $31 $32 $30 Random $5A $31.
    expect(rows[BOSTON + 1]).toEqual([BOSTON + 1, 'Boston Bruins', 2, 3, 1, 0, 43, 2])
    const list = songList.rows(project)
    expect(list[1]).toEqual([0, 'Random'])
    expect(list[17 + 1]).toEqual([17, 'Brass Bonanza (HFD)'])
    expect(list).toHaveLength(2 + 72)
  })

  it('changes the songs whose numbers change, and leaves blank cells as they are', () => {
    const project = open('nhl94.bin')
    const result = edit(project, (rows) =>
      rows.map((row, r) => (r === BOSTON + 1 ? row.map((cell, c) => (c === 5 ? 17 : c === 2 ? '' : c === 7 ? 'random' : cell)) : row)),
    )
    expect(result.summary).toBe('Updated the songs of 1 team.')
    expect(result.project.teams[BOSTON].songs).toEqual([49, 50, 48, 0x40, 90, 0])
    expect(result.project.teams.filter((t, i) => t !== project.teams[i])).toHaveLength(1)
    expect(openRom(buildRom(result.project)).teams[BOSTON].songs).toEqual([49, 50, 48, 0x40, 90, 0])
    // Unchanged, it changes nothing.
    expect(edit(project, (rows) => rows).summary).toBe('Updated the songs of 0 teams.')
  })

  it('says which cells are not song numbers, and changes nothing then', () => {
    const project = open('nhl94.bin')
    let problems: string[] = []
    try {
      edit(project, (rows) => rows.map((row, r) => (r === 2 ? row.map((cell, c) => (c === 3 ? 73 : c === 4 ? 'Charge' : cell)) : row)))
    } catch (e) {
      problems = (e as CsvImportError).problems
    }
    expect(problems).toEqual([
      'Row 3: Home team on the power play must be a song number from 0 (Random) to 72, not "73".',
      'Row 3: Faceoff (once a period, and the shootout) must be a song number from 0 (Random) to 72, not "Charge".',
    ])
  })

  it('is recognised by its file name and imported with a set', () => {
    expect(identifyCsvFile('League_S10_songs.csv')?.table).toBe(songs)
    expect(identifyCsvFile('League_S10_songlist.csv')?.table).toBe(songList)
    const project = open('nhl94.bin')
    const text = formatCsv(songs.rows(project).map((row, r) => (r === BOSTON + 1 ? row.map((cell, c) => (c === 5 ? 17 : cell)) : row)))
    const result = importCsvSet(project, [
      { name: 'S_songs.csv', text },
      { name: 'S_songlist.csv', text: formatCsv(songList.rows(project)) },
    ])
    expect(result.project.teams[BOSTON].songs![3]).toBe(0x40)
    expect(result.files.map((f) => f.summary)).toEqual(['Updated the songs of 1 team.', 'The song list is for reading only, so nothing was changed.'])
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))('moves the song table to free room when a team past it is given songs', () => {
    const project = open(local.league30Rom!)
    expect(teamSongsRoom(project.bytes, 30)).toBe(28)
    // Unchanged, the two teams past the table's room change nothing.
    expect(edit(project, (rows) => rows).project.bytes).toBe(project.bytes)
    const result = edit(project, (rows) => rows.map((row, r) => (r === 30 ? row.map((cell, c) => (c >= 2 ? 17 : cell)) : row)))
    expect(teamSongsRoom(result.project.bytes, 30)).toBe(30)
    expect(openRom(buildRom(result.project)).teams[29].songs).toEqual([0x40, 0x40, 0x40, 0x40, 0x40, 0x40])
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('organ songs as a spreadsheet file (SNES)', () => {
  it('numbers the songs by the song list, and changes a team to one by its number', () => {
    const project = open('NHL94.smc')
    const list = songList.rows(project)
    const brass = list.find((row) => row[1] === 'Brass Bonanza')![0] as number
    const result = edit(project, (rows) => rows.map((row, r) => (r === BOSTON + 1 ? row.map((cell, c) => (c === 5 ? brass : c === 2 ? 0 : cell)) : row)))
    const reopened = openRom(buildRom(result.project))
    expect(songs.rows(reopened)[BOSTON + 1][5]).toBe(brass)
    expect(reopened.teams[BOSTON].snesSongs![0]).toBe(SNES_RANDOM_SONG)
    expect(edit(project, (rows) => rows).summary).toBe('Updated the songs of 0 teams.')
  })
})

describe.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("NHL '95", () => {
  it('has no songs files, having no organ songs the editor reads', () => {
    expect(tablesFor(open('NHL95/NHL_95.bin').game).map((t) => t.id)).not.toContain('songs')
  })
})
