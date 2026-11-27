import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { DRUMS, MidiError, type MidiNote, type SongEvent } from './core/genesismusic'
import type { SnesMusicRender } from './core/snesaudio'
import {
  addNote,
  changeSpeed,
  crowded,
  deleteNotes,
  editedMusicOf,
  editedMusicToMidi,
  keepStretch,
  lengthenNotes,
  moveNotes,
  notesOf,
  previewEvents,
  scaleVelocity,
  type EditedMusic,
} from './core/midiedit'
import { download } from './download'
import { SongControls, useSongPlayer } from './SongPlayer'

// The music editor: a piece's notes on a piano roll, to change before they go into the ROM. What comes out is a MIDI
// file, which goes in through the section's own Replace (so on the game's instruments and within its limits, as a file
// of one's own would).

// How many notes the game plays at once, for the warning: in all (drums counted or not), or in each part.
export interface MusicLimit {
  most: number
  perPart?: boolean
  // Which notes count (by default all but the drums).
  counts?: (note: MidiNote) => boolean
  // Said with the warning, as "the organ plays 4 notes at once".
  text: string
}

interface Props {
  music: EditedMusic
  // What it is being made for, as "song 5" or "the title music".
  title: string
  limit: MusicLimit
  // The button that puts it in, as "Put it in" or "Choose the instruments".
  doneLabel: string
  // The music as it would go in, to play: its notes as the game has them, and on the SNES its sound on the game's
  // instruments. Said under Play, as "Play plays it as it would go in, on the organ."
  preview: (midi: Uint8Array, name: string, names: Map<number, string>) => { events: SongEvent[]; sound?: () => SnesMusicRender | null }
  previewText: string
  // The MIDI file, its name, and its parts' track names (EditedMusic's names).
  onDone: (midi: Uint8Array, name: string, names: Map<number, string>) => void
  onCancel: () => void
}

const ROW = 7
const RULER = 16
const STRIP = 8
const KEYS = 34
// Wide enough for a long piece, and within what every browser draws on a canvas.
const MAX_WIDTH = 12000
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (note: number) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`
const BLACK = new Set([1, 3, 6, 8, 10])
const COLOURS = ['#2563a8', '#c2410c', '#15803d', '#7e22ce', '#b45309', '#0e7490', '#be123c', '#4d7c0f', '#6d28d9', '#64748b', '#a21caf', '#0369a1', '#9a3412', '#047857', '#7c2d12', '#334155']
const STEPS = [
  { label: '1/60 second (a frame)', value: 1 / 60 },
  { label: '1/16 second', value: 1 / 16 },
  { label: '1/8 second', value: 1 / 8 },
  { label: '1/4 second', value: 1 / 4 },
  { label: '1/2 second', value: 1 / 2 },
]
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`

type Drag =
  | { kind: 'move'; x: number; y: number; dx: number; dy: number }
  | { kind: 'length'; x: number; dx: number }
  | { kind: 'box'; x: number; y: number; x2: number; y2: number; add: boolean }

export function MusicEditor({ music: first, title, limit, doneLabel, preview, previewText, onDone, onCancel }: Props) {
  const [history, setHistory] = useState<{ list: EditedMusic[]; at: number }>({ list: [first], at: 0 })
  const music = history.list[history.at]
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [step, setStep] = useState(1 / 16)
  const [speed, setSpeed] = useState('100')
  const [stretch, setStretch] = useState({ from: '', to: '' })
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const player = useSongPlayer<string>()
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const keys = useRef<HTMLCanvasElement>(null)

  const channels = useMemo(() => [...new Set(music.notes.map((n) => n.channel))].sort((a, b) => a - b), [music])
  const [chosen, setActive] = useState(() => channels.find((c) => c !== DRUMS) ?? 0)
  // The part new notes go to: the one chosen, or where it has gone (its notes all deleted, another file opened), the first.
  const active = channels.includes(chosen) ? chosen : (channels.find((c) => c !== DRUMS) ?? channels[0] ?? 0)
  const colourOf = (channel: number) => COLOURS[channel % COLOURS.length]
  const duration = Math.max(music.end, music.notes.reduce((most, n) => Math.max(most, n.start + n.length), 0), 1)
  const [zoom, setZoom] = useState(() => Math.max(20, Math.min(200, 900 / duration)))
  const pxPerSecond = Math.min(zoom, MAX_WIDTH / duration)
  const pitches = music.notes.filter((n) => n.channel !== DRUMS).map((n) => n.note)
  const top = Math.min(127, (pitches.length ? Math.max(...pitches) : 72) + 3)
  const bottom = Math.max(0, (pitches.length ? Math.min(...pitches) : 48) - 3)
  // The drums on rows of their own below the tune, one for each drum sound.
  const drumNotes = [...new Set(music.notes.filter((n) => n.channel === DRUMS).map((n) => n.note))].sort((a, b) => b - a)
  const rows = top - bottom + 1 + drumNotes.length
  const width = Math.ceil(duration * pxPerSecond) + 40
  const height = RULER + rows * ROW + STRIP
  const rowOf = (n: MidiNote) => (n.channel === DRUMS ? top - bottom + 1 + drumNotes.indexOf(n.note) : top - n.note)
  const xOf = (seconds: number) => seconds * pxPerSecond
  const yOf = (row: number) => RULER + row * ROW

  const over = useMemo(() => {
    if (!limit.perPart) return crowded(music.notes, limit.most, limit.counts)
    return channels
      .filter((c) => c !== DRUMS)
      .flatMap((c) => crowded(music.notes, limit.most, (n) => n.channel === c))
      .sort((a, b) => a.from - b.from)
  }, [music, limit, channels])

  const change = (next: EditedMusic, nextPicked = picked) => {
    setHistory(({ list, at }) => ({ list: [...list.slice(0, at + 1), next].slice(-200), at: Math.min(at + 1, 199) }))
    setPicked(nextPicked)
    player.stop()
  }
  const undo = () => history.at > 0 && (setHistory({ ...history, at: history.at - 1 }), setPicked(new Set()))
  const redo = () => history.at < history.list.length - 1 && (setHistory({ ...history, at: history.at + 1 }), setPicked(new Set()))

  // The note under a point, and whether at its end (to lengthen it).
  const hit = (x: number, y: number) => {
    for (let i = music.notes.length - 1; i >= 0; i--) {
      const n = music.notes[i]
      if (hidden.has(n.channel)) continue
      const left = xOf(n.start)
      const right = Math.max(left + 3, xOf(n.start + n.length))
      const row = yOf(rowOf(n))
      if (x >= left && x <= right + 2 && y >= row && y < row + ROW) return { index: i, end: x >= right - 4 }
    }
    return null
  }
  const point = (e: { clientX: number; clientY: number }) => {
    const box = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const snap = (seconds: number) => Math.round(seconds / step) * step

  const draw = () => {
    const c = canvas.current?.getContext('2d')
    const k = keys.current?.getContext('2d')
    if (!c || !k) return
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    const field = dark ? '#23262b' : '#ffffff'
    const shade = dark ? '#1c1f23' : '#eef0f3'
    const line = dark ? '#3a3f47' : '#d0d4da'
    const text = dark ? '#e6e8eb' : '#1a1c1f'
    c.clearRect(0, 0, width, height)
    c.fillStyle = field
    c.fillRect(0, 0, width, height)
    for (let row = 0; row < rows; row++) {
      const note = top - row
      const isDrum = row > top - bottom
      if (isDrum || BLACK.has(note % 12)) {
        c.fillStyle = shade
        c.fillRect(0, yOf(row), width, ROW)
      }
      if (!isDrum && note % 12 === 0) {
        c.fillStyle = line
        c.fillRect(0, yOf(row) + ROW - 1, width, 1)
      }
    }
    if (drumNotes.length) {
      c.fillStyle = text
      c.fillRect(0, yOf(top - bottom + 1), width, 1)
    }
    // Seconds along the top.
    c.fillStyle = text
    c.font = '10px system-ui, sans-serif'
    const every = pxPerSecond >= 60 ? 1 : pxPerSecond >= 25 ? 2 : 5
    for (let s = 0; s <= duration; s += every) {
      c.fillStyle = line
      c.fillRect(xOf(s), RULER, 1, rows * ROW)
      c.fillStyle = text
      c.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, xOf(s) + 2, 11)
    }
    // Too many at once: red behind the notes and in the strip below.
    for (const span of over) {
      c.fillStyle = 'rgba(220, 38, 38, 0.15)'
      c.fillRect(xOf(span.from), RULER, Math.max(2, xOf(span.to - span.from)), rows * ROW)
      c.fillStyle = '#dc2626'
      c.fillRect(xOf(span.from), RULER + rows * ROW, Math.max(2, xOf(span.to - span.from)), STRIP)
    }
    if (music.loop > 0) {
      c.fillStyle = '#15803d'
      c.fillRect(xOf(music.loop), 0, 2, height)
    }
    c.fillStyle = text
    c.fillRect(xOf(music.end), 0, 1, height)
    const moving = drag?.kind === 'move' ? { dt: snap(drag.dx / pxPerSecond), dp: Math.round(-drag.dy / ROW) } : null
    const longer = drag?.kind === 'length' ? snap(drag.dx / pxPerSecond) : 0
    music.notes.forEach((n, i) => {
      if (hidden.has(n.channel)) return
      const isPicked = picked.has(i)
      const start = n.start + (isPicked && moving ? moving.dt : 0)
      const length = Math.max(1 / 60, n.length + (isPicked ? longer : 0))
      const shifted = isPicked && moving && n.channel !== DRUMS ? { ...n, note: n.note + moving.dp } : n
      const x = xOf(Math.max(0, start))
      const y = yOf(rowOf(shifted))
      c.globalAlpha = 0.45 + (0.55 * n.velocity) / 127
      c.fillStyle = colourOf(n.channel)
      c.fillRect(x, y + 1, Math.max(3, xOf(length) - 1), ROW - 2)
      c.globalAlpha = 1
      if (isPicked) {
        c.strokeStyle = text
        c.lineWidth = 1.5
        c.strokeRect(x - 0.5, y + 0.5, Math.max(3, xOf(length) - 1) + 1, ROW - 1)
      }
    })
    if (drag?.kind === 'box') {
      c.strokeStyle = text
      c.setLineDash([3, 3])
      c.strokeRect(Math.min(drag.x, drag.x2), Math.min(drag.y, drag.y2), Math.abs(drag.x2 - drag.x), Math.abs(drag.y2 - drag.y))
      c.setLineDash([])
    }
    if (player.playing !== null) {
      c.fillStyle = '#dc2626'
      c.fillRect(xOf(player.position), 0, 2, height)
    }
    // The keys beside it.
    k.clearRect(0, 0, KEYS, height)
    k.fillStyle = field
    k.fillRect(0, 0, KEYS, height)
    k.font = '9px system-ui, sans-serif'
    for (let row = 0; row < rows; row++) {
      const isDrum = row > top - bottom
      const note = isDrum ? drumNotes[row - (top - bottom + 1)] : top - row
      if (!isDrum && BLACK.has(note % 12)) {
        k.fillStyle = shade
        k.fillRect(0, yOf(row), KEYS, ROW)
      }
      if (isDrum || note % 12 === 0) {
        k.fillStyle = text
        k.fillText(isDrum ? `d${note}` : noteName(note), 2, yOf(row) + ROW)
      }
    }
  }
  useEffect(draw)

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // The left button (or a touch) only.
    if (e.button !== 0) return
    canvas.current!.focus()
    canvas.current!.setPointerCapture?.(e.pointerId)
    const { x, y } = point(e)
    const found = hit(x, y)
    if (!found) {
      setDrag({ kind: 'box', x, y, x2: x, y2: y, add: e.shiftKey })
      return
    }
    let next = picked
    if (e.shiftKey) {
      next = new Set(picked)
      if (next.has(found.index)) next.delete(found.index)
      else next.add(found.index)
    } else if (!picked.has(found.index)) next = new Set([found.index])
    setPicked(next)
    setDrag(found.end ? { kind: 'length', x, dx: 0 } : { kind: 'move', x, y, dx: 0, dy: 0 })
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = point(e)
    if (!drag) {
      const found = hit(x, y)
      canvas.current!.style.cursor = found ? (found.end ? 'ew-resize' : 'move') : 'crosshair'
      return
    }
    if (drag.kind === 'box') setDrag({ ...drag, x2: x, y2: y })
    else if (drag.kind === 'move') setDrag({ ...drag, dx: x - drag.x, dy: y - drag.y })
    else setDrag({ ...drag, dx: x - drag.x })
  }
  const onPointerUp = () => {
    if (!drag) return
    setDrag(null)
    if (drag.kind === 'box') {
      const [x1, x2] = [Math.min(drag.x, drag.x2), Math.max(drag.x, drag.x2)]
      const [y1, y2] = [Math.min(drag.y, drag.y2), Math.max(drag.y, drag.y2)]
      if (x2 - x1 < 3 && y2 - y1 < 3) {
        if (!drag.add) setPicked(new Set())
        return
      }
      const inside = music.notes.flatMap((n, i) => {
        if (hidden.has(n.channel)) return []
        const y = yOf(rowOf(n))
        return xOf(n.start + n.length) >= x1 && xOf(n.start) <= x2 && y + ROW >= y1 && y <= y2 ? [i] : []
      })
      setPicked(new Set([...(drag.add ? picked : []), ...inside]))
      return
    }
    if (drag.kind === 'move') {
      const dt = snap(drag.dx / pxPerSecond)
      const dp = Math.round(-drag.dy / ROW)
      if (dt || dp) change(moveNotes(music, picked, dt, dp))
      return
    }
    const dl = snap(drag.dx / pxPerSecond)
    if (dl) change(lengthenNotes(music, picked, dl))
  }
  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = point(e)
    if (hit(x, y)) return
    const row = Math.floor((y - RULER) / ROW)
    if (row < 0 || row >= rows || hidden.has(active)) return
    // A drum goes on a drum's row, and a note of the tune on a note's.
    const isDrum = active === DRUMS
    if (isDrum !== row > top - bottom) return
    const pitch = isDrum ? drumNotes[row - (top - bottom + 1)] : top - row
    const note: MidiNote = { start: Math.max(0, snap(x / pxPerSecond)), length: Math.max(step, 0.25), note: pitch, velocity: 100, channel: active }
    const added = addNote(music, note)
    change(added.music, new Set([added.index]))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
      return
    }
    if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
      return
    }
    if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setPicked(new Set(music.notes.flatMap((n, i) => (hidden.has(n.channel) ? [] : [i]))))
      return
    }
    if (picked.size === 0) return
    const act: Record<string, () => EditedMusic> = {
      Delete: () => deleteNotes(music, picked),
      Backspace: () => deleteNotes(music, picked),
      ArrowUp: () => moveNotes(music, picked, 0, e.shiftKey ? 12 : 1),
      ArrowDown: () => moveNotes(music, picked, 0, e.shiftKey ? -12 : -1),
      ArrowLeft: () => (e.shiftKey ? lengthenNotes(music, picked, -step) : moveNotes(music, picked, -step, 0)),
      ArrowRight: () => (e.shiftKey ? lengthenNotes(music, picked, step) : moveNotes(music, picked, step, 0)),
    }
    if (!act[e.key]) return
    e.preventDefault()
    const deleting = e.key === 'Delete' || e.key === 'Backspace'
    change(act[e.key](), deleting ? new Set() : picked)
  }

  const openFile = async (file: File) => {
    try {
      const opened = editedMusicOf(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.midi?$/i, ''))
      change(opened, new Set())
      setHidden(new Set())
      setNotice(`Opened ${file.name}. Undo goes back to the notes before.`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }
  const applySpeed = () => {
    const percent = Number(speed)
    if (!(percent >= 25 && percent <= 400)) {
      setNotice('The speed has to be from 25 to 400 per cent.')
      setFailed(true)
      return
    }
    if (percent !== 100) change(changeSpeed(music, percent / 100))
    setSpeed('100')
    setNotice('')
  }
  const applyStretch = () => {
    const from = stretch.from === '' ? 0 : Number(stretch.from)
    const to = stretch.to === '' ? music.end : Number(stretch.to)
    if (!(from >= 0 && to > from)) {
      setNotice('Give the seconds to keep from and to, the second after the first.')
      setFailed(true)
      return
    }
    change(keepStretch(music, from, to), new Set())
    setStretch({ from: '', to: '' })
    setNotice('')
  }
  // As it would go in (the parts shown only), else, where it cannot go in as it is, its notes as they are.
  const play = () => {
    if (player.playing === 'edit') return player.stop()
    const shown = { ...music, notes: music.notes.filter((n) => !hidden.has(n.channel)) }
    if (shown.notes.length === 0) return
    try {
      const made = preview(editedMusicToMidi(shown), music.name || title, music.names)
      player.toggle('edit', made.events, music.name || title, made.sound)
      setNotice('')
    } catch (e) {
      player.toggle('edit', previewEvents(shown), music.name || title)
      setNotice(`It cannot go in as it is (${e instanceof Error ? e.message : String(e)}), so Play plays its notes as they are, on one sound.`)
      setFailed(true)
    }
  }
  const forPart = (channel: number, edit: (music: EditedMusic, part: Set<number>) => EditedMusic) => change(edit(music, notesOf(music, channel)))
  const pickedNotes = [...picked].map((i) => music.notes[i]).filter(Boolean)

  return (
    <div className="notice music-editor">
      <p>
        Editing the notes for <b>{title}</b>.{' '}
        <label>
          Name <input value={music.name} maxLength={40} aria-label="Name of the music" onChange={(e) => setHistory({ list: history.list.map((m, i) => (i === history.at ? { ...m, name: e.target.value } : m)), at: history.at })} />
        </label>
      </p>
      <p className="note">
        Click a note to pick it, Shift-click to pick more, or drag a box around several. Drag picked notes to move them,
        or drag a note's right end to lengthen it. Double-click an empty spot to add a note to the part chosen below. Keys:
        Delete removes the picked notes; the up and down arrows move them a semitone (with Shift, an octave); left and
        right move them a step (with Shift, make them longer or shorter); Ctrl+Z undoes, Ctrl+Y redoes, Ctrl+A picks all.
      </p>
      <p className="music-editor-tools">
        <button onClick={undo} disabled={history.at === 0}>
          Undo
        </button>{' '}
        <button onClick={redo} disabled={history.at === history.list.length - 1}>
          Redo
        </button>{' '}
        <button onClick={play}>{player.playing === 'edit' ? 'Stop' : 'Play'}</button>{' '}
        <label>
          Step{' '}
          <select value={step} aria-label="Step" onChange={(e) => setStep(Number(e.target.value))}>
            {STEPS.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Zoom <input type="range" aria-label="Zoom" min={10} max={400} value={Math.round(zoom)} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>{' '}
        <label className="button">
          Open a MIDI file…
          <input
            type="file"
            accept=".mid,.midi,audio/midi"
            hidden
            aria-label="Open a MIDI file in the editor"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void openFile(file)
            }}
          />
        </label>{' '}
        <button onClick={() => download(editedMusicToMidi(music), `${(music.name || 'music').replace(/[^A-Za-z0-9]+/g, '_')}.mid`, 'audio/midi')}>Save as MIDI</button>
      </p>
      <p className="note">
        {previewText} Hide a part (Shown, below) to hear the others without it.
      </p>
      <SongControls player={player} />
      <div className="music-roll">
        <canvas ref={keys} width={KEYS} height={height} className="music-keys" aria-hidden="true" />
        <div className="music-scroll" ref={scroller}>
          <canvas
            ref={canvas}
            width={width}
            height={height}
            tabIndex={0}
            aria-label="Piano roll"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <p className={over.length ? 'error' : 'note'} role="status">
        {over.length ? (
          <>
            More notes at once than go in, in {over.length} {over.length === 1 ? 'place' : 'places'} (red), up to {Math.max(...over.map((o) => o.count))}
            {limit.perPart ? ' in a part' : ''}: {limit.text}. There some notes are left out or cut short when it goes in. The game's own music often has
            such places too. First at{' '}
            {over.slice(0, 5).map((o, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <button className="link" onClick={() => scroller.current?.scrollTo({ left: Math.max(0, xOf(o.from) - 100) })}>
                  {clock(o.from)}
                </button>
              </span>
            ))}
            .
          </>
        ) : (
          <>Never more notes at once than go in: {limit.text}.</>
        )}{' '}
        {music.notes.length} notes, {clock(music.end)} long{music.loop > 0 ? `, playing again from ${clock(music.loop)} (the green line)` : ''}.
        {pickedNotes.length > 0 && (
          <>
            {' '}
            Picked: {pickedNotes.length === 1 ? `${pickedNotes[0].channel === DRUMS ? `drum ${pickedNotes[0].note}` : noteName(pickedNotes[0].note)} at ${clock(pickedNotes[0].start)}, ${pickedNotes[0].length.toFixed(2)} s, velocity ${pickedNotes[0].velocity}` : `${pickedNotes.length} notes`}.{' '}
            <button onClick={() => change(scaleVelocity(music, picked, 0.8))}>Quieter</button> <button onClick={() => change(scaleVelocity(music, picked, 1.25))}>Louder</button>{' '}
            <button onClick={() => change(deleteNotes(music, picked), new Set())}>Delete</button>
          </>
        )}
      </p>
      <table className="left">
        <thead>
          <tr>
            <th>Part</th>
            <th>Notes</th>
            <th>Range</th>
            <th>Shown</th>
            <th>New notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => {
            const own = music.notes.filter((n) => n.channel === channel)
            const low = Math.min(...own.map((n) => n.note))
            const high = Math.max(...own.map((n) => n.note))
            const name = channel === DRUMS ? 'MIDI channel 10 (drums)' : `MIDI channel ${channel + 1}`
            return (
              <tr key={channel}>
                <td>
                  <span className="music-swatch" style={{ background: colourOf(channel) }} /> {name}
                </td>
                <td>{own.length}</td>
                <td>{channel === DRUMS ? '' : `${noteName(low)} to ${noteName(high)}`}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Show ${name}`}
                    checked={!hidden.has(channel)}
                    onChange={(e) => {
                      const next = new Set(hidden)
                      if (e.target.checked) next.delete(channel)
                      else next.add(channel)
                      setHidden(next)
                      setPicked(new Set([...picked].filter((i) => !next.has(music.notes[i]?.channel))))
                    }}
                  />
                </td>
                <td>
                  <input type="radio" name="music-active" aria-label={`Add new notes to ${name}`} checked={active === channel} onChange={() => setActive(channel)} />
                </td>
                <td>
                  <button
                    onClick={() => {
                      // A hidden part shows again when its notes are picked, so that what is picked is seen.
                      if (hidden.has(channel)) setHidden(new Set([...hidden].filter((c) => c !== channel)))
                      setPicked(notesOf(music, channel))
                    }}
                  >
                    Pick all
                  </button>{' '}
                  {channel !== DRUMS && (
                    <>
                      <button aria-label={`${name} an octave down`} onClick={() => forPart(channel, (m, p) => moveNotes(m, p, 0, -12))}>
                        −8ve
                      </button>{' '}
                      <button aria-label={`${name} a semitone down`} onClick={() => forPart(channel, (m, p) => moveNotes(m, p, 0, -1))}>
                        −1
                      </button>{' '}
                      <button aria-label={`${name} a semitone up`} onClick={() => forPart(channel, (m, p) => moveNotes(m, p, 0, 1))}>
                        +1
                      </button>{' '}
                      <button aria-label={`${name} an octave up`} onClick={() => forPart(channel, (m, p) => moveNotes(m, p, 0, 12))}>
                        +8ve
                      </button>{' '}
                    </>
                  )}
                  <button onClick={() => forPart(channel, (m, p) => scaleVelocity(m, p, 0.8))}>Quieter</button> <button onClick={() => forPart(channel, (m, p) => scaleVelocity(m, p, 1.25))}>Louder</button>{' '}
                  <button
                    onClick={() => {
                      forPart(channel, deleteNotes)
                      setPicked(new Set())
                    }}
                  >
                    Delete the part
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p>
        <label>
          Speed <input className="num" inputMode="numeric" aria-label="Speed in per cent" value={speed} onChange={(e) => setSpeed(e.target.value)} /> %
        </label>{' '}
        <button onClick={applySpeed}>Change the speed</button>{' '}
        <label>
          Keep from <input className="num" inputMode="decimal" aria-label="Keep from, in seconds" placeholder="0" value={stretch.from} onChange={(e) => setStretch({ ...stretch, from: e.target.value })} />
        </label>{' '}
        <label>
          to <input className="num" inputMode="decimal" aria-label="Keep to, in seconds" placeholder={music.end.toFixed(1)} value={stretch.to} onChange={(e) => setStretch({ ...stretch, to: e.target.value })} /> seconds
        </label>{' '}
        <button onClick={applyStretch}>Cut the rest</button>
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <p>
        <button
          disabled={music.notes.length === 0}
          onClick={() => {
            player.stop()
            onDone(editedMusicToMidi(music), music.name || title, music.names)
          }}
        >
          {doneLabel}
        </button>{' '}
        <button
          onClick={() => {
            player.stop()
            onCancel()
          }}
        >
          Cancel
        </button>
      </p>
    </div>
  )
}
