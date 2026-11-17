import { useState } from 'react'
import {
  defaultPartChoices,
  GAME_INSTRUMENTS,
  GAME_MUSIC,
  gameMusicFromMidi,
  gameMusicToMidi,
  gameMusicTune,
  genesisSongsSupported,
  MidiError,
  musicParts,
  readMidi,
  readSong,
  songToMidi,
  SongError,
  withOriginalSong,
  withSong,
  type MidiNote,
  type MusicPart,
  type PartChoice,
} from './core/genesismusic'
import type { RomProject } from './core/rom'
import { readSnesMusic, readSnesSong, SNES_GAME_MUSIC, SNES_SONG_VOICES, snesMusicToMidi, snesMusicTune, snesSongFromMidi, withOriginalSnesSong, withSnesSong } from './core/snesmusic'
import { readSnesRandomSongs, snesSongChoices, snesSongName } from './core/snessongs'
import { NHL95_GAME_MUSIC, nhl95SongsSupported, readNhl95Music } from './core/nhl95music'
import { genesisSongs, readRandomSongs, songNumber } from './core/teamsongs'
import { download } from './download'
import { SongControls, useSongPlayer } from './SongPlayer'
import { snesMusicSound } from './snesplayer'

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

// The Genesis game's organ songs, NHL 94's or NHL '95's: listen to them, export them as MIDI, or
// replace one with a MIDI file of your own.
export function OrganSongsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const player = useSongPlayer<number>()
  const songs = genesisSongs(project.game)
  if (!songs || !songs.supported(project.bytes)) return null
  const nhl95 = project.game.edition === 95
  const usedBy = usage(project, (team) => team.songs, readRandomSongs(project.bytes, project.teams.length))
  const unused = songs.numbers.filter((number) => songs.canReplace(number) && !usedBy(number))
  const shown = (number: number) => songNumber(number, songs)

  const stop = () => player.stop()


  async function replace(number: number, file: File) {
    stop()
    try {
      const { notes, name } = readMidi(new Uint8Array(await file.arrayBuffer()))
      const made = songs!.fromMidi(notes)
      const title = (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40)
      onChange({ ...project, bytes: songs!.withSong(project.bytes, number, made.events, title) })
      const left = [made.drums && `${made.drums} drum ${made.drums === 1 ? 'note' : 'notes'} (the organ plays no drums)`].filter(Boolean)
      const crowded = made.dropped
        ? ` Where more than ${songs!.voices} notes sounded at once, the highest were kept: ${made.dropped} ${made.dropped === 1 ? 'note was' : 'notes were'} left out or cut short.`
        : ''
      setNotice(
        `Song ${shown(number)} is now "${title}", ${seconds(made.seconds)} long, on the organ.` +
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
      {nhl95 ? (
        <p className="note">
          The songs the organ plays, which each team's page chooses from. Play gives a rough idea of one in the browser
          (the console's organ sounds different). Export MIDI saves it as a MIDI file. <b>Replace</b> puts a MIDI file
          of your own in its place: every note is played on the game's organ, at most {songs.voices} at once (where more
          sound at once the highest are kept), drums are left out, and notes are moved by octaves into the game's range.
          Every team with that song in a slot plays the new one. Short tunes of
          10 to 30 seconds suit the game, as its own are; Help, in the list on the left, has tips on preparing a MIDI
          file. Any of the songs can be replaced. Tested in the game by the NHL94 Match Viewer project.
        </p>
      ) : (
        <p className="note">
          The songs the organ plays, which each team's page chooses from. Play gives a rough idea of one in the browser
          (the console's organ sounds different). Export MIDI saves it as a MIDI file. <b>Replace</b> puts a MIDI file of
          your own in its place: every note is played on the game's organ, at most {songs.voices} at once (where more
          sound at once the highest are kept), drums are left out, and notes are moved by octaves into the game's range.
          Every team with that song in a slot plays the new one. Short tunes of 10 to 30 seconds suit the game, as its
          own are; Help, in the list on the left, has tips on preparing a MIDI file. Song 1 cannot be replaced, as the
          game needs it. Tested in the game by the NHL94 Match Viewer project.
        </p>
      )}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <p className="note">
        {unused.length
          ? `${unused.length} ${unused.length === 1 ? 'song is' : 'songs are'} used by no team and not picked by Random, so replacing ${unused.length === 1 ? 'it' : 'one'} changes nothing else: ${unused.map(shown).join(', ')}.`
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
          {songs.numbers.map((number) => {
            const song = songs.read(project.bytes, number)
            if (!song) return null
            const name = song.custom ? `${song.custom.name} (in place of ${songs.names[number]})` : songs.names[number]
            return (
              <tr key={number}>
                <td>{shown(number)}.</td>
                <td>{name}</td>
                <td>{seconds(song.seconds)}</td>
                <UsedBy text={usedBy(number)} />
                <td>
                  <button onClick={() => player.toggle(number, song.events, name)}>{player.playing === number ? 'Stop' : 'Play'}</button>{' '}
                  <button onClick={() => download(songToMidi(song, song.custom?.name ?? songs.names[number]), `song_${shown(number)}.mid`, 'audio/midi')}>Export MIDI</button>{' '}
                  {songs.canReplace(number) && (
                    <label className="button">
                      Replace…
                      <input
                        type="file"
                        accept=".mid,.midi,audio/midi"
                        hidden
                        aria-label={`Replace song ${shown(number)}`}
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
                        onChange({ ...project, bytes: songs.withOriginal(project.bytes, number) })
                        setNotice(`Song ${shown(number)} is the game's own again. Undo takes it back.`)
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
      <SongControls player={player} />
    </section>
  )
}

// NHL 94's other music on the Genesis: the title, end of period and scouting report pieces. Listen to them, export
// them as MIDI, or replace one with a MIDI file, each of its parts on a game instrument chosen for it.
export function GameMusicSection({ project, onChange }: Props) {
  const player = useSongPlayer<number>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // A MIDI file read for a piece, waiting for its parts' instruments to be chosen.
  const [pending, setPending] = useState<{ number: number; title: string; notes: MidiNote[]; end: number; parts: MusicPart[]; choices: Map<number, PartChoice> } | null>(null)
  // NHL '95's can be listened to and exported; NHL 94's replaced too.
  const nhl95 = project.game.edition === 95
  if (project.game.platform !== 'genesis' || !(nhl95 ? nhl95SongsSupported : genesisSongsSupported)(project.bytes)) return null
  const list = nhl95 ? NHL95_GAME_MUSIC : GAME_MUSIC
  const pieces = list.map((piece) => ({ ...piece, song: (nhl95 ? readNhl95Music : readSong)(project.bytes, piece.number) })).filter((piece) => piece.song)
  if (!pieces.length) return null
  const pieceName = (number: number) => list.find((piece) => piece.number === number)!.name

  async function read(number: number, file: File) {
    player.stop()
    try {
      const { notes, name, end, programs } = readMidi(new Uint8Array(await file.arrayBuffer()))
      const parts = musicParts(notes)
      if (!parts.length) throw new MidiError('This MIDI file has no notes.')
      setPending({ number, title: (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40), notes, end, parts, choices: defaultPartChoices(parts, programs) })
      setNotice('')
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }

  function putIn() {
    if (!pending) return
    try {
      const made = gameMusicFromMidi(pending.notes, pending.choices, pending.end)
      onChange({ ...project, bytes: withSong(project.bytes, pending.number, made.events, pending.title) })
      const said = [
        made.leftOut && `${made.leftOut} ${made.leftOut === 1 ? 'note' : 'notes'} of the parts left out`,
        made.dropped && `${made.dropped} ${made.dropped === 1 ? 'note' : 'notes'} past the five the console plays at once`,
        made.moved && `${made.moved} ${made.moved === 1 ? 'note' : 'notes'} moved by octaves into the game's range`,
        made.quieter && "played more quietly, as the game's own music is, so that it does not distort"
      ].filter(Boolean)
      setNotice(
        `The ${pieceName(pending.number).toLowerCase()} is now "${pending.title}", ${seconds(made.seconds)} long, playing again from the start when it ends.` +
          (said.length ? ` Not as in the file: ${said.join('; ')}.` : '') +
          ' Undo takes it back.',
      )
      setFailed(false)
      setPending(null)
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof SongError ? e.message : String(e))
      setFailed(true)
    }
  }

  const choose = (channel: number, value: string) => {
    if (!pending) return
    const choices = new Map(pending.choices)
    choices.set(channel, value === 'out' || value === 'drums' ? value : Number(value))
    setPending({ ...pending, choices })
  }
  const noteName = (note: number) => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][note % 12]}${Math.floor(note / 12) - 1}`

  return (
    <section>
      <h2>Game music</h2>
      <p className="note">
        The game's own music besides the organ. Play gives a rough idea of a piece in the browser, without its drums:
        the console's synthesizer sounds quite different. Export MIDI saves it as a MIDI file, each part on its own
        channel and the drums on the drum channel.
        {nhl95 ? (
          " Replacing these is still to come for NHL '95."
        ) : (
          <>
            {' '}
            <b>Replace</b> puts a MIDI file of your own in its place: you choose a game instrument for each of its parts
            (up to six), its drums play as the game's kick and hit, at most five notes sound at once, and the piece plays
            again from the start when it ends, as the game's own do; a file much louder than the game's music is played
            more quietly. Try it in the game before your league does.
          </>
        )}
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {pending && (
        <div className="notice">
          <p>
            Replacing the <b>{pieceName(pending.number).toLowerCase()}</b> with "{pending.title}". Choose what each part plays on:
          </p>
          <table className="left">
            <thead>
              <tr>
                <th>MIDI channel</th>
                <th>Notes</th>
                <th>Range</th>
                <th>Played on</th>
              </tr>
            </thead>
            <tbody>
              {pending.parts.map((part) => (
                <tr key={part.channel}>
                  <td>{part.channel === 9 ? '10 (drums)' : part.channel + 1}</td>
                  <td>{part.notes}</td>
                  <td>{part.channel === 9 ? '' : `${noteName(part.lowest)} to ${noteName(part.highest)}`}</td>
                  <td>
                    <select aria-label={`Part on MIDI channel ${part.channel + 1}`} value={String(pending.choices.get(part.channel) ?? 'out')} onChange={(e) => choose(part.channel, e.target.value)}>
                      {part.channel === 9 && <option value="drums">The game's drums: kick and hit</option>}
                      {GAME_INSTRUMENTS.map((instrument) => (
                        <option key={instrument.patch} value={instrument.patch}>
                          {instrument.name}
                        </option>
                      ))}
                      <option value="out">Left out</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={putIn}>Put it in</button> <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
      <table className="left">
        <thead>
          <tr>
            <th>Music</th>
            <th>Where it plays</th>
            <th>Length</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pieces.map(({ number, name, where, song }) => {
            const shown = song!.custom ? `${song!.custom.name} (in place of the ${name.toLowerCase()})` : name
            return (
              <tr key={number}>
                <td>{shown}</td>
                <td>{where}</td>
                <td>{seconds(song!.seconds)}</td>
                <td>
                  <button onClick={() => player.toggle(number, gameMusicTune(song!), shown)}>{player.playing === number ? 'Stop' : 'Play'}</button>{' '}
                  <button onClick={() => download(gameMusicToMidi(song!, song!.custom?.name ?? name), `${name.toLowerCase().replace(/ /g, '_')}.mid`, 'audio/midi')}>Export MIDI</button>{' '}
                  {!nhl95 && (
                  <label className="button">
                    Replace…
                    <input
                      type="file"
                      accept=".mid,.midi,audio/midi"
                      hidden
                      aria-label={`Replace the ${name.toLowerCase()}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void read(number, file)
                      }}
                    />
                  </label>
                  )}
                  {song!.custom && (
                    <>
                      {' '}
                      <button
                        onClick={() => {
                          player.stop()
                          onChange({ ...project, bytes: withOriginalSong(project.bytes, number) })
                          setNotice(`The ${name.toLowerCase()} is the game's own again. Undo takes it back.`)
                          setFailed(false)
                        }}
                      >
                        Put back the original
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <SongControls player={player} />
    </section>
  )
}

// The SNES game's organ songs: those the teams' and random songs point at.
export function SnesOrganSongsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const player = useSongPlayer<number>()
  const choices = snesSongChoices(project.bytes)
  if (choices.length === 0) return null
  const usedBy = usage(project, (team) => team.snesSongs, readSnesRandomSongs(project.bytes))
  const unused = choices.filter((c) => !usedBy(c.pointer))

  const stop = () => player.stop()


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
        The songs the teams' organ songs and the random songs use. Play plays one on the game's own organ. Export MIDI
        saves it as a MIDI file. <b>Replace</b> puts a MIDI file of your own in its place, played on the game's two
        organ sounds, left and right, at most {SNES_SONG_VOICES} notes at once (where more sound at once the highest
        are kept); drums are left out, and notes are moved by octaves into the organ's range. Every team with that
        song in a slot plays the new one. Help, in the list on the left, has tips on preparing a MIDI file. Tested in
        the game by the NHL94 Match Viewer project, on the original game and McMarkis's 32-team builds.
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
                  <button onClick={() => player.toggle(pointer, song.events, song.custom?.name ?? name, () => snesMusicSound(project.bytes, pointer, 'game'))}>
                    {player.playing === pointer ? 'Stop' : 'Play'}
                  </button>{' '}
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
      <SongControls player={player} />
    </section>
  )
}

// The SNES game's other music: the title, menu and playoff pieces. Listen to them and export them as MIDI.
export function SnesGameMusicSection({ project }: { project: RomProject }) {
  const player = useSongPlayer<number>()
  if (project.game.platform !== 'snes') return null
  const pieces = SNES_GAME_MUSIC.map((piece) => ({ ...piece, music: readSnesMusic(project.bytes, piece.pointer) })).filter((piece) => piece.music)
  if (!pieces.length) return null
  return (
    <section>
      <h2>Game music</h2>
      <p className="note">
        The game's own music besides the organ. Play plays a piece on the game's own instruments. Export MIDI saves it
        as a MIDI file, each of its parts on a track of its own named as the game names it, and the drums on the drum
        channel. Replacing them is still to come.
      </p>
      <table className="left">
        <thead>
          <tr>
            <th>Music</th>
            <th>Where it plays</th>
            <th>Length</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pieces.map(({ pointer, name, where, music, sounds }) => (
            <tr key={pointer}>
              <td>{name}</td>
              <td>{where}</td>
              <td>{seconds(music!.seconds)}</td>
              <td>
                <button onClick={() => player.toggle(pointer, snesMusicTune(music!), name, () => snesMusicSound(project.bytes, pointer, sounds))}>
                  {player.playing === pointer ? 'Stop' : 'Play'}
                </button>{' '}
                <button onClick={() => download(snesMusicToMidi(music!, name), `${name.toLowerCase().replace(/ /g, '_')}.mid`, 'audio/midi')}>Export MIDI</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SongControls player={player} />
    </section>
  )
}
