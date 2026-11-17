import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareProjects } from '../src/core/compare'
import { gameMusicToMidi, gameMusicTune, musicParts, NHL95_DRUM_NOTES, NHL95_EXPORT_PROGRAM, nhl95Shift, NOISE_HAT, readMidi, readSong, songToMidi, type MidiNote, type PartChoice, type SongEvent } from '../src/core/genesismusic'
import {
  findBankItem,
  NHL95_GAME_MUSIC,
  NHL95_INSTRUMENTS,
  nhl95LoopFrames,
  nhl95MusicFromMidi,
  nhl95MusicLimits,
  nhl95PartChoices,
  withNhl95Music,
  withNhl95SongBytes,
  NHL95_SONG_NUMBERS,
  NHL95_SONG_VOICES,
  nhl95CustomSongBytes,
  nhl95SongFromMidi,
  nhl95StreamBytes,
  readNhl95Music,
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
const W18P = 'NHL95/W18p.bin'
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

describe.skipIf(!existsSync(path(RETAIL)))("NHL '95's other music", () => {
  it('reads the title, end of period and scouting report music, and exports each as MIDI, the hi-hats as drums', () => {
    for (const name of [RETAIL, W18].filter((n) => existsSync(path(n)))) {
      const rom = open(name).bytes
      const lengths = NHL95_GAME_MUSIC.map(({ number }) => {
        const song = readNhl95Music(rom, number)!
        // The organ songs' reader does not take them.
        expect(readNhl95Song(rom, number)).toBeNull()
        const notes = readMidi(gameMusicToMidi(song, '', 95)).notes
        const hats = notes.filter((note) => note.channel === 9 && note.note === 42).length
        expect(hats).toBeGreaterThan(0)
        // Every tune note is in the MIDI file, at its time; the drums on the drum channel.
        const tune = gameMusicTune(song, 95).filter((e) => (e.status & 0xf0) === 0x90)
        expect(notes.filter((note) => note.channel !== 9).length).toBe(tune.length)
        expect(tune.length).toBeGreaterThan(300)
        return Math.round(song.seconds)
      })
      // Each to where it plays again: the title music to its $75 (its last 6 frames, after it, never play).
      expect(lengths, name).toEqual([70, 65, 70])
    }
    // Only songs 0, 2 and 3.
    expect(readNhl95Music(open(RETAIL).bytes, 1)).toBeNull()
  })

  it("plays NHL '95's patches as its own, not NHL 94's: channel 9 a tune, its drums by their notes, each octave as heard", () => {
    const rom = open(RETAIL).bytes
    const scouting = readNhl95Music(rom, 3)!
    const ons = (events: SongEvent[], channel: number) => events.filter((e) => (e.status & 0xf0) === 0x90 && (e.status & 0x0f) === channel)
    const range = (events: SongEvent[]) => [Math.min(...events.map((e) => e.data[0])), Math.max(...events.map((e) => e.data[0]))]
    // The scouting report's channel 9 is a tune on patch $14 (363 notes), which sounds at the note written: 52 to 67.
    const tune = gameMusicTune(scouting, 95)
    const nine = ons(tune, 9)
    expect(nine.length).toBe(363)
    expect(range(nine)).toEqual([52, 67])
    // Patch $0D sounds at the written note too (not NHL 94's bass an octave down): channel 5, 52 to 65.
    expect(range(ons(tune, 5))).toEqual([52, 65])
    // The drums are not in the tune, and keep their notes as written (patch $15 at 0 to 19 in the title music).
    expect(ons(tune, 7)).toEqual([])
    const title = readNhl95Music(rom, 0)!
    expect(Math.max(...ons(title.events, 6).map((e) => e.data[0]))).toBe(19)
    // In the MIDI file each drum by the note it is played at, one each: $15 at 0 the kick 36, at 9 the kick 35, at 17
    // and 19 the toms 45 and 48; $0E at 51 the low conga 64, at 55 and 57 the side stick 37 and the snare 40; the noise
    // at 108 the open hat 46, at 120 the closed hat 42.
    const drums = (song: typeof scouting) => [...new Set(readMidi(gameMusicToMidi(song, '', 95)).notes.filter((n) => n.channel === 9).map((n) => n.note))].sort()
    expect(drums(scouting)).toEqual([35, 36, 37, 42, 46])
    expect(drums(title)).toEqual([36, 40, 42, 45, 46, 48])
    expect(drums(readNhl95Music(rom, 2)!)).toEqual([36, 42, 48, 64])
    const midi = readMidi(gameMusicToMidi(scouting, '', 95)).notes
    expect(midi.filter((n) => n.channel !== 9).length).toBe(tune.filter((e) => (e.status & 0xf0) === 0x90).length)
    // As NHL 94's, channel 9 would be the drums.
    expect(ons(gameMusicTune(scouting), 9)).toEqual([])
    // $14 sounds an octave up below note 46: the end of period music's 16 notes at 43 sound at 55; and $1C two octaves
    // above the written note.
    const eop = readNhl95Music(rom, 2)!
    const on = (song: typeof eop, patch: number) => {
      const channels = new Set(song.events.filter((e) => (e.status & 0xf0) === 0xc0 && e.data[0] === patch).map((e) => e.status & 0x0f))
      return [song.events, gameMusicTune(song, 95)].map((events) => events.filter((e) => (e.status & 0xf0) === 0x90 && channels.has(e.status & 0x0f)).map((e) => e.data[0]))
    }
    const [written, heard] = on(eop, 0x14)
    expect(written.filter((note) => note === 43).length).toBe(16)
    expect(heard.filter((note) => note === 55).length - written.filter((note) => note === 55).length).toBe(16)
    for (const song of [title, scouting, eop]) {
      const [w, h] = on(song, 0x1c)
      expect(h, 'patch $1C').toEqual(w.map((note) => note + 24))
    }
  })
})

// A piece's stream as the ROM has it.
const pieceStream = (rom: Uint8Array, number: number) => {
  const item = findBankItem(rom, 3, number)!
  return readNhl95Stream(rom.subarray(item.at, item.at + item.size))
}
type Events = ReturnType<typeof readNhl95Stream>['events']
// The driver's limits, as Match Viewer measured them: six FM patches, three square notes and the noise at once; 14
// commands a frame kept to (16 sent); at most 24 notes waiting to end.
const expectWithinLimits = (stream: Events, name = '') => {
  const limits = nhl95MusicLimits(stream)
  expect(limits.fm, name).toBeLessThanOrEqual(6)
  expect(limits.square, name).toBeLessThanOrEqual(3)
  expect(limits.noise, name).toBeLessThanOrEqual(1)
  expect(limits.pending, name).toBeLessThanOrEqual(24)
  expect(limits.commands, name).toBeLessThanOrEqual(14)
  return limits
}
// Each channel's patch, from its program.
const channelPatches = (stream: Events) => new Map(stream.filter((e) => (e.status & 0xf0) === 0xc0).map((e) => [e.status & 0x0f, e.data[0]]))
const DRUM_PATCHES = [0x15, 0x0e, 0x13]
const at = (start: number, length: number, note: number, channel: number, velocity = 80): MidiNote => ({ start, length, note, velocity, channel })

describe.skipIf(!existsSync(path(RETAIL)))("NHL '95's other music from MIDI files", () => {
  it("puts each piece back from its own MIDI file: each part on its own patch and octave as heard, within the driver's limits", () => {
    for (const name of [RETAIL, W18, W18P].filter((n) => existsSync(path(n)))) {
      const rom = open(name).bytes
      for (const { number } of NHL95_GAME_MUSIC) {
        const label = `${name} ${number}`
        const song = readNhl95Music(rom, number)!
        const { notes, end, programs } = readMidi(gameMusicToMidi(song, 'Again', 95))
        const choices = nhl95PartChoices(musicParts(notes), notes, programs)
        // The parts on the patches they came from (where two had one, the second on another), and the drums.
        const taken = new Set<number>()
        for (const [channel, program] of programs) {
          const patch = Number(Object.entries(NHL95_EXPORT_PROGRAM).find(([, value]) => value === program)![0])
          if (!taken.has(patch)) expect(choices.get(channel), label).toBe(patch)
          taken.add(patch)
        }
        expect(choices.get(9)).toBe('drums')
        const made = nhl95MusicFromMidi(notes, choices, end)
        expect(made.moved, label).toBe(0)
        expect(made.quieter, label).toBe(false)
        const next = withNhl95Music(rom, number, made, 'Again')
        const back = readNhl95Music(next, number)!
        expect(back.custom, label).toEqual({ name: 'Again', replaced: number })
        expect(Math.abs(back.seconds - song.seconds), label).toBeLessThanOrEqual(1 / 60 + 1e-9)
        const stream = pieceStream(next, number)
        // Its $75 where the file ends, as the game's own pieces have theirs (a round trip of the scouting report's music
        // then repeats every 4,226 frames on the console, as the original: Match Viewer).
        // The title music's own loops after its intro (from frame 384) and has notes ringing past its $75; a new piece
        // loops from its start and ends no sooner than its last note, so a frame or two later.
        const loopFrames = nhl95LoopFrames(stream.events, true)!
        if (number === 0) expect(loopFrames - Math.round(end * 60), label).toBeLessThanOrEqual(2)
        else expect(loopFrames, label).toBe(Math.round(end * 60))
        // The $75 and $FF at the file's end (a frame on, the notes from frame 1).
        expect(stream.events.at(-1)!.frame - (Math.round(end * 60) + 1), label).toBe(number === 0 ? loopFrames - Math.round(end * 60) : 0)
        // Every drum moment of the game's own piece, each drum (patch and note) as it has it, a frame later (the
        // programs taking frame 0); of two hits at once on one patch (16 times in the title music, its kick and a tom or
        // two toms, and 3 in the scouting report's) one sounds, in the game as here.
        const drumHits = (events: Events, later: number) => {
          const patchOf = new Map<number, number>()
          const hits = new Map<string, number[]>()
          for (const e of events) {
            if ((e.status & 0xf0) === 0xc0) patchOf.set(e.status & 0x0f, e.data[0])
            const patch = patchOf.get(e.status & 0x0f)!
            const moment = `${e.frame + later}:${patch}`
            if ((e.status & 0xf0) === 0x90 && DRUM_PATCHES.includes(patch) && e.frame < song.seconds * 60) hits.set(moment, [...(hits.get(moment) ?? []), e.data[0]])
          }
          return hits
        }
        const mine = drumHits(stream.events, 0)
        const theirs = drumHits(pieceStream(rom, number).events, 1)
        expect([...mine.keys()].sort(), label).toEqual([...theirs.keys()].sort())
        for (const [moment, notes] of mine) {
          expect(notes, `${label} ${moment}`).toHaveLength(1)
          expect(theirs.get(moment), `${label} ${moment}`).toContain(notes[0])
        }
        const doubles = [...theirs.values()].filter((notes) => new Set(notes).size > 1).length
        expect(doubles, label).toBe({ 0: 16, 2: 0, 3: 3 }[number])
        expectWithinLimits(stream.events, label)
        // The programs first, then the loop point ($74), which controller $75 at the end goes back to.
        expect(stream.loops, label).toHaveLength(1)
        const events = stream.events
        const loop = events.findIndex((e) => e.status === 0xb0 && e.data[0] === 0x74)
        expect(events.slice(0, loop).every((e) => (e.status & 0xf0) === 0xc0 && e.frame === 0), label).toBe(true)
        expect(events.slice(-2).map((e) => [e.status, ...e.data]), label).toEqual([[0xb0, 0x75, 0], [0xff]])
        // The loop point is where the driver reads it: the wait before the $74, its status written.
        const item = findBankItem(next, 3, number)!
        const data = next.subarray(item.at, item.at + item.size)
        expect(Array.from(data.subarray(4 + stream.loops[0], 8 + stream.loops[0])), label).toEqual([1, 0xb0, 0x74, 0])
        // Every tune note kept sounds as in the file, at its time and velocity; most are kept.
        const patches = channelPatches(events)
        const tuneChannels = [...choices].filter(([channel, choice]) => typeof choice === 'number' && notes.some((n) => n.channel === channel)).map(([channel]) => channel)
        const first = Math.min(...notes.map((n) => n.start))
        const key = (frame: number, note: number, channel: number) => `${frame}:${note}:${channel}`
        const inFile = new Map(notes.map((n) => [key(1 + Math.round((n.start - first) * 60), n.note, n.channel), n.velocity]))
        let kept = 0
        for (const e of events) {
          if ((e.status & 0xf0) !== 0x90) continue
          const patch = patches.get(e.status & 0x0f)!
          if (DRUM_PATCHES.includes(patch)) continue
          kept++
          const channel = tuneChannels[e.status & 0x0f]
          expect(choices.get(channel)).toBe(patch)
          expect(inFile.get(key(e.frame, e.data[0] + nhl95Shift(patch, e.data[0]), channel)), `${label} ${JSON.stringify(e)}`).toBe(e.data[1])
        }
        const tunes = notes.filter((n) => n.channel !== 9).length
        expect(kept, label).toBeGreaterThan(tunes * 0.75)
        expect(kept + made.chords + made.dropped, label).toBeGreaterThanOrEqual(tunes)
        // The drums on the game's three, nearly every hit.
        const hits = events.filter((e) => (e.status & 0xf0) === 0x90 && DRUM_PATCHES.includes(patches.get(e.status & 0x0f)!))
        expect(hits.length, label).toBeGreaterThan(notes.filter((n) => n.channel === 9).length * 0.75)
        expect(new Set(hits.map((e) => patches.get(e.status & 0x0f))), label).toEqual(new Set(DRUM_PATCHES))
      }
    }
  })

  it("plays a chord on one FM patch as its highest note, the bass its lowest, the square wave three, and drums on the game's", () => {
    const notes = [
      // A chord on the lead, then a lower note the lead moves on to, legato.
      ...[60, 64, 67].map((note) => at(0, 1.02, note, 0)),
      at(1, 0.5, 55, 0),
      // The bass: a chord too, its lowest kept.
      ...[36, 43].map((note) => at(0, 1, note, 1)),
      // Four notes at once on the square wave: the highest three.
      ...[60, 64, 67, 72].map((note) => at(0, 1, note, 2)),
      // Drums: kick, snare, closed hat, a tom, and a cowbell the game has nothing like.
      at(0, 0.05, 36, 9, 120),
      at(0.5, 0.05, 38, 9, 120),
      at(0.25, 0.01, 42, 9, 100),
      at(0.75, 0.05, 45, 9, 100),
      at(0.9, 0.05, 56, 9, 100),
    ]
    const choices = new Map<number, PartChoice>([
      [0, 0x18],
      [1, 0x11],
      [2, 0x14],
      [9, 'drums'],
    ])
    const made = nhl95MusicFromMidi(notes, choices, 2)
    expect(made.leftOut).toBe(1)
    expect(made.chords).toBe(2 + 1 + 1)
    const patches = channelPatches(made.stream)
    const ons = (patch: number) => made.stream.filter((e) => (e.status & 0xf0) === 0x90 && patches.get(e.status & 0x0f) === patch).map((e) => [e.frame, e.data[0], e.data[2]])
    // $18 sounds an octave above the note written: 67 is written 55, cut where the line moves on.
    expect(ons(0x18)).toEqual([
      [1, 55, 60],
      [61, 43, 30],
    ])
    expect(ons(0x11)).toEqual([[1, 36, 60]])
    expect(ons(0x14).map(([, note]) => note).sort()).toEqual([64, 67, 72])
    // The drums at the notes Match Viewer heard them at: the kick and the tom on $15, the snare $0E, the hats the noise.
    expect(ons(0x15)).toEqual([
      [1, 0, 6],
      [46, 17, 6],
    ])
    expect(ons(0x0e)).toEqual([[31, 56, 6]])
    expect(ons(0x13)).toEqual([[16, 120, 1]])
    // The end: the file's rest kept, then back to the start.
    expect(made.seconds).toBe(2)
    expect(made.stream.at(-2)).toEqual({ frame: 121, status: 0xb0, data: [0x75, 0] })
    expect(nhl95LoopFrames(made.stream, true)).toBe(120)
    expectWithinLimits(made.stream)
    // The defaults: the chords on the square wave, the low part on the bass, the drums the drums.
    const defaults = nhl95PartChoices(musicParts(notes), notes)
    expect([defaults.get(1), defaults.get(9)]).toEqual([0x11, 'drums'])
    expect([defaults.get(0), defaults.get(2)]).toContain(0x14)
    // Each instrument once, and at least one.
    expect(() => nhl95MusicFromMidi(notes, new Map<number, PartChoice>([[0, 0x18], [2, 0x18]]))).toThrow(/only one part/)
    expect(() => nhl95MusicFromMidi(notes, new Map<number, PartChoice>([[9, 'drums']]))).toThrow(/at least one part/)
  })

  it('keeps a crowded, loud file to six FM patches, three square notes and 14 commands a frame, the drums and bass first', () => {
    const notes: MidiNote[] = []
    // Every frame for a second, six parts, three notes on the square wave and the drums at once, each a frame long.
    for (let frame = 0; frame < 60; frame++) {
      const start = frame / 60
      ;[30, 50, 55, 62, 69, 76].forEach((note, channel) => notes.push(at(start, 1 / 60, note + (frame % 3), channel, 120)))
      ;[60, 64, 67].forEach((note) => notes.push(at(start, 1 / 60, note, 6, 120)))
      notes.push(at(start, 1 / 60, 42, 9, 120))
      if (frame % 6 === 0) notes.push(at(start, 0.1, 36, 9, 120), at(start, 0.1, 38, 9, 120))
    }
    const choices = new Map<number, PartChoice>([...NHL95_INSTRUMENTS.map(({ patch }, channel): [number, PartChoice] => [channel, patch]), [9, 'drums']])
    const made = nhl95MusicFromMidi(notes, choices, 1)
    expect(made.quieter).toBe(true)
    expect(made.dropped).toBeGreaterThan(0)
    const limits = expectWithinLimits(made.stream)
    expect(limits.fm).toBe(6)
    expect(limits.commands).toBe(14)
    // Every drum hit and bass note kept.
    const patches = channelPatches(made.stream)
    const count = (patch: number) => made.stream.filter((e) => (e.status & 0xf0) === 0x90 && patches.get(e.status & 0x0f) === patch).length
    expect([count(0x15), count(0x0e), count(0x11)]).toEqual([10, 10, 60])
    expect(made.stream.filter((e) => (e.status & 0xf0) === 0x90).every((e) => e.data[1] <= 78)).toBe(true)
  })

  it('keeps the new pieces in its own bank with the organ songs, and puts each back byte for byte', () => {
    for (const name of [RETAIL, W18, W18P].filter((n) => existsSync(path(n)))) {
      const opened = open(name)
      const rom = opened.bytes
      const tune = (number: number) => {
        const { notes, end, programs } = readMidi(gameMusicToMidi(readNhl95Music(rom, number)!, '', 95))
        return nhl95MusicFromMidi(notes, nhl95PartChoices(musicParts(notes), notes, programs), end)
      }
      const brass = readNhl95Song(rom, 0x3d)!.events
      // The title music as the scouting report's, the scouting report as the end of period's, and an organ song.
      const one = withNhl95Music(rom, 0, tune(3), 'Scouting')
      const two = withNhl95Song(withNhl95Music(one, 3, tune(2), 'Period'), 0x4f, brass, 'Brass')
      expect(readNhl95Music(two, 0)?.custom?.name, name).toBe('Scouting')
      expect(readNhl95Music(two, 3)?.custom?.name).toBe('Period')
      expect(readNhl95Music(two, 2)?.custom).toBeNull()
      expect(readNhl95Song(two, 0x4f)?.custom?.name).toBe('Brass')
      // Everything else of the sound bank where it was.
      for (const item of soundBankItems(rom)) if (item.type !== 3 || ![0, 3, 0x4f].includes(item.id)) expect(findBankItem(two, item.type, item.id)).toEqual(findBankItem(rom, item.type, item.id))
      // Downloaded and opened again.
      expect(readNhl95Music(openRom(buildRom({ ...opened, bytes: two })).bytes, 0)?.custom?.name).toBe('Scouting')
      // Put back one at a time, the room given back: as it was.
      const back = withOriginalNhl95Song(withOriginalNhl95Song(withOriginalNhl95Song(two, 0), 0x4f), 3)
      expect(u32(back, OPERAND)).toBe(0xffffff36)
      expectSameBytes(back, rom)
      expect(withOriginalNhl95Song(rom, 2)).toBe(rom)
      // Replaced again, and back.
      expectSameBytes(withOriginalNhl95Song(withNhl95Music(one, 0, tune(2), 'Again'), 0), rom)
    }
  })

  it('carries a new piece in a project file, and lists it in the changes', () => {
    const opened = open(RETAIL)
    const { notes, end, programs } = readMidi(gameMusicToMidi(readNhl95Music(opened.bytes, 3)!, '', 95))
    const made = nhl95MusicFromMidi(notes, nhl95PartChoices(musicParts(notes), notes, programs), end)
    const project = { ...opened, bytes: withNhl95Song(withNhl95Music(opened.bytes, 2, made, 'Scouting'), 0x4f, readNhl95Song(opened.bytes, 0x3d)!.events, 'Brass') }
    const text = saveProjectFile(project, opened, 'P')
    expect(JSON.parse(text).songs.genesis.map((s: { number: number }) => s.number)).toEqual([0x4f, 2])
    const result = openProjectFile(opened, JSON.stringify({ ...JSON.parse(text), rom: undefined }))
    expect(readNhl95Music(result.project.bytes, 2)?.custom?.name).toBe('Scouting')
    expectSameBytes(nhl95CustomSongBytes(result.project.bytes, 2)!, nhl95CustomSongBytes(project.bytes, 2)!)
    expect(readNhl95Song(result.project.bytes, 0x4f)?.custom?.name).toBe('Brass')
    expect(nhl95CustomSongBytes(opened.bytes, 2)).toBeNull()
    expect(() => withNhl95SongBytes(opened.bytes, 1, nhl95CustomSongBytes(project.bytes, 2)!)).toThrow()
    const music = (before: typeof project, after: typeof project) => compareProjects(before, after).flatMap((d) => (d.heading === 'Game music' ? d.changes : []))
    expect(music(opened, project)).toEqual(['End of period music: "Scouting", from a MIDI file.'])
    expect(music(project, { ...project, bytes: withOriginalNhl95Song(project.bytes, 2) })).toEqual(["End of period music: the game's own again."])
  })
})

describe("NHL '95's other music from any MIDI file", () => {
  it("puts each drum it exports back as the same drum, and any other file's drums on the nearest", () => {
    const drums = (midiNotes: number[]) => {
      const notes = [at(0, 1, 60, 0), ...midiNotes.map((note, i) => at(i / 2, 0.05, note, 9))]
      const made = nhl95MusicFromMidi(notes, new Map<number, PartChoice>([[0, 0x18], [9, 'drums']]), midiNotes.length / 2)
      const patches = channelPatches(made.stream)
      return made.stream.filter((e) => (e.status & 0xf0) === 0x90 && DRUM_PATCHES.includes(patches.get(e.status & 0x0f)!)).map((e) => [patches.get(e.status & 0x0f), e.data[0]])
    }
    // The export's own, one each (with 36 in the file, 35 is the second kick).
    expect(drums(NHL95_DRUM_NOTES.map((d) => d.midi))).toEqual(NHL95_DRUM_NOTES.map((d) => [d.patch === NOISE_HAT ? 0x13 : d.patch, d.note]))
    // Any other file's: 35 alone the kick, the clap the snare, the toms by pitch, the pedal hat and the ride closed,
    // the crashes open; a cowbell left out.
    expect(drums([35, 39, 41, 43, 50, 44, 51, 49, 57, 56])).toEqual([
      [0x15, 0],
      [0x0e, 56],
      [0x15, 17],
      [0x15, 17],
      [0x15, 19],
      [0x13, 120],
      [0x13, 120],
      [0x13, 108],
      [0x13, 108],
    ])
  })

  it('puts a part of long notes on the mallet only when chosen', () => {
    expect(NHL95_INSTRUMENTS.find((i) => i.patch === 0x0d)?.name).toBe('Mallet (short notes only)')
    const part = (length: number) => Array.from({ length: 8 }, (_, i) => at(i * length, length, 60 + (i % 3), 0))
    // A part exported from $0D (General MIDI 12) comes back on it with short notes; with long ones on the next nearest.
    for (const [length, patch] of [
      [0.1, 0x0d],
      [0.5, 0x14],
    ]) {
      const notes = part(length)
      expect(nhl95PartChoices(musicParts(notes), notes, new Map([[0, 12]])).get(0), `${length}`).toBe(patch)
    }
    // With no instrument named, the third part from the top (the next free patch after both brass) is not put on it.
    const notes = [...[72, 67].map((note, channel) => at(0, 2, note, channel)), ...Array.from({ length: 4 }, (_, i) => at(i * 0.5, 0.5, 64, 2))]
    expect(nhl95PartChoices(musicParts(notes), notes).get(2)).toBe(0x1d)
  })
})
