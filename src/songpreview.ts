import { DRUMS, FRAMES_PER_SECOND, isSampled, type SongEvent } from './core/genesismusic'

// A rough preview of a song in the browser: each note an organ-like tone
// (a few harmonics), at its volume. The console's FM organ sounds different,
// but the tune, timing and harmony are the song's.
export function playSong(events: SongEvent[], onEnd: () => void): () => void {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = 0.15
  master.connect(context.destination)
  const start = context.currentTime + 0.05
  const on = new Map<string, { at: number; volume: number }>()
  let last = 0
  const play = (note: number, from: number, to: number, volume: number) => {
    const frequency = 440 * 2 ** ((note - 69) / 12)
    const gain = context.createGain()
    const level = 0.25 + volume / 127
    gain.gain.setValueAtTime(0, from)
    gain.gain.linearRampToValueAtTime(level, from + 0.01)
    gain.gain.setValueAtTime(level, Math.max(from + 0.01, to - 0.02))
    gain.gain.linearRampToValueAtTime(0, to)
    gain.connect(master)
    for (const [harmonic, weight] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]] as const) {
      const oscillator = context.createOscillator()
      oscillator.frequency.value = frequency * harmonic
      const partial = context.createGain()
      partial.gain.value = weight
      oscillator.connect(partial).connect(gain)
      oscillator.start(from)
      oscillator.stop(to + 0.05)
    }
  }
  // Channels on a sampled sound (the claps), and the drums', are not notes: they are left out.
  const sampled = new Set<number>()
  for (const event of events) {
    const command = event.status & 0xf0
    const channel = event.status & 0x0f
    if (command === 0xc0) {
      if (isSampled(event.data[0])) sampled.add(channel)
      else sampled.delete(channel)
    }
    if (channel === DRUMS || sampled.has(channel)) continue
    const key = `${event.status & 0x0f}:${event.data[0]}`
    const at = start + event.frame / FRAMES_PER_SECOND
    if (command === 0x90 && event.data[1] > 0) on.set(key, { at, volume: event.data[1] })
    else if (command === 0x80 || (command === 0x90 && event.data[1] === 0)) {
      const begun = on.get(key)
      if (begun) {
        play(event.data[0], begun.at, Math.max(at, begun.at + 0.03), begun.volume)
        on.delete(key)
        last = Math.max(last, at)
      }
    }
  }
  const timer = window.setTimeout(() => stop(), Math.max(0, (last - context.currentTime) * 1000) + 300)
  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    void context.close()
    onEnd()
  }
  return stop
}
