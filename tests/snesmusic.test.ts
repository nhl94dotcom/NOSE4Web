import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readMidi, songToMidi } from '../src/core/genesismusic'
import { buildRom, openRom } from '../src/core/rom'
import { readSnesSong, SNES_SONG_VOICES, snesSongFromMidi, withOriginalSnesSong, withSnesSong } from '../src/core/snesmusic'
import { snesSongChoices, snesSongName } from '../src/core/snessongs'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name = 'NHL94.smc') => openRom(new Uint8Array(readFileSync(path(name))))

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES organ songs from MIDI files', () => {
  it('reads Brass Bonanza with the notes the Genesis has, a tick a frame apart as the game times them', () => {
    const rom = open().bytes
    const brass = snesSongChoices(rom).find((c) => c.name === 'Brass Bonanza')!
    const song = readSnesSong(rom, brass.pointer)!
    expect(song.custom).toBeNull()
    // The melody opens A A A A G F D: MIDI 69 69 69 69 67 65 62.
    const melody = song.events.filter((e) => e.status === 0x90).map((e) => e.data[0])
    expect(melody.slice(0, 7)).toEqual([69, 69, 69, 69, 67, 65, 62])
    expect(song.seconds).toBeGreaterThan(10)
  })

  it('puts a song made from MIDI in place of another for every team that has it, and puts the original back', () => {
    const project = open()
    const brass = snesSongChoices(project.bytes).find((c) => c.name === 'Brass Bonanza')!
    const made = snesSongFromMidi(readMidi(songToMidi(readSnesSong(project.bytes, brass.pointer)!, 'Brass')).notes)
    let most = 0
    let sounding = 0
    for (const e of made.events) {
      if ((e.status & 0xf0) === 0x90) most = Math.max(most, ++sounding)
      else sounding--
    }
    expect(most).toBeLessThanOrEqual(SNES_SONG_VOICES)
    const target = project.teams[1].snesSongs!.find((p) => p !== 0xffffffff)!
    const holders = project.teams.flatMap((t, i) => (t.snesSongs?.includes(target) ? [i] : []))
    const next = withSnesSong(project, target, made, 'Brass from MIDI')
    const pointer = next.teams[holders[0]].snesSongs!.find((p) => p !== target && !project.teams[holders[0]].snesSongs!.includes(p))!
    for (const team of holders) expect(next.teams[team].snesSongs).not.toContain(target)
    const song = readSnesSong(next.bytes, pointer)!
    expect(song.custom).toEqual({ name: 'Brass from MIDI', replaced: target })
    expect(snesSongName(next.bytes, pointer)).toBe('Brass from MIDI')
    expect(song.events.filter((e) => (e.status & 0xf0) === 0x90).length).toBe(made.events.filter((e) => (e.status & 0xf0) === 0x90).length)
    // Downloaded and opened again, the teams have it.
    const reopened = openRom(buildRom(next))
    expect(reopened.teams[holders[0]].snesSongs).toContain(pointer)
    // Put back.
    const back = withOriginalSnesSong(next, pointer)
    for (const team of holders) expect(back.teams[team].snesSongs).toEqual(project.teams[team].snesSongs)
  })

  it('finds the songs in every build', () => {
    for (const name of names) {
      const rom = open(name).bytes
      const choices = snesSongChoices(rom)
      expect(choices.length, name).toBeGreaterThan(10)
      expect(choices.every((c) => readSnesSong(rom, c.pointer) !== null), name).toBe(true)
    }
  })
})
