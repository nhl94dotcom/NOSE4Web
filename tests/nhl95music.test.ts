import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { readMidi, readSong, songToMidi, type MidiNote, type SongEvent } from '../src/core/genesismusic'
import {
  findBankItem,
  NHL95_SONG_NUMBERS,
  NHL95_SONG_VOICES,
  nhl95CustomSongBytes,
  nhl95SongFromMidi,
  nhl95StreamBytes,
  readNhl95Song,
  readNhl95Stream,
  soundBankItems,
  withNhl95Song,
  withOriginalNhl95Song,
} from '../src/core/nhl95music'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { genesisSongs, NHL95_SONGS, readRandomSongs, readTeamSongs, songName, teamSongsRoom } from '../src/core/teamsongs'
import { expectSameBytes } from './samebytes'

// NHL '95 (USA) at ../NHL95/NHL_95.bin, and the WN95HL's Season 18 ROM at ../NHL95/W18.bin.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const RETAIL = 'NHL95/NHL_95.bin'
const W18 = 'NHL95/W18.bin'
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const OPERAND = 0xbad0
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0

// The most notes sounding at once.
const mostAtOnce = (events: SongEvent[]) => {
  let now = 0
  let most = 0
  for (const event of events) {
    if ((event.status & 0xf0) === 0x90) most = Math.max(most, ++now)
    else if ((event.status & 0xf0) === 0x80) now--
  }
  return most
}
const ons = (events: SongEvent[]) => events.filter((e) => (e.status & 0xf0) === 0x90)

describe.skipIf(!existsSync(path(RETAIL)))("NHL '95's organ songs", () => {
  it('reads every one of the 36 songs to its end, and writes each song of the bank back byte for byte', () => {
    const rom = open(RETAIL).bytes
    for (const number of NHL95_SONG_NUMBERS) {
      const item = findBankItem(rom, 3, number)!
      const stream = readNhl95Stream(rom.subarray(item.at, item.at + item.size))
      expect(stream.used).toBe(item.size)
      expect(stream.loops).toEqual([])
      const song = readNhl95Song(rom, number)!
      expect(song.custom).toBeNull()
      expect(song.seconds).toBeGreaterThan(3)
      expect(song.seconds).toBeLessThan(31)
    }
    const songs = soundBankItems(rom).filter((item) => item.type === 3)
    let same = 0
    for (const item of songs) {
      const data = rom.subarray(item.at, item.at + item.size)
      const stream = readNhl95Stream(data)
      if (stream.loops.length) continue
      expectSameBytes(nhl95StreamBytes(stream.events, stream.firstWait), data)
      same++
    }
    expect(same).toBe(67)
  })

  it("plays NHL 94's notes: Brass Bonanza is NHL 94's, an octave as NHL '95 plays it", () => {
    const song = readNhl95Song(open(RETAIL).bytes, 0x3d)!
    expect(ons(song.events)[0].data[0]).toBeGreaterThanOrEqual(24)
    expect(song.events.find((e) => (e.status & 0xf0) === 0xc0)?.data[0]).toBe(11)
    if (!existsSync(path('nhl94.bin'))) return
    const nhl94 = readSong(open('nhl94.bin').bytes, 0x40)!
    const first = (events: SongEvent[]) => ons(events).slice(0, 12).map((e) => e.data[0])
    expect(first(song.events)).toEqual(first(nhl94.events))
  })

  it('finds the team songs and the random songs, and names the songs', () => {
    const project = open(RETAIL)
    expect(genesisSongs(project.game)).toBe(NHL95_SONGS)
    expect(teamSongsRoom(project.bytes, 28)).toBe(28)
    const table = readTeamSongs(project.bytes, 28)!
    table.forEach((six, t) => expect(six).toEqual(Array.from(project.bytes.subarray(0x67a20 + t * 6, 0x67a26 + t * 6))))
    expect(project.teams.map((team) => team.songs)).toEqual(table)
    expect(table.flat().every(NHL95_SONGS.isSong)).toBe(true)
    expect(readRandomSongs(project.bytes, 28)).toEqual(Array.from(project.bytes.subarray(0x67ac8, 0x67ad0)))
    expect(songName(0x3d, project.bytes, NHL95_SONGS)).toBe('12. Brass Bonanza')
    expect(songName(0x32, project.bytes, NHL95_SONGS)).toBe('1. Rally Time [F] {Claps}')
    expect(songName(0x30, project.bytes, NHL95_SONGS)).toBe('no song')
    // A team's songs come out as they went in, and a change to one is kept.
    const changed = { ...project, teams: project.teams.map((team, t) => (t === 3 ? { ...team, songs: [0x3d, 0, 0x55, 0x32, 0x3a, 0x4f] } : team)) }
    expect(openRom(buildRom(changed)).teams[3].songs).toEqual([0x3d, 0, 0x55, 0x32, 0x3a, 0x4f])
  })

  it('replaces a song in a bank of its own, which the game searches first, and puts the original back', () => {
    const opened = open(RETAIL)
    const rom = opened.bytes
    const brass = readNhl95Song(rom, 0x3d)!
    const next = withNhl95Song(rom, 0x4f, brass.events, 'Brass Bonanza again')
    expect(u32(next, OPERAND)).not.toBe(0xffffff36)
    const song = readNhl95Song(next, 0x4f)!
    expect(song.custom).toEqual({ name: 'Brass Bonanza again', replaced: 0x4f })
    const notes = (events: SongEvent[]) => ons(events).map((e) => e.frame * 128 + e.data[0]).sort((x, y) => x - y)
    expect(notes(song.events)).toEqual(notes(brass.events))
    // Every other item of the sound bank is found where it was.
    for (const item of soundBankItems(rom)) {
      if (item.type === 3 && item.id === 0x4f) expect(findBankItem(next, 3, 0x4f)!.at).toBeGreaterThan(0x100000)
      else expect(findBankItem(next, item.type, item.id)).toEqual(findBankItem(rom, item.type, item.id))
    }
    // Downloaded and opened again, it is still there.
    const reopened = openRom(buildRom({ ...opened, bytes: next }))
    expect(readNhl95Song(reopened.bytes, 0x4f)?.custom?.name).toBe('Brass Bonanza again')
    const back = withOriginalNhl95Song(next, 0x4f)
    expect(u32(back, OPERAND)).toBe(0xffffff36)
    expectSameBytes(back, rom)
    expect(withOriginalNhl95Song(rom, 0x4f)).toBe(rom)
  })

  it('keeps two songs, and puts back one', () => {
    const rom = open(RETAIL).bytes
    const brass = readNhl95Song(rom, 0x3d)!.events
    const tell = readNhl95Song(rom, 0x3e)!.events
    const two = withNhl95Song(withNhl95Song(rom, 0x4f, brass, 'One'), 0x3a, tell, 'Two')
    expect(readNhl95Song(two, 0x4f)?.custom?.name).toBe('One')
    expect(readNhl95Song(two, 0x3a)?.custom?.name).toBe('Two')
    // Replacing one again keeps one bank.
    const again = withNhl95Song(two, 0x4f, tell, 'Three')
    expect(readNhl95Song(again, 0x4f)?.custom?.name).toBe('Three')
    expect(readNhl95Song(again, 0x3a)?.custom?.name).toBe('Two')
    const one = withOriginalNhl95Song(again, 0x4f)
    expect(readNhl95Song(one, 0x4f)?.custom).toBeNull()
    expect(readNhl95Song(one, 0x3a)?.custom?.name).toBe('Two')
    expect(findBankItem(one, 3, 0x4f)).toEqual(findBankItem(rom, 3, 0x4f))
    expectSameBytes(withOriginalNhl95Song(one, 0x3a), rom)
  })

  it('exports a song as MIDI and takes it back in with the same notes, as many at once as the game’s own songs', () => {
    const rom = open(RETAIL).bytes
    for (const number of [0x52, 0x3d]) {
      const song = readNhl95Song(rom, number)!
      const { notes } = readMidi(songToMidi(song, 'x'))
      const made = nhl95SongFromMidi(notes)
      expect(mostAtOnce(made.events)).toBeLessThanOrEqual(NHL95_SONG_VOICES)
      const next = withNhl95Song(rom, number, made.events, 'x')
      const back = readNhl95Song(next, number)!
      // Two notes at once at most, and five (Brass Bonanza): every note comes back, within a frame.
      expect(made.dropped).toBe(0)
      // Notes that start together may come back in another order: compared by frame, then pitch.
      const sorted = (events: SongEvent[]) => ons(events).sort((a, b) => a.frame - b.frame || a.data[0] - b.data[0])
      const [was, now] = [sorted(song.events), sorted(back.events)]
      expect(now.length).toBe(was.length)
      now.forEach((event, i) => {
        expect(event.data[0]).toBe(was[i].data[0])
        expect(Math.abs(event.frame - was[i].frame)).toBeLessThanOrEqual(1)
      })
    }
  })

  it('holds a crowded MIDI file to seven notes at once, the highest kept, and moves notes into range', () => {
    const notes: MidiNote[] = [36, 40, 43, 48, 52, 55, 60, 64, 100].map((note) => ({ start: 0, length: 1, note, velocity: 64, channel: 0 }))
    const made = nhl95SongFromMidi([...notes, { start: 0, length: 1, note: 36, velocity: 100, channel: 9 }])
    expect(made.drums).toBe(1)
    expect(mostAtOnce(made.events)).toBe(7)
    expect(ons(made.events).map((e) => e.data[0]).sort()).toEqual([43, 48, 52, 55, 60, 64, 76])
    expect(made.moved).toBe(1)
    const rom = withNhl95Song(open(RETAIL).bytes, 0x40, made.events, 'Chord')
    const item = findBankItem(rom, 3, 0x40)!
    const stream = readNhl95Stream(rom.subarray(item.at, item.at + item.size))
    // As NHL '95 keeps them: 12 higher, the organ on channel 0, the game's velocities.
    expect(stream.events[0]).toEqual({ frame: 0, status: 0xc0, data: [0x19] })
    expect(stream.events.filter((e) => e.status === 0x90).map((e) => e.data[0]).sort()).toEqual([55, 60, 64, 67, 72, 76, 88])
    expect(stream.events.filter((e) => e.status === 0x90).every((e) => e.data[1] === 90 && e.data[2] === 60)).toBe(true)
  })

  it('carries a song in a project file, and lists it in the changes', () => {
    const opened = open(RETAIL)
    const project = { ...opened, bytes: withNhl95Song(opened.bytes, 0x4f, readNhl95Song(opened.bytes, 0x3d)!.events, 'Brass') }
    const text = saveProjectFile(project, opened, 'P')
    expect(JSON.parse(text).songs.genesis.map((s: { number: number }) => s.number)).toEqual([0x4f])
    // Over another copy of the ROM, the song is put in from the file.
    const result = openProjectFile(opened, JSON.stringify({ ...JSON.parse(text), rom: undefined }))
    expect(readNhl95Song(result.project.bytes, 0x4f)?.custom?.name).toBe('Brass')
    expectSameBytes(nhl95CustomSongBytes(result.project.bytes, 0x4f)!, nhl95CustomSongBytes(project.bytes, 0x4f)!)
    const changes = compareProjects(opened, project).flatMap((d) => (d.heading === 'Organ songs' ? d.changes : []))
    expect(changes).toEqual(['Song 30: "Brass", from a MIDI file.'])
  })

  it.skipIf(!existsSync(path(W18)))("puts a song into the WN95HL's ROM before the data it keeps at the end", () => {
    const opened = open(W18)
    expect(teamSongsRoom(opened.bytes, 34)).toBe(34)
    const table = readTeamSongs(opened.bytes, 34)!
    table.forEach((six, t) => expect(six).toEqual(Array.from(opened.bytes.subarray(0xc60 + t * 6, 0xc66 + t * 6))))
    expect(table.flat().every(NHL95_SONGS.isSong)).toBe(true)
    const next = withNhl95Song(opened.bytes, 0x3a, readNhl95Song(opened.bytes, 0x3d)!.events, 'Brass')
    expect(next.length).toBe(opened.bytes.length)
    const block = u32(next, OPERAND)
    expect(block).toBeLessThan(0x1fffef)
    expect(readNhl95Song(next, 0x3a)?.custom?.name).toBe('Brass')
    expect(readNhl95Song(openRom(buildRom({ ...opened, bytes: next })).bytes, 0x3a)?.custom?.name).toBe('Brass')
    // Again in the same place, and back as it was.
    expect(u32(withNhl95Song(next, 0x3a, readNhl95Song(opened.bytes, 0x3e)!.events, 'Tell'), OPERAND)).toBe(block)
    expectSameBytes(withOriginalNhl95Song(next, 0x3a), opened.bytes)
  })
})
