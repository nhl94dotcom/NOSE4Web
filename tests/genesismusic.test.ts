import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readMidi, readSong, SONG_VOICES, songFromMidi, songToMidi, withOriginalSong, withSong } from '../src/core/genesismusic'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { openRom } from '../src/core/rom'

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
      if (!project.game.settingsSupported) continue
      expect(readSong(project.bytes, 0x40), name).not.toBeNull()
    }
  })
})
