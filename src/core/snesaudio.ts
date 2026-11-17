// The SNES game's music as the console plays it, with its own sampled
// instruments (the SNES disassembly's routines/sound and the sound CPU
// program, data/tables/SoundDriver.asm).
//
// A sample set is uploaded to the sound CPU before music plays: SPCTitleUpload
// (TitleSampleList, 15 samples) for the title music, SPCMenuUpload
// (MenuSampleList, 16) for the menus and the playoff screen, and
// SPCGameUpload (GameSampleList, 20) for games, where the organ songs play.
// Each hands SoundInit an instrument table (MenuSfxTable for the first two,
// GameSfxTable in games): a word offset from the table for each entry, and
// entries of 48 bytes. The bytes the music uses: 0 the voices it may use (a
// bit each), 2-3 its tuning (added to the pitch), 4 its transpose (added to
// the note), $0A-$0B its gain word, $10-$11 its release word, $12 and $13 its
// left and right volume, $14 its sample, $15 and $16 its ADSR, $2A its
// priority, $2F its pitch bend range in notes. A sample is a 4-byte header
// (its loop point and its length in bytes, both high byte first) and then BRR
// blocks (SPCUploadBlock); the loop point is from the sample's start.
//
// The sequencer runs as in SoundUpdate, once a frame: UpdateSfxVoices (each
// voice's pitch, and its release fading), then SequencerTick (TempoAcc gains
// $40 a frame; each time it passes TempoTick a tick: UpdateVoices counts each
// note's length down and releases it at 0, then StepTrack steps each track
// from the last down). A note (StepTrack, StartSoundVoice) takes a voice by
// FindFreeVoice, its volume from the track's (the instrument's, or as $DF
// controller 7 / $DE sets it) times VolumeCurve[velocity], its pitch from
// PitchTable[note + transpose] plus the tuning (the pitch bend, $E5, moves it
// toward the note the bend range away). Track 9 is the drums: each note picks
// the instrument entry (note - $2F), and plays at note $3F + its transpose.
// Two organ instruments play no note of length 0 (or with bit 15 set), and the
// clap plays 45 ticks whatever its length.
//
// The sound CPU's DSP then plays each voice: the sample decoded from BRR, at
// 32000 Hz x pitch / $1000, its envelope (ADSR, or GAIN once released: a
// release is GAIN $9F/$99/$8C/$81 by the release word's high byte, and
// StopVoice GAIN $9F), its left and right volume, and the main volume ($50,
// SoundVolume's high byte). Echo is off. The DSP's own interpolation is
// Gaussian; here it is a 4-point kernel shaped like it, so the sound is close
// but not to the bit. The instruments the music uses have no vibrato (their
// bytes $18-$21 are 0), so UpdateSfxVoices's vibrato is left out, as are the
// music ducking and PAL timing.

import { findCode, findCodeAll, loRomAddress, loRomOffset } from './snes'
import { FRAMES_PER_SECOND } from './genesismusic'

export const SNES_SAMPLE_RATE = 32000
// How long after the music ends the voices still sounding may ring, in frames.
const TAIL_FRAMES = 2 * FRAMES_PER_SECOND
// The most music made at once, in frames (ten minutes).
const MOST_FRAMES = 600 * FRAMES_PER_SECOND
// How long the music may go with no track stepping and no voice sounding before it is taken as over, in frames.
const IDLE_FRAMES = 5 * FRAMES_PER_SECOND
// The longest tick the sequencer counts right: TempoAcc gains $40 a frame in a byte.
const MOST_TEMPO_TICK = 0xc0

const offsetOf = (long: number) => loRomOffset((long >>> 16) & 0xff, long & 0xffff)
const byteAt = (rom: Uint8Array, at: number) => (at >= 0 && at < rom.length ? rom[at] : 0)
const wordAt = (rom: Uint8Array, at: number) => byteAt(rom, at) | (byteAt(rom, at + 1) << 8)
const signed8 = (value: number) => ((value & 0xff) ^ 0x80) - 0x80
const clamp16 = (value: number) => (value > 32767 ? 32767 : value < -32768 ? -32768 : value)

// ------------------------------------------------------------- BRR samples

export interface BrrSample {
  // The decoded sample, as the DSP keeps it (16-bit).
  pcm: Int16Array
  // Where it loops back to, in samples, or -1 where it ends.
  loopStart: number
  // The loop decoded once more, from the end of the first time through (the filters carry on from there).
  loop: Int16Array
}

// Decodes BRR blocks: 9 bytes each, a header (bits 4-7 the shift, 2-3 the filter, 1 loop, 0 end) and 16 4-bit
// samples, high nibble first. `loopAt` is the loop point in bytes from the first block.
export function decodeBrr(data: Uint8Array, loopAt = -1): BrrSample {
  const blocks = Math.floor(data.length / 9)
  let end = blocks
  for (let b = 0; b < blocks; b++) {
    if (data[b * 9] & 1) {
      end = b + 1
      break
    }
  }
  const loops = end > 0 && (data[(end - 1) * 9] & 2) !== 0 && loopAt >= 0 && loopAt % 9 === 0 && loopAt / 9 < end
  const history = [0, 0]
  const decode = (from: number, to: number) => {
    const out = new Int16Array((to - from) * 16)
    let n = 0
    for (let b = from; b < to; b++) {
      const header = data[b * 9]
      const shift = header >> 4
      const filter = (header >> 2) & 3
      for (let i = 0; i < 16; i++) {
        const byte = data[b * 9 + 1 + (i >> 1)]
        const nibble = signed8((i & 1 ? byte << 4 : byte) & 0xf0) >> 4
        let s = shift <= 12 ? (nibble << shift) >> 1 : nibble < 0 ? -2048 : 0
        const p1 = history[1]
        const p2 = history[0] >> 1
        if (filter === 1) s += (p1 >> 1) + (-p1 >> 5)
        else if (filter === 2) s += p1 - p2 + (p2 >> 4) + ((p1 * -3) >> 6)
        else if (filter === 3) s += p1 - p2 + ((p1 * -13) >> 7) + ((p2 * 3) >> 4)
        s = ((clamp16(s) * 2) << 16) >> 16
        history[0] = history[1]
        history[1] = s
        out[n++] = s
      }
    }
    return out
  }
  const pcm = decode(0, end)
  if (!loops) return { pcm, loopStart: -1, loop: new Int16Array(0) }
  return { pcm, loopStart: (loopAt / 9) * 16, loop: decode(loopAt / 9, end) }
}

// ------------------------------------------------- where the sounds are

export type SnesSoundSetName = 'title' | 'menu' | 'game'

export interface SnesSoundSet {
  // The instrument table (its ROM offset; its entries are in its bank).
  table: number
  // Each sample's ROM offset (its header), in upload order: the sample numbers.
  samples: number[]
}

export interface SnesSound {
  sets: Record<SnesSoundSetName, SnesSoundSet>
  pitchTable: number
  volumeCurve: number
  // The instruments (their addresses in the table's bank) whose notes play only with a length, and the one that plays
  // 45 ticks (-1 where not found).
  needLength: number[]
  clap: number
}

// The upload routines (SPCTitleUpload, SPCMenuUpload, SPCGameUpload): lda #table>>16 / sta SoundTable+2 / lda #table /
// sta SoundTable / jsl SoundInit / ldx #0 / lda.l list,x / sta p0 / lda.l list+2,x / sta p0+2 / phx / jsl
// SPCUploadBlock / plx / inx x4 / cpx #(4 x count).
const UPLOAD = 'a9 (..) 00 85 36 a9 (....) 85 34 22 .. .. .. a2 00 00 bf (....) (..) 85 .. bf .. .. .. 85 .. da 22 .. .. .. fa e8 e8 e8 e8 e0 (..) 00'
// StartSoundVoice: asl / tax / rep #$20 / lda.l PitchTable,x / ldx VoiceOfs / sta VoiceBasePitch,x / sta EventData1.
const PITCH = '0a aa c2 20 bf (....) (..) ae .. .. 9d .. .. 85 5a'
// StartSoundVoice: ldx EventData1 / lda.l VolumeCurve,x / and #$FF / cmp #$40.
const VOLUME = 'a6 5a bf (....) (..) 29 ff c9 40'
// StartSoundVoice: beq / sta InstPtr / cmp #organ / beq / cmp #organ2 / bne / lda EventData2 / bmi: the two organ
// instruments' notes play only with a length (retail $DF80 and $DFB0; they move with the table).
const NEED_LENGTH = 'f0 1c 85 4e c9 (....) f0 05 c9 (....) d0 06 a5 5e 30 0c'
// StartSoundVoice: lda InstPtr / cmp #clap / bne / lda #45: the clap (retail $E130) plays 45 ticks whatever its length.
const CLAP = 'a5 4e c9 (....) d0 05 a9 2d 00'
const COUNTS: Record<number, SnesSoundSetName> = { 15: 'title', 16: 'menu', 20: 'game' }

const cache = new WeakMap<Uint8Array, SnesSound | null>()

// The ROM's sample sets, instrument tables and pitch and volume tables, found by the code that uses them; null where
// they are not found or do not look right.
export function findSnesSound(rom: Uint8Array): SnesSound | null {
  if (cache.has(rom)) return cache.get(rom)!
  const found = locate(rom)
  cache.set(rom, found)
  return found
}

function locate(rom: Uint8Array): SnesSound | null {
  const sets: Partial<Record<SnesSoundSetName, SnesSoundSet>> = {}
  for (const { groups } of findCodeAll(rom, UPLOAD)) {
    const [tableBank, table, list, listBank, count] = groups
    const name = COUNTS[count / 4]
    if (!name || sets[name]) continue
    const listAt = offsetOf((listBank << 16) | list)
    const samples: number[] = []
    for (let i = 0; i < count / 4; i++) {
      const at = listAt + 4 * i
      samples.push(offsetOf(wordAt(rom, at) | (byteAt(rom, at + 2) << 16)))
    }
    sets[name] = { table: offsetOf((tableBank << 16) | table), samples }
  }
  const pitch = findCode(rom, PITCH)
  const volume = findCode(rom, VOLUME)
  if (!sets.title || !sets.menu || !sets.game || !pitch || !volume) return null
  const needLength = findCode(rom, NEED_LENGTH)?.groups ?? []
  const clap = findCode(rom, CLAP)?.groups[0] ?? -1
  const sound: SnesSound = { sets: sets as SnesSound['sets'], pitchTable: offsetOf((pitch.groups[1] << 16) | pitch.groups[0]), volumeCurve: offsetOf((volume.groups[1] << 16) | volume.groups[0]), needLength, clap }
  // Each sample's header must hold whole BRR blocks within the ROM, ending on an end block.
  for (const set of Object.values(sound.sets)) {
    if (set.table < 0 || set.table + 2 > rom.length) return null
    for (const at of set.samples) {
      const header = sampleHeader(rom, at)
      if (!header) return null
    }
  }
  // The pitch table rises by about a twelfth of an octave a note.
  const p = (note: number) => wordAt(rom, sound.pitchTable + 2 * note)
  if (sound.pitchTable < 0 || !(p(69) > p(57) * 1.95 && p(69) < p(57) * 2.05 && p(1) > p(0))) return null
  return sound
}

function sampleHeader(rom: Uint8Array, at: number): { loop: number; length: number } | null {
  if (at < 0 || at + 4 > rom.length) return null
  const loop = (rom[at] << 8) | rom[at + 1]
  const length = (rom[at + 2] << 8) | rom[at + 3]
  if (length === 0 || length % 9 !== 0 || at + 4 + length > rom.length || loop > length) return null
  return { loop, length }
}

// The sample at `at` (its header), decoded.
export function readSnesSample(rom: Uint8Array, at: number): (BrrSample & { loopPoint: number; length: number }) | null {
  const header = sampleHeader(rom, at)
  if (!header) return null
  return { ...decodeBrr(rom.subarray(at + 4, at + 4 + header.length), header.loop < header.length ? header.loop : -1), loopPoint: header.loop, length: header.length }
}

export interface SnesInstrument {
  // Its ROM offset.
  at: number
  voices: number
  tuning: number
  transpose: number
  gain: number
  release: number
  left: number
  right: number
  sample: number
  adsr1: number
  adsr2: number
  priority: number
  bendRange: number
}

// Entry `index` of the instrument table at `table`.
export function readSnesInstrument(rom: Uint8Array, table: number, index: number): SnesInstrument {
  return instrumentAt(rom, entryAt(rom, table, index))
}

const entryAt = (rom: Uint8Array, table: number, index: number) => table + wordAt(rom, table + ((2 * index) & 0xff))

function instrumentAt(rom: Uint8Array, at: number): SnesInstrument {
  const b = (i: number) => byteAt(rom, at + i)
  return {
    at,
    voices: b(0),
    tuning: b(2) | (b(3) << 8),
    transpose: b(4),
    gain: b(0x0a) | (b(0x0b) << 8),
    release: b(0x10) | (b(0x11) << 8),
    left: b(0x12),
    right: b(0x13),
    sample: b(0x14),
    adsr1: b(0x15),
    adsr2: b(0x16),
    priority: b(0x2a),
    bendRange: b(0x2f),
  }
}

// The DSP's pitch for a note (PitchTable, the index's top bit lost as the game's 8-bit index loses it), and its rate.
export const snesNotePitch = (rom: Uint8Array, sound: SnesSound, note: number) => wordAt(rom, sound.pitchTable + ((note * 2) & 0xff))
export const snesPitchRate = (pitch: number) => (SNES_SAMPLE_RATE * (pitch & 0x3fff)) / 0x1000

// ------------------------------------------------- the sequencer

// A note as a voice plays it.
export interface SnesVoiceNote {
  // Seconds from the start: keyed on, released (its length over; the end where it never was), and silent or taken.
  start: number
  release: number
  end: number
  voice: number
  track: number
  // The note's code in the track.
  note: number
  sample: number
  // Samples a second the sample plays at.
  rate: number
  left: number
  right: number
  adsr1: number
  adsr2: number
}

interface Voice {
  state: number
  track: number
  priority: number
  length: number
  age: number
  inst: SnesInstrument | null
  note: number
  basePitch: number
  pitch: number
  velocity: number
  gain: number
  played: SnesVoiceNote | null
}

interface Track {
  ptr: number
  wait: number
  inst: SnesInstrument | null
  left: number
  right: number
  bend: number
  bendRange: number
  sustain: number
  done: boolean
}

// What the DSP is told for each voice.
interface DspVoice {
  left: number
  right: number
  sample: number
  adsr1: number
  adsr2: number
  gain: number
  pitch: number
  keyOn: boolean
}

export interface SnesMusicRender {
  notes: SnesVoiceNote[]
  seconds: number
  // At SNES_SAMPLE_RATE; empty unless asked for.
  left: Float32Array
  right: Float32Array
}

const mulFrac8 = (a: number, b: number) => Math.floor(((a & 0xff) * (b & 0xff)) / 128) & 0xff
const mulFrac16 = (a: number, b: number) => Math.floor(((a & 0xffff) * (b & 0xff)) / 128) & 0xffff

// Plays the song at `pointer` (a long pointer) on sample set `set` once through (to its loop's end, or its stop), as
// the console would: the notes the voices play, and the sound itself when `render` is set. Null where the ROM's sound
// is not found or the song is not one.
export function renderSnesMusic(rom: Uint8Array, pointer: number, set: SnesSoundSetName, render = true): SnesMusicRender | null {
  const sound = findSnesSound(rom)
  if (!sound) return null
  const at = offsetOf(pointer)
  if (at < 0 || at + 10 > rom.length) return null
  const tempo = rom[at + 1]
  const count = rom[at + 6]
  if (tempo === 0 || count === 0 || count > 17) return null
  const { table, samples } = sound.sets[set]
  const tracks: Track[] = []
  for (let t = 0; t < count; t++) {
    const offset = wordAt(rom, at + 8 + 2 * t)
    if (!offset) return null
    tracks.push({ ptr: at + offset, wait: 0, inst: null, left: 0, right: 0, bend: 0, bendRange: 0, sustain: 0, done: false })
  }
  const voices: Voice[] = Array.from({ length: 8 }, () => ({ state: 0, track: 0xff, priority: 0, length: 0, age: 0, inst: null, note: 0, basePitch: 0, pitch: 0, velocity: 0, gain: 0, played: null }))
  const dsp: DspVoice[] = Array.from({ length: 8 }, () => ({ left: 0, right: 0, sample: 0, adsr1: 0, adsr2: 0, gain: 0, pitch: 0, keyOn: false }))
  const notes: SnesVoiceNote[] = []
  let tempoTick = Math.floor(0x2760 / tempo) & 0xff
  // A tick of 0 never comes, and one past $C0 is missed as the byte turns over: such a song is not played here.
  const badTempo = () => tempoTick === 0 || tempoTick > MOST_TEMPO_TICK
  if (badTempo()) return null
  let tempoAcc = 0
  let musicOn = true
  let rotor = 0
  let master = 0x50
  // The instrument pointer the game keeps (InstPtr): a bend takes the tuning of the last one set.
  let instPtr: SnesInstrument | null = null
  let frame = 0
  const now = () => frame / FRAMES_PER_SECOND

  const pitchOf = (note: number) => snesNotePitch(rom, sound, note)
  const stopVoice = (v: number) => {
    const voice = voices[v]
    if (voice.played) voice.played.end = Math.min(voice.played.end, now() + 0.01)
    voice.state = 0
    voice.track = 0xff
    dsp[v].gain = 0x9f
    dsp[v].adsr1 = 0
  }
  const releaseVoice = (v: number) => {
    const voice = voices[v]
    if (voice.state === 0) return
    if (voice.played) voice.played.release = Math.min(voice.played.release, now())
    if (voice.state === 1) return stopVoice(v)
    voice.state = 4
    const inst = voice.inst!
    instPtr = inst
    voice.gain = (((inst.adsr1 | (inst.adsr2 << 8)) >> 1) & 0x7000) + 0x0fff
    const high = inst.release >> 8
    dsp[v].gain = high >= 0x6d ? 0x9f : high >= 0x36 ? 0x99 : high >= 0x03 ? 0x8c : 0x81
    dsp[v].adsr1 = 0
  }
  const findFreeVoice = (inst: SnesInstrument) => {
    rotor = (rotor + 1) & 7
    for (let k = 0, x = rotor; k < 8; k++, x = (x + 1) & 7) if (voices[x].state === 0 && inst.voices & (1 << x)) return x
    // None free: the voice of the highest state, then the greatest age, of no higher priority (the age read as the
    // game reads it, from the voices counted the other way).
    let best = -1
    let bestState = 0
    let bestAge = 0
    for (let k = 0, x = rotor; k < 8; k++, x = (x + 1) & 7) {
      const voice = voices[x]
      if (!(inst.voices & (1 << x)) || inst.priority < voice.priority || voice.state < bestState) continue
      const age = voices[7 - k].age
      if (voice.state > bestState) {
        best = x
        bestState = voice.state
        bestAge = age
      } else if (age >= bestAge) {
        best = x
        bestAge = age
      }
    }
    return best
  }
  // The pitch of `note` bent by the track's bend, from its pitch `base` (StartSoundVoice, StepTrack's $E5).
  const bent = (note: number, base: number, bend: number, range: number) => {
    if (!range || !bend) return base
    if (bend > 0) return (base + mulFrac16(pitchOf((note + range) & 0xff) - base, bend)) & 0xffff
    const amount = (0 - bend) & 0xff
    const span = (base - pitchOf((note - range) & 0xff)) & 0xffff
    return (base - (amount & 0x80 ? span : mulFrac16(span, amount))) & 0xffff
  }
  const startVoice = (t: number, code: number, velocity: number, length: number) => {
    const track = tracks[t]
    const inst = track.inst
    if (!inst) return
    instPtr = inst
    // The two organ instruments skip a note of no length (or a negative one), before a voice is looked for.
    const address = loRomAddress(inst.at)
    if (sound.needLength.includes(address) && ((length & 0xffff) === 0 || length & 0x8000)) return
    const v = findFreeVoice(inst)
    if (v < 0) return
    const voice = voices[v]
    if (voice.played) voice.played.end = Math.min(voice.played.end, now())
    voice.track = t
    voice.priority = inst.priority
    voice.state = inst.adsr1 & 0x80 ? 2 : 1
    voice.length = ((address === sound.clap ? 0x2d : length) - 1) & 0xffff
    voice.age = 0
    voice.gain = inst.gain
    voice.inst = inst
    const curve = byteAt(rom, sound.volumeCurve + (velocity & 0xff))
    let left = track.left
    let right = track.right
    if (curve !== 0x40) {
      voice.velocity = (curve * 2) & 0xff
      left = mulFrac8(track.left, voice.velocity)
      right = mulFrac8(track.right, voice.velocity)
    }
    const note = (code + inst.transpose) & 0xff
    voice.note = note
    voice.basePitch = pitchOf(t === 9 ? (0x3f + inst.transpose) & 0xff : note)
    const pitch = bent(note, voice.basePitch, track.bend, track.bendRange)
    voice.pitch = (inst.tuning + pitch) & 0xffff
    Object.assign(dsp[v], { left, right, sample: inst.sample, adsr1: inst.adsr1, adsr2: inst.adsr2, gain: 0, pitch, keyOn: true })
    if (!(inst.adsr1 & 0x80)) Object.assign(dsp[v], { gain: inst.gain >> 8, adsr1: 0 })
    const time = now()
    voice.played = { start: time, release: Infinity, end: Infinity, voice: v, track: t, note: code, sample: inst.sample, rate: snesPitchRate(voice.pitch), left, right, adsr1: inst.adsr1, adsr2: inst.adsr2 }
    notes.push(voice.played)
  }
  // A track's volume from its instrument's times `value` ($DE, controller 7), and its voices' with it.
  const trackVolume = (t: number, value: number) => {
    const track = tracks[t]
    instPtr = track.inst
    track.left = track.inst ? mulFrac8(track.inst.left, value) : 0
    track.right = track.inst ? mulFrac8(track.inst.right, value) : 0
    for (let v = 7; v >= 0; v--) {
      if (voices[v].track !== t) continue
      dsp[v].left = mulFrac8(track.left, voices[v].velocity)
      dsp[v].right = mulFrac8(track.right, voices[v].velocity)
    }
  }
  const setInstrument = (track: Track, inst: SnesInstrument) => {
    track.inst = inst
    instPtr = inst
    track.bendRange = inst.bendRange
    track.bend = 0
    track.left = inst.left
    track.right = inst.right
  }
  const readVarLen = (p: { at: number }) => {
    let value = 0
    for (let i = 0; i < 4; i++) {
      const byte = byteAt(rom, p.at++)
      value = (value << 7) | (byte & 0x7f)
      if (!(byte & 0x80)) break
    }
    return value
  }
  const musicStop = () => {
    musicOn = false
    for (let v = 7; v >= 0; v--) if (voices[v].track < 0x10 && voices[v].state) stopVoice(v)
  }
  const stepTrack = (t: number) => {
    const track = tracks[t]
    if (track.done) return
    if (track.wait > 0) {
      track.wait--
      return
    }
    const p = { at: track.ptr }
    stepped = frame
    for (let guard = 0; guard < 4000; guard++) {
      readVarLen(p)
      const code = byteAt(rom, p.at++)
      if (code < 0xd9) {
        const velocity = byteAt(rom, p.at++)
        const length = readVarLen(p)
        if (t === 9) setInstrument(track, instrumentAt(rom, entryAt(rom, table, (code - 0x2f) & 0xff)))
        startVoice(t, code, velocity, length)
      } else if (code === 0xd9 || code === 0xda) {
        musicStop()
        return
      } else if (code === 0xdb) {
        // The loop's end (back to the loop's start, $E2, or the track's): once through is enough.
        track.done = true
        return
      } else if (code === 0xe7) {
        p.at += byteAt(rom, p.at) + 1
      } else if (code === 0xdc || code === 0xdd || code === 0xde || code === 0xe2 || code === 0xea) {
        const data = byteAt(rom, p.at++)
        if (code === 0xdc) setInstrument(track, instrumentAt(rom, entryAt(rom, table, data === 0x6a ? 0x14 : data)))
        else if (code === 0xdd) {
          tempoTick = data
          if (badTempo()) musicOn = false
        }
        else if (code === 0xde) trackVolume(t, data)
      } else if (code === 0xdf) {
        const controller = byteAt(rom, p.at++)
        const value = byteAt(rom, p.at++)
        if (controller === 0x07) trackVolume(t, value)
        else if (controller === 0x40) {
          track.sustain = value
          if (!value) for (let v = 7; v >= 0; v--) if (voices[v].track === t && voices[v].state) releaseVoice(v)
        } else if (controller === 0x0b) track.left = value
        else if (controller === 0x0c) track.right = value
        else if (controller === 0x37) master = value
      } else if (code === 0xe5) {
        const low = byteAt(rom, p.at++)
        const high = byteAt(rom, p.at++)
        const word = ((((high << 8) | ((low << 1) & 0xff)) - 0x4000) << 1) & 0xffff
        track.bend = signed8(word >> 8)
        if (track.bendRange) {
          for (let v = 7; v >= 0; v--) {
            const voice = voices[v]
            if (voice.track !== t) continue
            const pitch = bent(voice.note, voice.basePitch, track.bend, track.bendRange)
            voice.pitch = ((instPtr?.tuning ?? 0) + pitch) & 0xffff
          }
        }
      }
      // The wait to the next event: none, and it follows at once.
      const after = p.at
      const wait = readVarLen(p)
      p.at = after
      if (wait) {
        track.ptr = after
        track.wait = wait - 1
        return
      }
    }
    track.done = true
  }

  // The DSP: each voice's place in its sample, envelope and output.
  const decoded = new Map<number, BrrSample | null>()
  const sampleFor = (n: number) => {
    if (!decoded.has(n)) decoded.set(n, n < samples.length ? readSnesSample(rom, samples[n]) : null)
    return decoded.get(n)!
  }
  const play = Array.from({ length: 8 }, () => ({ brr: null as BrrSample | null, pos: 0, env: 0, mode: 0, on: false }))
  let chunks: Float32Array[][] = [[], []]
  let counter = 0
  let owed = 0
  const renderFrame = () => {
    owed += SNES_SAMPLE_RATE / FRAMES_PER_SECOND
    const n = Math.floor(owed)
    owed -= n
    for (let v = 0; v < 8; v++) {
      const d = dsp[v]
      if (!d.keyOn) continue
      d.keyOn = false
      const p = play[v]
      p.brr = sampleFor(d.sample)
      p.pos = 0
      p.env = 0
      p.mode = ATTACK
      p.on = p.brr !== null && p.brr.pcm.length > 0
    }
    const l = new Float32Array(n)
    const r = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      counter++
      let mixL = 0
      let mixR = 0
      for (let v = 0; v < 8; v++) {
        const p = play[v]
        if (!p.on) continue
        const d = dsp[v]
        envelope(p, d, counter)
        const brr = p.brr!
        const index = p.pos >> 12
        if (index >= brr.pcm.length && brr.loopStart < 0) {
          p.on = false
          continue
        }
        const s = interpolate(brr, index, (p.pos >> 4) & 0xff)
        const out = (s * p.env) >> 11
        mixL += (out * signed8(d.left)) >> 7
        mixR += (out * signed8(d.right)) >> 7
        p.pos += d.pitch & 0x3fff
        // Round the loop again, so the place stays a small number.
        if (brr.loopStart >= 0 && p.pos >= (brr.pcm.length + brr.loop.length) * 0x1000) p.pos -= brr.loop.length * 0x1000
      }
      l[i] = clamp16((mixL * signed8(master)) >> 7) / 32768
      r[i] = clamp16((mixR * signed8(master)) >> 7) / 32768
    }
    chunks[0].push(l)
    chunks[1].push(r)
  }

  // Once every track is through (or the music stops), the notes still sounding run on to their ends; music that goes
  // a while with no track stepping and no voice sounding is over too.
  let ended = -1
  let stepped = 0
  for (; frame < MOST_FRAMES; frame++) {
    // UpdateSfxVoices: each voice's age and pitch, and a released voice's fade, stopped when it runs out.
    for (let v = 0; v < 8; v++) {
      const voice = voices[v]
      if (!voice.state) continue
      instPtr = voice.inst
      voice.age = (voice.age + 1) & 0xffff
      if (voice.state === 4) {
        voice.gain -= voice.inst!.release
        if (voice.gain < 0) {
          voice.gain &= 0xffff
          stopVoice(v)
          continue
        }
      } else if (voice.state === 1) {
        dsp[v].gain = voice.gain >> 8
        dsp[v].adsr1 = 0
      }
      dsp[v].pitch = voice.pitch
    }
    // SequencerTick: UpdateVoices, then each track from the last.
    if (musicOn) {
      tempoAcc = (tempoAcc + 0x40) & 0xff
      while (musicOn && tempoAcc >= tempoTick) {
        for (let v = 0; v < 8; v++) {
          const voice = voices[v]
          if (!voice.state || voice.track >= 0x10 || voice.length & 0x8000) continue
          if (voice.length > 0) voice.length--
          else if (voice.state !== 4 && !tracks[voice.track]?.sustain) releaseVoice(v)
        }
        for (let t = tracks.length - 1; t >= 0 && musicOn; t--) stepTrack(t)
        tempoAcc = (tempoAcc - tempoTick) & 0xff
      }
      if (badTempo()) return null
      if (ended < 0 && (!musicOn || tracks.every((track) => track.done))) ended = frame
    }
    if (render) renderFrame()
    const silent = voices.every((voice) => !voice.state) && play.every((p) => !p.on || p.env === 0)
    if (!silent) stepped = frame
    if (ended < 0 && frame - stepped >= IDLE_FRAMES) ended = frame
    if (ended >= 0 && (frame - ended >= TAIL_FRAMES || silent)) break
  }
  const seconds = (frame + 1) / FRAMES_PER_SECOND
  for (const n of notes) {
    n.end = Math.min(n.end, seconds)
    n.release = Math.min(n.release, n.end)
  }
  const join = (parts: Float32Array[]) => {
    const all = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
    let n = 0
    for (const part of parts) {
      all.set(part, n)
      n += part.length
    }
    return all
  }
  const result = { notes, seconds, left: join(chunks[0]), right: join(chunks[1]) }
  chunks = [[], []]
  return result
}

// ------------------------------------------------- the DSP's envelope and interpolation

const ATTACK = 0
const DECAY = 1
const SUSTAIN = 2
// Samples between steps at each rate (0: never), and where each rate's steps fall.
const RATES = [0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1]
const RATE_OFFSETS = [0, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 536, 0, 1040, 0, 0]
const due = (rate: number, counter: number) => rate > 0 && (counter + RATE_OFFSETS[rate]) % RATES[rate] === 0

function envelope(p: { env: number; mode: number }, d: DspVoice, counter: number) {
  let env = p.env
  if (d.adsr1 & 0x80) {
    if (p.mode === ATTACK) {
      const rate = (d.adsr1 & 0x0f) * 2 + 1
      if (due(rate, counter)) env += rate === 31 ? 1024 : 32
    } else {
      const rate = p.mode === DECAY ? ((d.adsr1 >> 3) & 0x0e) + 0x10 : d.adsr2 & 0x1f
      if (due(rate, counter)) env -= ((env - 1) >> 8) + 1
    }
  } else if (!(d.gain & 0x80)) env = (d.gain & 0x7f) * 16
  else if (due(d.gain & 0x1f, counter)) {
    const kind = (d.gain >> 5) & 3
    if (kind === 0) env -= 32
    else if (kind === 1) env -= ((env - 1) >> 8) + 1
    else if (kind === 2) env += 32
    else env += env < 0x600 ? 32 : 8
  }
  if (p.mode === DECAY && env >> 8 === d.adsr2 >> 5) p.mode = SUSTAIN
  if (env < 0) env = 0
  else if (env > 0x7ff) {
    env = 0x7ff
    if (p.mode === ATTACK) p.mode = DECAY
  }
  p.env = env
}

// Four weights for each 256th of a sample, of a bell like the DSP's Gaussian table (each sample next to the one
// played weighs about 0.28 of it).
const KERNEL = (() => {
  const weights = new Float32Array(256 * 4)
  const bell = (x: number) => Math.exp(-1.255 * x * x)
  for (let f = 0; f < 256; f++) {
    const x = f / 256
    const w = [bell(1 + x), bell(x), bell(1 - x), bell(2 - x)]
    const sum = w[0] + w[1] + w[2] + w[3]
    for (let k = 0; k < 4; k++) weights[f * 4 + k] = w[k] / sum
  }
  return weights
})()

function sampleAt(brr: BrrSample, index: number): number {
  if (index < 0) return 0
  if (index < brr.pcm.length) return brr.pcm[index]
  if (brr.loopStart < 0 || brr.loop.length === 0) return 0
  return brr.loop[(index - brr.pcm.length) % brr.loop.length]
}

function interpolate(brr: BrrSample, index: number, fraction: number): number {
  const k = fraction * 4
  return Math.trunc(KERNEL[k] * sampleAt(brr, index - 1) + KERNEL[k + 1] * sampleAt(brr, index) + KERNEL[k + 2] * sampleAt(brr, index + 1) + KERNEL[k + 3] * sampleAt(brr, index + 2))
}

