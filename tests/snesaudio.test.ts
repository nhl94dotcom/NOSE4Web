import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom } from '../src/core/rom'
import { decodeBrr, findSnesSound, readSnesInstrument, readSnesSample, renderSnesMusic, snesNotePitch, snesPitchRate } from '../src/core/snesaudio'
import { SNES_GAME_MUSIC } from '../src/core/snesmusic'
import { snesSongChoices } from '../src/core/snessongs'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name = 'NHL94.smc') => openRom(new Uint8Array(readFileSync(path(name)))).bytes

describe('BRR decoding', () => {
  it('decodes a block of each filter as the DSP does', () => {
    // Shift 12, filter 0: each nibble times 2048 (half of nibble << 12, kept doubled), then 1, -1, 7, -8.
    const plain = decodeBrr(Uint8Array.from([0xc0, 0x1f, 0x78, 0, 0, 0, 0, 0, 0x01]))
    expect(Array.from(plain.pcm.slice(0, 4))).toEqual([4096, -4096, 28672, -32768])
    expect(plain.loopStart).toBe(-1)
    // Filter 1 carries 15/16 of the sample before on: 4096 then 4096 x 15/16 = 3840, and so on.
    const one = decodeBrr(Uint8Array.from([0xc4, 0x10, 0, 0, 0, 0, 0, 0, 0, 0x05, 0, 0, 0, 0, 0, 0, 0, 0]))
    expect(Array.from(one.pcm.slice(0, 3))).toEqual([4096, 3840, 3600])
    // Shift 13 and up gives -2048 for a negative nibble, 0 otherwise; the value clamps at 16 bits before doubling.
    const big = decodeBrr(Uint8Array.from([0xd1, 0xf1, 0, 0, 0, 0, 0, 0, 0]))
    expect(Array.from(big.pcm.slice(0, 2))).toEqual([-4096, 0])
    // A loop flag on the end block loops back to the loop point.
    const looping = decodeBrr(Uint8Array.from([0xc0, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0xc3, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22]), 9)
    expect(looping.pcm.length).toBe(32)
    expect(looping.loopStart).toBe(16)
    expect(looping.loop[0]).toBe(8192)
  })
})

describe.skipIf(!names.length)('SNES sound', () => {
  it('finds the sample sets, instrument tables, pitch and volume tables of every SNES ROM', () => {
    for (const name of names) {
      const rom = open(name)
      const sound = findSnesSound(rom)
      expect(sound, name).not.toBeNull()
      expect(sound!.sets.title.samples, name).toHaveLength(15)
      expect(sound!.sets.menu.samples, name).toHaveLength(16)
      expect(sound!.sets.game.samples, name).toHaveLength(20)
      // The menu set's first 12 samples are the title set's.
      expect(sound!.sets.menu.samples.slice(0, 12), name).toEqual(sound!.sets.title.samples.slice(0, 12))
      // The bass (instrument 2) plays sample 1, its ADSR on; the organ (11 and 12 in games) sample 10, left and right.
      const bass = readSnesInstrument(rom, sound!.sets.menu.table, 2)
      expect([bass.sample, bass.adsr1 & 0x80], name).toEqual([1, 0x80])
      const left = readSnesInstrument(rom, sound!.sets.game.table, 11)
      const right = readSnesInstrument(rom, sound!.sets.game.table, 12)
      expect([left.sample, right.sample], name).toEqual([10, 10])
      expect(left.left > left.right && right.right > right.left, name).toBe(true)
      // A in the middle (69): the pitch the game gives it.
      expect(snesNotePitch(rom, sound!, 69), name).toBe(0x6ba)
    }
  })

  it("finds nothing in a ROM whose sound code is not the game's, so Play keeps to the rough preview", () => {
    const rom = open().slice()
    // SPCMenuUpload's lda #MenuSfxTable>>16 / sta SoundTable+2 made something else.
    const at = rom.findIndex((_, i) => rom[i] === 0xa9 && rom[i + 3] === 0x85 && rom[i + 4] === 0x36 && rom[i + 5] === 0xa9 && rom[i + 8] === 0x85 && rom[i + 9] === 0x34)
    rom[at + 4] = 0x37
    expect(findSnesSound(rom)).toBeNull()
    expect(renderSnesMusic(rom, SNES_GAME_MUSIC[1].pointer, 'menu')).toBeNull()
  })

  it('reads a real sample with its length and loop', () => {
    const rom = open()
    const sound = findSnesSound(rom)!
    // The bass: 2160 bytes (240 blocks, 3840 samples), looping from byte 1818 (block 202).
    const bass = readSnesSample(rom, sound.sets.menu.samples[1])!
    expect([bass.length, bass.loopPoint, bass.pcm.length, bass.loopStart, bass.loop.length]).toEqual([2160, 1818, 3840, 3232, 608])
    // The kick does not loop.
    const kick = readSnesSample(rom, sound.sets.menu.samples[0])!
    expect([kick.length, kick.loopStart]).toEqual([1350, -1])
    expect(Math.max(...kick.pcm.map(Math.abs))).toBeGreaterThan(8000)
  })

  it('plays each piece of the game music as voice notes on its own instruments', () => {
    for (const name of names) {
      const rom = open(name)
      for (const piece of SNES_GAME_MUSIC) {
        const played = renderSnesMusic(rom, piece.pointer, piece.sounds, false)!
        expect(played, `${name} ${piece.name}`).not.toBeNull()
        expect(played.notes.length, `${name} ${piece.name}`).toBeGreaterThan(100)
        expect(played.seconds).toBeGreaterThan(20)
        for (const n of played.notes) {
          expect(n.sample).toBeLessThan(piece.sounds === 'title' ? 15 : 16)
          expect(n.rate).toBeGreaterThan(500)
          expect(n.rate).toBeLessThan(130000)
          expect(n.end).toBeGreaterThanOrEqual(n.start)
        }
        // No two notes on a voice at once.
        for (let v = 0; v < 8; v++) {
          const on = played.notes.filter((n) => n.voice === v)
          for (let i = 1; i < on.length; i++) expect(on[i].start).toBeGreaterThanOrEqual(on[i - 1].end - 1e-9)
        }
      }
    }
  })

  it('plays the drums on their own instruments, and a horn at its pitch', () => {
    const rom = open()
    const played = renderSnesMusic(rom, 0x90c20c, 'menu', false)!
    const drums = played.notes.filter((n) => n.track === 9)
    // Kick (sample 0), snare (2) and hats (4) among them.
    const used = new Set(drums.map((n) => n.sample))
    for (const sample of [0, 2, 4]) expect(used.has(sample)).toBe(true)
    // The bass (track 8, instrument 2) on sample 1, and only voice 5: its pitch is PitchTable[note + its transpose of
    // 21], plus its tuning (none).
    const sound = findSnesSound(rom)!
    const instrument = readSnesInstrument(rom, sound.sets.menu.table, 2)
    expect([instrument.sample, instrument.transpose, instrument.tuning, instrument.voices]).toEqual([1, 21, 0, 0x20])
    const bass = played.notes.filter((n) => n.track === 8)
    expect(new Set(bass.map((n) => n.voice))).toEqual(new Set([5]))
    expect(bass[0].sample).toBe(1)
    expect(bass[0].rate).toBeCloseTo(snesPitchRate(snesNotePitch(rom, sound, bass[0].note + 21)), 3)
  })

  it('plays an organ song on the game set, and makes the sound', () => {
    const rom = open()
    const brass = snesSongChoices(rom).find((c) => c.name === 'Brass Bonanza')!
    const played = renderSnesMusic(rom, brass.pointer, 'game')!
    expect(played.notes.length).toBeGreaterThan(20)
    expect(new Set(played.notes.map((n) => n.sample))).toEqual(new Set([10]))
    expect(played.left.length).toBe(played.right.length)
    expect(played.left.length / 32000).toBeCloseTo(played.seconds, 0)
    const loudest = played.left.reduce((most, s) => Math.max(most, Math.abs(s)), 0)
    expect(loudest).toBeGreaterThan(0.05)
    expect(loudest).toBeLessThanOrEqual(1)
  })

  it('makes the title music quickly enough to start at a click', () => {
    const rom = open()
    const started = performance.now()
    const played = renderSnesMusic(rom, 0x8fdd32, 'title')!
    const took = performance.now() - started
    console.log('title', played.seconds, 's in', Math.round(took), 'ms', played.notes.length, 'notes')
    expect(played.left.length).toBeGreaterThan(32000 * 60)
    expect(took).toBeLessThan(5000)
  })
})
