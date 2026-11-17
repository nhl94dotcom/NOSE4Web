// NHL '95's organ songs, and new ones made from MIDI files (the NHL95Genesis
// disassembly's sound driver; every part of it confirmed in the game by the
// NHL94 Match Viewer project).
//
// The songs are items of the sound bank SoundBanks at $D8EC, in the original
// game and the WN95HL's ROMs alike: a word, the number of items, then 4 bytes
// for each (its type, its id and its size, a word), then every item's data
// back to back in that order, so an item starts where the sizes before it add
// up to (at an odd address as often as not). Type 0 is an FM patch, 1 a
// sample, 3 a song and $B a load list; the organ songs are the songs $32 to
// $55. SndFindBankItem ($BACA) finds an item in each bank of the list in RAM
// at SndBanks, through its lea (SndBanks).l,a1.
//
// A song (SndUpdate, $B10C): a word, the number of loop points, and a word for
// each (none in the organ songs); then events, each a wait in frames (60 a
// second at the songs' tempo), at most two bytes (bit 7 of the first set: its
// 7 bits then the next byte's; the first event's wait is not used), a status
// byte where it changes (from $80 up; the game's songs keep to the one they
// have), and its data: $9x a note (its number, velocity, and how long it
// sounds, a wait as above; there are no note offs), $Bx a controller (number,
// value; $75 a loop), $Cx a program (patch), $Ex a pitch bend (one byte), $FF
// the end. The organ plays on channel 0, patch $19; the claps on channel 7,
// patch $0C, note 105. NHL '95 keeps its notes 12 higher than NHL 94 and plays
// them an octave lower, so they sound the same: the events this gives, for
// playing and MIDI files, are NHL 94's (genesismusic.ts), its notes 12 lower.
//
// A new song goes into a bank of NOSE4Web's own, in free room, laid out as
// SoundBanks is but holding only the songs it replaces, and SndFindBankItem's
// lea is pointed at a list of two banks, that one and then SoundBanks: so the
// game finds the new song first, and everything else where it was. Each new
// song is marked after its end by 'N4W1' and its name; a new piece of the other
// music (songs 0, 2 and 3, below) goes in the same bank. Without any, the lea
// is put back as it was, as an empty bank would have the search go through
// 65,536 items of whatever follows it.

import { claimSpace95, fullRomReason, releaseSpace } from './space'
import {
  DRUMS,
  FRAMES_PER_SECOND,
  isSampled,
  MidiError,
  NHL95_DRUM_NOTES,
  NHL95_EXPORT_PROGRAM,
  nhl95Shift,
  NOISE_HAT,
  ORGAN,
  planOrganNotes,
  SongError,
  type MadeSong,
  type MidiNote,
  type MusicPart,
  type PartChoice,
  type Song,
  type SongEvent,
} from './genesismusic'

export const NHL95_FIRST_SONG = 0x32
export const NHL95_LAST_SONG = 0x55
export const NHL95_SONG_NUMBERS = Array.from({ length: NHL95_LAST_SONG - NHL95_FIRST_SONG + 1 }, (_, i) => NHL95_FIRST_SONG + i)
// Notes at once a new song may have: as many as NHL '95's own organ songs hold (7; most hold 6 or 7, where NHL 94's
// hold 4), well within the driver's list of notes waiting to end, which holds 32, shared with the sound effects, and
// does not check that it is full.
export const NHL95_SONG_VOICES = 7
const BANK = 0xd8ec
const SONG = 3
// SndFindBankItem's movem.l d1-d4/a1-a2,-(sp) / lea (SndBanks).l,a1 / move.w #3,d2: the address at 6.
const FIND = [0x48, 0xe7, 0x78, 0x60, 0x43, 0xf9, -1, -1, -1, -1, 0x34, 0x3c, 0x00, 0x03]
const SND_BANKS = 0xffffff36
const NONE = 0xffffffff
const ORGAN_PATCH = 0x19
const CLAPS_PATCH = 0x0c
const MARK = [0x4e, 0x34, 0x57, 0x31] // N4W1
// NHL '95's notes against NHL 94's (and MIDI's).
const PITCH = 12
// The range a new song's notes are moved into, in MIDI's numbers (36 to 96 as NHL '95 keeps them), and the
// velocities the game's own songs have.
const LOWEST = 24
const HIGHEST = 84
const SOFTEST = 90
const LOUDEST = 110
// A wait or a length of two bytes.
const LONGEST = 0x3fff

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const long = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]

interface Item {
  type: number
  id: number
  at: number
  size: number
}

// A bank's items, or null where it is not one.
function bankItems(rom: Uint8Array, bank: number, most = 1024): Item[] | null {
  if (bank + 2 > rom.length) return null
  const count = u16(rom, bank)
  if (count === 0 || count > most || bank + 2 + count * 4 > rom.length) return null
  const items: Item[] = []
  let at = bank + 2 + count * 4
  for (let i = 0; i < count; i++) {
    const header = bank + 2 + i * 4
    const size = u16(rom, header + 2)
    items.push({ type: rom[header], id: rom[header + 1], at, size })
    at += size
  }
  return at <= rom.length ? items : null
}

interface Banks {
  // Where SndFindBankItem's address is.
  operand: number
  // NOSE4Web's bank of new songs, with the list before it, or null where there is none.
  own: { start: number; end: number; items: Item[] } | null
}

const banksCache = new WeakMap<Uint8Array, Banks | null>()

// Where SndFindBankItem looks: the game's own banks, or NOSE4Web's list; null where it is neither, or the
// sound bank is not one.
function findBanks(rom: Uint8Array): Banks | null {
  if (banksCache.has(rom)) return banksCache.get(rom)!
  let found: Banks | null = null
  const items = bankItems(rom, BANK)
  for (let o = 0; items && o + FIND.length <= rom.length; o += 2) {
    if (rom[o] !== FIND[0] || !FIND.every((byte, i) => byte < 0 || rom[o + i] === byte)) continue
    const list = u32(rom, o + 6)
    if (list === SND_BANKS) found = { operand: o + 6, own: null }
    else if (list + 16 <= rom.length && u32(rom, list) === list + 16 && u32(rom, list + 4) === BANK && u32(rom, list + 8) === NONE && u32(rom, list + 12) === NONE) {
      const own = bankItems(rom, list + 16, NHL95_SONG_NUMBERS.length + NHL95_GAME_MUSIC.length)
      const ids = new Set(own?.map((item) => item.id))
      if (own && ids.size === own.length && own.every((item) => item.type === SONG && isOwnId(item.id))) {
        const last = own[own.length - 1]
        found = { operand: o + 6, own: { start: list, end: last.at + last.size, items: own } }
      }
    }
    break
  }
  banksCache.set(rom, found)
  return found
}

const isNhl95Song = (id: number) => id >= NHL95_FIRST_SONG && id <= NHL95_LAST_SONG
// The songs NOSE4Web's bank may hold: the organ songs, and the other music (NHL95_GAME_MUSIC).
const isOwnId = (id: number) => isNhl95Song(id) || isNhl95GameMusic(id)

// Whether the editor can read and change this ROM's songs.
export function nhl95SongsSupported(rom: Uint8Array): boolean {
  return findBanks(rom) !== null
}

// Where SndFindBankItem finds item `type` `id`: in the first bank of its list that has it.
export function findBankItem(rom: Uint8Array, type: number, id: number): { at: number; size: number } | null {
  const banks = findBanks(rom)
  if (!banks) return null
  const list = banks.own ? [banks.own.start + 16, BANK] : [BANK]
  for (const bank of list) {
    const item = bankItems(rom, bank)?.find((i) => i.type === type && i.id === id)
    if (item) return { at: item.at, size: item.size }
  }
  return null
}

// Every item of the game's own sound bank, for the tests.
export function soundBankItems(rom: Uint8Array): { type: number; id: number; at: number; size: number }[] {
  return bankItems(rom, BANK) ?? []
}

// A wait or a length: one byte, or two where the first has bit 7 set (the driver reads two, and goes past any more
// with bit 7 set).
function readWait(data: Uint8Array, p: { at: number }): number {
  const first = data[p.at]
  const value = first & 0x80 ? ((first & 0x7f) << 7) | data[p.at + 1] : first
  while (data[p.at] & 0x80) p.at++
  p.at++
  return value
}

const wait = (value: number): number[] => (value < 0x80 ? [value] : [0x80 | (value >> 7), value & 0x7f])

// An event as the song keeps it: frames since the song began, its status, and its data (for a note its number,
// velocity and length).
export interface Nhl95Event {
  frame: number
  status: number
  data: number[]
}

export interface Nhl95Stream {
  events: Nhl95Event[]
  // The first event's wait, which the driver does not use.
  firstWait: number
  loops: number[]
  // Where the end ($FF) was, from the start, or -1 where the stream did not end there.
  used: number
}

// A song's stream as the driver reads it.
export function readNhl95Stream(data: Uint8Array): Nhl95Stream {
  const loopCount = u16(data, 0)
  const loops = Array.from({ length: loopCount }, (_, i) => u16(data, 2 + i * 2))
  const p = { at: 2 + loopCount * 2 }
  const events: Nhl95Event[] = []
  let frame = 0
  let status = 0
  let firstWait = -1
  let used = -1
  while (p.at < data.length) {
    const waited = readWait(data, p)
    if (firstWait < 0) firstWait = waited
    else frame += waited
    if (data[p.at] & 0x80) status = data[p.at++]
    const command = status & 0xf0
    if (command === 0x90) {
      const [note, velocity] = [data[p.at], data[p.at + 1]]
      p.at += 2
      events.push({ frame, status, data: [note, velocity, readWait(data, p)] })
    } else if (command === 0xb0) {
      events.push({ frame, status, data: [data[p.at], data[p.at + 1]] })
      p.at += 2
    } else if (command === 0xc0 || command === 0xe0) events.push({ frame, status, data: [data[p.at++]] })
    else {
      if (status === 0xff) {
        events.push({ frame, status, data: [] })
        used = p.at
      }
      break
    }
  }
  return { events, firstWait: Math.max(0, firstWait), loops, used }
}

// The bytes of a stream, its status written only where it changes, as the game's songs have it. With `loopAt`, the
// stream has one loop point, at that event (its wait, as the driver's controller $75 takes it), whose status is
// written: the controller that jumps there leaves its own.
export function nhl95StreamBytes(events: Nhl95Event[], firstWait = 0, loopAt = -1): Uint8Array {
  const out: number[] = loopAt < 0 ? [0, 0] : [0, 1, 0, 0]
  const header = out.length
  let frame = 0
  let status = -1
  events.forEach((event, i) => {
    const waited = i === 0 ? firstWait : event.frame - frame
    const length = (event.status & 0xf0) === 0x90 ? event.data[2] : 0
    if (waited < 0 || waited > LONGEST || length > LONGEST) throw new SongError('The song has a note or a pause longer than the game can hold (4 minutes and 33 seconds).')
    frame = event.frame
    if (i === loopAt) {
      out.splice(2, 2, ((out.length - header) >> 8) & 0xff, (out.length - header) & 0xff)
      status = -1
    }
    out.push(...wait(waited))
    if (event.status !== status) out.push((status = event.status))
    if ((event.status & 0xf0) === 0x90) out.push(event.data[0], event.data[1], ...wait(length))
    else out.push(...event.data)
  })
  return Uint8Array.from(out)
}

// A song's stream as NHL 94's events (genesismusic.ts), for playing and MIDI files: notes on and off, 12 lower, a
// third of the velocity (as NHL 94's volume); the organ's patch as NHL 94's organ, the claps' as a sampled sound. A
// note sounding again before its end ends the one before.
// `velocity` divides the velocities (the organ songs' are a third of NHL 94's volume; the other music's are MIDI's).
// `asWritten` keeps every note as written: the other music's patches are tuned otherwise than the organ (Match Viewer
// played each alone), and genesismusic.ts's channelParts gives each its octave.
function songEvents(stream: Nhl95Stream, velocity = 3, patch = (value: number) => (value === ORGAN_PATCH ? ORGAN : value === CLAPS_PATCH ? 0x60 : value), asWritten = false): SongEvent[] {
  const events: SongEvent[] = []
  const sounding = new Map<number, SongEvent>()
  const patches = new Map<number, number>()
  for (const { frame, status, data } of stream.events) {
    const command = status & 0xf0
    const channel = status & 0x0f
    if (command === 0xc0) patches.set(channel, data[0])
    if (command === 0x90) {
      const note = asWritten ? data[0] : Math.max(0, data[0] - PITCH)
      const before = sounding.get(channel * 128 + note)
      if (before && before.frame > frame) before.frame = frame
      const off: SongEvent = { frame: frame + Math.max(1, data[2]), status: 0x80 | channel, data: [note, 0x40] }
      events.push({ frame, status, data: [note, Math.max(1, Math.round(data[1] / velocity))] }, off)
      sounding.set(channel * 128 + note, off)
    } else if (command === 0xb0) events.push({ frame, status, data: [data[0], data[1]] })
    else if (command === 0xc0) events.push({ frame, status, data: [patch(data[0]), 0] })
  }
  // In time order, offs before ons at the same moment.
  const timed = events.map((event, order) => ({ event, order, off: (event.status & 0xf0) === 0x80 ? 0 : 1 }))
  timed.sort((a, b) => a.event.frame - b.event.frame || a.off - b.off || a.order - b.order)
  return timed.map((t) => t.event)
}

const songCache = new WeakMap<Uint8Array, Map<number, Song | null>>()

// The name of song `number` where NOSE4Web put it in (in its own bank, marked after its end), or null.
function customName(rom: Uint8Array, number: number, item: { at: number }, data: Uint8Array, stream: Nhl95Stream): string | null {
  const own = findBanks(rom)?.own?.items.some((i) => i.id === number && i.at === item.at)
  if (!own || stream.used < 0 || !MARK.every((byte, i) => data[stream.used + i] === byte)) return null
  let name = ''
  for (let at = stream.used + MARK.length; at < data.length && data[at] !== 0 && name.length < 64; at++) name += String.fromCharCode(data[at])
  return name
}

// Song `number` as the game finds it, or null where it is not one of the organ songs or cannot be read.
export function readNhl95Song(rom: Uint8Array, number: number): Song | null {
  let cache = songCache.get(rom)
  if (!cache) songCache.set(rom, (cache = new Map()))
  if (cache.has(number)) return cache.get(number)!
  let song: Song | null = null
  const item = isNhl95Song(number) ? findBankItem(rom, SONG, number) : null
  if (item) {
    const data = rom.subarray(item.at, item.at + item.size)
    const stream = readNhl95Stream(data)
    const end = stream.events.length ? stream.events[stream.events.length - 1].frame : 0
    const name = customName(rom, number, item, data, stream)
    const custom = name === null ? null : { name, replaced: number }
    song = { number, events: songEvents(stream), seconds: end / FRAMES_PER_SECOND, loops: stream.loops.length > 0, custom }
  }
  cache.set(number, song)
  return song
}

// NHL '95's other music: songs 0 to 3 of the bank, which sound95.asm's `song` sends to StartSong (the organ songs
// and the sound effects' streams are other ids): 0 on the title screen and the credits (title95.asm) and the main
// menu (hockey95.asm's Opening2), 2 at the end of a period (PeriodOver_sp), 3 on the scouting report (scout95.asm),
// the playoff screen and the Stanley Cup screen; 1 is played by nothing. They play on the front end's FM patches and
// the sound chip's square-wave voices: patch $13 is its noise, the hi-hats.
export const NHL95_GAME_MUSIC: { number: number; name: string; where: string }[] = [
  { number: 0, name: 'Title music', where: 'The title screen, the credits and the main menu' },
  { number: 2, name: 'End of period music', where: 'Between periods' },
  { number: 3, name: 'Scouting report music', where: 'The scouting report, the playoff screen and the Stanley Cup screen' },
]
const NOISE_PATCH = 0x13
export const isNhl95GameMusic = (id: number) => NHL95_GAME_MUSIC.some((piece) => piece.number === id)
const musicCache = new WeakMap<Uint8Array, Map<number, Song | null>>()

// One of those pieces as NHL 94's events (as readNhl95Song gives the organ songs), its velocities as they are, its
// noise patch as the hi-hats (NOISE_HAT) and its drum patch's notes as written (NHL95_DRUM_PATCH). Played and exported
// as NHL '95's (gameMusicTune and gameMusicToMidi with 95), not on NHL 94's patches. One NOSE4Web put in has its name.
// Of two hits at once on one drum patch the game sounds only the one sent last (Match Viewer), so only that one is
// kept (soundingDrums): a MIDI file made from it then puts back the hit heard, the kick included where a tom shares
// its moment.
function soundingDrums(events: Nhl95Event[]): Nhl95Event[] {
  const patches = new Map<number, number>()
  const last = new Map<string, number>()
  events.forEach((event, i) => {
    if ((event.status & 0xf0) === 0xc0) patches.set(event.status & 0x0f, event.data[0])
    const patch = patches.get(event.status & 0x0f)
    if ((event.status & 0xf0) === 0x90 && (patch === KICK_PATCH || patch === SNARE_PATCH || patch === NOISE_PATCH)) last.set(`${patch}:${event.frame}`, i)
  })
  patches.clear()
  return events.filter((event, i) => {
    if ((event.status & 0xf0) === 0xc0) patches.set(event.status & 0x0f, event.data[0])
    const patch = patches.get(event.status & 0x0f)
    if ((event.status & 0xf0) !== 0x90 || !(patch === KICK_PATCH || patch === SNARE_PATCH || patch === NOISE_PATCH)) return true
    return last.get(`${patch}:${event.frame}`) === i
  })
}

export function readNhl95Music(rom: Uint8Array, number: number): Song | null {
  if (!isNhl95GameMusic(number)) return null
  let cache = musicCache.get(rom)
  if (!cache) musicCache.set(rom, (cache = new Map()))
  if (cache.has(number)) return cache.get(number)!
  let song: Song | null = null
  const item = findBankItem(rom, SONG, number)
  const data = item ? rom.subarray(item.at, item.at + item.size) : null
  const stream = data ? readNhl95Stream(data) : null
  if (item && data && stream && stream.used >= 0) {
    const events = songEvents({ ...stream, events: soundingDrums(stream.events) }, 1, (value) => (value === NOISE_PATCH ? NOISE_HAT : value), true)
    const name = customName(rom, number, item, data, stream)
    // Its length: to where its loop point plays again (the title music's events after its $75 never play).
    const loop = stream.events.find((e) => e.status === 0xb0 && e.data[0] === LOOP_START)
    const period = nhl95LoopFrames(stream.events, name !== null)
    const end = loop && period !== null ? loop.frame + period : stream.events.length ? stream.events[stream.events.length - 1].frame : 0
    song = { number, events, seconds: end / FRAMES_PER_SECOND, loops: true, custom: name === null ? null : { name, replaced: number } }
  }
  cache.set(number, song)
  return song
}

// A song for the organ from MIDI notes, as NHL 94's (songFromMidi) but into NHL '95's range: every note on the organ,
// at most NHL95_SONG_VOICES at once, drums left out, notes moved by octaves into range.
export function nhl95SongFromMidi(notes: MidiNote[]): MadeSong {
  const { played, drums, dropped, moved } = planOrganNotes(notes, LOWEST, HIGHEST, NHL95_SONG_VOICES)
  const timed: SongEvent[] = []
  for (const p of played) {
    timed.push({ frame: p.on, status: 0x90, data: [p.note, Math.round(Math.max(SOFTEST, Math.min(LOUDEST, p.velocity)) / 3)] })
    timed.push({ frame: p.off, status: 0x80, data: [p.note, 0x40] })
  }
  timed.sort((a, b) => a.frame - b.frame || (a.status === 0x80 ? -1 : 1) - (b.status === 0x80 ? -1 : 1))
  const events: SongEvent[] = [{ frame: 0, status: 0xc0, data: [ORGAN, 0] }, ...timed]
  const end = timed.length ? timed[timed.length - 1].frame : 0
  return { events, seconds: end / FRAMES_PER_SECOND, drums, dropped, moved }
}

// The bytes of a song from events as NHL 94's: its notes, on the organ on channel 0 (those of the claps and the
// drums left out), then the end and NOSE4Web's mark with its name.
export function nhl95SongBytes(events: SongEvent[], name: string): Uint8Array {
  const notes: { on: number; length: number; note: number; velocity: number }[] = []
  const sounding = new Map<string, { on: number; note: number; velocity: number }>()
  const sampled = new Set<number>()
  let end = 0
  for (const event of events) {
    const command = event.status & 0xf0
    const channel = event.status & 0x0f
    if (command === 0xc0) {
      if (isSampled(event.data[0])) sampled.add(channel)
      else sampled.delete(channel)
    }
    if (channel === DRUMS || sampled.has(channel)) continue
    const key = `${channel}:${event.data[0]}`
    if (command === 0x90 && event.data[1] > 0) {
      sounding.set(key, { on: event.frame, note: event.data[0], velocity: event.data[1] * 3 })
    } else if (command === 0x80 || command === 0x90) {
      const began = sounding.get(key)
      if (!began) continue
      sounding.delete(key)
      notes.push({ on: began.on, length: Math.max(1, event.frame - began.on), note: began.note, velocity: began.velocity })
      end = Math.max(end, event.frame)
    }
  }
  if (notes.length === 0) throw new MidiError('The song has no notes the organ plays.')
  notes.sort((a, b) => a.on - b.on || b.note - a.note)
  const stream: Nhl95Event[] = [{ frame: 0, status: 0xc0, data: [ORGAN_PATCH] }]
  for (const n of notes) {
    let note = n.note + PITCH
    while (note < LOWEST + PITCH) note += 12
    while (note > HIGHEST + PITCH) note -= 12
    stream.push({ frame: n.on, status: 0x90, data: [note, Math.max(SOFTEST, Math.min(LOUDEST, n.velocity)), n.length] })
  }
  stream.push({ frame: end, status: 0xff, data: [] })
  const out = [...nhl95StreamBytes(stream), ...MARK]
  for (const c of name.slice(0, 40)) out.push(c.charCodeAt(0) < 0x7f && c.charCodeAt(0) >= 0x20 ? c.charCodeAt(0) : 0x3f)
  out.push(0)
  return Uint8Array.from(out)
}

// The songs NOSE4Web put in, by number, as their bytes.
function ownSongs(rom: Uint8Array): Map<number, Uint8Array> {
  const own = findBanks(rom)?.own
  return new Map((own?.items ?? []).map((item) => [item.id, rom.slice(item.at, item.at + item.size)]))
}

// The ROM with NOSE4Web's bank holding `songs`: the old bank given back, a new one in free room and the search
// pointed at it; without any, the search as the game had it.
function withOwnSongs(rom: Uint8Array, songs: Map<number, Uint8Array>): Uint8Array {
  const banks = findBanks(rom)
  if (!banks) throw new SongError("This ROM's sound bank is not where the original game has it, so its songs cannot be changed.")
  let next: Uint8Array = rom.slice()
  if (banks.own) release(next, banks.own.start, banks.own.end)
  if (songs.size === 0) {
    next.set(long(SND_BANKS), banks.operand)
    return next
  }
  const numbers = [...songs.keys()].sort((a, b) => a - b)
  const block: number[] = [...long(0), ...long(BANK), ...long(NONE), ...long(NONE), (numbers.length >> 8) & 0xff, numbers.length & 0xff]
  for (const number of numbers) {
    const size = songs.get(number)!.length
    if (size > 0xffff) throw new SongError('The song is too long for the game to hold.')
    block.push(SONG, number, size >> 8, size & 0xff)
  }
  for (const number of numbers) block.push(...songs.get(number)!)
  // As the NHL '95 hacks' code: after the end mark, or in the WN95HL's ROMs before the data they keep at the end.
  const claimed = claimSpace95(next, block.length)
  if (!claimed) throw new SongError(`There is no room left in this ROM for the song.${fullRomReason(next)}`)
  next = claimed.rom
  block.splice(0, 4, ...long(claimed.at + 16))
  next.set(block, claimed.at)
  next.set(long(claimed.at), banks.operand)
  return next
}

// Gives back NOSE4Web's bank. Just before a long run of unused room (before the data the WN95HL's ROMs keep at the
// end, where claimBeforeTail takes room) it is only cleared, so that the room is found again as it was.
function release(rom: Uint8Array, start: number, end: number): void {
  let free = end
  while (free < rom.length && rom[free] === 0xff) free++
  if (free < rom.length && free - end >= 0x4000) rom.fill(0xff, start, end)
  else releaseSpace(rom, [{ start, end }])
}

// The ROM with song `number` replaced by `events` (as NHL 94's, from nhl95SongFromMidi), named `name`.
export function withNhl95Song(rom: Uint8Array, number: number, events: SongEvent[], name: string): Uint8Array {
  if (!isNhl95Song(number)) throw new SongError('That is not one of the organ songs.')
  const songs = ownSongs(rom)
  songs.set(number, nhl95SongBytes(events, name))
  return withOwnSongs(rom, songs)
}

// The ROM with song `number` (an organ song or a piece of the other music) back as the game had it.
export function withOriginalNhl95Song(rom: Uint8Array, number: number): Uint8Array {
  const songs = ownSongs(rom)
  if (!songs.has(number)) return rom
  songs.delete(number)
  return withOwnSongs(rom, songs)
}

// A song or piece of music NOSE4Web made, as its bytes, for a project file; null for the game's own.
export function nhl95CustomSongBytes(rom: Uint8Array, number: number): Uint8Array | null {
  return (isNhl95GameMusic(number) ? readNhl95Music : readNhl95Song)(rom, number)?.custom ? (ownSongs(rom).get(number) ?? null) : null
}

// The ROM with song `number` (an organ song or a piece of the other music) replaced by its bytes from a project file.
export function withNhl95SongBytes(rom: Uint8Array, number: number, bytes: Uint8Array): Uint8Array {
  if (!isOwnId(number)) throw new SongError('This ROM has no place for the song.')
  const stream = readNhl95Stream(bytes)
  if (stream.used < 0 || !MARK.every((byte, i) => bytes[stream.used + i] === byte)) throw new SongError('The song is not one NOSE4Web made.')
  const songs = ownSongs(rom)
  songs.set(number, bytes.slice())
  return withOwnSongs(rom, songs)
}

// ------------------------------------------------- the other music from MIDI files
// Match Viewer's measurements of the driver, which a new piece keeps to:
// - The music has six FM voices, three square-wave voices ($14) and the noise ($13); on the front end and between
//   periods nothing else takes them.
// - Each FM patch has one voice: a note on a patch already sounding cuts the note there, even from another channel.
//   So each part has a patch of its own, and a part on an FM patch plays one note at a time.
// - With no voice free a new note takes the first voice, and the note it stops never comes back: so at most six FM
//   patches sound at once (the drums $15 and $0E among them), three square notes and one noise.
// - The 68000 sends the Z80 at most 16 commands a frame (a note, a note's end and a program each one; SndPutZ80Cmd),
//   the rest a frame late: a new piece keeps to MOST_COMMANDS, a few left for the sound effects.
// - The list of notes waiting to end (SndNotes) holds 32, shared with the sound effects and unchecked: each of a new
//   piece's notes ends before the next on its voice begins, so it never has more waiting than its ten voices.
// - Controller $75 jumps to a loop point (the 68000's; the other controllers go to the Z80). The game's pieces have
//   their programs, then $74 at their loop point, and end with $75 0: a new piece is laid out the same.
// - A new piece is laid out as the game's own, its $75 at its end: the game's pieces come round a frame or two after
//   their $75 (the title music repeats every 4,225 frames, the scouting report's 4,226: Match Viewer, on the console),
//   and a new one laid out the same repeats as they do (a round trip of the scouting report's repeated every 4,226).
//   An earlier build moved the $75 2 frames earlier, which made new pieces 2 to 3 frames short.
const FM_VOICES = 6
const SQUARE_VOICES = 3
const MOST_COMMANDS = 14
const SQUARE_PATCH = 0x14
const BASS_PATCH = 0x11
const KICK_PATCH = 0x15
const SNARE_PATCH = 0x0e
const MALLET_PATCH = 0x0d
const LOOP_START = 0x74
const LOOP = 0x75
const LOOP_LATE = 0
// The game's tuned patches a part may be played on, each once (load list 0, which all three pieces use), named by
// as Match Viewer heard them. $0B and $16 are left out: none of the three pieces plays them, so how they sound is not
// known.
export const NHL95_INSTRUMENTS: { patch: number; name: string }[] = [
  { patch: BASS_PATCH, name: 'Plucked bass' },
  { patch: 0x18, name: 'Brass swell' },
  { patch: 0x1b, name: 'Mellow horn' },
  { patch: MALLET_PATCH, name: 'Mallet (short notes only)' },
  { patch: 0x1d, name: 'Sustained lead' },
  { patch: 0x1c, name: 'Whistle' },
  { patch: SQUARE_PATCH, name: 'Square (plays chords, three notes)' },
]
// $0D fades fast (18 dB in a second, 27 in two: Match Viewer): a part whose median note is longer than this (seconds)
// is not put on it unless chosen.
const MALLET_LONGEST = 0.3
// The game's drums: the kick and the toms on $15, the snare and the thump on $0E, the hi-hats and cymbals on the noise;
// each about as long as the game's own pieces hold them.
type Drum = { patch: number; note: number; shortest: number; longest: number }
const drum = (patch: number, note: number): Drum => (patch === NOISE_PATCH ? { patch, note, shortest: 1, longest: 4 } : { patch, note, shortest: 6, longest: 24 })
const KICK = drum(KICK_PATCH, 0)
const SNARE = drum(SNARE_PATCH, 56)
// The MIDI drum notes NHL '95's pieces are exported as (NHL95_DRUM_NOTES) come back as the same drums, so that a piece
// put back from its own MIDI file plays each as it did; but 35 (the second kick, $15 9) is the kick where a file has no
// 36. Any other file's: the kicks the kick, the snares and the clap the snare, the toms by pitch on $15 17 to 19, the
// closed and pedal hats and the rides the closed hat, the open hat and the crashes the open one; others left out.
const OWN_DRUMS = new Map(NHL95_DRUM_NOTES.map((d) => [d.midi, drum(d.patch === NOISE_HAT ? NOISE_PATCH : d.patch, d.note)]))
function drumFor(midi: number, bothKicks: boolean): Drum | null {
  if (midi === 35 && !bothKicks) return KICK
  const own = OWN_DRUMS.get(midi)
  if (own) return own
  if (midi === 39) return SNARE
  if (midi === 41 || midi === 43) return drum(KICK_PATCH, 17)
  if (midi === 50) return drum(KICK_PATCH, 19)
  if (midi === 44 || midi === 51 || midi === 53 || midi === 59) return drum(NOISE_PATCH, 120)
  if (midi === 49 || midi === 52 || midi === 55 || midi === 57) return drum(NOISE_PATCH, 108)
  return null
}
// The notes a patch may sound, as heard: its written notes 12 to 95 (the sound chip's octaves), the square wave from
// 46 (it goes no lower than about 110 Hz).
function soundingRange(patch: number): [number, number] {
  if (patch === SQUARE_PATCH) return [46, 96]
  const shift = nhl95Shift(patch, 60)
  return [12 + shift, Math.min(95 + shift, 108)]
}
// The game's own pieces' tunes have a median velocity of 78: a file much louder is brought down to it.
const TYPICAL_VELOCITY = 78
const LOUD_VELOCITY = 95
// A note that ends this few frames after the next of its part begins is the line moving on (legato), not a chord.
const LEGATO = 3

// The patches a General MIDI instrument is put on first, nearest first.
function patchesForProgram(program: number): number[] {
  const exported = Object.entries(NHL95_EXPORT_PROGRAM)
    .filter(([, value]) => value === program)
    .map(([patch]) => Number(patch))
  if (program >= 32 && program <= 39) return [...exported, BASS_PATCH]
  if (program >= 56 && program <= 63) return [...exported, 0x18, 0x1b]
  if (program === 80) return [...exported, SQUARE_PATCH, 0x1d]
  if (program >= 81 && program <= 87) return [...exported, 0x1d, 0x18, 0x1b]
  if (program >= 72 && program <= 79) return [...exported, 0x1c, 0x1d]
  if (program >= 64 && program <= 71) return [...exported, 0x1d, 0x1b]
  if ((program >= 40 && program <= 55) || (program >= 88 && program <= 95)) return [...exported, 0x1b, 0x18, 0x1d]
  if (program >= 16 && program <= 23) return [...exported, 0x1d, 0x18]
  if (program <= 15 || (program >= 24 && program <= 31)) return [...exported, 0x0d, SQUARE_PATCH]
  return exported
}

// How much of a part is chords: the share of its notes that begin while another of its notes still sounds.
function chordShare(notes: MidiNote[], channel: number): number {
  const own = notes.filter((n) => n.channel === channel && n.length > 0).sort((a, b) => a.start - b.start)
  let chords = 0
  own.forEach((note, i) => {
    if (own.slice(Math.max(0, i - 8), i).some((other) => other.start + other.length - note.start > LEGATO / FRAMES_PER_SECOND)) chords++
  })
  return own.length ? chords / own.length : 0
}

// The first choice for each part: the drum channel as the drums; a part with a General MIDI instrument (`programs`, as
// readMidi gives them) on the free patch nearest it (a piece's own MIDI file, exported here, gets back its own); of
// the others, the lowest on the bass where it is low and not the only one, a part mostly of chords on the square
// wave, and the rest from the highest down on the patches left; past seven, left out.
export function nhl95PartChoices(parts: MusicPart[], notes: MidiNote[], programs = new Map<number, number>()): Map<number, PartChoice> {
  const choices = new Map<number, PartChoice>()
  const free = NHL95_INSTRUMENTS.map((instrument) => instrument.patch)
  const take = (channel: number, patch: number) => {
    choices.set(channel, patch)
    free.splice(free.indexOf(patch), 1)
  }
  // A free patch for the part: $0D only for one of short notes.
  const fits = (channel: number) => {
    const lengths = notes
      .filter((n) => n.channel === channel)
      .map((n) => n.length)
      .sort((a, b) => a - b)
    const long = lengths.length > 0 && lengths[Math.floor(lengths.length / 2)] > MALLET_LONGEST
    return (patch: number) => free.includes(patch) && !(long && patch === MALLET_PATCH)
  }
  for (const part of parts) if (part.channel === DRUMS) choices.set(part.channel, 'drums')
  for (const part of parts) {
    if (choices.has(part.channel) || !programs.has(part.channel)) continue
    const patch = patchesForProgram(programs.get(part.channel)!).find(fits(part.channel))
    if (patch !== undefined) take(part.channel, patch)
  }
  const tunes = parts.filter((part) => !choices.has(part.channel)).sort((a, b) => a.average - b.average)
  if (tunes.length > 1 && tunes[0].average < 55 && free.includes(BASS_PATCH)) take(tunes.shift()!.channel, BASS_PATCH)
  for (const part of tunes.reverse()) {
    const chords = free.includes(SQUARE_PATCH) && part.highest >= 46 && chordShare(notes, part.channel) >= 0.25
    const fit = fits(part.channel)
    const patch = chords ? SQUARE_PATCH : (free.find((p) => p !== BASS_PATCH && p !== SQUARE_PATCH && fit(p)) ?? free.find(fit))
    if (patch === undefined) choices.set(part.channel, 'out')
    else take(part.channel, patch)
  }
  return choices
}

export interface MadeNhl95Music {
  // The stream (for nhl95StreamBytes), and which of its events is the loop point.
  stream: Nhl95Event[]
  loopAt: number
  seconds: number
  // Whether the velocities were brought down to the game's (the file being much louder).
  quieter: boolean
  // Notes left out with their part (and drums the game has none like); notes of chords on a patch that plays one at
  // a time (or past the square wave's three), left out or cut short; notes past the voices or the commands a frame;
  // and notes moved by octaves into their patch's range.
  leftOut: number
  chords: number
  dropped: number
  moved: number
}

type Planned = { on: number; off: number; note: number; sounding: number; velocity: number; channel: number; patch: number; rank: number; bass: boolean }
// Whether `a` gives way to `b`: the drums are kept first, then the bass, then the higher notes (the lower on the bass).
const weaker = (a: Planned, b: Planned) => a.rank < b.rank || (a.rank === b.rank && (a.bass ? a.sounding > b.sounding : a.sounding < b.sounding))
const isFm = (patch: number) => patch !== SQUARE_PATCH && patch !== NOISE_PATCH

// A piece of NHL '95's other music from MIDI notes: each part on the patch chosen for it (one each), on a channel of
// its own; MIDI's drums on the game's; each part moved by whole octaves into its patch's notes as heard (a note is
// written as the note heard less how far above it the patch sounds), only the notes of a part too wide moved one by
// one; one note at a time on each FM patch (of a chord the highest, the lowest on the bass), at most three on the
// square wave; and the driver's limits above kept, the drums kept first, then the bass, then the highest notes.
// `end` is where the file ends (readMidi), so that a rest at its end is kept before the piece plays again.
export function nhl95MusicFromMidi(notes: MidiNote[], choices: Map<number, PartChoice>, end = 0): MadeNhl95Music {
  const tuneChannels = [...choices].filter(([channel, choice]) => typeof choice === 'number' && notes.some((n) => n.channel === channel)).map(([channel]) => channel)
  if (tuneChannels.length === 0) throw new MidiError('Choose an instrument for at least one part that is not drums.')
  const patches = tuneChannels.map((channel) => choices.get(channel) as number)
  if (new Set(patches).size !== patches.length) throw new MidiError('Each instrument can play only one part: the game plays one note at a time on each.')
  if (patches.some((patch) => !NHL95_INSTRUMENTS.some((instrument) => instrument.patch === patch))) throw new MidiError('That is not one of the instruments the game offers.')
  const gameChannel = new Map(tuneChannels.map((channel, i) => [channel, i]))
  const drumChannel = new Map([KICK_PATCH, SNARE_PATCH, NOISE_PATCH].map((patch, i) => [patch, tuneChannels.length + i]))
  const first = notes.reduce((least, n) => Math.min(least, n.start), Infinity)
  const kept = notes
    .filter((n) => typeof choices.get(n.channel) === 'number')
    .map((n) => n.velocity)
    .sort((a, b) => a - b)
  const median = kept.length ? kept[Math.floor(kept.length / 2)] : 0
  const loudness = median > LOUD_VELOCITY ? TYPICAL_VELOCITY / median : 1
  // Each part moved by the same octaves, so that its line keeps its shape.
  const shifts = new Map<number, number>()
  for (const channel of tuneChannels) {
    const pitches = notes.filter((n) => n.channel === channel).map((n) => n.note)
    const [lowest, highest] = soundingRange(choices.get(channel) as number)
    const [low, high] = [Math.min(...pitches), Math.max(...pitches)]
    let shift = 0
    while (high + shift > highest && low + shift - 12 >= lowest) shift -= 12
    while (low + shift < lowest && high + shift + 12 <= highest) shift += 12
    shifts.set(channel, shift)
  }
  let leftOut = 0
  let moved = 0
  const wanted: Planned[] = []
  const bothKicks = [35, 36].every((kick) => notes.some((n) => n.channel === DRUMS && n.note === kick))
  for (const midi of notes) {
    const choice = choices.get(midi.channel) ?? 'out'
    const drum = choice === 'drums' && midi.channel === DRUMS ? drumFor(midi.note, bothKicks) : null
    if (choice === 'out' || (choice === 'drums' && !drum)) {
      leftOut++
      continue
    }
    // A tune's note of no length sounds nothing (a drum's is a hit).
    if (!drum && midi.length <= 0) continue
    // Frame 0 holds the programs; the piece begins at frame 1.
    const on = 1 + Math.round((midi.start - first) * FRAMES_PER_SECOND)
    const off = Math.max(on + 1, 1 + Math.round((midi.start - first + midi.length) * FRAMES_PER_SECOND))
    const velocity = Math.max(1, Math.min(127, Math.round(midi.velocity * loudness)))
    if (drum) {
      const length = Math.max(drum.shortest, Math.min(drum.longest, off - on))
      wanted.push({ on, off: on + length, note: drum.note, sounding: drum.note, velocity, channel: drumChannel.get(drum.patch)!, patch: drum.patch, rank: 3, bass: false })
      continue
    }
    const patch = choice as number
    const [lowest, highest] = soundingRange(patch)
    let sounding = midi.note + shifts.get(midi.channel)!
    while (sounding < lowest) sounding += 12
    while (sounding > highest) sounding -= 12
    if (sounding !== midi.note) moved++
    const bass = patch === BASS_PATCH
    wanted.push({ on, off, note: sounding - nhl95Shift(patch, sounding), sounding, velocity, channel: gameChannel.get(midi.channel)!, patch, rank: bass ? 2 : 1, bass })
  }
  // In time order; at the same moment the stronger first, so that of a chord on one patch it is the one kept.
  wanted.sort((a, b) => a.on - b.on || (weaker(a, b) ? 1 : weaker(b, a) ? -1 : 0))
  let chords = 0
  let dropped = 0
  const played: Planned[] = []
  let active: Planned[] = []
  const cut = (note: Planned, at: number) => {
    note.off = at
    active = active.filter((other) => other !== note)
  }
  for (const note of wanted) {
    active = active.filter((other) => other.off > note.on)
    // One note at a time on an FM patch and on the noise: the line moving on cuts the note before it; of notes that
    // overlap the stronger is kept; a drum's new hit always sounds, but of two at once on one patch the higher (the
    // tom over the kick, as the game's own title music has them). On the square wave the same note again ends the one
    // before.
    const square = note.patch === SQUARE_PATCH
    const before = active.find((other) => other.patch === note.patch && (!square || other.note === note.note))
    if (before) {
      const overlap = before.on === note.on || before.off - note.on > LEGATO
      if (!square && note.rank < 3 && overlap) {
        chords++
        if (before.on === note.on || weaker(note, before)) continue
      }
      if (note.rank === 3 && before.on === note.on) continue
      cut(before, note.on)
    }
    // At most three square notes, and six FM patches sounding: the weakest gives way.
    const sharing = active.filter((other) => (square ? other.patch === SQUARE_PATCH : isFm(note.patch) && isFm(other.patch)))
    if (sharing.length >= (square ? SQUARE_VOICES : FM_VOICES)) {
      const weakest = sharing.reduce((w, o) => (weaker(o, w) ? o : w))
      if (square) chords++
      else dropped++
      if (!weaker(weakest, note)) continue
      cut(weakest, note.on)
    }
    played.push(note)
    active.push(note)
  }
  // A note cut where it began sounds nothing.
  let sounding = played.filter((p) => p.off > p.on)
  // The end: where the file ends or its last note does, its rest kept; the piece plays again from frame 1 there.
  const lastOff = sounding.reduce((most, p) => Math.max(most, p.off), 1)
  const lastOn = sounding.reduce((most, p) => Math.max(most, p.on), 1)
  let finish = Math.max(lastOff, lastOn + LOOP_LATE, 1 + Math.round((end - first) * FRAMES_PER_SECOND))
  // The commands each frame: the notes ending there and those beginning, and at frame 1 the loop point's $74 (and, as
  // the piece plays again, the notes ending at its end). Past MOST_COMMANDS the weakest new notes are left out,
  // forward through the piece; frame 1 is looked at again last, with what ends at the end then known.
  const ends = new Map<number, number>()
  for (const p of sounding) ends.set(p.off, (ends.get(p.off) ?? 0) + 1)
  const starts = new Map<number, Planned[]>()
  for (const p of sounding) starts.set(p.on, [...(starts.get(p.on) ?? []), p])
  // Where the notes ending at the end and those beginning the piece again are too many for a frame, the piece ends a
  // frame later.
  if ((ends.get(finish) ?? 0) + 1 + (starts.get(1)?.length ?? 0) > MOST_COMMANDS) finish++
  const left = new Set<Planned>()
  for (const frame of [...[...starts.keys()].sort((a, b) => a - b), 1]) {
    const now = (starts.get(frame) ?? []).filter((p) => !left.has(p))
    const extra = frame === 1 ? 1 + (ends.get(finish) ?? 0) : 0
    let over = (ends.get(frame) ?? 0) + now.length + extra - MOST_COMMANDS
    for (const p of [...now].sort((a, b) => (weaker(a, b) ? -1 : weaker(b, a) ? 1 : 0))) {
      if (over <= 0) break
      left.add(p)
      ends.set(p.off, ends.get(p.off)! - 1)
      dropped++
      over--
    }
  }
  sounding = sounding.filter((p) => !left.has(p))
  if (sounding.length === 0) throw new MidiError('None of the notes chosen can be played: choose an instrument for a part with notes.')
  const patchOf = new Map(sounding.map((p) => [p.channel, p.patch]))
  const stream: Nhl95Event[] = [...patchOf.keys()].sort((a, b) => a - b).map((channel) => ({ frame: 0, status: 0xc0 | channel, data: [patchOf.get(channel)!] }))
  const loopAt = stream.length
  stream.push({ frame: 1, status: 0xb0, data: [LOOP_START, 0] })
  for (const p of sounding) stream.push({ frame: p.on, status: 0x90 | p.channel, data: [p.note, p.velocity, p.off - p.on] })
  // In time order (a stable sort: the programs, then the loop point, then the notes as kept).
  stream.sort((a, b) => a.frame - b.frame)
  stream.push({ frame: finish - LOOP_LATE, status: 0xb0, data: [LOOP, 0] }, { frame: finish - LOOP_LATE, status: 0xff, data: [] })
  return { stream, loopAt, seconds: (finish - 1) / FRAMES_PER_SECOND, quieter: loudness < 1, leftOut, chords, dropped, moved }
}

// How many frames a piece takes to come round to its loop point ($74) again: to its $75, and in one NOSE4Web made
// (`made`) the LOOP_LATE frames after it. Null where it has no loop point and $75.
export function nhl95LoopFrames(stream: Nhl95Event[], made: boolean): number | null {
  const loop = stream.find((e) => e.status === 0xb0 && e.data[0] === LOOP_START)
  const jump = stream.find((e) => e.status === 0xb0 && e.data[0] === LOOP)
  return loop && jump ? jump.frame - loop.frame + (made ? LOOP_LATE : 0) : null
}

// The bytes of a piece made by nhl95MusicFromMidi: its stream, then NOSE4Web's mark with its name.
export function nhl95MusicBytes(made: Pick<MadeNhl95Music, 'stream' | 'loopAt'>, name: string): Uint8Array {
  const out = [...nhl95StreamBytes(made.stream, 0, made.loopAt), ...MARK]
  for (const c of name.slice(0, 40)) out.push(c.charCodeAt(0) < 0x7f && c.charCodeAt(0) >= 0x20 ? c.charCodeAt(0) : 0x3f)
  out.push(0)
  if (out.length > 0xffff) throw new SongError('The piece is too long for the game to hold: make it shorter, or with fewer notes.')
  return Uint8Array.from(out)
}

// The ROM with piece `number` of the other music (NHL95_GAME_MUSIC) replaced by a piece made by nhl95MusicFromMidi,
// named `name`, in NOSE4Web's own bank as the organ songs are.
export function withNhl95Music(rom: Uint8Array, number: number, made: Pick<MadeNhl95Music, 'stream' | 'loopAt'>, name: string): Uint8Array {
  if (!isNhl95GameMusic(number)) throw new SongError('That is not one of the pieces of game music.')
  const songs = ownSongs(rom)
  songs.set(number, nhl95MusicBytes(made, name))
  return withOwnSongs(rom, songs)
}

// The most a stream reaches of each of the driver's limits above, as it plays (and plays again): FM patches sounding
// at once, square notes, noise notes, notes waiting to end, and commands in a frame (after the first, the programs').
// A piece NOSE4Web made plays its loop point again LOOP_LATE frames after its $75.
export function nhl95MusicLimits(stream: Nhl95Event[]): { fm: number; square: number; noise: number; pending: number; commands: number } {
  const patch = new Map<number, number>()
  const notes: { on: number; off: number; patch: number }[] = []
  const commands = new Map<number, number>()
  const add = (frame: number) => commands.set(frame, (commands.get(frame) ?? 0) + 1)
  let loopFrame = -1
  let finish = -1
  for (const { frame, status, data } of stream) {
    const command = status & 0xf0
    if (command === 0xc0) patch.set(status & 0x0f, data[0])
    if (command === 0x90) notes.push({ on: frame, off: frame + data[2], patch: patch.get(status & 0x0f) ?? -1 })
    if (command === 0xb0 && data[0] === LOOP_START && loopFrame < 0) loopFrame = frame
    if (command === 0xb0 && data[0] === LOOP) finish = frame + LOOP_LATE
    if (command === 0x90 || command === 0xc0 || command === 0xe0 || (command === 0xb0 && data[0] !== LOOP)) add(frame)
  }
  for (const n of notes) add(n.off)
  // Playing again: what is sent at the loop point comes in the frame of the end, with the notes ending there.
  if (loopFrame >= 0 && finish >= 0) commands.set(finish, (commands.get(finish) ?? 0) + (commands.get(loopFrame) ?? 0))
  const most = (keep: (patch: number) => boolean, count: (sounding: typeof notes) => number) =>
    notes.reduce((top, n) => Math.max(top, count(notes.filter((o) => keep(o.patch) && o.on <= n.on && o.off > n.on))), 0)
  return {
    fm: most(isFm, (sounding) => new Set(sounding.map((o) => o.patch)).size),
    square: most((p) => p === SQUARE_PATCH, (sounding) => sounding.length),
    noise: most((p) => p === NOISE_PATCH, (sounding) => sounding.length),
    pending: most(() => true, (sounding) => sounding.length),
    commands: Math.max(0, ...[...commands].filter(([frame]) => frame > 0).map(([, count]) => count)),
  }
}
