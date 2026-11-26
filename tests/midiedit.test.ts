import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultPartChoices, GAME_MUSIC, gameMusicFromMidi, gameMusicToMidi, musicParts, readMidi, readSong, songFromMidi, songToMidi, type MidiNote } from '../src/core/genesismusic'
import { addNote, changeSpeed, crowded, deleteNotes, editedMusicOf, editedMusicToMidi, keepStretch, lengthenNotes, moveNotes, scaleVelocity, type EditedMusic } from '../src/core/midiedit'
import { nhl95MusicFromMidi, nhl95PartChoices, NHL95_GAME_MUSIC, readNhl95Music } from '../src/core/nhl95music'
import { openRom } from '../src/core/rom'
import { defaultSnesPartChoices, midiLoopStart, midiPartNames, midiPitchBends, snesMusicFromMidi, snesMusicKit, snesMusicTempo } from '../src/core/snesgamemusic'
import { readSnesMusic, SNES_GAME_MUSIC, snesMusicToMidi } from '../src/core/snesmusic'

// The music editor's notes (midiedit.ts): edits, the too-many-at-once check, and the MIDI file it writes, which reads
// back as the same notes, so a piece opened and put in unedited goes in as its own MIDI file would.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const note = (start: number, length: number, pitch: number, channel = 0, velocity = 100): MidiNote => ({ start, length, note: pitch, velocity, channel })
const music = (notes: MidiNote[], more: Partial<EditedMusic> = {}): EditedMusic => ({ name: 'Test', notes, end: 4, loop: 0, programs: new Map(), bends: [], names: new Map(), ...more })
const all = (m: EditedMusic) => new Set(m.notes.map((_, i) => i))
const rounded = (notes: MidiNote[]) => notes.map((n) => ({ ...n, start: Math.round(n.start * 960), length: Math.round(n.length * 960) }))

describe('the music editor', () => {
  it('writes a MIDI file that reads back as the same notes, loop, instruments and end', () => {
    const before = music([note(0, 0.5, 60), note(0, 0.5, 64), note(0.5, 0.25, 67, 1, 80), note(1, 0.1, 36, 9), note(1.5, 1, 60), note(2.5, 0.5, 60)], { loop: 1, end: 3.25, programs: new Map([[0, 16], [1, 38]]) })
    const after = editedMusicOf(editedMusicToMidi(before))
    expect(after.name).toBe('Test')
    expect(rounded(after.notes)).toEqual(rounded([...before.notes].sort((a, b) => a.start - b.start || a.note - b.note)))
    expect(after.loop).toBeCloseTo(1, 6)
    expect(after.end).toBeCloseTo(3.25, 6)
    expect(after.programs).toEqual(new Map([[0, 16], [1, 38]]))
  })

  it('keeps a note ending as the same key starts again', () => {
    const after = editedMusicOf(editedMusicToMidi(music([note(0, 0.5, 60), note(0.5, 0.5, 60)])))
    expect(rounded(after.notes)).toEqual(rounded([note(0, 0.5, 60), note(0.5, 0.5, 60)]))
  })

  it('moves, lengthens, quietens, deletes and adds notes', () => {
    const m = music([note(0, 0.5, 60), note(1, 0.5, 36, 9)])
    const moved = moveNotes(m, all(m), 0.25, 12)
    expect(moved.notes.map((n) => [n.start, n.note])).toEqual([[0.25, 72], [1.25, 36]])
    expect(moveNotes(m, new Set([0]), -5, 100).notes[0]).toMatchObject({ start: 0, note: 127 })
    expect(lengthenNotes(m, new Set([0]), -1).notes[0].length).toBeCloseTo(1 / 60)
    expect(scaleVelocity(m, new Set([0]), 2).notes[0].velocity).toBe(127)
    expect(deleteNotes(m, new Set([0])).notes).toEqual([m.notes[1]])
    const added = addNote(m, note(0.5, 4, 62))
    expect(added.music.notes[added.index]).toMatchObject({ start: 0.5, note: 62 })
    expect(added.music.end).toBe(4.5)
  })

  it('changes the speed and cuts a stretch', () => {
    const m = music([note(0, 1, 60), note(2, 1, 62), note(3.5, 1, 64)], { loop: 2, end: 6 })
    const faster = changeSpeed(m, 2)
    expect(faster.notes.map((n) => [n.start, n.length])).toEqual([[0, 0.5], [1, 0.5], [1.75, 0.5]])
    expect([faster.loop, faster.end]).toEqual([1, 3])
    const cut = keepStretch(m, 2, 4)
    expect(cut.notes.map((n) => [n.start, n.length, n.note])).toEqual([[0, 1, 62], [1.5, 0.5, 64]])
    expect([cut.loop, cut.end]).toEqual([0, 2])
  })

  it('finds where too many notes sound at once', () => {
    const notes = [note(0, 2, 60), note(0, 1, 64), note(0.5, 1, 67), note(1, 1, 71), note(0, 2, 36, 9)]
    // Three at once from 0.5 to 1 (64 ends as 71 starts), then 60, 67 and 71 to 1.5.
    expect(crowded(notes, 2)).toEqual([{ from: 0.5, to: 1.5, count: 3 }])
    expect(crowded(notes, 3)).toEqual([])
    expect(crowded(notes, 3, () => true)).toEqual([{ from: 0.5, to: 1.5, count: 4 }])
  })
})

// Opened in the editor and put in with no change: as the piece's own MIDI file would go in.
describe.skipIf(!existsSync(path('nhl94.bin')))('the music editor on NHL 94', () => {
  it('leaves an organ song and the title music as they are', () => {
    const rom = open('nhl94.bin').bytes
    for (const number of [0x31, 0x40, 0x77]) {
      const own = songToMidi(readSong(rom, number)!, 'x')
      const edited = editedMusicToMidi(editedMusicOf(own))
      expect(songFromMidi(readMidi(edited).notes).events, `song ${number}`).toEqual(songFromMidi(readMidi(own).notes).events)
    }
    for (const piece of GAME_MUSIC) {
      const own = gameMusicToMidi(readSong(rom, piece.number)!, piece.name)
      const edited = editedMusicToMidi(editedMusicOf(own))
      const made = (bytes: Uint8Array) => {
        const { notes, end, programs } = readMidi(bytes)
        return gameMusicFromMidi(notes, defaultPartChoices(musicParts(notes), programs), end)
      }
      expect(made(edited).events, piece.name).toEqual(made(own).events)
    }
  })
})

describe.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("the music editor on NHL '95", () => {
  it('leaves the game music as it is', () => {
    const rom = open('NHL95/NHL_95.bin').bytes
    for (const piece of NHL95_GAME_MUSIC) {
      const own = gameMusicToMidi(readNhl95Music(rom, piece.number)!, piece.name, 95)
      const edited = editedMusicToMidi(editedMusicOf(own))
      const made = (bytes: Uint8Array) => {
        const { notes, end, programs } = readMidi(bytes)
        return nhl95MusicFromMidi(notes, nhl95PartChoices(musicParts(notes), notes, programs), end)
      }
      expect(made(edited).stream, piece.name).toEqual(made(own).stream)
    }
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('the music editor on the SNES', () => {
  it('keeps the notes, loop and length of the game music', () => {
    const project = open('NHL94.smc')
    SNES_GAME_MUSIC.forEach((piece, index) => {
      const own = snesMusicToMidi(readSnesMusic(project.bytes, piece.pointer)!, piece.name)
      const edited = editedMusicToMidi(editedMusicOf(own))
      const [before, after] = [readMidi(own).notes, readMidi(edited).notes]
      expect(after.map((n) => [n.note, n.channel, n.velocity]), piece.name).toEqual(before.map((n) => [n.note, n.channel, n.velocity]))
      for (const [i, n] of after.entries()) expect(Math.max(Math.abs(n.start - before[i].start), Math.abs(n.length - before[i].length))).toBeLessThan(0.001)
      expect(midiLoopStart(edited)).toBeCloseTo(midiLoopStart(own), 3)
      // And with the track names it carries beside it, its parts go on the instruments (and sides) the piece's own
      // file's names give them: as the own file without its own volumes and percussion tracks would.
      const kit = snesMusicKit(project.bytes, piece.sounds)!
      const names = editedMusicOf(own).names
      expect(names, piece.name).toEqual(midiPartNames(own))
      const made = (bytes: Uint8Array) => {
        const { notes, end, programs } = readMidi(bytes)
        return snesMusicFromMidi(kit, notes, defaultSnesPartChoices(kit, musicParts(notes), programs, names), end, { tempo: snesMusicTempo(project.bytes, index), loop: midiLoopStart(bytes), bends: midiPitchBends(bytes) }, null)
      }
      const { notes: ownNotes, programs: ownPrograms } = readMidi(own)
      expect(defaultSnesPartChoices(kit, musicParts(ownNotes), ownPrograms, names)).toEqual(defaultSnesPartChoices(kit, musicParts(ownNotes), ownPrograms, midiPartNames(own)))
      const [a, b] = [made(own), made(edited)]
      expect([b.ticks, b.loop], piece.name).toEqual([a.ticks, a.loop])
      expect(b.tracks, piece.name).toEqual(a.tracks)
    })
  })
})
