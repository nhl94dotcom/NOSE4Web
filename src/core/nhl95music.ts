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
// song is marked after its end by 'N4W1' and its name. Without any, the lea
// is put back as it was, as an empty bank would have the search go through
// 65,536 items of whatever follows it.

import { claimSpace95, fullRomReason, releaseSpace } from './space'
import { DRUMS, FRAMES_PER_SECOND, isSampled, MidiError, NHL95_DRUM_PATCH, NOISE_HAT, ORGAN, planOrganNotes, SongError, type MadeSong, type MidiNote, type Song, type SongEvent } from './genesismusic'

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
      const own = bankItems(rom, list + 16, NHL95_SONG_NUMBERS.length)
      const ids = new Set(own?.map((item) => item.id))
      if (own && ids.size === own.length && own.every((item) => item.type === SONG && isNhl95Song(item.id))) {
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

// The bytes of a stream with no loop points, its status written only where it changes, as the game's songs have it.
export function nhl95StreamBytes(events: Nhl95Event[], firstWait = 0): Uint8Array {
  const out: number[] = [0, 0]
  let frame = 0
  let status = -1
  events.forEach((event, i) => {
    const waited = i === 0 ? firstWait : event.frame - frame
    const length = (event.status & 0xf0) === 0x90 ? event.data[2] : 0
    if (waited < 0 || waited > LONGEST || length > LONGEST) throw new SongError('The song has a note or a pause longer than the game can hold (4 minutes and 33 seconds).')
    frame = event.frame
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
// `asWritten` is the patches whose notes are kept as written (a drum played at notes as low as 0).
function songEvents(stream: Nhl95Stream, velocity = 3, patch = (value: number) => (value === ORGAN_PATCH ? ORGAN : value === CLAPS_PATCH ? 0x60 : value), asWritten = new Set<number>()): SongEvent[] {
  const events: SongEvent[] = []
  const sounding = new Map<number, SongEvent>()
  const patches = new Map<number, number>()
  for (const { frame, status, data } of stream.events) {
    const command = status & 0xf0
    const channel = status & 0x0f
    if (command === 0xc0) patches.set(channel, data[0])
    if (command === 0x90) {
      const note = asWritten.has(patches.get(channel) ?? -1) ? data[0] : Math.max(0, data[0] - PITCH)
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
    let custom: Song['custom'] = null
    const own = findBanks(rom)?.own?.items.some((i) => i.id === number && i.at === item.at)
    if (own && stream.used >= 0 && MARK.every((byte, i) => data[stream.used + i] === byte)) {
      let name = ''
      for (let at = stream.used + MARK.length; at < data.length && data[at] !== 0 && name.length < 64; at++) name += String.fromCharCode(data[at])
      custom = { name, replaced: number }
    }
    song = { number, events: songEvents(stream), seconds: end / FRAMES_PER_SECOND, loops: stream.loops.length > 0, custom }
  }
  cache.set(number, song)
  return song
}

// NHL '95's other music: songs 0 to 3 of the bank, which sound95.asm's `song` sends to StartSong (the organ songs
// and the sound effects' streams are other ids): 0 on the title screen and the credits (title95.asm) and the main
// menu (hockey95.asm's Opening2), 2 at the end of a period (PeriodOver_sp), 3 on the scouting report (scout95.asm),
// the playoff screen and the Stanley Cup screen; 1 is played by nothing. They play on the front end's FM patches and
// two of the sound chip's square-wave voices: patch $13 is its noise, the hi-hats.
export const NHL95_GAME_MUSIC: { number: number; name: string; where: string }[] = [
  { number: 0, name: 'Title music', where: 'The title screen, the credits and the main menu' },
  { number: 2, name: 'End of period music', where: 'Between periods' },
  { number: 3, name: 'Scouting report music', where: 'The scouting report, the playoff screen and the Stanley Cup screen' },
]
const NOISE_PATCH = 0x13

// One of those pieces as NHL 94's events (as readNhl95Song gives the organ songs), its velocities as they are, its
// noise patch as the hi-hats (NOISE_HAT) and its drum patch's notes as written (NHL95_DRUM_PATCH). Played and exported
// as NHL '95's (gameMusicTune and gameMusicToMidi with 95), not on NHL 94's patches.
export function readNhl95Music(rom: Uint8Array, number: number): Song | null {
  if (!NHL95_GAME_MUSIC.some((piece) => piece.number === number)) return null
  const item = findBankItem(rom, SONG, number)
  if (!item) return null
  const stream = readNhl95Stream(rom.subarray(item.at, item.at + item.size))
  if (stream.used < 0) return null
  const end = stream.events.length ? stream.events[stream.events.length - 1].frame : 0
  const events = songEvents(stream, 1, (value) => (value === NOISE_PATCH ? NOISE_HAT : value), new Set([NHL95_DRUM_PATCH]))
  return { number, events, seconds: end / FRAMES_PER_SECOND, loops: true, custom: null }
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

// The ROM with song `number` back as the game had it.
export function withOriginalNhl95Song(rom: Uint8Array, number: number): Uint8Array {
  const songs = ownSongs(rom)
  if (!songs.has(number)) return rom
  songs.delete(number)
  return withOwnSongs(rom, songs)
}

// A song NOSE4Web made, as its bytes, for a project file; null for the game's own.
export function nhl95CustomSongBytes(rom: Uint8Array, number: number): Uint8Array | null {
  return readNhl95Song(rom, number)?.custom ? (ownSongs(rom).get(number) ?? null) : null
}

// The ROM with song `number` replaced by a song's bytes from a project file.
export function withNhl95SongBytes(rom: Uint8Array, number: number, bytes: Uint8Array): Uint8Array {
  if (!isNhl95Song(number)) throw new SongError('This ROM has no place for the song.')
  const stream = readNhl95Stream(bytes)
  if (stream.used < 0 || !MARK.every((byte, i) => bytes[stream.used + i] === byte)) throw new SongError('The song is not one NOSE4Web made.')
  const songs = ownSongs(rom)
  songs.set(number, bytes.slice())
  return withOwnSongs(rom, songs)
}
