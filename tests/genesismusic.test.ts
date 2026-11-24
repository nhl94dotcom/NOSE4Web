import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultPartChoices, GAME_MUSIC, type PartChoice, gameMusicFromMidi, gameMusicToMidi, gameMusicTune, musicParts, readMidi, readSong, SONG_VOICES, songFromMidi, songToMidi, withOriginalSong, withSong } from '../src/core/genesismusic'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name = 'nhl94.bin') => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { otherRoms?: string[]; league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// A small MIDI file: format 1, 96 ticks a beat, a tempo track at 150 beats a
// minute, then a C major scale of quarter notes on channel 1, a chord of six
// notes, a drum hit on channel 10 and a note too low for the game.
function testMidi(): Uint8Array {
  const vlq = (value: number) => {
    const bytes = [value & 0x7f]
    for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 0x7f) | 0x80)
    return bytes
  }
  const chunk = (type: string, body: number[]) => [...type].map((c) => c.charCodeAt(0)).concat([(body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff], body)
  const tempo = [...vlq(0), 0xff, 0x03, 4, ...[...'Test'].map((c) => c.charCodeAt(0)), ...vlq(0), 0xff, 0x51, 3, 0x06, 0x1a, 0x80, ...vlq(0), 0xff, 0x2f, 0]
  const notes: number[] = []
  for (const note of [60, 62, 64, 65, 67, 69, 71, 72]) notes.push(...vlq(0), 0x90, note, 100, ...vlq(96), 0x80, note, 0)
  for (const note of [48, 52, 55, 60, 64, 67]) notes.push(...vlq(0), 0x90, note, 80)
  ;[48, 52, 55, 60, 64, 67].forEach((note, i) => notes.push(...vlq(i === 0 ? 192 : 0), 0x80, note, 0))
  notes.push(...vlq(0), 0x99, 36, 100, ...vlq(48), 0x89, 36, 0)
  notes.push(...vlq(0), 0x90, 5, 100, ...vlq(48), 0x90, 5, 0)
  notes.push(...vlq(0), 0xff, 0x2f, 0)
  return Uint8Array.from([...chunk('MThd', [0, 1, 0, 2, 0, 96]), ...chunk('MTrk', tempo), ...chunk('MTrk', notes)])
}

describe.skipIf(!existsSync(path('nhl94.bin')))('Genesis organ songs from MIDI files', () => {
  it("reads the game's songs: organ on channel 0, notes on and off", () => {
    const rom = open().bytes
    const song = readSong(rom, 0x40)!
    expect(song.custom).toBeNull()
    expect(song.loops).toBe(false)
    expect(song.events.find((e) => (e.status & 0xf0) === 0xc0)?.data[0]).toBe(11)
    const ons = song.events.filter((e) => (e.status & 0xf0) === 0x90).length
    const offs = song.events.filter((e) => (e.status & 0xf0) === 0x80).length
    expect(ons).toBeGreaterThan(50)
    expect(ons).toBe(offs)
    expect(song.seconds).toBeGreaterThan(10)
    expect(song.seconds).toBeLessThan(100)
  })

  it('reads a MIDI file: tempo, name, notes in seconds', () => {
    const { notes, name } = readMidi(testMidi())
    expect(name).toBe('Test')
    // At 150 beats a minute a quarter note is 0.4 s.
    expect(notes.filter((n) => n.channel === 0).slice(0, 2).map((n) => [n.note, +n.start.toFixed(3), +n.length.toFixed(3)])).toEqual([
      [60, 0, 0.4],
      [62, 0.4, 0.4],
    ])
    expect(notes.some((n) => n.channel === 9)).toBe(true)
  })

  it('reads notes of no length as notes of their own, and a new note on a key ending the one before', () => {
    const vlq = (value: number) => {
      const bytes = [value & 0x7f]
      for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 0x7f) | 0x80)
      return bytes
    }
    const file = (events: number[]) => Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, events.length + 4, ...events, 0, 0xff, 0x2f, 0])
    const notes = (events: number[]) => readMidi(file(events)).notes.map((n) => [n.channel, n.note, +n.start.toFixed(3), +n.length.toFixed(3)])
    // A grace C of no length at the start, then a C on beats 2 and 3 (120 beats a minute: 0.5 s a beat).
    expect(notes([...vlq(0), 0x90, 60, 90, ...vlq(0), 0x80, 60, 0, ...vlq(96), 0x90, 60, 90, ...vlq(96), 0x80, 60, 0])).toEqual([
      [0, 60, 0, 0],
      [0, 60, 0.5, 0.5],
    ])
    // Three drum hits of no length: three notes.
    expect(notes([0, 0x99, 38, 100, 0, 0x89, 38, 0, ...vlq(48), 0x99, 38, 100, 0, 0x89, 38, 0, ...vlq(48), 0x99, 38, 100, 0, 0x89, 38, 0]).length).toBe(3)
    // A repeated note whose new on comes before the old one's off at the same tick, and one whose new on comes while
    // the old one sounds: the old one ends where the new one starts, and its off ends nothing.
    expect(notes([0, 0x90, 64, 90, ...vlq(96), 0x90, 64, 90, 0, 0x80, 64, 0, ...vlq(96), 0x80, 64, 0])).toEqual([
      [0, 64, 0, 0.5],
      [0, 64, 0.5, 0.5],
    ])
    expect(notes([0, 0x90, 64, 90, ...vlq(48), 0x90, 64, 90, ...vlq(48), 0x80, 64, 0, ...vlq(96), 0x80, 64, 0])).toEqual([
      [0, 64, 0, 0.25],
      [0, 64, 0.25, 0.75],
    ])
    // A note of no length is left out of an organ song.
    const made = songFromMidi(readMidi(file([...vlq(0), 0x90, 60, 90, ...vlq(0), 0x80, 60, 0, ...vlq(96), 0x90, 60, 90, ...vlq(96), 0x80, 60, 0])).notes)
    expect(made.events.filter((e) => e.status === 0x90).map((e) => e.frame)).toEqual([30])
  })

  it('makes an organ song of at most four notes at once, without drums, in the range, and puts it in and back', () => {
    const project = open()
    const made = songFromMidi(readMidi(testMidi()).notes)
    expect(made.drums).toBe(1)
    expect(made.dropped).toBe(2) // six notes of the chord, four voices
    expect(made.moved).toBe(1) // note 5 up an octave
    // The scale at 0.4 s a note is 24 frames apart.
    const ons = made.events.filter((e) => e.status === 0x90)
    expect(ons.slice(0, 3).map((e) => [e.frame, e.data[0]])).toEqual([
      [0, 60],
      [24, 62],
      [48, 64],
    ])
    expect(Math.max(...made.events.map((e) => e.frame))).toBeLessThan(60 * 10)
    // Never more than four sounding.
    let sounding = 0
    let most = 0
    for (const e of made.events) {
      if (e.status === 0x90) most = Math.max(most, ++sounding)
      if (e.status === 0x80) sounding--
    }
    expect(most).toBeLessThanOrEqual(SONG_VOICES)

    const before = readSong(project.bytes, 0x40)!
    const rom = withSong(project.bytes, 0x40, made.events, 'Test')
    const song = readSong(rom, 0x40)!
    expect(song.custom?.name).toBe('Test')
    expect(song.events.filter((e) => e.status === 0x90).map((e) => e.data[0])).toEqual(ons.map((e) => e.data[0]))
    // Replaced again, it still remembers the game's own; put back, it is the game's again.
    const again = withSong(rom, 0x40, made.events, 'Again')
    const back = withOriginalSong(again, 0x40)
    expect(readSong(back, 0x40)!.custom).toBeNull()
    expect(readSong(back, 0x40)!.events).toEqual(before.events)
    // Song 1 stays: the game finds the song playing by it.
    expect(() => withSong(project.bytes, 0x30, made.events, 'x')).toThrow('Song 1 cannot be replaced')
  })

  it('keeps a song in a project file, and puts it into a fresh copy of the ROM', () => {
    const project = open()
    const made = songFromMidi(readMidi(testMidi()).notes)
    const edited = { ...project, bytes: withSong(project.bytes, 0x40, made.events, 'Test') }
    const text = saveProjectFile(edited, project, 'test')
    const reopened = openProjectFile(open(), text).project
    const song = readSong(reopened.bytes, 0x40)!
    expect(song.custom?.name).toBe('Test')
    expect(song.custom?.replaced).toBe(readSong(edited.bytes, 0x40)!.custom!.replaced)
    expect(song.events).toEqual(readSong(edited.bytes, 0x40)!.events)
    // Over the ROM it was made from, it is not put in twice.
    expect(openProjectFile(edited, text).project.bytes.length).toBe(edited.bytes.length)
    expect(Buffer.compare(openProjectFile(edited, text).project.bytes, edited.bytes)).toBe(0)
  })

  it('keeps the tune over held chords, past four notes at once', () => {
    // Four notes held for 2 s, then a melody above them, its notes running into each other; and a low note
    // under the full chord, which is left out.
    const chord = [48, 52, 55, 60].map((note) => ({ start: 0, length: 2, note, velocity: 100, channel: 0 }))
    const tune = [72, 74].map((note, i) => ({ start: 0.5 + i * 0.5, length: 0.6, note, velocity: 100, channel: 0 }))
    const low = { start: 0.6, length: 0.2, note: 40, velocity: 100, channel: 0 }
    const made = songFromMidi([...chord, ...tune, low])
    const ons = made.events.filter((e) => e.status === 0x90).map((e) => e.data[0])
    expect(ons).toEqual([48, 52, 55, 60, 72, 74])
    expect(made.dropped).toBe(3)
    // The lowest held notes were cut short for the tune: 48 at its first note, 52 at its second.
    const off = (note: number) => made.events.find((e) => e.status === 0x80 && e.data[0] === note)!.frame
    expect([off(48), off(52), off(55)]).toEqual([30, 60, 120])
  })

  it("exports the game's claps as MIDI hand claps, and names a song by its track name over a comment", () => {
    const rom = open().bytes
    // Song 8, You Say It's Your Birthday {Claps}: its claps are on a sampled patch, on channel 7.
    const claps = readSong(rom, 0x37)!
    expect(claps.events.some((e) => (e.status & 0xf0) === 0xc0 && e.data[0] >= 0x60)).toBe(true)
    const { notes } = readMidi(songToMidi(claps))
    expect(notes.filter((n) => n.channel === 9).every((n) => n.note === 39)).toBe(true)
    expect(notes.some((n) => n.channel === 9)).toBe(true)
    // A text event before the track name: the track name wins.
    const vlqMidi = Uint8Array.from([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 30],
      ...[0, 0xff, 0x01, 4, 0x28, 0x63, 0x29, 0x20],
      ...[0, 0xff, 0x03, 4, 0x53, 0x6f, 0x6e, 0x67],
      ...[0, 0x90, 60, 100, 48, 0x80, 60, 0],
      ...[0, 0xff, 0x2f, 0],
    ])
    expect(readMidi(vlqMidi).name).toBe('Song')
  })

  it('makes no song of drums alone, and takes very long files', () => {
    expect(() => songFromMidi([{ start: 0, length: 1, note: 36, velocity: 100, channel: 9 }])).toThrow('only drums')
    const many = Array.from({ length: 200000 }, (_, i) => ({ start: i * 0.01, length: 0.005, note: 60 + (i % 12), velocity: 90, channel: 0 }))
    expect(songFromMidi(many).events.length).toBeGreaterThan(1000)
  })

  it('gives back the room of a song it replaces, so that put back the ROM is as it was', () => {
    for (const name of ['nhl94.bin', local.league30Rom].filter((n): n is string => !!n && existsSync(path(n)))) {
      const project = open(name)
      const made = songFromMidi(readMidi(testMidi()).notes)
      const once = withSong(project.bytes, 0x40, made.events, 'Test')
      // Replaced again, it goes where the first was; the room of a song made for another number is kept.
      const twice = withSong(once, 0x40, made.events, 'Again')
      expect(twice.length).toBe(once.length)
      const start = (rom: Uint8Array) => {
        const at = [...Array(rom.length - 8).keys()].find((o) => o % 2 === 0 && rom[o] === 0xe5 && rom[o + 1] === 0x40 && rom[o + 2] === 0x41 && rom[o + 3] === 0xf9)!
        return new DataView(rom.buffer, rom.byteOffset).getUint32(new DataView(rom.buffer, rom.byteOffset).getUint32(at + 4) + 0x40 * 4)
      }
      expect(start(twice), name).toBe(start(once))
      expectSameBytes(withOriginalSong(twice, 0x40), project.bytes, name)
      // Two songs put back, in either order.
      const both = withSong(twice, 0x41, made.events, 'Other')
      expectSameBytes(withOriginalSong(withOriginalSong(both, 0x41), 0x40), project.bytes, name)
      expectSameBytes(withOriginalSong(withOriginalSong(both, 0x40), 0x41), project.bytes, name)
      // The game's title music too, which loops.
      const title = gameMusicFromMidi(readMidi(testMidi()).notes, new Map([[0, 14]]))
      const music = withSong(withSong(project.bytes, 0x78, title.events, 'One'), 0x78, title.events, 'Two')
      expectSameBytes(withOriginalSong(music, 0x78), project.bytes, name)
    }
  })

  it("exports a game song as MIDI that reads back with the same notes", () => {
    const song = readSong(open().bytes, 0x40)!
    const { notes } = readMidi(songToMidi(song))
    expect(notes.length).toBe(song.events.filter((e) => (e.status & 0xf0) === 0x90 && e.data[1] > 0).length)
    // A tick a frame at 60 a second.
    const firstOn = song.events.find((e) => (e.status & 0xf0) === 0x90)!
    expect(notes[0].start).toBeCloseTo(firstOn.frame / 60, 5)
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))('finds the songs in league ROMs too', () => {
    for (const name of [local.league30Rom!, ...(local.otherRoms ?? [])].filter((n) => existsSync(path(n)))) {
      const project = open(name)
      // Only the EVO builds, whose code is their own, are read without their settings.
      expect(project.game.settingsSupported, name).toBe(!name.includes('EVO'))
      if (name.includes('EVO')) continue
      expect(readSong(project.bytes, 0x40), name).not.toBeNull()
    }
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))("NHL 94's other music", () => {
  it('reads the title, end of period and scouting report music, and exports each as MIDI with its drums apart', () => {
    const rom = open().bytes
    const lengths = GAME_MUSIC.map(({ number }) => {
      const song = readSong(rom, number)!
      expect(song.loops).toBe(true)
      // Every note but the drums': the kick (one pitch on an FM patch, channel 6) and the hits (a sample, channel 7).
      // The notes that sound: two in the end of period music end in the frame they start, which a MIDI file has no
      // note for (nor does the game play one).
      const sounding = (events: typeof song.events) =>
        events.filter((event, i) => {
          if ((event.status & 0xf0) !== 0x90 || event.data[1] === 0) return false
          const end = events.slice(i + 1).find((later) => later.status % 16 === event.status % 16 && later.data[0] === event.data[0] && ((later.status & 0xf0) === 0x80 || (later.status & 0xf0) === 0x90))
          return !end || end.frame > event.frame
        })
      const tune = sounding(gameMusicTune(song))
      const all = sounding(song.events)
      const drums = all.filter((event) => [6, 7].includes(event.status & 0x0f))
      expect(tune.length).toBe(all.length - drums.length)
      const { notes } = readMidi(gameMusicToMidi(song, 'test'))
      expect(notes.length).toBe(all.length)
      expect(notes.filter((note) => note.channel === 9).length).toBe(drums.length)
      expect(new Set(notes.filter((note) => note.channel === 9).map((note) => note.note))).toEqual(new Set([36, 38]))
      // The tunes keep their pitches and start times.
      const tunes = notes.filter((note) => note.channel !== 9).map((note) => `${Math.round(note.start * 60)}:${note.note}`).sort()
      expect(tunes).toEqual(tune.map((event) => `${event.frame}:${event.data[0]}`).sort())
      return Math.round(song.seconds)
    })
    expect(lengths).toEqual([73, 78, 88])
  })

  it('replaces the title music with a MIDI file: each part on its game instrument, the drums, five notes at most, looping', () => {
    const project = open()
    // Bass on channel 1, a melody on channel 2 over a four-note chord on channel 3, and drums: kicks and a snare.
    const notes = [
      ...[0, 1, 2, 3].map((beat) => ({ start: beat, length: 0.9, note: 36, velocity: 110, channel: 0 })),
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, i) => ({ start: t, length: 0.45, note: 72 + (i % 5), velocity: 100, channel: 1 })),
      ...[60, 64, 67, 71].map((note) => ({ start: 0, length: 4, note, velocity: 80, channel: 2 })),
      ...[0, 2].map((t) => ({ start: t, length: 0.1, note: 36, velocity: 120, channel: 9 })),
      { start: 1, length: 0.1, note: 38, velocity: 120, channel: 9 },
    ]
    const parts = musicParts(notes)
    expect(parts.map((part) => part.channel)).toEqual([0, 1, 2, 9])
    const choices = defaultPartChoices(parts)
    // The bass on the bass, the melody on the title's lead, the chord on the next, the drums as drums.
    expect([...choices].sort((a, b) => a[0] - b[0])).toEqual([[0, 13], [1, 14], [2, 10], [9, 'drums']])
    // A tune on its own is no bass line: it goes on the lead.
    expect([...defaultPartChoices(musicParts(notes.filter((note) => note.channel === 0)))]).toEqual([[0, 14]])
    const made = gameMusicFromMidi(notes, choices)
    // Programs: the three parts on game channels 0 to 2, the kick and the hit on 6 and 7.
    expect(made.events.filter((e) => (e.status & 0xf0) === 0xc0).map((e) => [e.status & 15, e.data[0]])).toEqual([[0, 13], [1, 14], [2, 10], [6, 20], [7, 0x6a]])
    // At most five FM notes at once (channels 0 to 6; 7 is the sample): bass, kick, melody and two of the chord.
    let most = 0
    const on = new Set<string>()
    for (const e of made.events) {
      const key = `${e.status & 15}:${e.data[0]}`
      if ((e.status & 0xf0) === 0x90) on.add(key)
      if ((e.status & 0xf0) === 0x80) on.delete(key)
      most = Math.max(most, [...on].filter((k) => !k.startsWith('7:')).length)
    }
    expect(most).toBe(5)
    expect(made.dropped).toBeGreaterThan(0)
    expect(made.events.filter((e) => e.status === 0x96).every((e) => e.data[0] === 21)).toBe(true)
    expect(made.events.filter((e) => e.status === 0x97).length).toBe(1)
    const edited = { ...project, bytes: withSong(project.bytes, 0x78, made.events, 'New title') }
    const song = readSong(edited.bytes, 0x78)!
    expect(song.custom?.name).toBe('New title')
    expect(song.loops).toBe(true)
    // It plays again from just after its first wait: the end's pointer is its own start + 4.
    const table = [...Array(edited.bytes.length - 8).keys()].find((o) => o % 2 === 0 && edited.bytes[o] === 0xe5 && edited.bytes[o + 1] === 0x40 && edited.bytes[o + 2] === 0x41 && edited.bytes[o + 3] === 0xf9)!
    const tableAt = new DataView(edited.bytes.buffer, edited.bytes.byteOffset).getUint32(table + 4)
    const start = new DataView(edited.bytes.buffer, edited.bytes.byteOffset).getUint32(tableAt + 0x78 * 4)
    let p = start
    while (edited.bytes[p + 1] !== 0) p += 4
    expect(new DataView(edited.bytes.buffer, edited.bytes.byteOffset).getUint32(p + 2)).toBe(start + 4)
    // Into a project file and a fresh ROM, its loop pointed at its new place; and back to the game's own.
    const reopened = openProjectFile(open(), saveProjectFile(edited, project, 'test')).project
    expect(readSong(reopened.bytes, 0x78)!.events).toEqual(song.events)
    expect(readSong(reopened.bytes, 0x78)!.custom?.name).toBe('New title')
    const back = withOriginalSong(edited.bytes, 0x78)
    expect(readSong(back, 0x78)!.custom).toBeNull()
    expect(readSong(back, 0x78)!.events).toEqual(readSong(project.bytes, 0x78)!.events)
  })

  it('lets a hit ring until the next begins (at most half a second), as the driver starts the sample again only once it is off', () => {
    // Hits 6 frames apart, and one 20 frames after.
    const hits = [0, 0.1, 0.2, 0.3, 0.6333].map((start) => ({ start, length: 0.1, note: 38, velocity: 100, channel: 9 }))
    const made = gameMusicFromMidi([{ start: 0, length: 1, note: 60, velocity: 80, channel: 0 }, ...hits], new Map<number, PartChoice>([[0, 14], [9, 'drums']]))
    const hit = made.events.filter((e) => (e.status & 0x0f) === 7 && (e.status & 0xf0) !== 0xc0).map((e) => [e.frame, e.status & 0xf0])
    expect(hit).toEqual([
      [0, 0x90],
      [6, 0x80],
      [6, 0x90],
      [12, 0x80],
      [12, 0x90],
      [18, 0x80],
      [18, 0x90],
      // Each rings until the next, however short in the file: the 20-frame gap too; the last for half a second.
      [38, 0x80],
      [38, 0x90],
      [68, 0x80],
    ])
  })

  it('takes a project\'s piece of game music as there already where the ROM has it elsewhere, and names what is left out', () => {
    const project = open()
    const title = gameMusicFromMidi(readMidi(testMidi()).notes, new Map([[0, 14]]))
    const edited = { ...project, bytes: withSong(project.bytes, 0x78, title.events, 'New title') }
    const text = JSON.stringify({ ...JSON.parse(saveProjectFile(edited, project, 'test')), rom: undefined })
    // The same piece in another ROM, after an organ song: at another address, so its loop address differs.
    const other = { ...project, bytes: withSong(withSong(project.bytes, 0x41, songFromMidi(readMidi(testMidi()).notes).events, 'Song'), 0x78, title.events, 'New title') }
    expect(readSong(other.bytes, 0x78)!.custom?.name).toBe('New title')
    const reopened = openProjectFile(other, text).project
    expect(reopened.bytes.length).toBe(other.bytes.length)
    expect(Buffer.compare(reopened.bytes, other.bytes)).toBe(0)
    // A piece that cannot go in is called game music, not an organ song.
    const file = JSON.parse(text)
    const broken = JSON.stringify({ ...file, songs: { genesis: [{ number: 0x78, bytes: file.songs.genesis[0].bytes.slice(0, 8) }] } })
    expect(openProjectFile(project, broken).notes.join(' ')).toContain("1 of the project's pieces of game music could not be put into this ROM, and was left out.")
  })

  it("brings a loud MIDI file down to the game's loudness", () => {
    const notes = [0, 0.5, 1, 1.5].map((start, i) => ({ start, length: 0.4, note: 60 + i, velocity: 105, channel: 0 }))
    const made = gameMusicFromMidi(notes, new Map([[0, 14]]), 4)
    expect(made.quieter).toBe(true)
    expect(made.events.filter((e) => (e.status & 0xf0) === 0x90).map((e) => e.data[1])).toEqual([44, 44, 44, 44])
    // An octave up for the lead, and the file's rest to 4 s kept.
    expect(made.events.filter((e) => (e.status & 0xf0) === 0x90).map((e) => e.data[0])).toEqual([72, 73, 74, 75])
    expect(made.seconds).toBe(4)
  })

  it('moves a part by whole octaves into range, keeping its line', () => {
    // A high line, 82 to 89, put on the lead (which is written an octave up): the whole part comes down together.
    const line = [82, 84, 87, 89, 82].map((note, i) => ({ start: i * 0.25, length: 0.2, note, velocity: 50, channel: 0 }))
    const made = gameMusicFromMidi(line, new Map([[0, 14]]))
    expect(made.events.filter((e) => (e.status & 0xf0) === 0x90).map((e) => e.data[0])).toEqual([82, 84, 87, 89, 82])
    expect(made.moved).toBe(5)
    // A General MIDI flute goes on the flute, a bass on the bass.
    expect([...defaultPartChoices(musicParts([...line, { ...line[0], channel: 1, note: 40 }]), new Map([[0, 73], [1, 33]]))]).toEqual([[0, 3], [1, 13]])
  })

  it("puts the game's own title music back in from its exported MIDI file, much as it was", () => {
    const rom = open().bytes
    const song = readSong(rom, 0x78)!
    const { notes, end, programs } = readMidi(gameMusicToMidi(song))
    const choices = defaultPartChoices(musicParts(notes), programs)
    // Each part back on its own patch, from the instrument the export gave it: bass 13, lead 14, pad 4, organ pad 9.
    expect([...choices].filter(([channel]) => channel !== 9).sort((a, b) => a[0] - b[0]).map(([, patch]) => patch)).toEqual([13, 14, 4, 9])
    const made = gameMusicFromMidi(notes, choices, end)
    const count = (events: typeof song.events) => events.filter((e) => (e.status & 0xf0) === 0x90 && e.data[1] > 0).length
    // Its rest after the last notes (120 frames) is kept, so it loops in time: the same length to the frame.
    expect(Math.round(made.seconds * 60)).toBe(Math.round(song.seconds * 60))
    expect(made.events[made.events.length - 1].status).toBe(0xff)
    // As loud as it was: the game's own velocities are left alone.
    expect(made.quieter).toBe(false)
    // The notes as written: the bass and the lead (patches 13 and 14, which sound an octave down) are written an
    // octave up in the stream, as the game has them, after an octave down in the MIDI file.
    const written = (events: typeof song.events, channel: number) => events.filter((e) => e.status === (0x90 | channel) && e.data[1] > 0).map((e) => e.data[0])
    // Every part's notes come back as the game has them written, at their times, on their own channels (a few
    // dropped by the five voices).
    const at = (events: typeof song.events) => new Set(events.filter((e) => (e.status & 0xf0) === 0x90 && e.data[1] > 0 && (e.status & 15) < 4).map((e) => `${e.status & 15}:${e.frame}:${e.data[0]}`))
    const original = at(song.events)
    const back = [...at(made.events)]
    expect(back.filter((note) => !original.has(note))).toEqual([])
    expect(back.length).toBeGreaterThan(original.size * 0.9)
    // The original sounds up to nine notes at once, which the console's five voices cut; the new one keeps five.
    expect(count(made.events)).toBeGreaterThan(count(song.events) * 0.7)
  })
})
