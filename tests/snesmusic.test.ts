import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readMidi, songToMidi } from '../src/core/genesismusic'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'
import { readSnesMusic, readSnesNotesText, readSnesSong, SNES_GAME_MUSIC, SNES_SONG_VOICES, snesMusicToMidi, snesMusicTune, snesNotesText, snesSongFromMidi, withOriginalSnesSong, withSnesSong } from '../src/core/snesmusic'
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
    // In a project file, opened over a fresh copy of the ROM, the teams have the song again, wherever it now is.
    const fresh = openProjectFile(open(), saveProjectFile(next, project, 'test')).project
    const moved = fresh.teams[holders[0]].snesSongs!.find((p) => !project.teams[holders[0]].snesSongs!.includes(p))!
    expect(readSnesSong(fresh.bytes, moved)?.custom?.name).toBe('Brass from MIDI')
    for (const team of holders) expect(fresh.teams[team].snesSongs).not.toContain(target)
    // Put back.
    const back = withOriginalSnesSong(next, pointer)
    for (const team of holders) expect(back.teams[team].snesSongs).toEqual(project.teams[team].snesSongs)
  })

  it('puts a melody on both organs, its notes running on a frame or two included, and a chord apart', () => {
    // A melody whose notes each run 2 frames into the next, then a three-note chord.
    const melody = [60, 62, 64, 65].map((note, i) => ({ start: i * 0.5, length: 0.5 + 2 / 60, note, velocity: 100, channel: 0 }))
    const chord = [48, 52, 55].map((note) => ({ start: 2, length: 1, note, velocity: 100, channel: 0 }))
    const made = snesSongFromMidi([...melody, ...chord])
    expect(made.tracks[0].map((n) => n.code - 104)).toEqual([60, 62, 64, 65, 55])
    // The last melody note runs 2 frames into the chord, where doubling it would make five voices: it stays on the first.
    expect(made.tracks[1].map((n) => n.code - 104)).toEqual([60, 62, 64, 48, 52])
    // Drums alone make no song.
    expect(() => snesSongFromMidi([{ start: 0, length: 1, note: 36, velocity: 100, channel: 9 }])).toThrow('only drums')
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

describe.skipIf(names.length === 0)("the SNES game's other music", () => {
  it.each(names)('reads the title, menu and playoff music in %s, and exports each as MIDI, a track a part', (name) => {
    const rom = openRom(new Uint8Array(readFileSync(path(name)))).bytes
    const found = SNES_GAME_MUSIC.map(({ pointer, name: piece }) => {
      const music = readSnesMusic(rom, pointer)
      expect(music, piece).not.toBeNull()
      const notes = readMidi(snesMusicToMidi(music!, piece)).notes
      // Every note is in the file: the tunes at their pitches, the drums and the percussion parts on the drum channel;
      // but the playoff music's organ line once, not on both its organ entries (put back, it is doubled again).
      const all = music!.parts.reduce((sum, part) => sum + part.notes.length, 0)
      const doubled = pointer === SNES_GAME_MUSIC[2].pointer ? 102 : 0
      expect(notes.length).toBe(all - doubled)
      const drums = music!.parts.find((part) => part.drums)!
      expect(notes.filter((note) => note.channel === 9).length).toBeGreaterThanOrEqual(drums.notes.length)
      // The preview leaves the drums out (and plays both organ lines).
      expect(snesMusicTune(music!).filter((e) => (e.status & 0xf0) === 0x90).length).toBe(notes.filter((note) => note.channel !== 9).length + doubled)
      return [music!.parts.length, Math.round(music!.seconds)]
    })
    expect(found).toEqual([[13, 88], [14, 70], [14, 28]])
  })
})

// A MIDI file's tracks: each one's name, its texts, and its channel events (status and data bytes).
function midiTrackEvents(bytes: Uint8Array) {
  const u32 = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  const tracks: { name: string; texts: string[]; events: number[][] }[] = []
  let at = 8 + u32(4)
  while (at + 8 <= bytes.length) {
    const end = at + 8 + u32(at + 4)
    let p = at + 8
    let running = 0
    const track = { name: '', texts: [] as string[], events: [] as number[][] }
    const vlq = () => {
      let value = 0
      for (let i = 0; i < 4; i++) {
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
        const text = String.fromCharCode(...bytes.subarray(p, p + length))
        if (type === 0x03) track.name = text
        if (type === 0x01) track.texts.push(text)
        p += length
        continue
      }
      running = status
      const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2
      track.events.push([status, ...bytes.subarray(p, p + size)])
      p += size
    }
    tracks.push(track)
    at = end
  }
  return tracks
}

describe("the SNES game's percussion parts in MIDI files", () => {
  it('says what the game plays each percussion note with: its code, entry and track volume', () => {
    const notes = [
      { note: 66, entry: 4, volume: 79 },
      { note: 66, entry: 4, volume: 79 },
      { note: 68, entry: 35, volume: 97 },
      { note: 65, entry: 4, volume: null },
    ].map((n, i) => ({ ...n, frame: i, length: 1, velocity: 100, tick: i, ticks: 1 }))
    const text = snesNotesText(notes)
    expect(text).toBe('SNES notes #4 v79: 66 66 #35 v97: 68 #4 v127: 65')
    expect(readSnesNotesText(text)).toEqual(notes.map((n) => ({ code: n.note, entry: n.entry, volume: n.volume ?? 127 })))
    for (const other of ['', 'Drums', 'SNES notes', 'SNES notes 66', 'SNES notes #4 v79: x', 'SNES notes #4: 200', 'SNES notes # v: 5', 'SNES notes #0x10 v1e2: 32', 'SNES notes #4 v79 5', 'SNES notes #4 v79: 0x20']) expect(readSnesNotesText(other), other).toBeNull()
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('puts each percussion part on the drum channel on a track of its own, with that text and no channel volume', () => {
    const rom = open().bytes
    SNES_GAME_MUSIC.forEach((piece, index) => {
      const music = readSnesMusic(rom, piece.pointer)!
      const tracks = midiTrackEvents(snesMusicToMidi(music, piece.name))
      // The crashes', cowbell's and open hi-hat's parts (title: 2, menu: 3, playoff: 2), each as the game plays it.
      const percussion = music.parts.filter((part) => !part.drums && /crash|crsh|cow|hat/i.test(part.name))
      expect(percussion.length, piece.name).toBe([2, 3, 2][index])
      for (const part of percussion) {
        const track = tracks.find((t) => t.name === part.name)!
        expect(track.events.every(([status]) => (status & 0x0f) === 9), part.name).toBe(true)
        const said = track.texts.map(readSnesNotesText).find((n) => n)!
        const heard = part.notes.filter((n) => n.entry >= 0)
        expect(said, part.name).toEqual(heard.map((n) => ({ code: n.note, entry: n.entry, volume: n.volume ?? 127 })))
        expect(track.events.filter(([status]) => (status & 0xf0) === 0x90)).toHaveLength(heard.length)
      }
      // No channel volume on the drum channel: a MIDI player plays every drum at the file's velocities, as before.
      expect(tracks.flatMap((t) => t.events).filter(([status, controller]) => status === 0xb9 && controller === 7)).toEqual([])
    })
  })
})
