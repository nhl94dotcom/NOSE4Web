// The music editor's notes (MusicEditor.tsx): a MIDI file's notes as readMidi reads them, edited, and written back as
// a MIDI file, which then goes in through the same Replace as a file of one's own. Times are in seconds.
import { DRUMS, FRAMES_PER_SECOND, readMidi, type MidiNote, type SongEvent } from './genesismusic'
import { MIDI_LOOP_MARKER } from './snesmusic'
import { midiLoopStart, midiPartNames, midiPitchBends, type MidiBend } from './snesgamemusic'

export interface EditedMusic {
  name: string
  notes: MidiNote[]
  // Where it ends (a rest at its end kept), and where it plays again from (0: its start).
  end: number
  loop: number
  // Each channel's General MIDI instrument, as the file has it.
  programs: Map<number, number>
  bends: MidiBend[]
  // Each channel's track name, where the file has tracks of their own (a SNES piece's own MIDI file names them as the
  // game names its parts, and its Replace puts each back on that part's instrument and side). The file written here
  // has one track, so they go along beside it (MusicEditor's onDone).
  names: Map<number, string>
}

export function editedMusicOf(bytes: Uint8Array, fallbackName = ''): EditedMusic {
  const { notes, name, end, programs } = readMidi(bytes)
  return { name: (name || fallbackName).slice(0, 40), notes, end, loop: midiLoopStart(bytes), programs, bends: midiPitchBends(bytes), names: midiPartNames(bytes) }
}

const sorted = (notes: MidiNote[]) => [...notes].sort((a, b) => a.start - b.start || a.note - b.note || a.channel - b.channel)
const clampNote = (note: number) => Math.max(0, Math.min(127, note))
const lastSound = (notes: MidiNote[]) => notes.reduce((most, n) => Math.max(most, n.start + n.length), 0)

// The notes picked by index, changed by `change`; the end kept past the last note.
export function changeNotes(music: EditedMusic, picked: ReadonlySet<number>, change: (note: MidiNote) => MidiNote): EditedMusic {
  const notes = music.notes.map((note, i) => (picked.has(i) ? change(note) : note))
  return { ...music, notes, end: Math.max(music.end, lastSound(notes)) }
}

// Moved by `seconds` (not before the start) and `notes` semitones (each within MIDI's notes).
export const moveNotes = (music: EditedMusic, picked: ReadonlySet<number>, seconds: number, notes: number) =>
  changeNotes(music, picked, (n) => ({ ...n, start: Math.max(0, n.start + seconds), note: n.channel === DRUMS ? n.note : clampNote(n.note + notes) }))

// Each made longer or shorter by `seconds`, at least `least` long.
export const lengthenNotes = (music: EditedMusic, picked: ReadonlySet<number>, seconds: number, least = 1 / FRAMES_PER_SECOND) =>
  changeNotes(music, picked, (n) => ({ ...n, length: Math.max(least, n.length + seconds) }))

// Louder or quieter by `factor`, each velocity within 1 to 127.
export const scaleVelocity = (music: EditedMusic, picked: ReadonlySet<number>, factor: number) =>
  changeNotes(music, picked, (n) => ({ ...n, velocity: Math.max(1, Math.min(127, Math.round(n.velocity * factor))) }))

export function deleteNotes(music: EditedMusic, picked: ReadonlySet<number>): EditedMusic {
  return { ...music, notes: music.notes.filter((_, i) => !picked.has(i)) }
}

// A note added; it comes back with the index it has.
export function addNote(music: EditedMusic, note: MidiNote): { music: EditedMusic; index: number } {
  const notes = sorted([...music.notes, note])
  return { music: { ...music, notes, end: Math.max(music.end, note.start + note.length) }, index: notes.indexOf(note) }
}

// The notes of a channel, by index.
export const notesOf = (music: EditedMusic, channel: number) => new Set(music.notes.flatMap((n, i) => (n.channel === channel ? [i] : [])))

// Faster or slower: every time multiplied by 1 / `speed` (1.1 is ten per cent faster).
export function changeSpeed(music: EditedMusic, speed: number): EditedMusic {
  const at = (seconds: number) => seconds / speed
  return {
    ...music,
    notes: music.notes.map((n) => ({ ...n, start: at(n.start), length: at(n.length) })),
    end: at(music.end),
    loop: at(music.loop),
    bends: music.bends.map((b) => ({ ...b, start: at(b.start) })),
  }
}

// Only the stretch from `from` to `to` kept, starting at 0: notes starting in it kept (cut at `to`), the others and
// their bends gone; the loop kept where it is in it, else the start.
export function keepStretch(music: EditedMusic, from: number, to: number): EditedMusic {
  const notes = music.notes.filter((n) => n.start >= from - 1e-9 && n.start < to).map((n) => ({ ...n, start: n.start - from, length: Math.min(n.length, to - n.start) }))
  return {
    ...music,
    notes,
    end: to - from,
    loop: music.loop >= from && music.loop < to ? music.loop - from : 0,
    bends: music.bends.filter((b) => b.start >= from && b.start < to).map((b) => ({ ...b, start: b.start - from })),
  }
}

// The stretches where more than `most` notes sound at once (`counted` picks which notes count), with the most there.
export function crowded(notes: MidiNote[], most: number, counted: (note: MidiNote) => boolean = (n) => n.channel !== DRUMS): { from: number; to: number; count: number }[] {
  // Times to the MIDI file's ticks, so that a note ending as the next begins (after a move, a sum one rounding off)
  // is not taken for an overlap.
  const tick = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND) / TICKS_PER_SECOND
  const edges: { at: number; step: number }[] = []
  for (const n of notes) {
    if (!counted(n) || n.length <= 0) continue
    edges.push({ at: tick(n.start), step: 1 }, { at: tick(n.start + n.length), step: -1 })
  }
  // Ends before starts at one moment: a note ending as the next begins does not overlap it.
  edges.sort((a, b) => a.at - b.at || a.step - b.step)
  const found: { from: number; to: number; count: number }[] = []
  let sounding = 0
  let open: { from: number; to: number; count: number } | null = null
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    sounding += edge.step
    // Every edge of one moment taken together: a note ending as another starts leaves the count as it was.
    if (i + 1 < edges.length && edges[i + 1].at === edge.at) continue
    if (sounding > most) {
      if (!open) open = { from: edge.at, to: edge.at, count: sounding }
      open.count = Math.max(open.count, sounding)
    } else if (open) {
      open.to = edge.at
      if (open.to > open.from) found.push(open)
      open = null
    }
  }
  return found
}

// The notes as the rough preview plays them (songpreview.ts): each channel's, drums left out there.
export function previewEvents(music: EditedMusic): SongEvent[] {
  const events: SongEvent[] = []
  for (const n of music.notes) {
    const on = Math.round(n.start * FRAMES_PER_SECOND)
    const off = Math.max(on + 1, Math.round((n.start + n.length) * FRAMES_PER_SECOND))
    const volume = Math.max(1, Math.min(127, Math.round(n.velocity / 3)))
    events.push({ frame: on, status: 0x90 | n.channel, data: [n.note, volume] }, { frame: off, status: 0x80 | n.channel, data: [n.note, 0x40] })
  }
  return events.sort((a, b) => a.frame - b.frame || (a.status & 0xf0) - (b.status & 0xf0))
}

// Ticks a second the file is written in: 960 a beat at 120 beats a minute, so a frame (1/60 s) is 32 ticks.
const DIVISION = 960
const TICKS_PER_SECOND = 1920

// The MIDI file (format 0, one track, so that notes starting together come back in the order they have here): its name,
// tempo, loop marker (snesmusic.ts's MIDI_LOOP_MARKER) and each channel's instrument, then the notes and pitch bends.
export function editedMusicToMidi(music: EditedMusic): Uint8Array {
  const tick = (seconds: number) => Math.max(0, Math.round(seconds * TICKS_PER_SECOND))
  const ascii = (text: string) => [...text.slice(0, 60)].map((c) => (c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f ? c.charCodeAt(0) : 0x3f))
  // At one tick: the meta events and instruments, then the offs, the bends before notes, the ons, the other bends;
  // each kind in the order of the notes here.
  const events: { tick: number; kind: number; order: number; bytes: number[] }[] = []
  const name = ascii(music.name)
  if (name.length) events.push({ tick: 0, kind: 0, order: 0, bytes: [0xff, 0x03, name.length, ...name] })
  events.push({ tick: 0, kind: 0, order: 1, bytes: [0xff, 0x51, 3, 0x07, 0xa1, 0x20] }) // 500,000 microseconds a beat
  if (music.loop > 0) {
    const marker = ascii(MIDI_LOOP_MARKER)
    events.push({ tick: tick(music.loop), kind: 0, order: 2, bytes: [0xff, 0x06, marker.length, ...marker] })
  }
  const channels = [...new Set(music.notes.map((n) => n.channel))].sort((a, b) => a - b)
  for (const channel of channels) {
    const program = music.programs.get(channel)
    if (program !== undefined && channel !== DRUMS) events.push({ tick: 0, kind: 0, order: 3 + channel, bytes: [0xc0 | channel, program & 0x7f] })
    // The bend range, where a bend has one but 2.
    const range = music.bends.find((b) => b.channel === channel && b.range !== 2)?.range
    if (range !== undefined)
      [[101, 0], [100, 0], [6, range & 0x7f]].forEach(([control, value], k) => events.push({ tick: 0, kind: 0, order: 20 + channel * 3 + k, bytes: [0xb0 | channel, control, value] }))
  }
  music.bends.forEach((b, i) => {
    if (channels.includes(b.channel)) events.push({ tick: tick(b.start), kind: b.first ? 2 : 4, order: i, bytes: [0xe0 | b.channel, b.value & 0x7f, (b.value >> 7) & 0x7f] })
  })
  music.notes.forEach((n, i) => {
    const on = tick(n.start)
    const off = Math.max(on + 1, tick(n.start + n.length))
    events.push({ tick: on, kind: 3, order: i, bytes: [0x90 | n.channel, n.note & 0x7f, Math.max(1, Math.min(127, n.velocity))] })
    events.push({ tick: off, kind: 1, order: i, bytes: [0x80 | n.channel, n.note & 0x7f, 0x40] })
  })
  events.sort((a, b) => a.tick - b.tick || a.kind - b.kind || a.order - b.order)
  const out: number[] = []
  let last = 0
  const vlq = (value: number) => {
    const bytes = [value & 0x7f]
    for (value >>>= 7; value > 0; value >>>= 7) bytes.unshift((value & 0x7f) | 0x80)
    out.push(...bytes)
  }
  for (const e of events) {
    vlq(e.tick - last)
    last = e.tick
    out.push(...e.bytes)
  }
  vlq(Math.max(0, tick(Math.max(music.end, lastSound(music.notes))) - last))
  out.push(0xff, 0x2f, 0)
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (DIVISION >> 8) & 0xff, DIVISION & 0xff]
  return Uint8Array.from([...header, 0x4d, 0x54, 0x72, 0x6b, (out.length >>> 24) & 0xff, (out.length >>> 16) & 0xff, (out.length >>> 8) & 0xff, out.length & 0xff, ...out])
}
