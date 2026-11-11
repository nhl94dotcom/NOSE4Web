import { DRUMS, FRAMES_PER_SECOND, isSampled, type SongEvent } from './core/genesismusic'

// A rough preview of a song in the browser: each note an organ-like tone
// (a few harmonics), at its volume. The console's FM organ sounds different,
// but the tune, timing and harmony are the song's.

interface Note {
  note: number
  // Seconds from the song's start.
  from: number
  to: number
  volume: number
}

// The song's notes, in seconds. Channels on a sampled sound (the claps), and the drums', are not notes: they are left out.
export function songNotes(events: SongEvent[]): Note[] {
  const notes: Note[] = []
  const on = new Map<string, { at: number; volume: number }>()
  const sampled = new Set<number>()
  for (const event of events) {
    const command = event.status & 0xf0
    const channel = event.status & 0x0f
    if (command === 0xc0) {
      if (isSampled(event.data[0])) sampled.add(channel)
      else sampled.delete(channel)
    }
    if (channel === DRUMS || sampled.has(channel)) continue
    const key = `${channel}:${event.data[0]}`
    const at = event.frame / FRAMES_PER_SECOND
    if (command === 0x90 && event.data[1] > 0) on.set(key, { at, volume: event.data[1] })
    else if (command === 0x80 || (command === 0x90 && event.data[1] === 0)) {
      const begun = on.get(key)
      if (begun) {
        notes.push({ note: event.data[0], from: begun.at, to: Math.max(at, begun.at + 0.03), volume: begun.volume })
        on.delete(key)
      }
    }
  }
  return notes
}

// How long a song lasts, in seconds.
export const songLength = (events: SongEvent[]) => songNotes(events).reduce((most, n) => Math.max(most, n.to), 0)

export interface SongPlayback {
  stop(): void
  // 0 (silent) to 1.
  setVolume(volume: number): void
  // Seconds into the song.
  position(): number
  duration: number
}

const LOUDEST = 0.15

// Plays a song from `from` seconds, at `volume` (0 to 1); `onEnd` once it ends or is stopped.
export function playSong(events: SongEvent[], onEnd: () => void, options: { from?: number; volume?: number } = {}): SongPlayback {
  const notes = songNotes(events)
  const duration = notes.reduce((most, n) => Math.max(most, n.to), 0)
  const from = Math.min(Math.max(0, options.from ?? 0), duration)
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = LOUDEST * Math.min(1, Math.max(0, options.volume ?? 1))
  master.connect(context.destination)
  const start = context.currentTime + 0.05
  for (const n of notes) {
    if (n.to <= from) continue
    const at = start + Math.max(n.from, from) - from
    const end = start + n.to - from
    const frequency = 440 * 2 ** ((n.note - 69) / 12)
    const gain = context.createGain()
    const level = 0.25 + n.volume / 127
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.01)
    gain.gain.setValueAtTime(level, Math.max(at + 0.01, end - 0.02))
    gain.gain.linearRampToValueAtTime(0, end)
    gain.connect(master)
    for (const [harmonic, weight] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]] as const) {
      const oscillator = context.createOscillator()
      oscillator.frequency.value = frequency * harmonic
      const partial = context.createGain()
      partial.gain.value = weight
      oscillator.connect(partial).connect(gain)
      oscillator.start(at)
      oscillator.stop(end + 0.05)
    }
  }
  const timer = window.setTimeout(() => stop(), Math.max(0, (duration - from) * 1000) + 350)
  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    void context.close()
    onEnd()
  }
  return {
    stop,
    setVolume: (volume) => master.gain.setValueAtTime(LOUDEST * Math.min(1, Math.max(0, volume)), context.currentTime),
    position: () => Math.min(duration, Math.max(from, context.currentTime - start + from)),
    duration,
  }
}
