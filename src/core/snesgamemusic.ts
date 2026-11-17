// The SNES game's title, menu and playoff music replaced by MIDI files (the
// SNES disassembly's routines/sound: MusicStart, StepTrack, ReadTrackEvent,
// StartSoundVoice, FindFreeVoice; and the routines that start the pieces).
//
// Where the pieces are started: each place loads the piece's long pointer and
// calls MusicStart (lda #bank / sta p0+2 / lda #address / sta p0 / jsl
// MusicStart): the title music once (TitleScreen), the menu music four times
// (Opening, PeriodOver, ReplayMode, SaveRegsStartHL2) and the playoff music
// four times (the same but Opening, and PlayoffScreen). Two of those first ask
// whether the piece is playing already, by the low word of the song playing
// (MusicStart keeps it in SongPtr): Opening (lda SongPtr / cmp #$C20C / beq)
// and PlayoffScreen (cmp #$ED31), so that the piece carries on rather than
// starting again. A new piece is written in free room within one bank, and
// those places and those questions are pointed at it.
//
// A piece's notes and voices: a note's code is its MIDI number; a track's
// instrument is set by $DC (an entry of the instrument table, MenuSfxTable for
// these pieces); track 9 is the drums, whose every note picks its own entry
// (note - $2F) and plays it at one pitch (StepTrack, StartSoundVoice). A note
// takes a voice by FindFreeVoice: a free one of the voices its instrument may
// use (the entry's byte 0, a bit a voice), else one of those taken, cut off;
// the entries the music uses all have priority 0, so a note always cuts
// another rather than being left out. Most entries may use one voice only, and
// these pieces' instruments share the console's 8 voices between them, the
// drums included (the drums on voices 6 and 7, the bass on 5, the brass on 2
// to 4, and so on). So a new piece plays each note on an entry of one voice
// only, with every voice holding one note at a time, and where a note finds
// none of its instrument's voices free, the weakest is left out: the drums
// first kept, then the bass, then the higher notes, as NHL 94's Genesis game
// music does (genesismusic.ts).
//
// A piece's own MIDI file put back keeps each track on the entry its name gives (EA's names carry them, as
// 'chug  (L) #50'), so on its own side: the playoff music's width is its pairs of entries, one on each side (chug 50
// and 51, apower 48 and 49, bsec 45 and 46). It keeps the file's velocities and track volumes too.
//
// The organ: the playoff music plays its organ line twice, on entry 31 (which
// may take voices 0 to 2, in the middle) and a tick later on entry 47 (voice 0
// only, on the right): 102 notes each, which together sound in the middle. A
// part on the organ is written so too, its notes on the single-voice entry and
// a tick earlier on the other, each planned on a voice of its own; the earlier
// note only where a voice of its entry is free, and the first given up for
// another part's note.
//
// A track ends with $DB, which goes back to the track's loop start ($E2 sets
// it; MusicStart makes it the track's start), then $D9 (the stop, never
// reached), as the game's own pieces do. Every track of a new piece is as long
// as the others, so they stay together each time round. The menu and playoff
// music set their loop start a little after their start ($E2 at tick 96): a
// MIDI file's loop marker (snesmusic.ts: MIDI_LOOP_MARKER, which their own MIDI
// files have) does so in a new piece. And a new piece has the tempo byte of the
// piece it replaces (TempoTick = $2760 / tempo: a tick a frame for the title
// music's 156, 64 ticks in 65 frames for the menu's 155 and the playoff's 154),
// its notes put on its ticks from the file's seconds, so that a piece's own MIDI
// file put back has the piece's own ticks and length to the frame.

import type { RomProject } from './rom'
import { findCodeAll, grownSnesRom, loRomAddress, loRomBank, loRomOffset, SNES_GROWN_SIZE } from './snes'
import { findSnesSound, readSnesInstrument, snesNotePitch, type SnesInstrument, type SnesSoundSetName } from './snesaudio'
import { MIDI_LOOP_MARKER, SNES_GAME_MUSIC, snesTicksPerSecond } from './snesmusic'
import { freeSpace, keptBanks } from './snespictures'
import { DRUMS, FRAMES_PER_SECOND, MidiError, type MidiNote, type MusicPart } from './genesismusic'

const MARK = 'N4W1'
// A tick a frame: TempoTick = $2760 / 157 = $40, which TempoAcc gains each frame (where no piece's own is to be had).
const TEMPO = 157
const DRUM_TRACK = 9
// Tracks 0 to 15 are the music's (track 16 is the sound effects').
const MOST_TRACKS = 16
const VOICES = 8
const LOOP_START = 0xe2
const LOOP_END = 0xdb
const STOP = 0xd9
const INSTRUMENT = 0xdc
const CONTROLLER = 0xdf
const TEXT = 0xe7
// The track volume (controller 7) and velocities where the game's pieces give none to go by.
const TRACK_VOLUME = 97
const VELOCITY = 60
// The most frames a drum's voice is held for it (a hit rings on as it is let go).
const DRUM_LENGTH = [3, 30]
// The entries of the instrument table the music uses (52 to 55 are the menus' sound effects).
const MUSIC_ENTRIES = 52
// Ticks after its last note that a voice is kept for the part that played it, where another part has a voice of its own free.
const RESERVED = 2 * FRAMES_PER_SECOND
// The weight of an organ note's earlier copy (on the other organ entry): below every note of a part.
const DOUBLED_RANK = 0.5

const offsetOf = (pointer: number) => loRomOffset((pointer >>> 16) & 0xff, pointer & 0xffff)
const signed8 = (value: number) => ((value & 0xff) ^ 0x80) - 0x80
const singleVoice = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0
const voiceOf = (mask: number) => 31 - Math.clz32(mask)

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

// ------------------------------------------------- the pieces' tracks

interface TrackNote {
  tick: number
  code: number
  velocity: number
  length: number
  // The instrument entry it plays on.
  entry: number
}
interface ReadTrack {
  texts: string[]
  notes: TrackNote[]
  volumes: number[]
  // Where the track ends (its first $D9 or $DA), as an offset in the ROM.
  end: number
}

// The tracks of the song at ROM offset `at`, as written (once through).
function readTracks(rom: Uint8Array, at: number): ReadTrack[] | null {
  if (at < 0 || at + 10 > rom.length || rom[at] !== 1) return null
  const count = rom[at + 6]
  if (count < 1 || count > 17) return null
  const tracks: ReadTrack[] = []
  for (let t = 0; t < count; t++) {
    const offset = rom[at + 8 + 2 * t] | (rom[at + 9 + 2 * t] << 8)
    if (!offset) return null
    const p = { at: at + offset }
    const track: ReadTrack = { texts: [], notes: [], volumes: [], end: p.at }
    let tick = 0
    let entry = -1
    for (let i = 0; i < 20000 && p.at < rom.length; i++) {
      tick += readVarLen(rom, p)
      const code = rom[p.at++]
      if (code < 0xd9) {
        const velocity = rom[p.at++]
        const length = readVarLen(rom, p)
        track.notes.push({ tick, code, velocity, length, entry: t === DRUM_TRACK ? (code - 0x2f) & 0xff : entry })
      } else if (code === STOP || code === 0xda) break
      else if (code === TEXT) {
        const length = rom[p.at]
        track.texts.push(String.fromCharCode(...rom.subarray(p.at + 1, p.at + 1 + length)))
        p.at += length + 1
      } else if (code === CONTROLLER || code === 0xe5) {
        if (code === CONTROLLER && rom[p.at] === 7) track.volumes.push(rom[p.at + 1])
        p.at += 2
      } else if (code === INSTRUMENT) entry = rom[p.at++] === 0x6a ? 0x14 : rom[p.at - 1]
      else if (code === 0xdd || code === 0xde || code === LOOP_START || code === 0xea) p.at += 1
    }
    track.end = p.at
    tracks.push(track)
  }
  return tracks
}

// The text NOSE4Web leaves in its pieces' first track: its mark, the piece's own pointer and the new one's name.
function markOf(rom: Uint8Array, pointer: number): { replaced: number; name: string } | null {
  const tracks = readTracks(rom, offsetOf(pointer))
  const text = tracks?.[0].texts.find((t) => t.startsWith(MARK))
  return text ? { replaced: parseInt(text.slice(4, 12), 16) >>> 0, name: text.slice(13).replace(/\0+$/, '') } : null
}

// ------------------------------------------------- where the pieces are started

// lda #bank / sta p0+2 / lda #address / sta p0 / jsl MusicStart.
const START = 'a9 (..) 00 85 (..) a9 (....) 85 (..) 22 (....) (..)'
// MusicStart: rep #$20 / lda p0 / sta SongPtr / ldx #0 / ldy #8.
const SONG_POINTER = 'c2 20 a5 .. 8d (....) a2 00 a0 08'
// The places that start each piece, and that ask whether it is playing, in every SNES ROM the editor knows.
const STARTS = [1, 4, 4]
const ASKS = [0, 1, 1]

export interface SnesMusicPlaces {
  // The piece's long pointer now.
  pointer: number
  // The ROM offsets of the instructions that start it (lda #bank), and of the compares' operands.
  starts: number[]
  asks: number[]
}

const placesCache = new WeakMap<Uint8Array, (SnesMusicPlaces | null)[]>()

// Where each of SNES_GAME_MUSIC's pieces is started, and asked about, in this ROM: null for a piece whose places
// are not all found as the game has them (it cannot be replaced there).
export function snesMusicPlaces(rom: Uint8Array): (SnesMusicPlaces | null)[] {
  const kept = placesCache.get(rom)
  if (kept) return kept
  const found = locatePlaces(rom)
  placesCache.set(rom, found)
  return found
}

function locatePlaces(rom: Uint8Array): (SnesMusicPlaces | null)[] {
  const none = SNES_GAME_MUSIC.map(() => null)
  const songPointer = findCodeAll(rom, SONG_POINTER)
  if (songPointer.length !== 1) return none
  const matches = findCodeAll(rom, START).filter(({ groups: [, high, , low] }) => high === low + 2)
  const original = SNES_GAME_MUSIC.map((piece) => piece.pointer >>> 0)
  const pieceOf = new Map<number, number>()
  const which = (pointer: number) => {
    if (!pieceOf.has(pointer)) {
      const own = original.indexOf(pointer)
      const mark = own >= 0 ? null : markOf(rom, pointer)
      pieceOf.set(pointer, own >= 0 ? own : mark ? original.indexOf(mark.replaced) : -1)
    }
    return pieceOf.get(pointer)!
  }
  const starts = matches.map(({ at, groups: [bank, , address, , call, callBank] }) => ({ at, pointer: (((bank & 0xff) << 16) | address) >>> 0, call: (callBank << 16) | call }))
  // Every piece's places call one routine, MusicStart.
  const calls = new Set(starts.filter((s) => which(s.pointer) >= 0).map((s) => s.call))
  if (calls.size !== 1) return none
  return SNES_GAME_MUSIC.map((_, i) => {
    const own = starts.filter((s) => which(s.pointer) === i && calls.has(s.call))
    if (own.length !== STARTS[i] || new Set(own.map((s) => s.pointer)).size !== 1) return null
    const pointer = own[0].pointer
    const songPtr = songPointer[0].groups[0]
    const low = pointer & 0xffff
    const asks = findCodeAll(rom, `ad ${hex(songPtr & 0xff)} ${hex(songPtr >> 8)} c9 ${hex(low & 0xff)} ${hex(low >> 8)} f0`).map((m) => m.at + 4)
    if (asks.length !== ASKS[i]) return null
    return { pointer, starts: own.map((s) => s.at), asks }
  })
}
const hex = (value: number) => value.toString(16).padStart(2, '0')

// The pointer each piece plays from now (its own where its places are not found).
export const snesMusicPointer = (rom: Uint8Array, index: number) => snesMusicPlaces(rom)[index]?.pointer ?? SNES_GAME_MUSIC[index].pointer >>> 0

// The name of the piece NOSE4Web put in place of piece `index`, or null for the game's own.
export function snesCustomMusicName(rom: Uint8Array, index: number): string | null {
  const places = snesMusicPlaces(rom)[index]
  if (!places || places.pointer === SNES_GAME_MUSIC[index].pointer >>> 0) return null
  return markOf(rom, places.pointer)?.name ?? null
}

// ------------------------------------------------- the instruments

// The samples of each set, named from the disassembly's TitleSampleList and MenuSampleList (sample 13 of the title
// set is the in-game hard shot's sound, which the title music's dist tracks play as their guitar).
const SAMPLE_NAMES: Record<'title' | 'menu', string[]> = {
  title: ['Kick drum', 'Bass', 'Snare drum', 'Crash played backwards', 'Closed hi-hat', 'Tom', 'Open hi-hat', 'Crash cymbal', 'Brass', 'Chugging guitar', 'Orchestra hit', 'Cowbell', 'Timpani', 'Distorted guitar', 'Skate stop'],
  menu: ['Kick drum', 'Bass', 'Snare drum', 'Crash played backwards', 'Closed hi-hat', 'Tom', 'Open hi-hat', 'Crash cymbal', 'Brass', 'Chugging guitar', 'Orchestra hit', 'Cowbell', 'Timpani', 'Distorted guitar', 'Organ', 'Power guitar'],
}
// The drum kit's samples, which play on the drum channel only; and the title set's skate stop, no instrument.
const DRUM_SAMPLES = [0, 2, 4, 5, 6]
const NOT_INSTRUMENTS: Record<'title' | 'menu', number[]> = { title: [...DRUM_SAMPLES, 14], menu: DRUM_SAMPLES }
// EA's track names for each sample, so that a piece's own MIDI file (its tracks named so) goes back on them.
const SAMPLE_BY_NAME: [RegExp, number][] = [
  [/bass/i, 1],
  [/horn|bsec|brass/i, 8],
  [/orgn|organ/i, 14],
  [/apower|power/i, 15],
  [/dist/i, 13],
  [/chug/i, 9],
  [/orch/i, 10],
  [/timp/i, 12],
  [/cow/i, 11],
  [/crshbkwd|backw/i, 3],
  [/crash|crsh/i, 7],
]
const BASS = 1
const BRASS = 8
const ORGAN = 14

export interface SnesMusicInstrument {
  sample: number
  name: string
  // The table entries it plays on, one voice each, by voice.
  entries: Map<number, number>
  // Every entry of one voice of its sample, in table order, with its voice and left and right volumes: a part may be
  // put on one of them (a piece's own MIDI file names its tracks' entries, each its own side).
  sides: SnesMusicEntry[]
  // Its range of notes (codes) the game's own pieces give it, widened by an octave each way within the pitch table.
  lowest: number
  highest: number
  // The game's own pieces' typical velocity and track volume for it.
  velocity: number
  volume: number
  // The organ's other entry, of more voices (the voices it may take but the instrument's own), each note played on it
  // a tick before the instrument's own, as the playoff music plays its organ line.
  doubled: { entry: number; voices: number[] } | null
}

export interface SnesMusicEntry {
  entry: number
  voice: number
  left: number
  right: number
}

// Which side an entry plays on, by its left and right volumes.
export const snesEntrySide = (entry: { left: number; right: number }): 'left' | 'right' | 'centre' =>
  Math.abs(entry.left - entry.right) < 0.2 * Math.max(entry.left, entry.right, 1) ? 'centre' : entry.left > entry.right ? 'left' : 'right'

export interface SnesMusicKit {
  set: 'title' | 'menu'
  instruments: SnesMusicInstrument[]
  // General MIDI drum notes to the drum track's notes (codes), and each such note's voice and weight.
  drums: Map<number, number>
  drumVoice: Map<number, number>
  drumRank: Map<number, number>
  drumVelocity: number
}

// The drum track's notes for MIDI's drums (General MIDI note: code), and the sample each must play; a code whose
// entry plays another sample in a ROM is not used there.
const GM_DRUMS: [number[], number][] = [
  [[35, 36], 48], // kick
  [[37, 38, 39, 40], 50], // snare (side stick, clap)
  [[42, 69, 70, 54, 75, 76, 77, 82], 54], // closed hi-hat (cabasa, maracas, tambourine, claves, wood blocks, shaker)
  [[44], 52], // pedal hi-hat: the closed one on the kick's voice
  [[46], 56], // open hi-hat
  [[51, 53, 59], 58], // ride: the other open hi-hat
  [[41, 64], 53], // toms, low to high (low congas)
  [[43, 62, 63, 66], 55],
  [[45, 61], 57],
  [[47, 60, 65], 59],
  [[48, 50], 60],
  [[49, 55, 57, 52], 62], // crash (splash, Chinese): the crash on one voice
  [[56, 67, 68], 68], // cowbell (agogo)
]
const DRUM_SAMPLE_OF: Record<number, number> = { 48: 0, 50: 2, 51: 3, 52: 4, 53: 5, 54: 4, 55: 5, 56: 6, 57: 5, 58: 6, 59: 5, 60: 5, 61: 7, 62: 7, 68: 11 }
// Which drum is kept where two want one voice at once: the kick, the snare, the cymbals, the cowbell, the toms, the hi-hats.
const DRUM_WEIGHT: Record<number, number> = { 0: 0.5, 2: 0.4, 7: 0.3, 3: 0.3, 11: 0.25, 5: 0.2, 4: 0.1, 6: 0.1 }

const kitCache = new WeakMap<Uint8Array, Map<string, SnesMusicKit | null>>()

// The instruments a new piece may play on with sample set `set`, as this ROM has them; null where its sound is not found.
export function snesMusicKit(rom: Uint8Array, set: SnesSoundSetName): SnesMusicKit | null {
  if (set === 'game') return null
  const kept = kitCache.get(rom) ?? new Map<string, SnesMusicKit | null>()
  kitCache.set(rom, kept)
  if (!kept.has(set)) kept.set(set, makeKit(rom, set))
  return kept.get(set)!
}

function makeKit(rom: Uint8Array, set: 'title' | 'menu'): SnesMusicKit | null {
  const sound = findSnesSound(rom)
  if (!sound) return null
  const { table, samples } = sound.sets[set]
  const entries: SnesInstrument[] = Array.from({ length: MUSIC_ENTRIES }, (_, i) => readSnesInstrument(rom, table, i))
  // What the game's own pieces play on each sample: their notes' velocities and codes, and their tracks' volumes.
  const heard = new Map<number, { velocities: number[]; codes: number[]; volumes: number[] }>()
  const drumVelocities: number[] = []
  // (The pieces share one instrument table, so the samples are numbered alike in both sets.)
  for (const piece of SNES_GAME_MUSIC) {
    const tracks = readTracks(rom, offsetOf(piece.pointer))
    tracks?.forEach((track, t) => {
      for (const note of track.notes) {
        if (t === DRUM_TRACK) {
          drumVelocities.push(note.velocity)
          continue
        }
        if (note.entry < 0) continue
        const sample = readSnesInstrument(rom, table, note.entry).sample
        const h = heard.get(sample) ?? { velocities: [], codes: [], volumes: [] }
        h.velocities.push(note.velocity)
        h.codes.push(note.code)
        h.volumes.push(...track.volumes)
        heard.set(sample, h)
      }
    })
  }
  const median = (values: number[], otherwise: number) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : otherwise)
  const instruments: SnesMusicInstrument[] = []
  for (let sample = 0; sample < samples.length && sample < SAMPLE_NAMES[set].length; sample++) {
    if (NOT_INSTRUMENTS[set].includes(sample)) continue
    // Each voice's entry: of those on it alone, the one most in the middle (and loudest).
    const byVoice = new Map<number, number>()
    entries.forEach((entry, i) => {
      if (entry.sample !== sample || !singleVoice(entry.voices)) return
      const voice = voiceOf(entry.voices)
      const best = byVoice.get(voice)
      if (best === undefined || Math.min(entry.left, entry.right) > Math.min(entries[best].left, entries[best].right)) byVoice.set(voice, i)
    })
    if (!byVoice.size) continue
    const sides: SnesMusicEntry[] = []
    entries.forEach((entry, i) => entry.sample === sample && singleVoice(entry.voices) && sides.push({ entry: i, voice: voiceOf(entry.voices), left: entry.left, right: entry.right }))
    // The notes every entry of it can play: within the pitch table, at a pitch the DSP takes.
    const playable = (code: number) =>
      sides.every(({ entry: i }) => {
        const index = code + signed8(entries[i].transpose)
        return index >= 0 && index <= 127 && ((snesNotePitch(rom, sound, index) + entries[i].tuning) & 0xffff) <= 0x3fff
      })
    const h = heard.get(sample)
    let lowest = h ? Math.min(...h.codes) - 12 : 36
    let highest = h ? Math.max(...h.codes) + 12 : 96
    lowest = Math.max(lowest, 0)
    highest = Math.min(highest, 127)
    while (lowest <= highest && !playable(lowest)) lowest++
    while (highest >= lowest && !playable(highest)) highest--
    if (highest - lowest < 12) continue
    // The organ's entry of more voices (the playoff music's 31, voices 0 to 2) that its pieces play: the one most in the middle.
    let doubled: SnesMusicInstrument['doubled'] = null
    if (sample === ORGAN) {
      const own = [...byVoice.keys()]
      const playedEntries = new Set(SNES_GAME_MUSIC.flatMap((piece) => readTracks(rom, offsetOf(piece.pointer))?.flatMap((track) => track.notes.map((n) => n.entry)) ?? []))
      entries.forEach((entry, i) => {
        if (entry.sample !== sample || singleVoice(entry.voices) || !playedEntries.has(i)) return
        const voices = Array.from({ length: VOICES }, (_, v) => v).filter((v) => entry.voices & (1 << v) && !own.includes(v))
        const middle = (e: SnesInstrument) => Math.min(e.left, e.right)
        if (voices.length && (!doubled || middle(entry) > middle(entries[doubled.entry]))) doubled = { entry: i, voices }
      })
    }
    instruments.push({ sample, name: SAMPLE_NAMES[set][sample], entries: byVoice, sides, lowest, highest, velocity: median(h?.velocities ?? [], VELOCITY), volume: median(h?.volumes ?? [], TRACK_VOLUME), doubled })
  }
  const drums = new Map<number, number>()
  const drumVoice = new Map<number, number>()
  const drumRank = new Map<number, number>()
  for (const [notes, code] of GM_DRUMS) {
    const entry = entries[code - 0x2f]
    if (!entry || entry.sample !== DRUM_SAMPLE_OF[code] || !singleVoice(entry.voices)) continue
    for (const note of notes) drums.set(note, code)
    drumVoice.set(code, voiceOf(entry.voices))
    drumRank.set(code, 3 + (DRUM_WEIGHT[entry.sample] ?? 0))
  }
  return { set, instruments, drums, drumVoice, drumRank, drumVelocity: median(drumVelocities, VELOCITY) }
}

// ------------------------------------------------- choices

// What a MIDI part is played on: an instrument (its sample number), one entry of an instrument (its side: one of its
// `sides`), the drums (MIDI's drum channel only), or left out.
export type SnesPartChoice = number | { sample: number; entry: number } | 'drums' | 'out'

// The instrument (sample) of a choice, if any.
export const snesChoiceSample = (choice: SnesPartChoice | undefined) => (typeof choice === 'number' ? choice : typeof choice === 'object' ? choice.sample : undefined)

// The entry a track name gives (EA's names carry their entries, as 'chug  (L) #50'; the first where there are more),
// if it is an entry of one voice of an instrument of the kit that has more than one.
function namedEntry(kit: SnesMusicKit, name: string): { sample: number; entry: number } | undefined {
  const found = /#\s*(\d+)/.exec(name)
  if (!found) return undefined
  const entry = Number(found[1])
  const instrument = kit.instruments.find((i) => i.sides.length > 1 && i.sides.some((side) => side.entry === entry))
  return instrument && { sample: instrument.sample, entry }
}

// The first track name each channel's notes are in, in a format 1 file (a piece's own MIDI file names its tracks as
// the game names its parts).
export const midiPartNames = (bytes: Uint8Array): Map<number, string> => midiTracks(bytes).names

// Each channel's first volume (controller 7).
export const midiPartVolumes = (bytes: Uint8Array): Map<number, number> => midiTracks(bytes).volumes

function midiTracks(bytes: Uint8Array): { names: Map<number, string>; volumes: Map<number, number> } {
  const names = new Map<number, string>()
  const volumes = new Map<number, number>()
  const u32 = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd') return { names, volumes }
  let at = 8 + u32(4)
  while (at + 8 <= bytes.length && String.fromCharCode(...bytes.subarray(at, at + 4)) === 'MTrk') {
    const end = Math.min(bytes.length, at + 8 + u32(at + 4))
    let p = at + 8
    let name = ''
    let running = 0
    const channels = new Set<number>()
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
      vlq()
      let status = bytes[p]
      if (status & 0x80) p++
      else status = running
      if (status === 0xff) {
        const type = bytes[p++]
        const length = vlq()
        if (type === 0x03 && !name) name = String.fromCharCode(...bytes.subarray(p, p + length)).replace(/[^\x20-\x7e]/g, '').trim()
        p += length
        continue
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq()
        continue
      }
      running = status
      const command = status & 0xf0
      if (command === 0x90) channels.add(status & 0x0f)
      if (command === 0xb0 && bytes[p] === 7 && !volumes.has(status & 0x0f)) volumes.set(status & 0x0f, bytes[p + 1] & 0x7f)
      p += command === 0xc0 || command === 0xd0 ? 1 : 2
    }
    if (name && channels.size === 1) {
      const channel = [...channels][0]
      if (!names.has(channel)) names.set(channel, name)
    }
    at = end
  }
  return { names, volumes }
}

// The instrument (sample) a General MIDI program is first put on, by family, where the kit has it.
function sampleForProgram(program: number, has: (sample: number) => boolean): number | undefined {
  const organ = has(ORGAN) ? ORGAN : BRASS
  if (program >= 32 && program <= 39) return BASS
  if (program === 55) return 10 // orchestra hit
  if (program === 47) return 12 // timpani
  if (program >= 29 && program <= 31) return 13 // overdriven and distortion guitars
  if (program >= 24 && program <= 28) return 9 // other guitars
  if (program >= 56 && program <= 63) return BRASS
  if (program >= 16 && program <= 23) return organ
  if (program >= 80 && program <= 87) return 13 // synth leads
  if ((program >= 40 && program <= 54) || (program >= 64 && program <= 79)) return BRASS // strings, ensembles, reeds, pipes
  if (program <= 15 || (program >= 88 && program <= 95)) return organ // pianos, mallets, pads
  return undefined
}

// The first choice for each part: the drum channel as drums; a part named as the game names its parts (a piece's own
// MIDI file) on the entry its name gives (so on its own side), else on that instrument; one with a General MIDI
// instrument on the nearest; of the others, the lowest on the bass where it is low and not the only one, the rest on
// the brass, guitar and organ by turns.
export function defaultSnesPartChoices(kit: SnesMusicKit, parts: MusicPart[], programs = new Map<number, number>(), names = new Map<number, string>()): Map<number, SnesPartChoice> {
  const has = (sample: number) => kit.instruments.some((i) => i.sample === sample)
  const choices = new Map<number, SnesPartChoice>()
  for (const part of parts) {
    if (part.channel === DRUMS) {
      choices.set(part.channel, 'drums')
      continue
    }
    const entry = namedEntry(kit, names.get(part.channel) ?? '')
    if (entry) {
      choices.set(part.channel, entry)
      continue
    }
    const named = SAMPLE_BY_NAME.find(([pattern]) => pattern.test(names.get(part.channel) ?? ''))?.[1]
    const sample = named !== undefined && has(named) ? named : programs.has(part.channel) ? sampleForProgram(programs.get(part.channel)!, has) : undefined
    if (sample !== undefined && has(sample)) choices.set(part.channel, sample)
  }
  const tunes = parts.filter((part) => !choices.has(part.channel)).sort((a, b) => a.average - b.average)
  if (tunes.length > 1 && tunes[0].average < 55 && has(BASS) && ![...choices.values()].some((choice) => snesChoiceSample(choice) === BASS)) choices.set(tunes.shift()!.channel, BASS)
  const turns = [BRASS, 13, ORGAN, 9].filter(has)
  tunes.reverse().forEach((part, i) => choices.set(part.channel, turns.length ? turns[i % turns.length] : 'out'))
  return choices
}

// ------------------------------------------------- the new piece

export interface SnesMadeMusic {
  // The piece's tracks, track 9 the drums' (empty tracks where there are fewer parts), and the voice each was planned
  // on (-1 for the drums' and the empty ones).
  tracks: { name: string; entry: number; volume: number; voice: number; notes: { tick: number; code: number; velocity: number; length: number }[] }[]
  // Its tempo byte, its length in ticks (the rest at the file's end kept), and the tick it plays again from.
  tempo: number
  ticks: number
  loop: number
  seconds: number
  // Notes left out with their part, past the voices (left out or cut short), and moved by octaves into range.
  leftOut: number
  dropped: number
  moved: number
  // Notes of parts put on one entry played on another entry of the instrument, where its voice was taken.
  otherEntry: number
}

// A piece from MIDI notes: each part on the instrument chosen for it, its notes moved by whole octaves into the
// instrument's range (a part's line keeping its shape; only a part too wide has notes moved one by one), as loud as
// the game's own parts on that instrument; MIDI's drums on the game's drum kit; every voice one note at a time
// (where an instrument's voices are all taken, the drums, then the bass, then the higher notes are kept). The piece
// keeps the file's timing, a rest at its start and, to `end` (where the file ends: readMidi), at its end; it plays at
// `timing.tempo` (the tempo byte of the piece it replaces: snesMusicTempo) and again from `timing.loop` (seconds:
// midiLoopStart). A piece's own MIDI file (`ownVolumes`: snesOwnVolumes) keeps its velocities, and its parts' track
// volumes.
export function snesMusicFromMidi(kit: SnesMusicKit, notes: MidiNote[], choices: Map<number, SnesPartChoice>, end = 0, timing: { tempo?: number; loop?: number } = {}, ownVolumes: Map<number, number> | null = null): SnesMadeMusic {
  const tempo = timing.tempo ?? TEMPO
  const perSecond = snesTicksPerSecond(tempo)
  const instrumentOf = (channel: number) => {
    const choice = choices.get(channel)
    const sample = snesChoiceSample(choice)
    return sample === undefined ? undefined : kit.instruments.find((i) => i.sample === sample)
  }
  // The entry a part is put on (one of its instrument's sides), if any.
  const pinnedOf = (channel: number) => {
    const choice = choices.get(channel)
    return typeof choice === 'object' ? instrumentOf(channel)?.sides.find((side) => side.entry === choice.entry) : undefined
  }
  const tuneChannels = [...new Set(notes.map((n) => n.channel))].filter((channel) => instrumentOf(channel)).sort((a, b) => a - b)
  const drumsOn = choices.get(DRUMS) === 'drums'
  if (tuneChannels.length === 0 && !(drumsOn && notes.some((n) => n.channel === DRUMS && kit.drums.has(n.note)))) {
    throw new MidiError('Choose an instrument for at least one part.')
  }
  // Each part's octaves, and its loudness: its middle velocity made the game's for its instrument (a piece's own file's
  // as they are).
  const shifts = new Map<number, number>()
  const loudness = new Map<number, number>()
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] || 1
  for (const channel of [...tuneChannels, ...(drumsOn ? [DRUMS] : [])]) {
    const own = notes.filter((n) => n.channel === channel)
    if (!own.length) continue
    const instrument = instrumentOf(channel)
    loudness.set(channel, ownVolumes ? 1 : (instrument ? instrument.velocity : kit.drumVelocity) / median(own.map((n) => n.velocity)))
    if (!instrument) continue
    const pitches = own.map((n) => n.note)
    const [low, high] = [Math.min(...pitches), Math.max(...pitches)]
    let shift = 0
    while (high + shift > instrument.highest && low + shift - 12 >= instrument.lowest) shift -= 12
    while (low + shift < instrument.lowest && high + shift + 12 <= instrument.highest) shift += 12
    shifts.set(channel, shift)
  }
  const bass = tuneChannels.filter((channel) => instrumentOf(channel)!.sample === BASS)
  // How many parts may use each voice: a part takes first the voices fewest others may use.
  const wanted = new Array(VOICES).fill(0)
  for (const channel of tuneChannels) {
    const instrument = instrumentOf(channel)!
    for (const voice of [...(pinnedOf(channel) ? [pinnedOf(channel)!.voice] : instrument.entries.keys()), ...(instrument.doubled?.voices ?? [])]) wanted[voice]++
  }
  if (drumsOn) for (const voice of new Set(kit.drumVoice.values())) wanted[voice] += 2

  // `doubled`: the earlier copy of an organ note, on the organ's other entry.
  type Planned = { on: number; off: number; code: number; velocity: number; channel: number; voice: number; rank: number; drum: boolean; doubled: boolean }
  // The notes to come of the parts that have one voice only (the organ, the bass, the timpani, a part put on one entry;
  // and each drum), by voice: a part of more voices keeps off a voice one of them will want while its note sounds.
  const needs: { on: number; off: number; channel: number }[][] = Array.from({ length: VOICES }, () => [])
  for (const midi of notes) {
    const instrument = instrumentOf(midi.channel)
    const drum = drumsOn && midi.channel === DRUMS && kit.drums.has(midi.note)
    const pinned = pinnedOf(midi.channel)
    if (!drum && (!instrument || (instrument.entries.size !== 1 && !pinned) || midi.length <= 0)) continue
    const late = instrument?.doubled ? 1 : 0
    const on = Math.round(midi.start * perSecond) + late
    const off = drum ? on + DRUM_LENGTH[0] : Math.max(on + 1, Math.round((midi.start + midi.length) * perSecond) + late)
    needs[drum ? kit.drumVoice.get(kit.drums.get(midi.note)!)! : (pinned?.voice ?? [...instrument!.entries.keys()][0])].push({ on, off, channel: midi.channel })
  }
  const needed = (voice: number, on: number, off: number, channel: number) => needs[voice].some((n) => n.channel !== channel && n.on < off && n.off > on)
  // The notes planned once keeping off those voices and once not: the way that keeps more of them is taken.
  const plan = (lookahead: boolean) => {
    const held: (Planned | null)[] = new Array(VOICES).fill(null)
    // The last note each voice played, by which a part keeps to its own voices where it can.
    const lastUse: (Planned | null)[] = new Array(VOICES).fill(null)
    const played: Planned[] = []
    // The tracks made so far: a part on one voice is a track (the drums are one, track 9).
    const tracks = new Set<string>()
    const lastVoice = new Map<number, number>()
    let leftOut = 0
    let dropped = 0
    let moved = 0
    const free = (voice: number, on: number) => !held[voice] || held[voice]!.off <= on
    for (const midi of [...notes].sort((a, b) => a.start - b.start || b.note - a.note)) {
      const choice = choices.get(midi.channel) ?? 'out'
      const instrument = instrumentOf(midi.channel)
      const drum = choice === 'drums' && midi.channel === DRUMS
      if (!instrument && !drum) {
        leftOut++
        continue
      }
      if (drum && !kit.drums.has(midi.note)) {
        leftOut++
        continue
      }
      if (!drum && midi.length <= 0) continue
      // On the organ the instrument's own note comes a tick after its copy (below).
      const late = instrument?.doubled ? 1 : 0
      const on = Math.round(midi.start * perSecond) + late
      let off = Math.max(on + 1, Math.round((midi.start + midi.length) * perSecond) + late)
      let code: number
      let voices: number[]
      let rank: number
      const pinned = drum ? undefined : pinnedOf(midi.channel)
      if (drum) {
        code = kit.drums.get(midi.note)!
        off = on + Math.min(DRUM_LENGTH[1], Math.max(DRUM_LENGTH[0], off - on))
        voices = [kit.drumVoice.get(code)!]
        rank = kit.drumRank.get(code)!
        // A hit rings on as it is let go: it is let go when a part of one voice wants the voice.
        if (lookahead) {
          const next = needs[voices[0]].reduce((soonest, n) => (n.channel !== DRUMS && n.on >= on ? Math.min(soonest, n.on) : soonest), Infinity)
          off = Math.max(on + DRUM_LENGTH[0], Math.min(off, next))
        }
      } else {
        code = midi.note + shifts.get(midi.channel)!
        while (code < instrument!.lowest) code += 12
        while (code > instrument!.highest) code -= 12
        if (code !== midi.note) moved++
        rank = bass.includes(midi.channel) ? 2 : 1
        // The voice this part used last, then those it has a track on, then the rest, those fewest parts want first.
        const own = [...instrument!.entries.keys()]
        const last = lastVoice.get(midi.channel)
        const hasTrack = (voice: number) => tracks.has(`${midi.channel}:${voice}`)
        // (A part put on one entry: that entry's voice first.)
        voices = own.sort((a, b) => Number(b === pinned?.voice) - Number(a === pinned?.voice) || Number(b === last) - Number(a === last) || Number(hasTrack(b)) - Number(hasTrack(a)) || wanted[a] - wanted[b] || a - b)
        // Past the tracks the game has, a part keeps to those it has.
        const melodic = [...tracks].filter((key) => !key.startsWith('d')).length
        if (melodic >= MOST_TRACKS - 1) voices = voices.filter(hasTrack)
      }
      const velocity = Math.max(1, Math.min(127, Math.round(midi.velocity * (loudness.get(midi.channel) ?? 1))))
      const planned: Planned = { on, off, code, velocity, channel: midi.channel, voice: -1, rank, drum, doubled: false }
      // The same note of the same part ends the one sounding.
      for (const other of held) if (other && other.channel === midi.channel && other.code === code && other.off > on) other.off = on
      // A free voice no other part has used lately; then the part's own note begun before it, cut short (as a line's
      // notes running into each other are on one voice); then any free voice; then one held by a weaker note, cut
      // short; otherwise it is left out.
      const others = (v: number) => lastUse[v] !== null && lastUse[v]!.channel !== midi.channel && on - lastUse[v]!.off < RESERVED
      // A voice another part of one voice wants while this note sounds is taken last.
      const wantedElse = (v: number) => lookahead && !drum && voices.length > 1 && needed(v, on, off, midi.channel)
      // A part put on one entry takes its voice where it is free, or holds the part's own earlier note (cut short); else
      // another entry of the instrument as below.
      // (Its voice where the part may still use it: past the tracks the game has, one it has a track on.)
      const pinnedVoice = pinned && voices.includes(pinned.voice) ? pinned.voice : undefined
      const pinnedHeld = pinnedVoice === undefined ? null : held[pinnedVoice]
      let voice = pinnedVoice !== undefined && free(pinnedVoice, on) ? pinnedVoice : undefined
      if (voice === undefined && pinnedHeld && pinnedHeld.channel === midi.channel && pinnedHeld.on < on && !pinnedHeld.doubled) {
        pinnedHeld.off = on
        voice = pinnedVoice
      }
      voice ??= voices.find((v) => free(v, on) && (drum || !others(v)) && !wantedElse(v)) ?? voices.find((v) => free(v, on) && (drum || !others(v)))
      const ownBefore = voices.map((v) => held[v]!).filter((p) => p && p.off > on && p.channel === midi.channel && p.on < on && !drum)
      if (voice === undefined && ownBefore.length) {
        const oldest = ownBefore.reduce((o, p) => (p.on < o.on ? p : o))
        oldest.off = on
        voice = oldest.voice
      }
      if (voice === undefined) voice = voices.find((v) => free(v, on) && !wantedElse(v)) ?? voices.find((v) => free(v, on))
      if (voice === undefined) {
        const weakest = voices
          .map((v) => held[v]!)
          .reduce<Planned | null>((w, o) => (!w || o.rank < w.rank || (o.rank === w.rank && (o.drum ? o.on < w.on : o.code < w.code)) ? o : w), null)
        const stronger = (p: Planned) => (drum && p.drum && p.on < on) || rank > p.rank || (rank === p.rank && !drum && code > p.code)
        // (An organ note's copy given up is not a note of the file's cut short.)
        if (!weakest?.doubled) dropped++
        if (!weakest || !stronger(weakest)) continue
        weakest.off = on
        voice = weakest.voice
      }
      planned.voice = voice
      held[voice] = planned
      lastUse[voice] = planned
      played.push(planned)
      if (!drum) lastVoice.set(midi.channel, voice)
      tracks.add(drum ? 'drums' : `${midi.channel}:${voice}`)
      // The organ's copy a tick earlier, on a voice of the other entry that is free (no note is cut for it).
      const doubled = instrument?.doubled
      if (doubled) {
        const copyOn = on - late
        const melodic = [...tracks].filter((key) => !key.startsWith('d')).length
        const hasCopy = (v: number) => tracks.has(`${midi.channel}:${v}:d`)
        const copyVoices = doubled.voices
          .filter((v) => melodic < MOST_TRACKS - 1 || hasCopy(v))
          .sort((a, b) => Number(hasCopy(b)) - Number(hasCopy(a)) || wanted[a] - wanted[b] || a - b)
        const copyVoice = copyVoices.find((v) => free(v, copyOn) && !others(v)) ?? copyVoices.find((v) => free(v, copyOn))
        if (copyVoice !== undefined) {
          const copy: Planned = { ...planned, on: copyOn, off: off - late, voice: copyVoice, rank: DOUBLED_RANK, doubled: true }
          held[copyVoice] = copy
          lastUse[copyVoice] = copy
          played.push(copy)
          tracks.add(`${midi.channel}:${copyVoice}:d`)
        }
      }
    }
    return { played, leftOut, dropped, moved }
  }
  const kept = (way: ReturnType<typeof plan>) => way.played.filter((p) => p.off > p.on && !p.doubled).length * 2 + way.played.filter((p) => p.off > p.on && p.doubled).length
  const ways = [plan(true), plan(false)]
  const { played, leftOut, dropped, moved } = kept(ways[1]) > kept(ways[0]) ? ways[1] : ways[0]
  // (An organ note's copy only where the note itself was kept.)
  const keptNotes = new Set(played.filter((p) => p.off > p.on && !p.doubled).map((p) => `${p.channel}:${p.code}:${p.on}`))
  const sounding = played.filter((p) => p.off > p.on && (!p.doubled || keptNotes.has(`${p.channel}:${p.code}:${p.on + 1}`)))
  const last = sounding.reduce((latest, p) => Math.max(latest, p.off), 0)
  const ticks = Math.max(1, last, Math.round(end * perSecond))
  const loopTick = Math.round((timing.loop ?? 0) * perSecond)
  const loop = loopTick > 0 && loopTick < ticks ? loopTick : 0
  // The tracks: the parts' in channel order then voice order (an organ part's copies after its own notes), track 9
  // kept for the drums.
  const keyOf = (p: Planned) => `${p.channel}:${p.voice}${p.doubled ? ':d' : ''}`
  const keys = [...new Set(sounding.filter((p) => !p.drum).map(keyOf))].sort((a, b) => {
    const [ca, va, da] = a.split(':')
    const [cb, vb, db] = b.split(':')
    return Number(ca) - Number(cb) || Number(Boolean(da)) - Number(Boolean(db)) || Number(va) - Number(vb)
  })
  const drumNotes = sounding.filter((p) => p.drum)
  const otherEntry = sounding.filter((p) => !p.drum && !p.doubled && pinnedOf(p.channel) && p.voice !== pinnedOf(p.channel)!.voice).length
  const out: SnesMadeMusic['tracks'] = []
  const empty = () => ({ name: '', entry: -1, volume: 0, voice: -1, notes: [] })
  const notesOf = (own: Planned[]) => own.map((p) => ({ tick: p.on, code: p.code, velocity: p.velocity, length: p.off - p.on }))
  for (const key of keys) {
    if (out.length === DRUM_TRACK) out.push(empty())
    const [channel, voice] = key.split(':').map(Number)
    const copies = key.endsWith(':d')
    const instrument = instrumentOf(channel)!
    const own = sounding.filter((p) => keyOf(p) === key)
    const pinned = pinnedOf(channel)
    const entry = copies ? instrument.doubled!.entry : pinned?.voice === voice ? pinned.entry : instrument.entries.get(voice)!
    out.push({ name: `${instrument.name} (MIDI ${channel + 1})${copies ? ' doubled' : ''}`, entry, volume: ownVolumes?.get(channel) ?? instrument.volume, voice, notes: notesOf(own) })
  }
  if (drumNotes.length) {
    while (out.length < DRUM_TRACK) out.push(empty())
    out.splice(DRUM_TRACK, out.length > DRUM_TRACK && out[DRUM_TRACK].entry < 0 ? 1 : 0, { name: 'drums', entry: -1, volume: 0, voice: -1, notes: notesOf(drumNotes) })
  }
  if (!out.length) throw new MidiError('None of the chosen parts has a note the game can play.')
  // The game's pieces have two tracks or more (readSnesMusic).
  if (out.length < 2) out.push(empty())
  return { tracks: out, tempo, ticks, loop, seconds: ticks / perSecond, leftOut, dropped, moved, otherEntry }
}

// The track volumes of a piece's own MIDI file (snesMusicToMidi: its tracks named with their entries), by channel;
// null for another file.
export function snesOwnVolumes(kit: SnesMusicKit, bytes: Uint8Array): Map<number, number> | null {
  return [...midiPartNames(bytes).values()].some((name) => namedEntry(kit, name)) ? midiPartVolumes(bytes) : null
}

// The tempo byte of the game's own piece `index` in this ROM (TEMPO where it is not found).
export function snesMusicTempo(rom: Uint8Array, index: number): number {
  const at = offsetOf(SNES_GAME_MUSIC[index].pointer)
  return at >= 0 && at + 1 < rom.length && rom[at] === 1 && rom[at + 1] ? rom[at + 1] : TEMPO
}

// Where a MIDI file plays again from when it ends, in seconds: its loop marker (MIDI_LOOP_MARKER; a marker or cue
// point named so), else 0 (its start).
export function midiLoopStart(bytes: Uint8Array): number {
  const u32 = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'MThd') return 0
  const division = (bytes[12] << 8) | bytes[13]
  if (!division || division & 0x8000) return 0
  const tempos: { tick: number; value: number }[] = []
  let loop = -1
  let at = 8 + u32(4)
  while (at + 8 <= bytes.length && String.fromCharCode(...bytes.subarray(at, at + 4)) === 'MTrk') {
    const end = Math.min(bytes.length, at + 8 + u32(at + 4))
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
        if (type === 0x51 && length === 3) tempos.push({ tick, value: (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2] })
        const text = String.fromCharCode(...bytes.subarray(p, p + length)).replace(/[^a-z]/gi, '').toLowerCase()
        if ((type === 0x06 || type === 0x07) && text === MIDI_LOOP_MARKER.toLowerCase() && loop < 0) loop = tick
        p += length
        continue
      }
      if (status === 0xf0 || status === 0xf7) {
        p += vlq()
        continue
      }
      running = status
      const command = status & 0xf0
      p += command === 0xc0 || command === 0xd0 ? 1 : 2
    }
    at = end
  }
  if (loop <= 0) return 0
  // Ticks to seconds through the tempo changes (120 beats a minute until the first), as readMidi counts them.
  tempos.sort((a, b) => a.tick - b.tick)
  let seconds = 0
  let from = 0
  let value = 500000
  for (const change of tempos) {
    if (change.tick >= loop) break
    seconds += ((change.tick - from) * value) / division / 1e6
    from = change.tick
    value = change.value
  }
  return seconds + ((loop - from) * value) / division / 1e6
}

// The piece's bytes: the header, then each track (the first with NOSE4Web's mark) with its name, instrument and
// volume, its loop start, its notes, and the loop's end where the piece ends.
export function snesMusicBytes(made: SnesMadeMusic, replaced: number, name: string): Uint8Array {
  const text = (value: string) => {
    const bytes = [...value.slice(0, 200)].map((c) => (c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f))
    return [0, TEXT, bytes.length, ...bytes]
  }
  const bodies = made.tracks.map((track, t) => {
    const out: number[] = []
    if (track.name) out.push(...text(track.name))
    if (t === 0) out.push(...text(`${MARK}${(replaced >>> 0).toString(16).padStart(8, '0')} ${name}`))
    if (track.entry >= 0) out.push(0, INSTRUMENT, track.entry, 0, CONTROLLER, 7, track.volume)
    // The loop's start where the piece plays again from (its notes before it played once only).
    let tick = 0
    let looped = false
    const loopStart = () => {
      out.push(...varLen(made.loop - tick), LOOP_START, 0x7f)
      tick = made.loop
      looped = true
    }
    for (const n of [...track.notes].sort((a, b) => a.tick - b.tick)) {
      if (!looped && n.tick >= made.loop) loopStart()
      out.push(...varLen(n.tick - tick), n.code, n.velocity, ...varLen(Math.max(1, n.length)))
      tick = n.tick
    }
    if (!looped) loopStart()
    out.push(...varLen(made.ticks - tick), LOOP_END, 0, STOP)
    return out
  })
  const header = [0x01, made.tempo, 0x01, 0, 0, 0, bodies.length, 0]
  const offsets: number[] = []
  let offset = header.length + bodies.length * 2 + 2
  for (const body of bodies) {
    offsets.push(offset & 0xff, offset >> 8)
    offset += body.length
  }
  return Uint8Array.from([...header, ...offsets, 0, 0, ...bodies.flat()])
}

// ------------------------------------------------- putting it in

export class SnesMusicError extends Error {}

// Whether piece `index` can be replaced in this ROM: its places found, and its instruments.
export const snesMusicReplaceable = (rom: Uint8Array, index: number) => snesMusicPlaces(rom)[index] !== null && snesMusicKit(rom, SNES_GAME_MUSIC[index].sounds) !== null

// The bytes of the piece NOSE4Web put in place of piece `index` (header and tracks), or null for the game's own.
export function snesCustomMusicBytes(rom: Uint8Array, index: number): Uint8Array | null {
  const places = snesMusicPlaces(rom)[index]
  if (!places || places.pointer === SNES_GAME_MUSIC[index].pointer >>> 0 || !markOf(rom, places.pointer)) return null
  const at = offsetOf(places.pointer)
  const tracks = readTracks(rom, at)!
  return rom.slice(at, Math.max(...tracks.map((track) => track.end)))
}

// A copy of the ROM with the piece NOSE4Web put in place of piece `index`, if any, given back to free room, and the
// places that start it, and ask about it, pointed at `to`.
function pointedAt(rom: Uint8Array, index: number, to: number): Uint8Array {
  const places = snesMusicPlaces(rom)[index]
  if (!places) throw new SnesMusicError('The editor cannot find where this ROM starts this music, so it cannot be replaced here.')
  const old = snesCustomMusicBytes(rom, index)
  const out = rom.slice()
  if (old) out.fill(0xff, offsetOf(places.pointer), offsetOf(places.pointer) + old.length)
  for (const at of places.starts) {
    out[at + 1] = (to >>> 16) & 0xff
    out[at + 6] = to & 0xff
    out[at + 7] = (to >>> 8) & 0xff
  }
  for (const at of places.asks) {
    out[at] = to & 0xff
    out[at + 1] = (to >>> 8) & 0xff
  }
  return out
}

// The project with a piece's bytes (snesMusicBytes, or from a project file) in place of piece `index`, in free room
// within one bank; the piece NOSE4Web put there before, if any, given back to free room. Where no bank has the
// room, a ROM under 2 MB is grown to 2 MB, as the fighting patch grows it (grownSnesRom), and the piece goes in
// the new banks ($A0 to $BF), which MusicStart's long pointer reads as well as any other. Putting the game's own
// piece back leaves the ROM 2 MB, as the Genesis game music does.
export function withSnesMusicBytes(project: RomProject, index: number, bytes: Uint8Array): RomProject {
  const own = SNES_GAME_MUSIC[index].pointer >>> 0
  let rom = pointedAt(project.bytes, index, own)
  const kept = keptBanks(rom)
  let at = freeSpace(rom, bytes.length, kept)
  const grows = at < 0 && rom.length < SNES_GROWN_SIZE
  if (grows) {
    rom = grownSnesRom(rom)
    at = freeSpace(rom, bytes.length, kept)
  }
  if (at < 0) {
    // The most room there is, found by halves.
    let [low, high] = [0, bytes.length]
    while (low + 1 < high) {
      const middle = (low + high) >> 1
      if (freeSpace(rom, middle, kept) >= 0) low = middle
      else high = middle
    }
    throw new SnesMusicError(`The new music takes ${bytes.length} bytes, and the most free room this ROM has in one place${grows ? ', even grown to 2 MB,' : ''} is ${low}. A shorter piece, or one with fewer notes, would fit.`)
  }
  rom.set(bytes, at)
  const to = ((loRomBank(at, 0x80) << 16) | loRomAddress(at)) >>> 0
  if (markOf(rom, to)?.replaced !== own) throw new SnesMusicError('The music is not one NOSE4Web made.')
  return { ...project, bytes: pointedAt(rom, index, to) }
}

// The project with a piece made from a MIDI file in place of piece `index`.
export function withSnesMusic(project: RomProject, index: number, made: SnesMadeMusic, name: string): RomProject {
  return withSnesMusicBytes(project, index, snesMusicBytes(made, SNES_GAME_MUSIC[index].pointer, name))
}

// The project with piece `index` the game's own again, the room of NOSE4Web's given back.
export function withOriginalSnesMusic(project: RomProject, index: number): RomProject {
  return snesCustomMusicBytes(project.bytes, index) ? { ...project, bytes: pointedAt(project.bytes, index, SNES_GAME_MUSIC[index].pointer >>> 0) } : project
}
