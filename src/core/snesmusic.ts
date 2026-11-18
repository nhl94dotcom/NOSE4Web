// The SNES game's songs, and new ones made from MIDI files (the SNES
// disassembly's routines/sound: MusicStart, StepTrack, ReadTrackEvent,
// StartSoundVoice).
//
// A song: byte 1 its tempo (TempoTick = $2760 / tempo, and a tick when
// TempoAcc, which gains $40 each frame, passes it: 157 is a tick a frame),
// byte 6 its track count, and from byte 8 a word for each track, its offset
// from the song, then 0. A track is events, each a variable-length wait in
// ticks then a code: below $D9 a note (then a velocity byte and a
// variable-length length in ticks; no note off), $DC an instrument, $E7 a text
// (a length byte and that many bytes, skipped), $D9 or $DA the end of the song
// (the first track to reach it stops the music). The organ songs play the
// melody on instrument 11 and the rest on 12; a note's code is its MIDI number
// plus 104 for them (Brass Bonanza against the Genesis's), from 130 to 181.
// Team songs are long pointers (TeamSongs, DefaultSongs: snessongs.ts), so a
// new song is written in free room within one bank and the pointers to the
// song it replaces are pointed at it. NOSE4Web's songs carry a text in the
// first track: 'N4W1', the replaced song's pointer in hex, and their name.

import type { RomProject } from './rom'
import { loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks } from './snespictures'
import { snesSongPointerEntries } from './snessongs'
import { DRUMS, FRAMES_PER_SECOND, MidiError, type MadeSong, type MidiNote, type SongEvent } from './genesismusic'

const NOTE_OFFSET = 104
const LOWEST_MIDI = 26
const HIGHEST_MIDI = 79
const MELODY = 11
const HARMONY = 12
const VELOCITY = 110
const TEMPO = 157 // a tick a frame
export const SNES_SONG_VOICES = 4
const MARK = 'N4W1'
// Frames two notes may overlap and still count as one after the other.
const LEGATO = 3

const offsetOf = (pointer: number) => loRomOffset((pointer >>> 16) & 0xff, pointer & 0xffff)
const ticksPerSecond = (tempo: number) => (FRAMES_PER_SECOND * 0x40) / Math.max(1, Math.floor(0x2760 / Math.max(1, tempo)))

function readVarLen(rom: Uint8Array, p: { at: number }): number {
  let value = 0
  for (let i = 0; i < 4; i++) {
    const byte = rom[p.at++] ?? 0
    value = (value << 7) | (byte & 0x7f)
    if (!(byte & 0x80)) break
  }
  return value
}

const varLen = (value: number): number[] => {
  const bytes = [value & 0x7f]
  for (value >>>= 7; value > 0; value >>>= 7) bytes.unshift((value & 0x7f) | 0x80)
  return bytes
}

export interface SnesSong {
  pointer: number
  // As the Genesis's are (see genesismusic.ts): MIDI notes on and off, in frames, for playing and MIDI files.
  events: SongEvent[]
  seconds: number
  custom: { name: string; replaced: number } | null
}

// The song at `pointer`, or null where it is not one.
export function readSnesSong(rom: Uint8Array, pointer: number): SnesSong | null {
  const at = offsetOf(pointer)
  if (at < 0 || at + 10 > rom.length) return null
  const tempo = rom[at + 1]
  const tracks: number[] = []
  for (let y = 8; y < 8 + 2 * 17; y += 2) {
    const offset = rom[at + y] | (rom[at + y + 1] << 8)
    if (!offset) break
    tracks.push(at + offset)
  }
  if (tracks.length === 0 || tempo === 0) return null
  const perSecond = ticksPerSecond(tempo)
  const events: SongEvent[] = []
  let last = 0
  let custom: SnesSong['custom'] = null
  tracks.forEach((start, track) => {
    const p = { at: start }
    let tick = 0
    // A track on another instrument than the two organs (the claps, 106) is the drums', as hand claps.
    let organ = true
    for (let i = 0; i < 5000 && p.at < rom.length; i++) {
      tick += readVarLen(rom, p)
      const code = rom[p.at++]
      if (code < 0xd9) {
        const velocity = rom[p.at++]
        const length = readVarLen(rom, p)
        const note = code - NOTE_OFFSET
        if (note < 0 || note > 127) continue
        const on = Math.round((tick / perSecond) * FRAMES_PER_SECOND)
        const off = Math.round(((tick + Math.max(1, length)) / perSecond) * FRAMES_PER_SECOND)
        const channel = organ ? Math.min(track, 15) : DRUMS
        events.push({ frame: on, status: 0x90 | channel, data: [note, Math.max(1, Math.round(velocity / 3))] })
        events.push({ frame: Math.max(on + 1, off), status: 0x80 | channel, data: [note, 0x40] })
        continue
      }
      if (code === 0xd9 || code === 0xda || code === 0xdb) {
        last = Math.max(last, tick / perSecond)
        break
      }
      if (code === 0xe7) {
        const length = rom[p.at]
        const text = String.fromCharCode(...rom.subarray(p.at + 1, p.at + 1 + length))
        if (track === 0 && text.startsWith(MARK)) custom = { replaced: parseInt(text.slice(4, 12), 16) >>> 0, name: text.slice(13).replace(/\0+$/, '') }
        p.at += length + 1
      } else if (code === 0xdf || code === 0xe5) p.at += 2
      else if (code === 0xdc) organ = [MELODY, HARMONY].includes(rom[p.at++])
      else if (code === 0xdd || code === 0xde || code === 0xe2 || code === 0xea) p.at += 1
    }
  })
  events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
  return { pointer, events, seconds: last, custom }
}

// A song for the organ from MIDI notes, as the game's: a note alone on both
// organs, in a chord the highest on the first and the rest on the second, at
// most SNES_SONG_VOICES notes at once, drums left out, notes moved into range.
export function snesSongFromMidi(notes: MidiNote[]): MadeSong & { tracks: { tick: number; code: number; length: number }[][] } {
  let drums = 0
  let dropped = 0
  let moved = 0
  const first = notes.reduce((least, n) => Math.min(least, n.start), Infinity)
  type Played = { on: number; off: number; note: number }
  const played: Played[] = []
  let active: Played[] = []
  for (const midi of notes) {
    if (midi.channel === DRUMS) {
      drums++
      continue
    }
    let note = midi.note
    while (note < LOWEST_MIDI) note += 12
    while (note > HIGHEST_MIDI) note -= 12
    if (note !== midi.note) moved++
    const on = Math.round((midi.start - first) * FRAMES_PER_SECOND)
    const off = Math.max(on + 1, Math.round((midi.start - first + midi.length) * FRAMES_PER_SECOND))
    // The notes still sounding (the notes come in order of start); the same note again ends the one sounding.
    active = active.filter((other) => other.off > on)
    for (const other of active) if (other.note === note) other.off = on
    active = active.filter((other) => other.off > on)
    // Past the voices: the lowest note held is cut short for a higher one; one no higher is left out.
    if (active.length >= SNES_SONG_VOICES) {
      dropped++
      const lowest = active.reduce((low, o) => (o.note < low.note ? o : low))
      if (note <= lowest.note) continue
      lowest.off = on
      active = active.filter((o) => o !== lowest)
    }
    const p = { on, off, note }
    played.push(p)
    active.push(p)
  }
  const kept = played.filter((p) => p.off > p.on)
  if (kept.length === 0) throw new MidiError('This MIDI file has only drums, which the organ does not play.')
  // Each organ has its own place left or right (the instrument's stereo bytes; Match Viewer). In a chord the
  // highest note starting plays on the first and the rest on the second, as the game's own songs share them;
  // a note on its own (no other sounding with it for more than a few frames, as a melody's notes often run
  // on) plays on both, in the middle, where that keeps to SNES_SONG_VOICES voices.
  const overlap = (a: Played, b: Played) => Math.min(a.off, b.off) - Math.max(a.on, b.on)
  const near = (p: Played) => {
    const others: Played[] = []
    for (let i = kept.indexOf(p) - 1; i >= 0 && kept[i].on > p.on - 600; i--) if (overlap(kept[i], p) > 0) others.push(kept[i])
    for (let i = kept.indexOf(p) + 1; i < kept.length && kept[i].on < p.off; i++) if (overlap(kept[i], p) > 0) others.push(kept[i])
    return others
  }
  const voices = new Map<Played, number>()
  const tracks: { tick: number; code: number; length: number }[][] = [[], []]
  for (const p of kept) {
    const n = { tick: p.on, code: p.note + NOTE_OFFSET, length: p.off - p.on }
    const others = near(p)
    const alone = others.every((o) => overlap(o, p) <= LEGATO)
    // The voices of the other notes at the busiest moment of its own (later ones counted as one until placed).
    const moments = [p.on, p.off - 1, ...others.flatMap((o) => [o.on, o.off - 1])].filter((t) => t >= p.on && t < p.off)
    const around = Math.max(0, ...moments.map((t) => others.reduce((sum, o) => sum + (o.on <= t && o.off > t ? (voices.get(o) ?? 1) : 0), 0)))
    if (alone && around + 2 <= SNES_SONG_VOICES) {
      tracks[0].push(n)
      tracks[1].push({ ...n })
      voices.set(p, 2)
      continue
    }
    voices.set(p, 1)
    const highest = kept.reduce((top, o) => (o.on === p.on ? Math.max(top, o.note) : top), 0)
    tracks[p.note === highest ? 0 : 1].push(n)
  }
  const events: SongEvent[] = []
  tracks.forEach((track, t) =>
    track.forEach((n) => {
      events.push({ frame: n.tick, status: 0x90 | t, data: [n.code - NOTE_OFFSET, 37] })
      events.push({ frame: n.tick + n.length, status: 0x80 | t, data: [n.code - NOTE_OFFSET, 0x40] })
    }),
  )
  events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
  const end = kept.reduce((latest, p) => Math.max(latest, p.off), 0)
  return { events, seconds: end / FRAMES_PER_SECOND, drums, dropped, moved, tracks }
}

// The bytes of a song from its two tracks: the header, then each track
// (the first with NOSE4Web's mark), each ending at the song's last tick.
export function snesSongBytes(tracks: { tick: number; code: number; length: number }[][], replaced: number, name: string): Uint8Array {
  const end = tracks.flat().reduce((latest, n) => Math.max(latest, n.tick + n.length), 1)
  const used = tracks.filter((track, t) => t === 0 || track.length > 0)
  const bodies = used.map((track, t) => {
    const out: number[] = []
    if (t === 0) {
      const text = `${MARK}${(replaced >>> 0).toString(16).padStart(8, '0')} ${name}`.slice(0, 200)
      out.push(0, 0xe7, text.length, ...[...text].map((c) => (c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f)))
    }
    out.push(0, 0xdc, t === 0 ? MELODY : HARMONY)
    let tick = 0
    for (const n of [...track].sort((a, b) => a.tick - b.tick)) {
      out.push(...varLen(n.tick - tick), n.code, VELOCITY, ...varLen(Math.max(1, n.length)))
      tick = n.tick
    }
    out.push(...varLen(end - tick), 0xd9)
    return out
  })
  const header = [0x01, TEMPO, 0x01, 0, 0, 0, used.length, 0]
  const tableLength = used.length * 2 + 2
  const offsets: number[] = []
  let offset = header.length + tableLength
  for (const body of bodies) {
    offsets.push(offset & 0xff, offset >> 8)
    offset += body.length
  }
  return Uint8Array.from([...header, ...offsets, 0, 0, ...bodies.flat()])
}

// The project with every team song pointing at `pointer` pointing at a new
// song made from `made` instead, written in free room within one bank.
export function withSnesSong(project: RomProject, pointer: number, made: ReturnType<typeof snesSongFromMidi>, name: string): RomProject {
  const current = readSnesSong(project.bytes, pointer)
  const replaced = current?.custom ? current.custom.replaced : pointer
  const bytes = snesSongBytes(made.tracks, replaced, name)
  const rom = project.bytes.slice()
  const at = freeSpace(rom, bytes.length, keptBanks(rom))
  if (at < 0) throw new Error('There is no room left in this ROM for the song.')
  rom.set(bytes, at)
  const to = ((loRomBank(at, 0x80) << 16) | loRomAddress(at)) >>> 0
  return repoint({ ...project, bytes: rom }, pointer, to)
}

// The project with the song NOSE4Web put at `pointer` replaced by the game's own again.
export function withOriginalSnesSong(project: RomProject, pointer: number): RomProject {
  const song = readSnesSong(project.bytes, pointer)
  return song?.custom ? repoint(project, pointer, song.custom.replaced) : project
}

// Every team song and random song at `from` pointed at `to`: in the ROM's tables and the teams' choices.
function repoint(project: RomProject, from: number, to: number): RomProject {
  const rom = project.bytes.slice()
  for (const entry of snesSongPointerEntries(rom)) {
    const value = (rom[entry] | (rom[entry + 1] << 8) | (rom[entry + 2] << 16) | (rom[entry + 3] << 24)) >>> 0
    if (value === from >>> 0) rom.set([to & 0xff, (to >>> 8) & 0xff, (to >>> 16) & 0xff, (to >>> 24) & 0xff], entry)
  }
  const teams = project.teams.map((team) => (team.snesSongs ? { ...team, snesSongs: team.snesSongs.map((p) => (p >>> 0 === from >>> 0 ? to : p)) } : team))
  return { ...project, bytes: rom, teams }
}

// ------------------------------------------------- songs in project files

// A song NOSE4Web made, as its bytes (header and tracks), for a project file; null for the game's own.
export function snesCustomSongBytes(rom: Uint8Array, pointer: number): Uint8Array | null {
  const song = readSnesSong(rom, pointer)
  const at = offsetOf(pointer)
  if (!song?.custom || at < 0) return null
  let end = at + 8
  for (let y = 8; y < 8 + 2 * 17; y += 2) {
    const offset = rom[at + y] | (rom[at + y + 1] << 8)
    if (!offset) break
    // Each track runs to its end ($D9).
    const p = { at: at + offset }
    for (let i = 0; i < 20000 && p.at < rom.length; i++) {
      readVarLen(rom, p)
      const code = rom[p.at++]
      if (code < 0xd9) {
        p.at++
        readVarLen(rom, p)
      } else if (code === 0xd9 || code === 0xda) break
      else if (code === 0xe7) p.at += rom[p.at] + 1
      else if (code === 0xdc) p.at += 1
    }
    end = Math.max(end, p.at)
  }
  return rom.slice(at, end)
}

// The project with a song from a project file, once at `saved`, written in free room, and every team song
// and random song at `saved` or at the song it replaced pointed at it.
export function withSnesSongBytes(project: RomProject, saved: number, bytes: Uint8Array): RomProject {
  const rom = project.bytes.slice()
  const at = freeSpace(rom, bytes.length, keptBanks(rom))
  if (at < 0) throw new Error('There is no room left in this ROM for the song.')
  rom.set(bytes, at)
  const to = ((loRomBank(at, 0x80) << 16) | loRomAddress(at)) >>> 0
  const song = readSnesSong(rom, to)
  let next = repoint({ ...project, bytes: rom }, saved, to)
  if (song?.custom) next = repoint(next, song.custom.replaced, to)
  return next
}

// ------------------------------------------------- the game's other music
// Besides the organ songs, the SNES game plays three pieces of its own, in the same form (MusicStart's songs, the
// SNES disassembly): TitleSong (TitleScreen), MenuSong (Opening2, and the breaks between periods early in the
// playoffs: PeriodOver) and PlayoffSong (the playoff screen, and the breaks from the second playoff round on). Their
// notes' codes are MIDI's numbers (the organ songs' are 104 more), each track begins with a text naming its part
// (EA's names, such as 'BASS #2' or 'HORN (L) #16'), and the track named 'drums' plays a drum for each note. They
// are at the same places in every SNES ROM the editor knows. All three play on the menus' sample set: the others
// after SPCMenuUpload, and the title music too, for TitleScreen calls SPCTitleToMenu (which turns the title screen's
// set into the menus' set) just before it starts the title music (snesaudio.ts; Match Viewer heard it so).
export const SNES_GAME_MUSIC: { pointer: number; name: string; where: string; sounds: 'title' | 'menu' }[] = [
  { pointer: 0x8fdd32, name: 'Title music', where: 'The title screen', sounds: 'menu' },
  { pointer: 0x90c20c, name: 'Menu music', where: 'The main menu, and between periods early in the playoffs', sounds: 'menu' },
  { pointer: 0x93ed31, name: 'Playoff music', where: 'The playoff screen, and between periods from the second round on', sounds: 'menu' },
]

export interface SnesMusicPart {
  name: string
  drums: boolean
  // Its track volume at its first note ($DF 07 or $DE after its instrument, $DC, which sets its instrument's own), or
  // null where it has none (its instrument's own).
  volume: number | null
  // In frames (at 60 a second, for the browser's preview) and in the piece's own ticks; with the instrument entry each
  // plays on (the track's last $DC; on the drums' track, its own: note - $2F; -1 where there is none, so that it is
  // never heard) and the track volume then (null for its instrument's own, which $DC sets).
  notes: { frame: number; length: number; note: number; velocity: number; tick: number; ticks: number; entry: number; volume: number | null }[]
}

export interface SnesMusic {
  pointer: number
  parts: SnesMusicPart[]
  seconds: number
  // The header's tempo byte; where the piece ends, and where it plays again from ($E2, 0 for its start), in ticks.
  tempo: number
  ticks: number
  loop: number
}

// The console's frames a second (NTSC).
export const SNES_FRAMES_PER_SECOND = 60.0988
// Ticks a second at a song's tempo byte as the console plays it: TempoTick = $2760 / tempo (MusicStart), and a tick
// each time TempoAcc, which gains $40 a frame, reaches it (SequencerTick): a tick a frame at 156 and 157 (TempoTick
// 64), 64 ticks in 65 frames at 154 and 155 (TempoTick 65).
export const snesTicksPerSecond = (tempo: number) => (SNES_FRAMES_PER_SECOND * 0x40) / Math.max(1, Math.floor(0x2760 / Math.max(1, tempo)))

// One of those pieces, or null where the ROM has none there.
export function readSnesMusic(rom: Uint8Array, pointer: number): SnesMusic | null {
  const at = offsetOf(pointer)
  if (at < 0 || at + 10 > rom.length || rom[at] !== 1) return null
  const tempo = rom[at + 1]
  const count = rom[at + 6]
  if (tempo === 0 || count < 2 || count > 17) return null
  const perSecond = ticksPerSecond(tempo)
  const frames = (tick: number) => Math.round((tick / perSecond) * FRAMES_PER_SECOND)
  let last = 0
  let ticks = 0
  let loop = -1
  const parts: SnesMusicPart[] = []
  for (let track = 0; track < count; track++) {
    const offset = rom[at + 8 + 2 * track] | (rom[at + 9 + 2 * track] << 8)
    if (!offset) return null
    const p = { at: at + offset }
    let tick = 0
    let name = ''
    let volume: number | null = null
    // The track's instrument and volume as it goes, and where it goes back to at its end.
    let entry = -1
    let now: number | null = null
    let loopStart = 0
    let loops = false
    const notes: SnesMusicPart['notes'] = []
    for (let i = 0; i < 8000 && p.at < rom.length; i++) {
      tick += readVarLen(rom, p)
      const code = rom[p.at++]
      if (code < 0xd9) {
        const velocity = rom[p.at++]
        const length = readVarLen(rom, p)
        if (code <= 127) notes.push({ frame: frames(tick), length: Math.max(1, frames(tick + Math.max(1, length)) - frames(tick)), note: code, velocity: Math.max(1, Math.min(127, velocity)), tick, ticks: Math.max(1, length), entry: track === 9 ? (code - 0x2f) & 0xff : entry, volume: now })
        continue
      }
      // The loop's end ($DB) then the stop ($D9): the piece plays again from its loop's start.
      if (code === 0xd9 || code === 0xda || code === 0xdb) {
        last = Math.max(last, tick / perSecond)
        ticks = Math.max(ticks, tick)
        loops = code === 0xdb
        break
      }
      if (code === 0xe2) {
        if (loop < 0) loop = tick
        loopStart = tick
      }
      if (code === 0xe7) {
        const length = rom[p.at]
        if (!name) name = String.fromCharCode(...rom.subarray(p.at + 1, p.at + 1 + length)).replace(/\0+$/, '').trim()
        p.at += length + 1
      } else if (code === 0xdf || code === 0xe5) {
        if (code === 0xdf && rom[p.at] === 7) {
          if (!notes.length) volume = rom[p.at + 1]
          now = rom[p.at + 1]
        }
        p.at += 2
      } else if (code === 0xdc || code === 0xdd || code === 0xde || code === 0xe2 || code === 0xea) {
        if ((code === 0xde || code === 0xdc) && !notes.length) volume = code === 0xde ? rom[p.at] : null
        if (code === 0xde) now = rom[p.at]
        if (code === 0xdc) {
          entry = rom[p.at] === 0x6a ? 0x14 : rom[p.at]
          now = null
        }
        p.at += 1
      }
    }
    // A note before the track's first instrument is not heard the first time through (StartSoundVoice starts none
    // with no instrument, and MusicStart's MusicStop clears them), but the track keeps its last instrument and volume
    // when it goes back to its loop's start ($DB): so a note from there on is heard on them each time round after (as
    // in the menu music's tracks named 'bsec ... apower', whose first $DC is at tick 480 and whose last is the brass's).
    for (const n of notes) {
      if (n.entry >= 0) break
      if (loops && entry >= 0 && n.tick >= loopStart) Object.assign(n, { entry, volume: now })
    }
    parts.push({ name, drums: name.toLowerCase() === 'drums', volume, notes })
  }
  if (!parts.some((part) => part.notes.length)) return null
  return { pointer, parts, seconds: last, tempo, ticks, loop: Math.max(0, loop) }
}

// A General MIDI instrument for a part, by EA's name for it.
const PROGRAMS: [RegExp, number][] = [
  [/bass/i, 38], // synth bass
  [/horn|bsec|brass/i, 61], // brass section
  [/orgn|organ/i, 16], // drawbar organ
  [/apower|dist|chug/i, 30], // distortion guitar
  [/orch/i, 55], // orchestra hit
  [/timp/i, 47], // timpani
]
const programFor = (name: string) => PROGRAMS.find(([pattern]) => pattern.test(name))?.[1] ?? 62
// A part of single percussion sounds, by its name: on the drum channel as that drum, whatever note it plays.
const SINGLE_DRUMS: [RegExp, number][] = [
  [/crash|crsh/i, 49], // crash cymbal
  [/cow/i, 56], // cowbell
  [/hat/i, 46], // open hi-hat
]
const drumFor = (part: SnesMusicPart) => (part.drums ? null : (SINGLE_DRUMS.find(([pattern]) => pattern.test(part.name))?.[1] ?? null))
// The drum track's notes as General MIDI's drums. Each note picks the instrument table's entry (note - $2F): 48 the
// kick, 50 the snare, 51 the crash played backwards, 52 and 54 closed hi-hats, 56 and 58 open ones, 53 to 60 the
// toms (55, 57 and 59 among them), 61 and 62 crashes (in the middle and on the right), 68 the cowbell; and 82 the
// cowbell on the right, which only a part of one percussion sound plays (the menu music's 'crshbkwd/cow #4, #35'), as
// the high agogo (MenuSfxTable's samples). Each drum is its own, so that a piece's own file goes back on them.
export const SNES_DRUM_GM: Record<number, number> = { 48: 36, 50: 38, 51: 52, 52: 44, 53: 41, 54: 42, 55: 43, 56: 46, 57: 45, 58: 51, 59: 47, 60: 48, 61: 49, 62: 57, 68: 56, 82: 67 }

// The piece as NHL 94's Genesis events (genesismusic.ts), without its drums, for the browser's rough preview.
export function snesMusicTune(music: SnesMusic): SongEvent[] {
  const events: SongEvent[] = []
  music.parts.forEach((part, i) => {
    if (part.drums || drumFor(part) !== null) return
    const channel = Math.min(i, 15)
    for (const n of part.notes) {
      events.push({ frame: n.frame, status: 0x90 | channel, data: [n.note, Math.max(1, Math.round(n.velocity / 3))] })
      events.push({ frame: n.frame + n.length, status: 0x80 | channel, data: [n.note, 0x40] })
    }
  })
  return events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
}

// An organ part that only doubles one before it: each of its notes the other's, a tick apart at most (the playoff
// music plays its organ line on two instruments a tick apart, one on the right and one in the middle, which the
// editor does again for any part put on the organ, its copies on a track for each voice: snesgamemusic.ts). The
// other parts a tick apart, one on the left and one on the right, are kept, as each goes back on its own side.
const ORGAN_PROGRAM = 16
const doubles = (part: SnesMusicPart, other: SnesMusicPart) => {
  if (programFor(part.name) !== ORGAN_PROGRAM || programFor(other.name) !== ORGAN_PROGRAM || part.notes.length > other.notes.length) return false
  const theirs = new Set(other.notes.map((n) => `${n.note}:${n.tick}`))
  return part.notes.every((n) => [-1, 0, 1].some((d) => theirs.has(`${n.note}:${n.tick + d}`)))
}

// The marker a MIDI file gives the place it plays again from when it ends (as many games' MIDI files mark it).
export const MIDI_LOOP_MARKER = 'loopStart'

// A part of one percussion sound goes on the drum channel (snesMusicToMidi), where a MIDI note is a drum, not a pitch,
// and a channel's volume (controller 7) would set every drum's. So its track carries, in a text event that MIDI
// players do not play, what the game plays each of its notes with: 'SNES notes #21 v69: 68 68 ...', each '#NN' the
// entry from there on, each 'vNN' the track volume (127 the instrument's own, as $DC sets it), each number a note's
// code (its pitch), one for each note of the track in order. A piece's own MIDI file so puts such a part back on its
// own track, at its own pitch, volume and entry (snesOwnMidi, snesgamemusic.ts).
export const SNES_NOTES_TEXT = 'SNES notes'

export function snesNotesText(notes: SnesMusicPart['notes']): string {
  const words: string[] = []
  let entry = -1
  let volume = -1
  for (const n of notes) {
    const v = Math.min(127, n.volume ?? 127)
    if (n.entry !== entry || v !== volume) {
      words.push(`#${n.entry}`, `v${v}:`)
      entry = n.entry
      volume = v
    }
    words.push(String(n.note))
  }
  return `${SNES_NOTES_TEXT} ${words.join(' ')}`
}

// The notes such a text gives (snesNotesText), or null where it is none.
export function readSnesNotesText(text: string): { code: number; entry: number; volume: number }[] | null {
  if (!text.startsWith(`${SNES_NOTES_TEXT} `)) return null
  const notes: { code: number; entry: number; volume: number }[] = []
  let entry = -1
  let volume = 127
  for (const word of text.slice(SNES_NOTES_TEXT.length).trim().split(/\s+/)) {
    const value = Number(word.replace(/^[#v]/, '').replace(/:$/, ''))
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    if (word.startsWith('#')) entry = value
    else if (word.startsWith('v')) volume = Math.min(127, value)
    else if (entry < 0 || value > 127) return null
    else notes.push({ code: value, entry, volume })
  }
  return notes.length ? notes : null
}

// The entry a track's name gives: ' on #NN' at its end (snesMusicToMidi's), else the first '#NN' (EA's, as
// 'chug  (L) #50'; or '*NN', as the menu music's 'dist *38').
export function snesTrackEntry(name: string): number | undefined {
  const found = / on #(\d+)$/.exec(name) ?? /[#*]\s*(\d+)/.exec(name)
  return found ? Number(found[1]) : undefined
}

// The piece as a MIDI file (format 1, a MIDI tick a tick of the piece, at the console's speed): a track for each
// part, named as the game names it, on its own channel with a General MIDI instrument guessed from that name and its
// track volume (controller 7; 127 where it has none, its instrument's own); a part whose instrument changes on the
// way a track for each entry it plays on, and one whose name does not give its entry, its name with ' on #NN'
// (snesTrackEntry), so that each goes back on its entry; the notes the game never plays (with no instrument) left
// out. The drums on the drum channel as General MIDI's drums (SNES_DRUM_GM; another note as it is), and a part of one
// percussion sound (a crash, a cowbell) there as that drum, on a track of its own with a text of what the game plays
// each of its notes with (SNES_NOTES_TEXT: no controller 7, which would set every drum's volume in a MIDI player).
// The first track has the place the piece plays again from
// (MIDI_LOOP_MARKER) and its end; a part that only doubles another is left out.
export function snesMusicToMidi(music: SnesMusic, name = ''): Uint8Array {
  const chunk = (type: string, body: number[]) => [...type].map((c) => c.charCodeAt(0)).concat([(body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff], body)
  const text = (value: string) => [...value.slice(0, 60)].map((c) => (c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f))
  const tracks: number[][] = []
  // 60 MIDI ticks a beat, a beat as long as 60 of the piece's ticks.
  const beat = Math.round((60 * 1e6) / snesTicksPerSecond(music.tempo))
  const tempo = [0, 0xff, 0x51, 3, (beat >>> 16) & 0xff, (beat >>> 8) & 0xff, beat & 0xff]
  const marker = text(MIDI_LOOP_MARKER)
  const loop = music.loop > 0 && music.loop < music.ticks ? [...varLen(music.loop), 0xff, 0x06, marker.length, ...marker] : []
  // The first track ends where the piece ends, its last rest kept, so that it loops in time when put back in.
  tracks.push([...(name ? [0, 0xff, 0x03, text(name).length, ...text(name)] : []), ...tempo, ...loop, ...varLen(music.ticks - (loop.length ? music.loop : 0)), 0xff, 0x2f, 0])
  let next = 0
  const kept: SnesMusicPart[] = []
  // Each part's notes that are heard, and on a track of its own for each entry it plays on (a track's instrument may
  // change, $DC, as the menu music's 'crshbkwd/cow #4, #35' does), named with that entry where the game's name does
  // not give it (snesTrackEntry).
  const tracksOf = (part: SnesMusicPart) => {
    if (part.drums || drumFor(part) !== null) return [{ name: part.name, notes: part.notes.filter((n) => n.entry >= 0) }]
    const entries = [...new Set(part.notes.filter((n) => n.entry >= 0).map((n) => n.entry))]
    const named = snesTrackEntry(part.name)
    const plain = (entry: number) => (named === undefined ? entries.length === 1 : named === entry)
    return entries.map((entry) => ({ name: plain(entry) ? part.name : `${part.name} on #${entry}`, notes: part.notes.filter((n) => n.entry === entry) }))
  }
  // A part's track: on the drum channel for the drums and a part of one percussion sound, each note as the drum of
  // the entry it plays on where the drums' track has that entry (the crash in the middle, 61, as 49; the one on the
  // right, 62, as 57; the crash played backwards, 51, as 52), else as the part's drum; any other on a channel of its
  // own with the track volume at its first note (127 for its instrument's own).
  const partTrack = (part: SnesMusicPart, name: string, notes: SnesMusicPart['notes']): number[] | null => {
    const single = drumFor(part)
    let channel = DRUMS
    if (!part.drums && single === null) {
      if (next === DRUMS) next++
      if (next > 15) return null
      channel = next++
    }
    const body: number[] = [0, 0xff, 0x03, text(name).length, ...text(name)]
    if (channel !== DRUMS) body.push(0, 0xc0 | channel, programFor(part.name), 0, 0xb0 | channel, 7, Math.min(127, notes[0].volume ?? 127))
    // (A part of one percussion sound: what the game plays its notes with, SNES_NOTES_TEXT.)
    if (single !== null) {
      const said = [...snesNotesText(notes)].map((c) => c.charCodeAt(0))
      body.push(0, 0xff, 0x01, ...varLen(said.length), ...said)
    }
    const timed: { frame: number; bytes: number[]; off: boolean }[] = []
    for (const n of notes) {
      const note = part.drums ? (SNES_DRUM_GM[n.note] ?? n.note) : single !== null ? (SNES_DRUM_GM[n.entry + 0x2f] ?? single) : n.note
      timed.push({ frame: n.tick, bytes: [0x90 | channel, note, n.velocity], off: false })
      timed.push({ frame: n.tick + n.ticks, bytes: [0x80 | channel, note, 0x40], off: true })
    }
    timed.sort((a, b) => a.frame - b.frame || Number(b.off) - Number(a.off))
    let frame = 0
    for (const t of timed) {
      body.push(...varLen(t.frame - frame), ...t.bytes)
      frame = t.frame
    }
    body.push(0, 0xff, 0x2f, 0)
    return body
  }
  for (const part of music.parts) {
    if (!part.notes.length || kept.some((other) => doubles(part, other))) continue
    kept.push(part)
    for (const own of tracksOf(part)) {
      if (!own.notes.length) continue
      const body = partTrack(part, own.name, own.notes)
      if (body) tracks.push(body)
    }
  }
  return Uint8Array.from([...chunk('MThd', [0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff, 0, 60]), ...tracks.flatMap((body) => chunk('MTrk', body))])
}
