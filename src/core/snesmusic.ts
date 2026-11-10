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
import { FRAMES_PER_SECOND, type MadeSong, type MidiNote, type SongEvent } from './genesismusic'

const NOTE_OFFSET = 104
const LOWEST_MIDI = 26
const HIGHEST_MIDI = 79
const MELODY = 11
const HARMONY = 12
const VELOCITY = 110
const TEMPO = 157 // a tick a frame
export const SNES_SONG_VOICES = 4
const DRUMS = 9
const MARK = 'N4W1'

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
        events.push({ frame: on, status: 0x90 | track, data: [note, Math.max(1, Math.round(velocity / 3))] })
        events.push({ frame: Math.max(on + 1, off), status: 0x80 | track, data: [note, 0x40] })
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
      else if (code === 0xdc || code === 0xdd || code === 0xde || code === 0xe2 || code === 0xea) p.at += 1
    }
  })
  events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
  return { pointer, events, seconds: last, custom }
}

// A song for the organ from MIDI notes, as the game's: the highest note
// sounding at each start on the melody organ, the rest on the other, at most
// SNES_SONG_VOICES at once, drums left out, notes moved by octaves into range.
export function snesSongFromMidi(notes: MidiNote[]): MadeSong & { tracks: { tick: number; code: number; length: number }[][] } {
  let drums = 0
  let dropped = 0
  let moved = 0
  const first = Math.min(...notes.map((n) => n.start))
  type Played = { on: number; off: number; note: number }
  const played: Played[] = []
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
    for (const other of played) if (other.note === note && other.off > on && other.on <= on) other.off = on
    if (played.filter((other) => other.on <= on && other.off > on).length >= SNES_SONG_VOICES) {
      dropped++
      continue
    }
    played.push({ on, off, note })
  }
  const kept = played.filter((p) => p.off > p.on)
  const tracks: { tick: number; code: number; length: number }[][] = [[], []]
  for (const p of kept) {
    const highest = Math.max(...kept.filter((o) => o.on === p.on).map((o) => o.note))
    tracks[p.note === highest ? 0 : 1].push({ tick: p.on, code: p.note + NOTE_OFFSET, length: p.off - p.on })
  }
  const events: SongEvent[] = []
  tracks.forEach((track, t) =>
    track.forEach((n) => {
      events.push({ frame: n.tick, status: 0x90 | t, data: [n.code - NOTE_OFFSET, 37] })
      events.push({ frame: n.tick + n.length, status: 0x80 | t, data: [n.code - NOTE_OFFSET, 0x40] })
    }),
  )
  events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
  const end = Math.max(0, ...kept.map((p) => p.off))
  return { events, seconds: end / FRAMES_PER_SECOND, drums, dropped, moved, tracks }
}

// The bytes of a song from its two tracks: the header, then each track
// (the first with NOSE4Web's mark), each ending at the song's last tick.
export function snesSongBytes(tracks: { tick: number; code: number; length: number }[][], replaced: number, name: string): Uint8Array {
  const end = Math.max(1, ...tracks.flat().map((n) => n.tick + n.length))
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
