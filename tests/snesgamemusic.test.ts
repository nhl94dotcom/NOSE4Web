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
  midiLoopStart,
  midiPartNames,
  snesCustomMusicBytes,
  snesCustomMusicName,
  snesMusicFromMidi,
  snesMusicKit,
  snesMusicPlaces,
  snesMusicPointer,
  snesMusicReplaceable,
  snesEntrySide,
  snesMusicTempo,
  snesOwnMidi,
  withOriginalSnesMusic,
  withSnesMusic,
  withSnesMusicBytes,
  type SnesPartChoice,
  snesMusicFromFile,
} from '../src/core/snesgamemusic'
import { readSnesMusic, SNES_FRAMES_PER_SECOND, SNES_GAME_MUSIC, snesMusicToMidi, snesTrackEntry } from '../src/core/snesmusic'
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
  const made = snesMusicFromMidi(kit, notes, choices, end, { tempo: snesMusicTempo(project.bytes, index), loop: midiLoopStart(bytes) }, snesOwnMidi(kit, bytes))
  return { made, choices, bytes, next: withSnesMusic(project, index, made, `${piece.name} again`) }
}

// The entries a made track's notes play on (a track that changes entry on the way gives each note's).
const entriesOf = (track: ReturnType<typeof snesMusicFromMidi>['tracks'][number]) => new Set(track.notes.map((n) => n.entry ?? track.entry))

// The frame (from the piece's start) at which the sequencer steps the piece's tick `tick`: TempoAcc gains $40 a
// frame, and a tick is stepped each time it reaches TempoTick = $2760 / tempo (SequencerTick, MusicStart).
function frameOfTick(tempo: number, tick: number) {
  const tempoTick = Math.floor(0x2760 / tempo)
  let acc = 0
  let stepped = -1
  for (let frame = 1; ; frame++) {
    acc = (acc + 0x40) & 0xff
    while (acc >= tempoTick) {
      if (++stepped === tick) return frame
      acc -= tempoTick
    }
  }
}

// The voices a piece's notes were planned on never hold two at once, and are eight at most; each is a voice its
// entry may take. (A piece's own drum of more voices, as the crash in the middle, takes the one the game finds; a
// track on an entry of more voices has each note's own; a track that changes entry on the way, each note's entry. A
// note of a piece's own file that another cuts the tick it starts, as in the game's piece, is planned as long as none.)
function voicesHeldOnce(rom: Uint8Array, made: ReturnType<typeof snesMusicFromMidi>, set: 'title' | 'menu') {
  const kit = snesMusicKit(rom, set)!
  const spans: { voice: number; on: number; off: number }[] = []
  made.tracks.forEach((track, t) => {
    for (const n of track.notes) {
      const drumVoices = kit.ownDrumVoices.get(n.code) ?? [kit.drumVoice.get(n.code)!]
      if (t === 9 && drumVoices.length > 1) continue
      const voice = t === 9 ? drumVoices[0] : (n.voice ?? track.voice)
      if (t !== 9) expect(kit.entrySides[n.entry ?? track.entry].voices).toContain(voice)
      spans.push({ voice, on: n.tick, off: n.tick + n.length })
    }
  })
  for (let v = 0; v < 8; v++) {
    const own = spans.filter((s) => s.voice === v).sort((a, b) => a.on - b.on || a.off - b.off)
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
    // The organ: entry 47 on voice 0, and doubled a tick earlier on entry 31, which may take voices 0 to 2.
    expect([...menu.instruments.find((i) => i.name === 'Organ')!.entries]).toEqual([[0, 47]])
    expect(menu.instruments.find((i) => i.name === 'Organ')!.doubled).toEqual({ entry: 31, voices: [1, 2] })
    // The title set has no organ or power guitar; but the title music plays on the menu set (TitleScreen calls
    // SPCTitleToMenu before it starts it), so a new title music may use them.
    expect(snesMusicKit(rom, 'title')!.instruments.map((i) => i.name)).not.toContain('Organ')
    expect(SNES_GAME_MUSIC.map((piece) => piece.sounds)).toEqual(['menu', 'menu', 'menu'])
    expect(SNES_GAME_MUSIC.map((_, i) => snesMusicTempo(rom, i))).toEqual([156, 155, 154])
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
    // The piece's own tempo, length and loop start, so it plays as long as the game's to the frame, first time
    // through and each time round after (the menu and playoff music from tick 96).
    const own = readSnesMusic(project.bytes, piece.pointer)!
    expect([music.tempo, music.ticks, music.loop]).toEqual([own.tempo, own.ticks, own.loop])
    expect([made.tempo, made.ticks, made.loop]).toEqual([own.tempo, own.ticks, own.loop])
    const frames = (m: typeof own) => [frameOfTick(m.tempo, m.ticks), frameOfTick(m.tempo, m.ticks) - frameOfTick(m.tempo, m.loop)]
    expect(frames(music)).toEqual(frames(own))
    // The drums' hits (with the crashes' and cowbell's parts, on the drum channel in the file) at the very ticks the
    // game's are.
    const ownTicks = new Set(own.parts.flatMap((part) => part.notes.map((n) => n.tick)))
    expect(music.parts[9].notes.filter((n) => !ownTicks.has(n.tick))).toEqual([])
  })

  // How wide a piece sounds (the side's, left less right, loudness against the middle's, left and right), and how loud
  // each side is.
  const width = (rom: Uint8Array, pointer: number) => {
    const { left, right } = renderSnesMusic(rom, pointer, 'menu')!
    const sums = [0, 0, 0, 0]
    for (let i = 0; i < left.length; i++) {
      sums[0] += (left[i] - right[i]) ** 2
      sums[1] += (left[i] + right[i]) ** 2
      sums[2] += left[i] ** 2
      sums[3] += right[i] ** 2
    }
    return { width: Math.sqrt(sums[0] / sums[1]), left: Math.sqrt(sums[2] / left.length), right: Math.sqrt(sums[3] / left.length) }
  }

  it.each(SNES_GAME_MUSIC.map((piece, i) => [piece.name, i] as const))('puts the %s back from its own MIDI file with each track on its own entry, as wide as the game has it', (_, index) => {
    const project = open(roomy)
    const piece = SNES_GAME_MUSIC[index]
    const { made, choices, bytes, next } = roundTrip(project, index)
    const kit = snesMusicKit(project.bytes, piece.sounds)!
    const names = midiPartNames(bytes)
    // Each track named with an entry (as 'chug  (L) #50', or as the export names a track of a part whose instrument
    // changes, '... on #43') goes back on that entry, every note, as the game plays it: a note takes its entry's voice,
    // or on an entry of more voices (the title music's dist on 27 to 29, its HORN on 30, the menu music's power guitar
    // on 41) the one the game finds for it, cutting the one there, rather than moving to another entry. (A part the
    // game plays on more entries, a track for each in the file, goes back on one track, as the game has it.)
    let pinned = 0
    for (const [channel, name] of names) {
      // (The crashes and cowbell go on the drum channel.)
      if (channel === 9) continue
      const entry = snesTrackEntry(name) ?? -1
      const instrument = kit.instruments.find((i) => i.sides.length > 1 && i.sides.some((e) => e.entry === entry))
      if (!instrument) continue
      pinned++
      expect(choices.get(channel), name).toEqual({ sample: instrument.sample, entry })
      expect(made.tracks.filter((t) => entriesOf(t).has(entry)), name).toHaveLength(1)
    }
    expect(pinned).toBe([8, 11, 6][index])
    expect(made.otherEntry).toBe(0)
    // The playoff music's tracks all on their own entries.
    if (index === 2) for (const entry of [45, 46, 48, 49, 50, 51]) expect(made.tracks.filter((t) => t.entry === entry)).toHaveLength(1)
    // The title and menu music's tracks as the game has them, each on the entries the game's track plays: its parts of
    // more entries one track each, and its percussion parts (on the drum channel in the file) each its own again.
    if (index < 2) {
      const own = readSnesMusic(project.bytes, piece.pointer)!.parts
      expect(made.tracks.map((t, i) => (i === 9 ? 'drums' : [...entriesOf(t)].sort((a, b) => a - b).join(' ')))).toEqual(
        own.map((part) => (part.drums ? 'drums' : [...new Set(part.notes.filter((n) => n.entry >= 0).map((n) => n.entry))].sort((a, b) => a - b).join(' '))),
      )
    }
    // As wide as the game's, and as loud on each side.
    const was = width(project.bytes, piece.pointer)
    const now = width(next.bytes, snesMusicPointer(next.bytes, index))
    expect(Math.abs(now.width - was.width) / was.width).toBeLessThan(0.15)
    expect(Math.abs(now.left - was.left) / was.left).toBeLessThan(0.1)
    expect(Math.abs(now.right - was.right) / was.right).toBeLessThan(0.1)
  })

  // How many frames each sample sounds on each side (by its voice's left and right volumes), keyed on to let go, as
  // Match Viewer counts them from the DSP.
  const framesBySide = (rom: Uint8Array, pointer: number) => {
    const frames = new Map<string, number>()
    for (const n of renderSnesMusic(rom, pointer, 'menu', false)!.notes) {
      const key = `${n.sample} ${snesEntrySide(n)}`
      frames.set(key, (frames.get(key) ?? 0) + Math.round((n.release - n.start) * SNES_FRAMES_PER_SECOND))
    }
    return frames
  }

  it("plays each sample of the playoff music put back from its own MIDI file on each side as long as the game's", () => {
    const project = open(roomy)
    const { next } = roundTrip(project, 2)
    const was = framesBySide(project.bytes, SNES_GAME_MUSIC[2].pointer)
    const now = framesBySide(next.bytes, snesMusicPointer(next.bytes, 2))
    // The brass a left and right pair (45 and 46) all through, never on a voice in the middle; the crash in the
    // middle (the drums' 61, which may take voice 2 or 3) and on the right ('xtra crsh #15'); the crash played
    // backwards ('crshbkwd #4'); every other sample as long within a few frames.
    expect(now.get('8 centre')).toBeUndefined()
    for (const key of ['8 left', '8 right', '7 centre', '7 right', '3 centre']) expect(now.get(key), key).toBeGreaterThan(0)
    for (const key of new Set([...was.keys(), ...now.keys()])) {
      const [a, b] = [was.get(key) ?? 0, now.get(key) ?? 0]
      expect(Math.abs(b - a), `sample ${key}: ${a} then ${b}`).toBeLessThanOrEqual(Math.max(3, 0.03 * a))
    }
  })

  it.each([
    ['title', 0],
    ['menu', 1],
  ] as const)("plays each sample of the %s music put back from its own MIDI file on each side as long as the game's", (_, index) => {
    const project = open(roomy)
    const { made, next } = roundTrip(project, index)
    const was = framesBySide(project.bytes, SNES_GAME_MUSIC[index].pointer)
    const now = framesBySide(next.bytes, snesMusicPointer(next.bytes, index))
    // The title music's dist on its middle entries (27 to 29), never on another's side; its HORN (M) on 30, in the
    // middle; the menu music's power guitar on the left (41) as well as the middle and right.
    if (index === 0) {
      for (const entry of [27, 28, 29, 30]) expect(made.tracks.filter((t) => entriesOf(t).has(entry))).toHaveLength(1)
      expect(Math.abs(now.get('13 right')! - was.get('13 right')!)).toBeLessThanOrEqual(0.05 * was.get('13 right')!)
    } else expect(now.get('15 left')).toBeGreaterThan(0)
    // Every sample as long on each side within 5% (or 3 frames), the percussion parts' too (the title music's
    // 'cowbell #21' at its track volume 69, the menu music's 'crshbkwd/cow #4, #35' at 79, which went on the drum
    // channel's track without them before: their quiet hits fell to one side or the middle by a step of the volume).
    for (const key of new Set([...was.keys(), ...now.keys()])) {
      const [a, b] = [was.get(key) ?? 0, now.get(key) ?? 0]
      expect(Math.abs(b - a), `sample ${key}: ${a} then ${b}`).toBeLessThanOrEqual(Math.max(3, 0.05 * a))
    }
  })

  it('puts back a track whose instrument changes on the way, a MIDI track for each entry, on one track again', () => {
    const project = open(roomy)
    const menu = readSnesMusic(project.bytes, SNES_GAME_MUSIC[1].pointer)!
    // The menu music's 'bsec' tracks have no instrument until $DC at tick 480 (the power guitar: 43, 42 and 41), and
    // change between it and the brass (17, 16 and 40) on the way, ending on the brass: so the game plays their notes
    // from the loop's start (tick 96) to 480 on the brass, each time round after the first; and its 'crshbkwd/cow #4,
    // #35' plays the crash played backwards (4), the cowbell on the right (35), then 4 again.
    const bsec = menu.parts.find((part) => part.name.startsWith('bsec (R)'))!
    expect(new Set(bsec.notes.map((n) => n.entry))).toEqual(new Set([17, 43]))
    expect(bsec.notes.filter((n) => n.tick < 480).every((n) => n.entry === 17)).toBe(true)
    const crashes = menu.parts.find((part) => part.name.startsWith('crshbkwd/cow'))!
    expect([...new Set(crashes.notes.map((n) => n.entry))]).toEqual([4, 35])
    // The title music's 'HORN (M) #25' goes on to entry 30 at tick 1632: a MIDI track for each.
    const { bytes } = roundTrip(open(roomy), 0)
    expect([...midiPartNames(bytes).values()].filter((name) => name.startsWith('HORN (M)'))).toEqual(['HORN (M) #25', 'HORN (M) #25 on #30'])
    const horns = readSnesMusic(project.bytes, SNES_GAME_MUSIC[0].pointer)!.parts.find((part) => part.name.startsWith('HORN (M)'))!
    const file = readMidi(bytes).notes
    const channels = [...midiPartNames(bytes)].filter(([, name]) => name.startsWith('HORN (M)')).map(([channel]) => channel)
    expect(channels.map((channel) => file.filter((n) => n.channel === channel).length)).toEqual([25, 30].map((entry) => horns.notes.filter((n) => n.entry === entry).length))
    // Put back, each goes on its own entry, the entries of one part on one track as the game has them: the brass and
    // power guitar on 17 and 43, 16, 42 and 44, 40 and 41 (of voices 0 and 4); the crash played backwards and the
    // cowbell on the right on 4 and 35, at their track volumes 79 and 97 and their own pitches.
    const { made, next } = roundTrip(project, 1)
    for (const entries of ['17 43', '16 42 44', '40 41', '4 35']) expect(made.tracks.filter((t) => [...entriesOf(t)].sort((a, b) => a - b).join(' ') === entries)).toHaveLength(1)
    expect(made.otherEntry).toBe(0)
    const power = made.tracks.find((t) => entriesOf(t).has(41))!
    expect(new Set(power.notes.filter((n) => n.entry === 41).map((n) => n.voice))).toEqual(new Set([0, 4]))
    const percussion = made.tracks.find((t) => entriesOf(t).has(35))!
    expect(percussion.notes.map((n) => [n.code, n.entry, n.volume])).toEqual(crashes.notes.map((n) => [n.note, n.entry, n.volume ?? 127]))
    expect(made.tracks[9].notes.some((n) => [51, 82].includes(n.code))).toBe(false)
    // The game plays them so: the cowbell on the right, and the crash played backwards, as long as in the game's.
    const was = framesBySide(project.bytes, SNES_GAME_MUSIC[1].pointer)
    const now = framesBySide(next.bytes, snesMusicPointer(next.bytes, 1))
    expect(Math.abs(now.get('11 right')! - was.get('11 right')!)).toBeLessThanOrEqual(3)
    const crashBackwards = (frames: Map<string, number>) => (frames.get('3 centre') ?? 0) + (frames.get('3 right') ?? 0)
    expect(Math.abs(crashBackwards(now) - crashBackwards(was))).toBeLessThanOrEqual(3)
  })

  it('doubles the organ as the playoff music does: its line on entry 31, and a tick later on entry 47', () => {
    const project = open(roomy)
    const { made, next } = roundTrip(project, 2)
    const own = made.tracks.find((t) => t.entry === 47)!
    const doubled = made.tracks.filter((t) => t.entry === 31)
    // The playoff music's line of 102 notes back on both, as the game has it (a note or so given up for a crash).
    expect(own.notes.length).toBeGreaterThanOrEqual(100)
    const copies = doubled.flatMap((t) => t.notes)
    expect(copies.length).toBeGreaterThanOrEqual(100)
    // Each copy a tick before its note; a copy or so given up for a guitar or brass note on its own side's voice.
    for (const c of copies) expect(own.notes.some((n) => c.tick === n.tick - 1 && c.code === n.code)).toBe(true)
    expect(own.notes.filter((n) => !copies.some((c) => c.tick === n.tick - 1 && c.code === n.code)).length).toBeLessThanOrEqual(2)
    // Each on a voice of its own (31's of voices 1 and 2), and the game starts every note so.
    expect(doubled.every((t) => t.voice === 1 || t.voice === 2)).toBe(true)
    const pointer = snesMusicPointer(next.bytes, 2)
    const played = renderSnesMusic(next.bytes, pointer, 'menu', false)!
    for (const t of doubled) expect(played.notes.filter((n) => n.track === made.tracks.indexOf(t)).length).toBe(t.notes.length)
    // Its own MIDI file again has the line once, on one organ track.
    const file = snesMusicToMidi(readSnesMusic(next.bytes, pointer)!)
    expect([...midiPartNames(file).values()].filter((name) => /organ/i.test(name))).toHaveLength(1)
    expect(readMidi(file).notes.length).toBe(played.notes.length - copies.length)
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
    // Ten seconds, at the console's 60.0988 frames a second (a tick a frame where no tempo is given).
    expect(made.ticks).toBe(601)
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
    // (The organ's copies a tick earlier are extra notes, on voices left free.)
    expect(made.tracks.flatMap((t) => t.notes).length).toBeLessThanOrEqual(8)
    const played = made.tracks.filter((t) => !t.name.endsWith('doubled')).flatMap((t) => t.notes)
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

  it('puts back the original byte for byte, in a 1 MB ROM grown for the new music and in a 2 MB ROM', () => {
    const small = open()
    expect(small.bytes.length).toBe(0x100000)
    // The 1 MB ROM grows for the title music; put back, it is the grown ROM with nothing else changed.
    const grown = roundTrip(small, 0).next
    expect(grown.bytes.length).toBe(0x200000)
    expectSameBytes(withOriginalSnesMusic(grown, 0).bytes, grownSnesRom(small.bytes))
    // A 2 MB ROM (the same game grown) has room: each piece in and put back gives the ROM byte for byte.
    const big = { ...small, bytes: grownSnesRom(small.bytes) }
    let all = big
    SNES_GAME_MUSIC.forEach((_, index) => {
      const next = roundTrip(big, index).next
      expect(next.bytes.length).toBe(0x200000)
      expectSameBytes(withOriginalSnesMusic(next, index).bytes, big.bytes)
      all = roundTrip(all, index).next
    })
    // All three in, then put back one by one.
    expectSameBytes(SNES_GAME_MUSIC.reduce((rom, _, index) => withOriginalSnesMusic(rom, index), all).bytes, big.bytes)
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

describe.skipIf(!existsSync(path('NHL94.smc')))('a MIDI file put in as the page does', () => {
  it("puts the playoff music's own MIDI file back as the page's Replace does, as wide as the original", () => {
    const project = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    const piece = SNES_GAME_MUSIC[2]
    const midi = snesMusicToMidi(readSnesMusic(project.bytes, piece.pointer)!, piece.name)
    const done = snesMusicFromFile(project, 2, midi, 'Again')
    const width = (bytes: Uint8Array, pointer: number) => {
      const r = renderSnesMusic(bytes, pointer, piece.sounds)!
      let side = 0
      let mid = 0
      for (let i = 0; i < r.left.length; i++) {
        side += (r.left[i] - r.right[i]) ** 2
        mid += (r.left[i] + r.right[i]) ** 2
      }
      return Math.sqrt(side / mid)
    }
    const original = width(project.bytes, piece.pointer)
    expect(Math.abs(width(done.bytes, snesMusicPointer(done.bytes, 2)) - original) / original).toBeLessThan(0.05)
  })

  // Each note the game plays: its frame, sample, left and right volumes (its entry's side times its track volume and
  // velocity), pitch and frames to its let go.
  const heard = (rom: Uint8Array, pointer: number, samples?: number[]) =>
    renderSnesMusic(rom, pointer, 'menu', false)!
      .notes.filter((n) => !samples || samples.includes(n.sample))
      .map((n) => `${Math.round(n.start * SNES_FRAMES_PER_SECOND)} sample ${n.sample} L${n.left} R${n.right} rate ${n.rate.toFixed(0)} for ${Math.round((Math.min(n.release, 1e6) - n.start) * SNES_FRAMES_PER_SECOND)}`)
  // The notes of `was` not in `now` (as many times as they are there).
  const missing = (was: string[], now: string[]) => {
    const left = [...now]
    return was.filter((key) => {
      const at = left.indexOf(key)
      if (at >= 0) left.splice(at, 1)
      return at < 0
    })
  }
  // The kick, snare, crash played backwards, hi-hats, toms, crash and cowbell.
  const PERCUSSION = [0, 2, 3, 4, 5, 6, 7, 11]

  it.each(names)('puts the percussion of each piece in %s back from its own MIDI file at its own volume, side and pitch', (name) => {
    const project = open(name)
    SNES_GAME_MUSIC.forEach((piece, index) => {
      const done = snesMusicFromFile(project, index, snesMusicToMidi(readSnesMusic(project.bytes, piece.pointer)!, piece.name), 'Again')
      const pointer = snesMusicPointer(done.bytes, index)
      // Every percussion note as the game plays it, on its own entry at its track volume and pitch: the title music's
      // 'cowbell #21' at 69 and 'crash #14' at 97, the menu music's 'crshbkwd/cow #4, #35' at 79, 97 and its own, its
      // 'crash #15' and 'ohat #32' at 97, the playoff music's 'xtra crsh #15' and 'crshbkwd #4' (before, on the drum
      // track, at their entries' own volumes, the drum track's pitch, and the hat on the drums' 56). But one crash of
      // the playoff music's drums at frame 1268, cut a frame later than the game's (its organ's copies are planned
      // as they always were, one given up where the game's piece cuts another).
      const was = heard(project.bytes, piece.pointer, PERCUSSION)
      const now = heard(done.bytes, pointer, PERCUSSION)
      expect(now.length, piece.name).toBe(was.length)
      expect(missing(was, now), piece.name).toHaveLength(index === 2 ? 1 : 0)
      // The menu music every note as the game's; the title music all but one of its dist's (1,695 notes).
      if (index < 2) expect(missing(heard(project.bytes, piece.pointer), heard(done.bytes, pointer)), piece.name).toHaveLength(index === 0 ? 1 : 0)
    })
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('the tracks the game has, and notes played on another entry', () => {
  // A piece's MIDI file and its notes.
  const exported = (project: RomProject, index: number) => {
    const piece = SNES_GAME_MUSIC[index]
    const bytes = snesMusicToMidi(readSnesMusic(project.bytes, piece.pointer)!, piece.name)
    return { bytes, ...readMidi(bytes) }
  }

  it("keeps a piece's own MIDI file with four parts added to the game's 16 tracks, an entry of more voices too", () => {
    const project = open()
    const kit = snesMusicKit(project.bytes, SNES_GAME_MUSIC[0].sounds)!
    const { bytes, notes, end, programs } = exported(project, 0)
    const used = new Set(notes.map((n) => n.channel))
    const free = Array.from({ length: 16 }, (_, c) => c).filter((c) => c !== 9 && !used.has(c))
    expect(free).toEqual([12, 13, 14, 15])
    // On each free channel, short chords of two near the start.
    const added: MidiNote[] = free.flatMap((channel, i) => [0, 1, 2, 3].flatMap((k) => [60, 67].map((note) => ({ start: 0.01 + i * 0.05 + k * 0.01, length: 0.004, note, velocity: 90, channel }))))
    const all = [...notes, ...added].sort((a, b) => a.start - b.start || a.note - b.note)
    const choices = defaultSnesPartChoices(kit, musicParts(all), programs, midiPartNames(bytes))
    const made = snesMusicFromMidi(kit, all, choices, end, { tempo: snesMusicTempo(project.bytes, 0), loop: midiLoopStart(bytes) }, snesOwnMidi(kit, bytes))
    // (Before, 19: the distorted guitar on its entries 27 to 29 of two voices and the crash on #14's voices 2 and 3
    // took new tracks past the 15 the parts have.)
    expect(made.tracks.length).toBeLessThanOrEqual(16)
    expect(made.tracks[9].name).toBe('drums')
    withSnesMusic(project, 0, made, 'More parts')
  })

  it('keeps a part put on the power guitar (left), an entry of two voices, to the tracks the game has', () => {
    const project = open()
    const kit = snesMusicKit(project.bytes, SNES_GAME_MUSIC[0].sounds)!
    // Fifteen parts, chords of two but the last's (on channel 15), which goes on entry 41.
    const notes: MidiNote[] = []
    for (let channel = 0; channel < 16; channel++) {
      if (channel === 9) continue
      for (let k = 0; k < 8; k++) {
        const start = channel * 10 + k
        notes.push({ start, length: 0.9, note: 60 + (channel % 5), velocity: 90, channel })
        if (channel !== 14) notes.push({ start, length: 0.9, note: 64 + (channel % 5), velocity: 90, channel })
      }
    }
    notes.sort((a, b) => a.start - b.start || a.note - b.note)
    const choices = defaultSnesPartChoices(kit, musicParts(notes))
    choices.set(14, { sample: 15, entry: 41 })
    expect(kit.instruments.find((i) => i.sample === 15)!.sides.find((s) => s.entry === 41)!.voices.length).toBe(2)
    // (Before, 17.)
    const made = snesMusicFromMidi(kit, notes, choices, 200)
    expect(made.tracks.length).toBeLessThanOrEqual(16)
    withSnesMusic(project, 0, made, 'Fifteen parts')
    // And a piece of more tracks is not put in.
    const more = { ...made, tracks: [...made.tracks, { ...made.tracks[0] }] }
    expect(() => withSnesMusic(project, 0, more, 'Too many')).toThrow(/16 tracks of music at most, and this music has 17/)
  })

  it('counts the notes played on another entry than the one their part is put on as its tracks play them', () => {
    const project = open()
    const kit = snesMusicKit(project.bytes, SNES_GAME_MUSIC[0].sounds)!
    // The title music as another's file, each part of an instrument of several entries of one voice put on the first.
    const { notes, end, programs } = exported(project, 0)
    const choices = defaultSnesPartChoices(kit, musicParts(notes), programs)
    for (const [channel, choice] of choices) {
      const singles = kit.instruments.find((i) => i.sample === choice)?.sides.filter((s) => s.voices.length === 1) ?? []
      if (typeof choice === 'number' && singles.length > 1) choices.set(channel, { sample: choice, entry: singles[0].entry })
    }
    const made = snesMusicFromMidi(kit, notes, choices, end)
    let played = 0
    for (const track of made.tracks) {
      const channel = /\(MIDI (\d+)\)$/.exec(track.name)
      const choice = channel ? choices.get(Number(channel[1]) - 1) : undefined
      if (typeof choice === 'object') played += track.notes.filter((n) => (n.entry ?? track.entry) !== choice.entry).length
    }
    // (Before, 278: a note that came to its part's voice by cutting a weaker one was counted on the voice's other entry.)
    expect(played).toBe(273)
    expect(made.otherEntry).toBe(played)
  })
})
