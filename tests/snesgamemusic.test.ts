import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { musicParts, readMidi, type MidiNote } from '../src/core/genesismusic'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { grownSnesRom } from '../src/core/snes'
import { renderSnesMusic } from '../src/core/snesaudio'
import { snesFightState } from '../src/core/snesfight'
import {
  defaultSnesPartChoices,
  midiPartNames,
  snesCustomMusicBytes,
  snesCustomMusicName,
  snesMusicFromMidi,
  snesMusicKit,
  snesMusicPlaces,
  snesMusicPointer,
  snesMusicReplaceable,
  withOriginalSnesMusic,
  withSnesMusic,
  withSnesMusicBytes,
  type SnesPartChoice,
} from '../src/core/snesgamemusic'
import { readSnesMusic, SNES_GAME_MUSIC, snesMusicToMidi } from '../src/core/snesmusic'
import { compareProjects } from '../src/core/compare'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name = 'NHL94.smc') => openRom(new Uint8Array(readFileSync(path(name))))
// A ROM with room for the longest pieces: the 2 MB 2026 build where it is here, else the original game.
const roomy = ['nhl94_2026.sfc', 'nhl94snes_2026.sfc'].find((name) => names.includes(name)) ?? 'NHL94.smc'

// A piece's own MIDI file put back in its place, with the editor's first choices.
function roundTrip(project: RomProject, index: number) {
  const piece = SNES_GAME_MUSIC[index]
  const bytes = snesMusicToMidi(readSnesMusic(project.bytes, piece.pointer)!, piece.name)
  const { notes, end, programs } = readMidi(bytes)
  const kit = snesMusicKit(project.bytes, piece.sounds)!
  const choices = defaultSnesPartChoices(kit, musicParts(notes), programs, midiPartNames(bytes))
  const made = snesMusicFromMidi(kit, notes, choices, end)
  return { made, choices, next: withSnesMusic(project, index, made, `${piece.name} again`) }
}

// The voices a piece's notes were planned on never hold two at once, and are eight at most.
function voicesHeldOnce(rom: Uint8Array, made: ReturnType<typeof snesMusicFromMidi>, set: 'title' | 'menu') {
  const kit = snesMusicKit(rom, set)!
  const spans: { voice: number; on: number; off: number }[] = []
  made.tracks.forEach((track, t) => {
    for (const n of track.notes) {
      const voice = t === 9 ? kit.drumVoice.get(n.code)! : [...kit.instruments.flatMap((i) => [...i.entries])].find(([, entry]) => entry === track.entry)![0]
      spans.push({ voice, on: n.tick, off: n.tick + n.length })
    }
  })
  for (let v = 0; v < 8; v++) {
    const own = spans.filter((s) => s.voice === v).sort((a, b) => a.on - b.on)
    own.forEach((s, i) => i > 0 && expect(s.on, `voice ${v}`).toBeGreaterThanOrEqual(own[i - 1].off))
  }
  expect(spans.every((s) => s.voice >= 0 && s.voice < 8)).toBe(true)
}

// A small MIDI file: format 0, 60 ticks a beat at 60 beats a minute (a tick a frame), of the given notes in ticks.
function midiFile(notes: { tick: number; length: number; note: number; channel: number; velocity?: number }[], endTick = 0): Uint8Array {
  const vlq = (value: number) => {
    const bytes = [value & 0x7f]
    for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 0x7f) | 0x80)
    return bytes
  }
  const events = notes.flatMap((n) => [
    { tick: n.tick, bytes: [0x90 | n.channel, n.note, n.velocity ?? 100] },
    { tick: n.tick + n.length, bytes: [0x80 | n.channel, n.note, 0] },
  ])
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0))
  const track: number[] = [0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40]
  let tick = 0
  for (const e of events) {
    track.push(...vlq(e.tick - tick), ...e.bytes)
    tick = e.tick
  }
  track.push(...vlq(Math.max(0, endTick - tick)), 0xff, 0x2f, 0)
  const length = track.length
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 60, 0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...track])
}

describe.skipIf(names.length === 0)("the SNES game's other music from MIDI files", () => {
  it.each(names)('finds where %s starts each piece and asks whether it plays, and the instruments', (name) => {
    const rom = open(name).bytes
    const places = snesMusicPlaces(rom)
    expect(places.map((p) => [p!.starts.length, p!.asks.length])).toEqual([[1, 0], [4, 1], [4, 1]])
    places.forEach((p, i) => {
      expect(p!.pointer).toBe(SNES_GAME_MUSIC[i].pointer)
      for (const at of p!.starts) expect([rom[at + 1], rom[at + 6] | (rom[at + 7] << 8)]).toEqual([(SNES_GAME_MUSIC[i].pointer >>> 16) & 0xff, SNES_GAME_MUSIC[i].pointer & 0xffff])
      for (const at of p!.asks) expect(rom[at] | (rom[at + 1] << 8)).toBe(SNES_GAME_MUSIC[i].pointer & 0xffff)
      expect(snesMusicReplaceable(rom, i)).toBe(true)
      expect(snesCustomMusicName(rom, i)).toBeNull()
    })
    const menu = snesMusicKit(rom, 'menu')!
    expect(menu.instruments.map((i) => i.name)).toEqual(['Bass', 'Crash played backwards', 'Crash cymbal', 'Brass', 'Chugging guitar', 'Orchestra hit', 'Cowbell', 'Timpani', 'Distorted guitar', 'Organ', 'Power guitar'])
    // The bass on voice 5 alone; the brass on three voices; the kick and snare on voice 7, the hi-hats and toms on 6.
    expect([...menu.instruments.find((i) => i.name === 'Bass')!.entries]).toEqual([[5, 2]])
    expect(menu.instruments.find((i) => i.name === 'Brass')!.entries.size).toBe(3)
    expect([36, 38, 42, 45].map((note) => menu.drums.get(note))).toEqual([48, 50, 54, 57])
    expect([48, 50, 54, 57].map((code) => menu.drumVoice.get(code))).toEqual([7, 7, 6, 6])
    // The title set has no organ or power guitar.
    expect(snesMusicKit(rom, 'title')!.instruments.map((i) => i.name)).not.toContain('Organ')
  })

  it('exports the drums as General MIDI drums: the kick, snare and hi-hats', () => {
    const rom = open().bytes
    const notes = readMidi(snesMusicToMidi(readSnesMusic(rom, SNES_GAME_MUSIC[1].pointer)!)).notes.filter((n) => n.channel === 9)
    const used = new Set(notes.map((n) => n.note))
    for (const drum of [36, 38, 42]) expect(used).toContain(drum)
  })

  it.each(SNES_GAME_MUSIC.map((piece, i) => [piece.name, i] as const))('puts the %s back in from its own MIDI file, on its own instruments as far as the voices allow', (_, index) => {
    const project = open(roomy)
    const piece = SNES_GAME_MUSIC[index]
    const { made, next } = roundTrip(project, index)
    expect(made.leftOut).toBe(0)
    expect(made.moved).toBe(0)
    voicesHeldOnce(project.bytes, made, piece.sounds)
    const pointer = snesMusicPointer(next.bytes, index)
    expect(pointer).not.toBe(piece.pointer)
    expect(snesCustomMusicName(next.bytes, index)).toBe(`${piece.name} again`)
    const was = renderSnesMusic(project.bytes, piece.pointer, piece.sounds, false)!
    const now = renderSnesMusic(next.bytes, pointer, piece.sounds, false)!
    // As long, the rest at its end kept, and the game plays every note planned.
    expect(Math.abs(now.seconds - was.seconds)).toBeLessThan(0.2)
    expect(now.notes.length).toBe(made.tracks.reduce((sum, track) => sum + track.notes.length, 0))
    // Most of its tunes' notes at the same moment, pitch and sample.
    const tunes = was.notes.filter((n) => n.track !== 9)
    const same = tunes.filter((n) => now.notes.some((m) => Math.abs(m.start - n.start) < 0.04 && m.note === n.note && m.sample === n.sample)).length
    expect(same / tunes.length).toBeGreaterThan(0.7)
    // The drums on track 9, on the drum kit's samples.
    const drums = new Set(now.notes.filter((n) => n.track === 9).map((n) => n.sample))
    for (const sample of new Set(was.notes.filter((n) => n.track === 9).map((n) => n.sample))) expect(drums).toContain(sample)
    // It loops: each track ends with the loop's end and the stop, and reads back as the game's own do.
    const music = readSnesMusic(next.bytes, pointer)!
    expect(music.parts[9].drums).toBe(true)
    expect(Math.abs(music.seconds - was.seconds)).toBeLessThan(0.2)
  })

  it.each(names)('puts all three pieces in %s together, growing a ROM under 2 MB once, and plays and puts back each', (name) => {
    const project = open(name)
    let next = project
    const grew: number[] = []
    const made = SNES_GAME_MUSIC.map((_, index) => {
      const trip = roundTrip(next, index)
      if (trip.next.bytes.length !== next.bytes.length) grew.push(index)
      next = trip.next
      return trip.made
    })
    // A 1 MB ROM (6,028 bytes free in one place) grows to 2 MB for the title music, once: the others fit after.
    if (project.bytes.length < 0x200000) {
      expect(grew).toEqual([0])
      expect(next.bytes.length).toBe(0x200000)
      expect(next.bytes[0x7fd7]).toBe(0x0b)
      // Only the header's ROM size changes in what the ROM had, but for the places that start the pieces and their room.
      expectSameBytes(SNES_GAME_MUSIC.reduce((rom, _, index) => withOriginalSnesMusic(rom, index), next).bytes, grownSnesRom(project.bytes))
    } else expect(grew).toEqual([])
    SNES_GAME_MUSIC.forEach((piece, index) => {
      const pointer = snesMusicPointer(next.bytes, index)
      expect(snesCustomMusicName(next.bytes, index)).toBe(`${piece.name} again`)
      // Within one bank.
      expect((pointer & 0xffff) + snesCustomMusicBytes(next.bytes, index)!.length).toBeLessThanOrEqual(0x10000)
      // The game plays every note planned, each at its planned pitch, track by track.
      const played = renderSnesMusic(next.bytes, pointer, piece.sounds, false)!
      made[index].tracks.forEach((track, t) => {
        const codes = played.notes.filter((n) => n.track === t).map((n) => n.note).sort((a, b) => a - b)
        expect(codes, `${piece.name} track ${t}`).toEqual(track.notes.map((n) => n.code).sort((a, b) => a - b))
      })
    })
    // Each put back on its own: the game's piece again, the others still the new ones.
    SNES_GAME_MUSIC.forEach((piece, index) => {
      const back = withOriginalSnesMusic(next, index)
      expect(snesMusicPointer(back.bytes, index)).toBe(piece.pointer)
      expect(snesCustomMusicName(back.bytes, index)).toBeNull()
      expect(back.bytes.length).toBe(next.bytes.length)
      SNES_GAME_MUSIC.forEach((other, i) => i !== index && expect(snesCustomMusicName(back.bytes, i)).toBe(`${other.name} again`))
    })
    const all = SNES_GAME_MUSIC.reduce((rom, _, index) => withOriginalSnesMusic(rom, index), next)
    if (project.bytes.length >= 0x200000) expectSameBytes(all.bytes, project.bytes)
    // A project file over the ROM as opened: all three back in, grown the same.
    const fresh = openProjectFile(open(name), saveProjectFile(next, project, 'test')).project
    expect(fresh.bytes.length).toBe(next.bytes.length)
    SNES_GAME_MUSIC.forEach((piece, index) => {
      expect(snesCustomMusicName(fresh.bytes, index)).toBe(`${piece.name} again`)
      expectSameBytes(snesCustomMusicBytes(fresh.bytes, index)!, snesCustomMusicBytes(next.bytes, index)!)
    })
    // Downloaded and opened again they are still there.
    const built = openRom(buildRom(next))
    SNES_GAME_MUSIC.forEach((piece, index) => expect(snesCustomMusicName(built.bytes, index)).toBe(`${piece.name} again`))
  })

  it.each(names.filter((name) => open(name).bytes.length < 0x200000))('keeps the fighting working in %s grown for the music, in either order', (name) => {
    const project = open(name)
    const music = (from: RomProject) => SNES_GAME_MUSIC.reduce((p, _, index) => roundTrip(p, index).next, from)
    const playsAll = (rom: Uint8Array) =>
      SNES_GAME_MUSIC.forEach((piece, index) => {
        expect(snesCustomMusicName(rom, index)).toBe(`${piece.name} again`)
        expect(renderSnesMusic(rom, snesMusicPointer(rom, index), piece.sounds, false)!.notes.length).toBeGreaterThan(100)
      })
    // The music first, then the fights: they go in the grown banks too, and the ROM does not grow again.
    const withMusic = music(project)
    const fights = applySnesHacks(withMusic, { fighting: true })
    expect(fights.bytes.length).toBe(0x200000)
    expect(snesFightState(fights.bytes)).toMatchObject({ kind: 'in', bonus: 2 })
    expect(detectSnesHacks(fights.bytes).unknown).toEqual([])
    playsAll(fights.bytes)
    // Out again: the music's ROM as it was, still 2 MB.
    const out = applySnesHacks(fights, { fighting: false })
    expect(snesFightState(out.bytes)).toEqual({ kind: 'none' })
    expectSameBytes(out.bytes, withMusic.bytes)
    // The fights first (the ROM grown by them), then the music: no growing again.
    const fightsFirst = applySnesHacks(project, { fighting: true })
    const both = music(fightsFirst)
    expect(both.bytes.length).toBe(0x200000)
    expect(snesFightState(both.bytes)).toMatchObject({ kind: 'in', bonus: 2 })
    playsAll(both.bytes)
    // The fights out: the music past the first megabyte keeps the ROM 2 MB, and its header says so.
    const kept = applySnesHacks(both, { fighting: false })
    expect(kept.bytes.length).toBe(0x200000)
    expect(kept.bytes[0x7fd7]).toBe(0x0b)
    expect(snesFightState(kept.bytes)).toEqual({ kind: 'none' })
    playsAll(kept.bytes)
    // And the fights in again on top.
    expect(snesFightState(applySnesHacks(kept, { fighting: true }).bytes)).toMatchObject({ kind: 'in' })
  })

  it('plays a MIDI file of a bass, brass chords and drums on the game kit, at most eight notes at once', () => {
    const project = open()
    const kit = snesMusicKit(project.bytes, 'menu')!
    const notes: Parameters<typeof midiFile>[0] = []
    for (let beat = 0; beat < 8; beat++) {
      notes.push({ tick: beat * 60, length: 30, note: 36, channel: 9 }, { tick: beat * 60, length: 30, note: 42, channel: 9 })
      if (beat % 2) notes.push({ tick: beat * 60, length: 30, note: 38, channel: 9 })
      notes.push({ tick: beat * 60, length: 55, note: 40 + (beat % 4), channel: 1, velocity: 120 })
      // A chord of five on the brass, which has three voices: its highest three are kept.
      for (const note of [60, 64, 67, 72, 76]) notes.push({ tick: beat * 60, length: 60, note, channel: 0, velocity: 90 })
    }
    const bytes = midiFile(notes, 600)
    const { notes: read, end } = readMidi(bytes)
    const choices = new Map<number, SnesPartChoice>([[0, 8], [1, 1], [9, 'drums']])
    const made = snesMusicFromMidi(kit, read, choices, end)
    expect(made.ticks).toBe(600)
    voicesHeldOnce(project.bytes, made, 'menu')
    const brass = made.tracks.filter((t) => t.name.startsWith('Brass')).flatMap((t) => t.notes)
    expect(new Set(brass.map((n) => n.code))).toEqual(new Set([67, 72, 76]))
    // Two brass notes a beat, and the four snares (below).
    expect(made.dropped).toBe(20)
    // The drums: kick and snare share a voice, the kick kept; the hi-hat on its own.
    const drums = made.tracks[9]
    expect(drums.name).toBe('drums')
    expect(new Set(drums.notes.map((n) => n.code))).toEqual(new Set([48, 54]))
    // The bass, loud in the file, as loud as the game's own bass.
    const bass = made.tracks.find((t) => t.name.startsWith('Bass'))!
    expect(bass.notes.map((n) => n.code)).toEqual([40, 41, 42, 43, 40, 41, 42, 43])
    expect(bass.notes[0].velocity).toBe(kit.instruments.find((i) => i.name === 'Bass')!.velocity)
    // In the ROM, the game plays them so: the drums' samples, at most eight at once.
    const next = withSnesMusic(project, 2, made, 'Test')
    const played = renderSnesMusic(next.bytes, snesMusicPointer(next.bytes, 2), 'menu', false)!
    expect(new Set(played.notes.filter((n) => n.track === 9).map((n) => n.sample))).toEqual(new Set([0, 4]))
    expect(played.notes.length).toBe(made.tracks.reduce((sum, t) => sum + t.notes.length, 0))
    for (const n of played.notes) expect(played.notes.filter((m) => m.start <= n.start && m.release > n.start).length).toBeLessThanOrEqual(8)
  })

  it('moves a part by octaves into its instrument range, and keeps to eight voices with twelve notes at once', () => {
    const project = open()
    const kit = snesMusicKit(project.bytes, 'menu')!
    const notes: MidiNote[] = []
    for (let channel = 0; channel < 6; channel++) for (const note of [72, 79]) notes.push({ start: 0, length: 1, note: note - 24 * (channel === 0 ? 1 : 0), velocity: 80, channel })
    const choices = new Map<number, SnesPartChoice>([[0, 1], [1, 8], [2, 9], [3, 13], [4, 14], [5, 15]])
    const made = snesMusicFromMidi(kit, notes, choices, 2)
    const played = made.tracks.flatMap((t) => t.notes)
    expect(played.length).toBeLessThanOrEqual(8)
    expect(played.length + made.dropped).toBe(12)
    // The bass's 48 and 55 are in its range; the rest too.
    for (const track of made.tracks) {
      const instrument = kit.instruments.find((i) => track.name.startsWith(i.name))
      for (const n of track.notes) expect(n.code >= instrument!.lowest && n.code <= instrument!.highest).toBe(true)
    }
  })

  it('points every place at the new piece, and puts them and the room back byte for byte', () => {
    const project = open()
    const original = project.bytes
    const { next } = roundTrip(project, 2)
    const places = snesMusicPlaces(next.bytes)[2]!
    const to = places.pointer
    for (const at of places.starts) expect([next.bytes[at + 1], next.bytes[at + 6] | (next.bytes[at + 7] << 8)]).toEqual([(to >>> 16) & 0xff, to & 0xffff])
    expect(next.bytes[places.asks[0]] | (next.bytes[places.asks[0] + 1] << 8)).toBe(to & 0xffff)
    // Again, over the first: its room given back and used again.
    const again = withSnesMusic(next, 2, roundTrip(project, 2).made, 'Twice')
    expect(snesCustomMusicName(again.bytes, 2)).toBe('Twice')
    expectSameBytes(withOriginalSnesMusic(again, 2).bytes, original)
    expectSameBytes(withOriginalSnesMusic(next, 2).bytes, original)
    // The other pieces are untouched.
    expect(snesMusicPointer(next.bytes, 1)).toBe(SNES_GAME_MUSIC[1].pointer)
    // Downloaded and opened again it is still there.
    expect(snesCustomMusicName(openRom(buildRom(next)).bytes, 2)).toBe('Playoff music again')
  })

  it('keeps a replaced piece in a project file, and names it in the changes', () => {
    const project = open()
    const { next } = roundTrip(project, 2)
    const fresh = openProjectFile(open(), saveProjectFile(next, project, 'test')).project
    expect(snesCustomMusicName(fresh.bytes, 2)).toBe('Playoff music again')
    expectSameBytes(snesCustomMusicBytes(fresh.bytes, 2)!, snesCustomMusicBytes(next.bytes, 2)!)
    // Opened over the same ROM with the piece in it, nothing moves.
    const same = openProjectFile(next, saveProjectFile(next, project, 'test')).project
    expect(snesMusicPointer(same.bytes, 2)).toBe(snesMusicPointer(next.bytes, 2))
    const changes = compareProjects(project, next).flatMap((d) => d.changes)
    expect(changes).toContain('Playoff music: "Playoff music again", from a MIDI file.')
    expect(compareProjects(next, withOriginalSnesMusic(next, 2)).flatMap((d) => d.changes)).toContain("Playoff music: the game's own again.")
  })

  it('says where the room is too small, and does not offer a piece whose places are not all found', () => {
    const project = open()
    const rom = project.bytes
    // More than a bank does not fit anywhere, even with the ROM grown to 2 MB.
    const huge = new Uint8Array(0x8000).fill(1)
    expect(() => withSnesMusicBytes(project, 0, huge)).toThrow(/takes 32768 bytes, and the most free room this ROM has in one place, even grown to 2 MB, is 32767/)
    const broken = rom.slice()
    broken[snesMusicPlaces(rom)[1]!.starts[2] + 10] = 0x5c
    expect(snesMusicPlaces(broken)[1]).toBeNull()
    expect(snesMusicReplaceable(broken, 1)).toBe(false)
    expect(snesMusicReplaceable(broken, 2)).toBe(true)
  })
})
