// The Genesis game's songs as event streams, and new ones made from MIDI
// files (the sound driver, src/sound/sound94.asm of the Genesis disassembly).
//
// play_sfx_or_music_track starts sound d0 from SoundStreamTable, a long
// pointer for each of sounds 0 to $7A, found by its asl.w #2,d0 / lea
// (SoundStreamTable).l,a0; the songs are $30 to $7A. A stream is events of 4
// bytes: the frames to wait before the event (60 a second), a status byte as
// MIDI's (bits 6-4 the command, 3-0 the channel) and two data bytes:
//   $8x note off (note), $9x note on (note, volume; volume 0 is off),
//   $Bx controller (number, value; only 7, volume, is read),
//   $Cx program (patch), $Ex pitch bend (a word, $2000 none),
//   $Ax, $Dx and $Fx are skipped, and status 0 ends the stream (a data word
//   of 0 or more being a loop pointer, read as a long).
// A note's number is MIDI's: 60 is middle C, octave n / 12 up to 7 (95). The
// songs play on five FM voices that the sound effects share, the oldest note
// giving way when a sixth is wanted; 72 of the 75 songs are organ, patch 11 on
// channel 0, notes at volume 35.
//
// stop_current_song takes a track as the song playing when its stream is at or
// past song $30's, so song $30 stays where it is and a new song goes in free
// room at the end of the ROM. NOSE4Web marks a song it made by 'N4W1' after its
// end, then the address of the song it replaced and its name.

import { claimSpace } from './space'

export const FIRST_SONG = 0x30
export const LAST_TEAM_SONG = 0x77
const LAST_SOUND = 0x7a
export const FRAMES_PER_SECOND = 60
const ORGAN = 11
const ORGAN_VOLUME = 35
// Notes at once a new song may have, one voice left for the sound effects.
export const SONG_VOICES = 4
const LOWEST = 12
const HIGHEST = 95
const MARK = [0x4e, 0x34, 0x57, 0x31] // N4W1
const DRUMS = 9

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put32 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], at)

// Where SoundStreamTable is, or -1.
function soundTable(rom: Uint8Array): number {
  for (let o = 0; o + 8 <= rom.length; o += 2) {
    if (rom[o] !== 0xe5 || rom[o + 1] !== 0x40 || rom[o + 2] !== 0x41 || rom[o + 3] !== 0xf9) continue
    const at = u32(rom, o + 4)
    if (at + (LAST_SOUND + 1) * 4 > rom.length) continue
    const pointers = Array.from({ length: LAST_SOUND + 1 }, (_, i) => u32(rom, at + i * 4))
    if (pointers.every((p) => p > 0 && p + 4 <= rom.length && p % 2 === 0)) return at
  }
  return -1
}

export interface SongEvent {
  // Frames since the song began.
  frame: number
  status: number
  data: [number, number]
}

export interface Song {
  number: number
  events: SongEvent[]
  // Seconds until the stream ends (or loops).
  seconds: number
  loops: boolean
  // For a song NOSE4Web made: its name, and where the song it replaced is.
  custom: { name: string; replaced: number } | null
}

const songCache = new WeakMap<Uint8Array, Map<number, Song | null>>()

// Song `number` as the ROM has it, or null where the table or the stream is not as expected.
export function readSong(rom: Uint8Array, number: number): Song | null {
  let cache = songCache.get(rom)
  if (!cache) songCache.set(rom, (cache = new Map()))
  if (cache.has(number)) return cache.get(number)!
  let song: Song | null = null
  const table = soundTable(rom)
  if (table >= 0 && number >= FIRST_SONG && number <= LAST_SOUND) {
    let p = u32(rom, table + number * 4)
    const events: SongEvent[] = []
    let frame = 0
    let loops = false
    for (let i = 0; i < 20000 && p + 4 <= rom.length; i++, p += 4) {
      frame += rom[p]
      const status = rom[p + 1]
      if (status === 0) {
        loops = u16(rom, p + 2) < 0x8000
        break
      }
      if (status & 0x80) events.push({ frame, status, data: [rom[p + 2], rom[p + 3]] })
    }
    let custom: Song['custom'] = null
    if (!loops && MARK.every((byte, i) => rom[p + 4 + i] === byte)) {
      let name = ''
      for (let at = p + 12; at < rom.length && rom[at] !== 0 && name.length < 64; at++) name += String.fromCharCode(rom[at])
      custom = { name, replaced: u32(rom, p + 8) }
    }
    song = { number, events, seconds: frame / FRAMES_PER_SECOND, loops, custom }
  }
  cache.set(number, song)
  return song
}

export function genesisSongsSupported(rom: Uint8Array): boolean {
  return soundTable(rom) >= 0
}

// ------------------------------------------------------------- MIDI files

export interface MidiNote {
  // Seconds from the start, and how long it sounds.
  start: number
  length: number
  note: number
  velocity: number
  channel: number
}

export class MidiError extends Error {}

// The notes of a standard MIDI file (format 0 or 1), with its tempo changes
// followed, and the first track name it has.
export function readMidi(bytes: Uint8Array): { notes: MidiNote[]; name: string } {
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
  if (bytes.length < 14 || text(0, 4) !== 'MThd') throw new MidiError('This is not a MIDI file.')
  const format = u16(bytes, 8)
  const trackCount = u16(bytes, 10)
  const division = u16(bytes, 12)
  if (division & 0x8000) throw new MidiError('This MIDI file counts time in SMPTE frames, which the editor does not read. Save it with beats instead.')
  if (format > 1) throw new MidiError('This MIDI file is of a kind (format 2) that holds separate songs; save it as one song.')
  type Raw = { tick: number; order: number; kind: 'on' | 'off' | 'tempo'; channel: number; note: number; velocity: number; tempo: number }
  const raw: Raw[] = []
  let name = ''
  let at = 8 + u32(bytes, 4)
  let order = 0
  for (let track = 0; track < trackCount && at + 8 <= bytes.length; track++) {
    if (text(at, 4) !== 'MTrk') throw new MidiError('This MIDI file is damaged: a track is not where it should be.')
    const end = Math.min(bytes.length, at + 8 + u32(bytes, at + 4))
    let p = at + 8
    let tick = 0
    let running = 0
    const vlq = () => {
      let value = 0
      for (let i = 0; i < 4 && p < end; i++) {
        const byte = bytes[p++]
        value = (value << 7) | (byte & 0x7f)
        if (!(byte & 0x80)) break
      }
      return value
    }
    while (p < end) {
      tick += vlq()
      let status = bytes[p]
      if (status & 0x80) p++
      else status = running
      if (status === 0xff) {
        const type = bytes[p++]
        const length = vlq()
        if (type === 0x51 && length === 3) raw.push({ tick, order: order++, kind: 'tempo', channel: 0, note: 0, velocity: 0, tempo: (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2] })
        if ((type === 0x03 || type === 0x01) && !name) name = text(p, length).replace(/[^\x20-\x7e]/g, '').trim()
        p += length
        continue
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq()
        continue
      }
      running = status
      const command = status & 0xf0
      const channel = status & 0x0f
      const one = command === 0xc0 || command === 0xd0
      const a = bytes[p++]
      const b = one ? 0 : bytes[p++]
      if (command === 0x90 && b > 0) raw.push({ tick, order: order++, kind: 'on', channel, note: a, velocity: b, tempo: 0 })
      else if (command === 0x80 || (command === 0x90 && b === 0)) raw.push({ tick, order: order++, kind: 'off', channel, note: a, velocity: 0, tempo: 0 })
    }
    at = end
  }
  raw.sort((x, y) => x.tick - y.tick || (x.kind === 'tempo' ? -1 : y.kind === 'tempo' ? 1 : 0) || (x.kind === 'off' ? -1 : y.kind === 'off' ? 1 : 0) || x.order - y.order)
  // Ticks to seconds, through the tempo changes (120 beats a minute until the first).
  let tempo = 500000
  let lastTick = 0
  let seconds = 0
  const open = new Map<string, { start: number; velocity: number }[]>()
  const notes: MidiNote[] = []
  for (const event of raw) {
    seconds += ((event.tick - lastTick) * tempo) / division / 1e6
    lastTick = event.tick
    if (event.kind === 'tempo') {
      tempo = event.tempo || tempo
      continue
    }
    const key = `${event.channel}:${event.note}`
    if (event.kind === 'on') {
      open.set(key, [...(open.get(key) ?? []), { start: seconds, velocity: event.velocity }])
    } else {
      const started = open.get(key)?.shift()
      if (started) notes.push({ start: started.start, length: seconds - started.start, note: event.note, velocity: started.velocity, channel: event.channel })
    }
  }
  if (notes.length === 0) throw new MidiError('This MIDI file has no notes.')
  notes.sort((a, b) => a.start - b.start || a.note - b.note)
  return { notes, name }
}

export interface MadeSong {
  events: SongEvent[]
  seconds: number
  // Notes left out: drums, and those past the voices at once; and notes moved by octaves into the game's range.
  drums: number
  dropped: number
  moved: number
}

// A song for the organ from MIDI notes: every note on the organ, at most
// SONG_VOICES at once (the later ones left out), drums left out, each note
// moved by octaves into the game's range, louder notes a little louder.
export function songFromMidi(notes: MidiNote[]): MadeSong {
  let drums = 0
  let dropped = 0
  let moved = 0
  const first = notes.reduce((least, n) => Math.min(least, n.start), Infinity)
  type Played = { on: number; off: number; note: number; volume: number }
  const played: Played[] = []
  let active: Played[] = []
  for (const midi of notes) {
    if (midi.channel === DRUMS) {
      drums++
      continue
    }
    let note = midi.note
    while (note < LOWEST) note += 12
    while (note > HIGHEST) note -= 12
    if (note !== midi.note) moved++
    const on = Math.round((midi.start - first) * FRAMES_PER_SECOND)
    const off = Math.max(on + 1, Math.round((midi.start - first + midi.length) * FRAMES_PER_SECOND))
    // The notes still sounding (the notes come in order of start). The same note again ends the one
    // still sounding, as the game keys notes off by number.
    active = active.filter((other) => other.off > on)
    for (const other of active) if (other.note === note) other.off = on
    active = active.filter((other) => other.off > on)
    if (active.length >= SONG_VOICES) {
      dropped++
      continue
    }
    // A third of the MIDI velocity, as songToMidi gives three times the game's volume: 105 is the organ's 35.
    const volume = Math.max(1, Math.min(127, Math.round(midi.velocity / 3)))
    const p = { on, off, note, volume }
    played.push(p)
    active.push(p)
  }
  if (played.length === 0) throw new MidiError('This MIDI file has only drums, which the organ does not play.')
  const events: SongEvent[] = [{ frame: 0, status: 0xc0, data: [ORGAN, ORGAN_VOLUME] }]
  const timed: SongEvent[] = []
  for (const p of played) {
    if (p.off <= p.on) continue
    timed.push({ frame: p.on, status: 0x90, data: [p.note, p.volume] })
    timed.push({ frame: p.off, status: 0x80, data: [p.note, 0x40] })
  }
  // Offs before ons at the same moment, so a repeated note sounds again.
  timed.sort((a, b) => a.frame - b.frame || (a.status === 0x80 ? -1 : 1) - (b.status === 0x80 ? -1 : 1))
  for (const event of timed) events.push(event)
  const end = timed.length ? timed[timed.length - 1].frame : 0
  return { events, seconds: end / FRAMES_PER_SECOND, drums, dropped, moved }
}

// The bytes of a song: a short wait (as the game's songs start), the events,
// the end, and NOSE4Web's mark with the song it replaces and its name.
export function songBytes(events: SongEvent[], replaced: number, name: string): Uint8Array {
  const out: number[] = [0x14, 0xff, 0xff, 0xff]
  let frame = 0
  for (const event of events) {
    let wait = event.frame - frame
    while (wait > 255) {
      out.push(255, 0xff, 0xff, 0xff)
      wait -= 255
    }
    out.push(wait, event.status, event.data[0], event.data[1])
    frame = event.frame
  }
  out.push(0, 0, 0xff, 0xff)
  out.push(...MARK, (replaced >>> 24) & 0xff, (replaced >>> 16) & 0xff, (replaced >>> 8) & 0xff, replaced & 0xff)
  for (const c of name.slice(0, 40)) out.push(c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f)
  out.push(0)
  if (out.length % 2) out.push(0)
  return Uint8Array.from(out)
}

export class SongError extends Error {}

// The ROM with song `number` replaced by `events`, in free room at the end.
export function withSong(rom: Uint8Array, number: number, events: SongEvent[], name: string): Uint8Array {
  const table = soundTable(rom)
  if (table < 0) throw new SongError("This ROM's sound table is not where the original game has it, so its songs cannot be changed.")
  if (number <= FIRST_SONG || number > LAST_TEAM_SONG) throw new SongError('Song 1 cannot be replaced: the game finds which song is playing by it.')
  const current = readSong(rom, number)
  const replaced = current?.custom ? current.custom.replaced : u32(rom, table + number * 4)
  const bytes = songBytes(events, replaced, name)
  const claimed = claimSpace(rom, bytes.length + 1)
  if (!claimed) throw new SongError('There is no room left in this ROM for the song.')
  const at = claimed.at + (claimed.at % 2)
  const next = claimed.rom
  next.set(bytes, at)
  put32(next, table + number * 4, at)
  return next
}

// The ROM with song `number` back as it was before NOSE4Web replaced it.
export function withOriginalSong(rom: Uint8Array, number: number): Uint8Array {
  const table = soundTable(rom)
  const song = readSong(rom, number)
  if (table < 0 || !song?.custom) return rom
  const next = rom.slice()
  put32(next, table + number * 4, song.custom.replaced)
  return next
}

// ----------------------------------------------------------- MIDI out

// A song as a MIDI file (format 0, a tick a frame: 60 ticks a beat at 60 beats
// a minute), its organ as a drawbar organ, named `name`, for listening to or editing.
export function songToMidi(song: { events: SongEvent[] }, name = ''): Uint8Array {
  const track: number[] = []
  const vlq = (value: number) => {
    const bytes = [value & 0x7f]
    for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 0x7f) | 0x80)
    track.push(...bytes)
  }
  const title = [...name.slice(0, 60)].map((c) => (c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f))
  if (title.length) {
    vlq(0)
    track.push(0xff, 0x03, title.length, ...title)
  }
  vlq(0)
  track.push(0xff, 0x51, 3, 0x0f, 0x42, 0x40) // 1,000,000 microseconds a beat
  let frame = 0
  for (const event of song.events) {
    const command = event.status & 0xf0
    const channel = event.status & 0x0f
    let bytes: number[] | null = null
    if (command === 0x90) bytes = [0x90 | channel, event.data[0] & 0x7f, Math.min(127, event.data[1] * 3)]
    else if (command === 0x80) bytes = [0x80 | channel, event.data[0] & 0x7f, 0x40]
    else if (command === 0xc0) bytes = [0xc0 | channel, event.data[0] === ORGAN ? 16 : event.data[0] & 0x7f]
    else if (command === 0xb0 && event.data[0] === 7) bytes = [0xb0 | channel, 7, event.data[1] & 0x7f]
    if (!bytes) continue
    vlq(event.frame - frame)
    frame = event.frame
    track.push(...bytes)
  }
  vlq(0)
  track.push(0xff, 0x2f, 0)
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 60]
  const length = track.length
  return Uint8Array.from([...header, 0x4d, 0x54, 0x72, 0x6b, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff, ...track])
}

// ------------------------------------------------- songs in project files

// A song NOSE4Web made, as its bytes (stream, end and mark), for a project file; null for the game's own.
export function customSongBytes(rom: Uint8Array, number: number): Uint8Array | null {
  const table = soundTable(rom)
  const song = readSong(rom, number)
  if (table < 0 || !song?.custom) return null
  const start = u32(rom, table + number * 4)
  let p = start
  while (p + 4 <= rom.length && rom[p + 1] !== 0) p += 4
  let end = p + 12
  while (end < rom.length && rom[end] !== 0) end++
  end++
  if ((end - start) % 2) end++
  return rom.slice(start, end)
}

// The ROM with song `number` replaced by a song's bytes from a project file, its mark naming this ROM's own.
export function withSongBytes(rom: Uint8Array, number: number, bytes: Uint8Array): Uint8Array {
  const table = soundTable(rom)
  if (table < 0 || number <= FIRST_SONG || number > LAST_TEAM_SONG) throw new SongError('This ROM has no place for the song.')
  let p = 0
  while (p + 4 <= bytes.length && bytes[p + 1] !== 0) p += 4
  if (!MARK.every((byte, i) => bytes[p + 4 + i] === byte)) throw new SongError('The song is not one NOSE4Web made.')
  const current = readSong(rom, number)
  const own = current?.custom ? current.custom.replaced : u32(rom, table + number * 4)
  const song = bytes.slice()
  put32(song, p + 8, own)
  const claimed = claimSpace(rom, song.length + 1)
  if (!claimed) throw new SongError('There is no room left in this ROM for the song.')
  const at = claimed.at + (claimed.at % 2)
  claimed.rom.set(song, at)
  put32(claimed.rom, table + number * 4, at)
  return claimed.rom
}
