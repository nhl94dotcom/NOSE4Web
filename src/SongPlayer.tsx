import { useCallback, useEffect, useRef, useState } from 'react'
import type { SongEvent } from './core/genesismusic'
import type { SnesMusicRender } from './core/snesaudio'
import { playSnesSound } from './snesplayer'
import { playSong, type SongPlayback } from './songpreview'

// Playing organ songs in the browser, wherever the editor offers it: one song
// at a time, with where it is in the song (which can be moved) and a volume,
// which this browser remembers. A SNES song can come with its sound made from
// the game's own instruments (snesplayer.ts), played in place of the rough
// preview of its notes.

const VOLUME_KEY = 'nose4web.songVolume'

function storedVolume(): number {
  try {
    const value = Number(window.localStorage.getItem(VOLUME_KEY))
    return window.localStorage.getItem(VOLUME_KEY) !== null && value >= 0 && value <= 1 ? value : 0.8
  } catch {
    return 0.8
  }
}

export interface SongPlayer<Key> {
  playing: Key | null
  title: string
  // Whether it plays the song's real sound (not the rough preview).
  real: boolean
  position: number
  duration: number
  volume: number
  // Plays the song (its real sound where `sound` gives one), or stops it if it is the one playing.
  toggle(key: Key, events: SongEvent[] | null, title: string, sound?: () => SnesMusicRender | null): void
  stop(): void
  seek(seconds: number): void
  setVolume(volume: number): void
}

export function useSongPlayer<Key>(): SongPlayer<Key> {
  const [playing, setPlaying] = useState<Key | null>(null)
  const [title, setTitle] = useState('')
  const [isReal, setReal] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(storedVolume)
  const playback = useRef<SongPlayback | null>(null)
  const events = useRef<SongEvent[] | null>(null)
  const real = useRef<SnesMusicRender | null>(null)
  // Which start of a song is current: a stop from an earlier one (as when moving in the song) is not an end.
  const run = useRef(0)

  const halt = useCallback(() => {
    run.current++
    playback.current?.stop()
    playback.current = null
  }, [])
  useEffect(() => halt, [halt])

  const start = useCallback(
    (key: Key, song: SongEvent[], from: number) => {
      halt()
      const mine = ++run.current
      events.current = song
      const ended = () => {
        if (run.current !== mine) return
        playback.current = null
        setPlaying(null)
        setPosition(0)
      }
      const p = real.current ? playSnesSound(real.current, ended, { from, volume }) : playSong(song, ended, { from, volume })
      playback.current = p
      setReal(real.current !== null)
      setPlaying(key)
      setDuration(p.duration)
      setPosition(from)
    },
    [halt, volume],
  )

  // Where it is, a few times a second.
  useEffect(() => {
    if (playing === null) return
    const timer = window.setInterval(() => setPosition(playback.current?.position() ?? 0), 250)
    return () => window.clearInterval(timer)
  }, [playing])

  return {
    playing,
    title,
    real: isReal,
    position,
    duration,
    volume,
    toggle(key, song, name, sound) {
      if (playing === key || !song) {
        halt()
        setPlaying(null)
        return
      }
      setTitle(name)
      real.current = sound?.() ?? null
      start(key, song, 0)
    },
    stop() {
      halt()
      setPlaying(null)
    },
    seek(seconds) {
      if (playing === null || !events.current) return
      start(playing, events.current, seconds)
    },
    setVolume(value) {
      setVolumeState(value)
      playback.current?.setVolume(value)
      try {
        window.localStorage.setItem(VOLUME_KEY, String(value))
      } catch {
        // Not kept: it still applies now.
      }
    },
  }
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

// The playing song's name, where it is (drag to move), and the volume.
export function SongControls<Key>({ player }: { player: SongPlayer<Key> }) {
  if (player.playing === null) return null
  return (
    <p className="song-controls" data-sound={player.real ? 'real' : 'rough'}>
      Playing <b>{player.title}</b>{' '}
      <input
        type="range"
        aria-label="Position in the song"
        min={0}
        max={Math.max(0.1, player.duration)}
        step={0.1}
        value={Math.min(player.position, player.duration)}
        onChange={(e) => player.seek(Number(e.target.value))}
      />{' '}
      <span className="note">
        {clock(player.position)} / {clock(player.duration)}
      </span>{' '}
      <label>
        Volume{' '}
        <input type="range" aria-label="Volume" min={0} max={100} step={1} value={Math.round(player.volume * 100)} onChange={(e) => player.setVolume(Number(e.target.value) / 100)} />
      </label>{' '}
      <button onClick={() => player.stop()}>Stop</button>
    </p>
  )
}
