import { useEffect, useRef, useState } from 'react'
import { FIRST_SONG, genesisSongsSupported, MidiError, readMidi, readSong, SONG_VOICES, songFromMidi, songToMidi, SongError, withOriginalSong, withSong } from './core/genesismusic'
import type { RomProject } from './core/rom'
import { readSnesSong, SNES_SONG_VOICES, snesSongFromMidi, withOriginalSnesSong, withSnesSong } from './core/snesmusic'
import { readSnesRandomSongs, snesSongChoices, snesSongName } from './core/snessongs'
import { readRandomSongs, SONG_NAMES, SONG_NUMBERS } from './core/teamsongs'
import { download } from './download'
import { playSong } from './songpreview'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// Who uses each song: the teams that have it in a slot, by their initials, and whether Random picks from it.
function usage(project: RomProject, slotsOf: (team: RomProject['teams'][number]) => number[] | undefined, random: number[]) {
  const users = new Map<number, string[]>()
  project.teams.forEach((team) => {
    for (const song of new Set(slotsOf(team) ?? [])) users.set(song >>> 0, [...(users.get(song >>> 0) ?? []), team.names[1] || team.names[0]])
  })
  const randomSet = new Set(random.map((r) => r >>> 0))
  const text = (song: number) => {
    const teams = users.get(song >>> 0) ?? []
    const parts = [...(teams.length ? [teams.join(', ')] : []), ...(randomSet.has(song >>> 0) ? ['Random'] : [])]
    return parts.length ? parts.join('; ') : null
  }
  return text
}

// The used-by cell: who plays it, or that nobody does, which makes it a good one to replace.
function UsedBy({ text }: { text: string | null }) {
  return <td>{text ?? <b>No team: a good one to replace</b>}</td>
}

const seconds = (value: number) => `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`

// The Genesis game's organ songs: listen to them, export them as MIDI, or
// replace one with a MIDI file of your own.
export function OrganSongsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  if (!genesisSongsSupported(project.bytes)) return null
  const usedBy = usage(project, (team) => team.songs, readRandomSongs(project.bytes, project.teams.length))
  const unused = SONG_NUMBERS.filter((number) => number > FIRST_SONG && !usedBy(number))

  function stop() {
    stopRef.current?.()
    stopRef.current = null
    setPlaying(null)
  }

  function play(number: number) {
    stop()
    const song = readSong(project.bytes, number)
    if (!song) return
    setPlaying(number)
    stopRef.current = playSong(song.events, () => setPlaying((now) => (now === number ? null : now)))
  }

  async function replace(number: number, file: File) {
    stop()
    try {
      const { notes, name } = readMidi(new Uint8Array(await file.arrayBuffer()))
      const made = songFromMidi(notes)
      const title = (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40)
      onChange({ ...project, bytes: withSong(project.bytes, number, made.events, title) })
      const left = [made.drums && `${made.drums} drum ${made.drums === 1 ? 'note' : 'notes'} (the organ plays no drums)`].filter(Boolean)
      const crowded = made.dropped
        ? ` Where more than ${SONG_VOICES} notes sounded at once, the highest were kept: ${made.dropped} ${made.dropped === 1 ? 'note was' : 'notes were'} left out or cut short.`
        : ''
      setNotice(
        `Song ${number - FIRST_SONG + 1} is now "${title}", ${seconds(made.seconds)} long, on the organ.` +
          (left.length ? ` Left out: ${left.join(' and ')}.` : '') +
          crowded +
          (made.moved ? ` ${made.moved} ${made.moved === 1 ? 'note was' : 'notes were'} moved by octaves into the game's range.` : '') +
          ' Every team with this song in a slot plays it. Undo takes it back.',
      )
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof SongError ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Organ songs</h2>
      <p className="note">
        The songs the organ plays, which each team's page chooses from. Play gives a rough idea of one in the browser
        (the console's organ sounds different). Export MIDI saves it as a MIDI file. <b>Replace</b> puts a MIDI file of
        your own in its place: every note is played on the game's organ, at most {SONG_VOICES} at once (the console has
        five voices, shared with the sound effects; where more sound at once the highest are kept), drums are left out, and notes are moved by octaves into the game's
        range; the new song goes into free room at the end of the ROM, and every team with that song in a slot plays it.
        Short tunes of 10 to 30 seconds suit the game, as its own are. Song 1 cannot be replaced, as the game uses it
        to know which song is playing. Played in the game by the NHL94 Match Viewer project.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <p className="note">
        {unused.length
          ? `${unused.length} ${unused.length === 1 ? 'song is' : 'songs are'} used by no team and not picked by Random, so replacing ${unused.length === 1 ? 'it' : 'one'} changes nothing else: ${unused.map((n) => n - FIRST_SONG + 1).join(', ')}.`
          : 'Every song is used by a team or picked by Random, so replacing one changes it for them too.'}{' '}
        <b>Used by</b> lists the teams that have each song in a slot, by their initials, and Random where it picks from it.
      </p>
      <table className="left">
        <thead>
          <tr>
            <th></th>
            <th>Song</th>
            <th>Length</th>
            <th>Used by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {SONG_NUMBERS.map((number) => {
            const song = readSong(project.bytes, number)
            if (!song) return null
            const name = song.custom ? `${song.custom.name} (in place of ${SONG_NAMES[number]})` : SONG_NAMES[number]
            return (
              <tr key={number}>
                <td>{number - FIRST_SONG + 1}.</td>
                <td>{name}</td>
                <td>{seconds(song.seconds)}</td>
                <UsedBy text={usedBy(number)} />
                <td>
                  <button onClick={() => (playing === number ? stop() : play(number))}>{playing === number ? 'Stop' : 'Play'}</button>{' '}
                  <button onClick={() => download(songToMidi(song, song.custom?.name ?? SONG_NAMES[number]), `song_${number - FIRST_SONG + 1}.mid`, 'audio/midi')}>Export MIDI</button>{' '}
                  {number > FIRST_SONG && (
                    <label className="button">
                      Replace…
                      <input
                        type="file"
                        accept=".mid,.midi,audio/midi"
                        hidden
                        aria-label={`Replace song ${number - FIRST_SONG + 1}`}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void replace(number, file)
                        }}
                      />
                    </label>
                  )}{' '}
                  {song.custom && (
                    <button
                      onClick={() => {
                        stop()
                        onChange({ ...project, bytes: withOriginalSong(project.bytes, number) })
                        setNotice(`Song ${number - FIRST_SONG + 1} is the game's own again. Undo takes it back.`)
                        setFailed(false)
                      }}
                    >
                      Put back the original
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// The SNES game's organ songs: those the teams' and random songs point at.
export function SnesOrganSongsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState<number | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  const choices = snesSongChoices(project.bytes)
  if (choices.length === 0) return null
  const usedBy = usage(project, (team) => team.snesSongs, readSnesRandomSongs(project.bytes))
  const unused = choices.filter((c) => !usedBy(c.pointer))

  function stop() {
    stopRef.current?.()
    stopRef.current = null
    setPlaying(null)
  }

  function play(pointer: number) {
    stop()
    const song = readSnesSong(project.bytes, pointer)
    if (!song) return
    setPlaying(pointer)
    stopRef.current = playSong(song.events, () => setPlaying((now) => (now === pointer ? null : now)))
  }

  async function replace(pointer: number, oldName: string, file: File) {
    stop()
    try {
      const { notes, name } = readMidi(new Uint8Array(await file.arrayBuffer()))
      const made = snesSongFromMidi(notes)
      const title = (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40)
      onChange(withSnesSong(project, pointer, made, title))
      const left = [made.drums && `${made.drums} drum ${made.drums === 1 ? 'note' : 'notes'} (the organ plays no drums)`].filter(Boolean)
      const crowded = made.dropped
        ? ` Where more than ${SNES_SONG_VOICES} notes sounded at once, the highest were kept: ${made.dropped} ${made.dropped === 1 ? 'note was' : 'notes were'} left out or cut short.`
        : ''
      setNotice(
        `"${title}" is now in place of ${oldName}, ${seconds(made.seconds)} long, on the organ.` +
          (left.length ? ` Left out: ${left.join(' and ')}.` : '') +
          crowded +
          (made.moved ? ` ${made.moved} ${made.moved === 1 ? 'note was' : 'notes were'} moved by octaves into the organ's range.` : '') +
          ' Every team with that song in a slot plays it. Undo takes it back.',
      )
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof Error ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Organ songs</h2>
      <p className="note">
        The songs the teams' organ songs and the random songs use. Play gives a rough idea of one in the browser (the
        console's organ sounds different). Export MIDI saves it as a MIDI file. <b>Replace</b> puts a MIDI file of your
        own in its place, on the game's two organs, one to the left and one to the right: a note on its own on both,
        and in a chord the highest note on one and the rest on the other, at most {SNES_SONG_VOICES} at once (the console has eight voices, shared with the sound effects; where more sound at once the highest are kept), drums
        left out, notes moved by octaves into the organ's range. The new song goes into free room in the ROM, and every
        team with that song in a slot plays it. Played in the game by the NHL94 Match Viewer project, on the original
        game and McMarkis's 32-team builds.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <p className="note">
        {unused.length
          ? `${unused.length} ${unused.length === 1 ? 'song is' : 'songs are'} used by no team and not picked by Random, so replacing ${unused.length === 1 ? 'it' : 'one'} changes nothing else.`
          : 'Every song is used by a team or picked by Random, so replacing one changes it for them too.'}{' '}
        <b>Used by</b> lists the teams that have each song in a slot, by their initials, and Random where it picks from it.
      </p>
      <table className="left">
        <thead>
          <tr>
            <th>Song</th>
            <th>Length</th>
            <th>Used by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {choices.map(({ pointer, name }) => {
            const song = readSnesSong(project.bytes, pointer)
            if (!song) return null
            return (
              <tr key={pointer}>
                <td>{song.custom ? `${song.custom.name} (in place of ${snesSongName(project.bytes, song.custom.replaced)})` : name}</td>
                <td>{seconds(song.seconds)}</td>
                <UsedBy text={usedBy(pointer)} />
                <td>
                  <button onClick={() => (playing === pointer ? stop() : play(pointer))}>{playing === pointer ? 'Stop' : 'Play'}</button>{' '}
                  <button onClick={() => download(songToMidi(song, song.custom?.name ?? name), `${(song.custom?.name ?? name).replace(/[^A-Za-z0-9]+/g, '_')}.mid`, 'audio/midi')}>
                    Export MIDI
                  </button>{' '}
                  <label className="button">
                    Replace…
                    <input
                      type="file"
                      accept=".mid,.midi,audio/midi"
                      hidden
                      aria-label={`Replace ${name}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void replace(pointer, name, file)
                      }}
                    />
                  </label>{' '}
                  {song.custom && (
                    <button
                      onClick={() => {
                        stop()
                        onChange(withOriginalSnesSong(project, pointer))
                        setNotice(`${snesSongName(project.bytes, song.custom!.replaced)} is back. Undo takes it back.`)
                        setFailed(false)
                      }}
                    >
                      Put back the original
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
