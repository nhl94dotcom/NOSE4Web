import { renderSnesMusic, SNES_SAMPLE_RATE, type SnesMusicRender, type SnesSoundSetName } from './core/snesaudio'
import type { SongPlayback } from './songpreview'

// SNES music played in the browser as the console plays it: the game's own
// samples and instruments, made into sound by snesaudio.ts (its sequencer and
// DSP) and played as one stereo buffer.

const LOUDEST = 0.8

// The last pieces made, by ROM, pointer and sample set: making one again takes
// a moment, and each holds a few megabytes a minute. They are kept up to about
// 20 million samples in all (80 MB), the newest always.
const MOST_SAMPLES = 20_000_000
const made: { rom: Uint8Array; key: string; sound: SnesMusicRender | null }[] = []

// The song at `pointer` made with its real instruments, or null where the ROM's sound is not found.
export function snesMusicSound(rom: Uint8Array, pointer: number, set: SnesSoundSetName): SnesMusicRender | null {
  const key = `${pointer}:${set}`
  const kept = made.findIndex((piece) => piece.rom === rom && piece.key === key)
  if (kept >= 0) {
    const [piece] = made.splice(kept, 1)
    made.unshift(piece)
    return piece.sound
  }
  let sound: SnesMusicRender | null = null
  try {
    sound = renderSnesMusic(rom, pointer, set)
  } catch {
    sound = null
  }
  if (sound && !sound.left.length) sound = null
  made.unshift({ rom, key, sound })
  let total = 0
  for (let i = 0; i < made.length; i++) {
    const piece = made[i].sound
    total += piece ? piece.left.length + piece.right.length : 0
    if (i > 0 && total > MOST_SAMPLES) {
      made.length = i
      break
    }
  }
  return sound
}

// Plays made music from `from` seconds, at `volume` (0 to 1); `onEnd` once it ends or is stopped.
export function playSnesSound(sound: SnesMusicRender, onEnd: () => void, options: { from?: number; volume?: number } = {}): SongPlayback {
  const duration = sound.left.length / SNES_SAMPLE_RATE
  const from = Math.min(Math.max(0, options.from ?? 0), duration)
  const context = new AudioContext()
  const buffer = context.createBuffer(2, sound.left.length, SNES_SAMPLE_RATE)
  buffer.copyToChannel(sound.left as Float32Array<ArrayBuffer>, 0)
  buffer.copyToChannel(sound.right as Float32Array<ArrayBuffer>, 1)
  const master = context.createGain()
  master.gain.value = LOUDEST * Math.min(1, Math.max(0, options.volume ?? 1))
  master.connect(context.destination)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(master)
  const start = context.currentTime + 0.05
  source.start(start, from)
  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    source.onended = null
    void context.close()
    onEnd()
  }
  source.onended = () => stop()
  return {
    stop,
    setVolume: (volume) => master.gain.setValueAtTime(LOUDEST * Math.min(1, Math.max(0, volume)), context.currentTime),
    position: () => Math.min(duration, Math.max(from, context.currentTime - start + from)),
    duration,
  }
}
