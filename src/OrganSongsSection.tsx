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
import {
  defaultSnesPartChoices,
  midiLoopStart,
  midiPartNames,
  snesCustomMusicName,
  snesEntrySide,
  SnesMusicError,
  snesMusicFromMidi,
  snesMusicKit,
  snesMusicPointer,
  snesMusicReplaceable,
  snesMusicTempo,
  snesOwnMidi,
  withOriginalSnesMusic,
  withSnesMusic,
  type SnesMusicInstrument,
  type SnesOwnMidi,
  type SnesPartChoice,
} from './core/snesgamemusic'
import {
  NHL95_GAME_MUSIC,
  NHL95_INSTRUMENTS,
  nhl95MusicFromMidi,
  nhl95PartChoices,
  nhl95SongsSupported,
  readNhl95Music,
  withNhl95Music,
  withOriginalNhl95Song,
} from './core/nhl95music'
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

// The Genesis game's other music, NHL 94's or NHL '95's: the title, end of period and scouting report pieces. Listen
// to them, export them as MIDI, or replace one with a MIDI file, each of its parts on a game instrument chosen for it.
export function GameMusicSection({ project, onChange }: Props) {
  const player = useSongPlayer<number>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // A MIDI file read for a piece, waiting for its parts' instruments to be chosen.
  const [pending, setPending] = useState<{ number: number; title: string; notes: MidiNote[]; end: number; parts: MusicPart[]; choices: Map<number, PartChoice> } | null>(null)
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
      const choices = nhl95 ? nhl95PartChoices(parts, notes, programs) : defaultPartChoices(parts, programs)
      setPending({ number, title: (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40), notes, end, parts, choices })
      setNotice('')
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }

  // NHL '95's: one patch to a part, one note at a time on each FM patch, and the driver's other limits kept.
  function putIn95() {
    if (!pending) return
    try {
      const made = nhl95MusicFromMidi(pending.notes, pending.choices, pending.end)
      onChange({ ...project, bytes: withNhl95Music(project.bytes, pending.number, made, pending.title) })
      const notes = (count: number) => `${count} ${count === 1 ? 'note' : 'notes'}`
      const said = [
        made.leftOut && `${notes(made.leftOut)} of the parts left out (or drums the game has no sound for)`,
        made.chords && `${notes(made.chords)} of chords left out or cut short (each instrument but the square wave plays one note at a time)`,
        made.dropped && `${notes(made.dropped)} past what the console plays at once`,
        made.moved && `${notes(made.moved)} moved by octaves into the instrument's range`,
        made.quieter && "played more quietly, as the game's own music is",
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

  function putIn() {
    if (!pending) return
    if (nhl95) return putIn95()
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
          <>
            {' '}
            <b>Replace</b> puts a MIDI file of your own in its place: you choose a game instrument for each of its parts
            (up to seven, each instrument once; each plays one note at a time, but the square wave plays three), and its
            drums play as the game's kick, snare and hi-hats. The piece plays again from the start when it ends. Tested
            in the game by the NHL94 Match Viewer project.
          </>
        ) : (
          <>
            {' '}
            <b>Replace</b> puts a MIDI file of your own in its place: you choose a game instrument for each of its parts
            (up to six), its drums play as the game's kick and hit, at most five notes sound at once, and the piece plays
            again from the start when it ends, as the game's own do; a file much louder than the game's music is played
            more quietly. Tested in the game by the NHL94 Match Viewer project.
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
                      {part.channel === 9 && <option value="drums">{nhl95 ? "The game's drums: kick, snare and hi-hats" : "The game's drums: kick and hit"}</option>}
                      {(nhl95 ? NHL95_INSTRUMENTS : GAME_INSTRUMENTS).map((instrument) => (
                        // NHL '95 plays each instrument for one part only.
                        <option key={instrument.patch} value={instrument.patch} disabled={nhl95 && [...pending.choices].some(([channel, choice]) => channel !== part.channel && choice === instrument.patch)}>
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
                  <button onClick={() => player.toggle(number, gameMusicTune(song!, nhl95 ? 95 : 94), shown)}>{player.playing === number ? 'Stop' : 'Play'}</button>{' '}
                  <button onClick={() => download(gameMusicToMidi(song!, song!.custom?.name ?? name, nhl95 ? 95 : 94), `${name.toLowerCase().replace(/ /g, '_')}.mid`, 'audio/midi')}>Export MIDI</button>{' '}
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
                  {song!.custom && (
                    <>
                      {' '}
                      <button
                        onClick={() => {
                          player.stop()
                          onChange({ ...project, bytes: (nhl95 ? withOriginalNhl95Song : withOriginalSong)(project.bytes, number) })
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

// The SNES game's other music: the title, menu and playoff pieces. Listen to them, export them as MIDI, or replace
// one with a MIDI file, each of its parts on one of the game's instruments chosen for it.
export function SnesGameMusicSection({ project, onChange }: Props) {
  const player = useSongPlayer<number>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // A MIDI file read for a piece, waiting for its parts' instruments to be chosen.
  const [pending, setPending] = useState<{
    index: number
    title: string
    notes: MidiNote[]
    end: number
    loop: number
    parts: MusicPart[]
    choices: Map<number, SnesPartChoice>
    own: SnesOwnMidi | null
  } | null>(null)
  if (project.game.platform !== 'snes') return null
  const pieces = SNES_GAME_MUSIC.map((piece, index) => {
    const pointer = snesMusicPointer(project.bytes, index)
    return { ...piece, index, pointer, music: readSnesMusic(project.bytes, pointer), custom: snesCustomMusicName(project.bytes, index), replaceable: snesMusicReplaceable(project.bytes, index) }
  }).filter((piece) => piece.music)
  if (!pieces.length) return null
  const kit = pending ? snesMusicKit(project.bytes, SNES_GAME_MUSIC[pending.index].sounds) : null

  async function read(index: number, file: File) {
    player.stop()
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const { notes, name, end, programs } = readMidi(bytes)
      const parts = musicParts(notes)
      const found = snesMusicKit(project.bytes, SNES_GAME_MUSIC[index].sounds)
      if (!parts.length) throw new MidiError('This MIDI file has no notes.')
      if (!found) throw new MidiError("The editor cannot find this ROM's instruments.")
      setPending({
        index,
        title: (name || file.name.replace(/\.midi?$/i, '')).slice(0, 40),
        notes,
        end,
        loop: midiLoopStart(bytes),
        parts,
        choices: defaultSnesPartChoices(found, parts, programs, midiPartNames(bytes)),
        own: snesOwnMidi(found, bytes),
      })
      setNotice('')
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${file.name} could not be read as a MIDI file.`)
      setFailed(true)
    }
  }

  function putIn() {
    if (!pending || !kit) return
    const name = SNES_GAME_MUSIC[pending.index].name.toLowerCase()
    try {
      const made = snesMusicFromMidi(kit, pending.notes, pending.choices, pending.end, { tempo: snesMusicTempo(project.bytes, pending.index), loop: pending.loop }, pending.own)
      const next = withSnesMusic(project, pending.index, made, pending.title)
      onChange(next)
      const said = [
        made.leftOut && `${made.leftOut} ${made.leftOut === 1 ? 'note' : 'notes'} of the parts left out or of drums the game has not`,
        made.dropped && `${made.dropped} ${made.dropped === 1 ? 'note' : 'notes'} left out or cut short where their instrument's voices were all taken`,
        made.moved && `${made.moved} ${made.moved === 1 ? 'note' : 'notes'} moved by octaves into the instruments' range`,
        made.otherEntry && `${made.otherEntry} ${made.otherEntry === 1 ? 'note' : 'notes'} played on another side of their instrument where its own voice was taken`,
      ].filter(Boolean)
      setNotice(
        `The ${name} is now "${pending.title}", ${seconds(made.seconds)} long, playing again from ${made.loop ? `${seconds((made.loop / made.ticks) * made.seconds)} (the file's loop marker)` : 'the start'} when it ends.` +
          (said.length ? ` Not as in the file: ${said.join('; ')}.` : '') +
          (next.bytes.length > project.bytes.length ? ` The ROM grew to ${next.bytes.length / 0x100000} MB to make room for it.` : '') +
          ' Undo takes it back.',
      )
      setFailed(false)
      setPending(null)
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof SnesMusicError ? e.message : String(e))
      setFailed(true)
    }
  }

  const choose = (channel: number, value: string) => {
    if (!pending) return
    const choices = new Map(pending.choices)
    const [sample, entry] = value.split(':').map(Number)
    choices.set(channel, value === 'out' || value === 'drums' ? value : entry >= 0 ? { sample, entry } : sample)
    setPending({ ...pending, choices })
  }
  const noteName = (note: number) => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][note % 12]}${Math.floor(note / 12) - 1}`
  const voices = (count: number) => (count === 1 ? 'one note at a time' : `up to ${count} notes at once`)
  // An instrument's sides a part may be put on (where it has more than one entry of one voice): for each side, the
  // part's own entry where it is on one, else the first.
  const sidesOf = (instrument: SnesMusicInstrument, choice: SnesPartChoice | undefined) =>
    instrument.sides.length < 2
      ? []
      : (['left', 'centre', 'right'] as const).flatMap((side) => {
          const own = instrument.sides.filter((e) => snesEntrySide(e) === side)
          const entry = own.find((e) => typeof choice === 'object' && choice.entry === e.entry) ?? own[0]
          return entry ? [{ side, entry: entry.entry }] : []
        })
  const valueOf = (choice: SnesPartChoice | undefined) => (typeof choice === 'object' ? `${choice.sample}:${choice.entry}` : String(choice ?? 'out'))

  return (
    <section>
      <h2>Game music</h2>
      <p className="note">
        The game's own music besides the organ. Play plays a piece on the game's own instruments. Export MIDI saves it
        as a MIDI file, each of its parts on a track of its own named as the game names it, and the drums on the drum
        channel. <b>Replace</b> puts a MIDI file of your own in its place: you choose one of the game's instruments for
        each of its parts, its drums play on the game's drums, and the piece plays again from the start when it ends
        (or from the file's loop marker, as the pieces' own MIDI files have). A part on the organ is played twice, a
        moment apart, as the playoff music plays its organ. A piece's own MIDI file keeps each part on its own side and
        as loud as it was. The console has eight voices for the music and its drums, and each instrument only some of them: where an
        instrument's voices are all taken, the drums, then the bass, then the higher notes are kept. Tested in the game
        by the NHL94 Match Viewer project.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {pending && kit && (
        <div className="notice">
          <p>
            Replacing the <b>{SNES_GAME_MUSIC[pending.index].name.toLowerCase()}</b> with "{pending.title}". Choose what each part plays on:
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
                    <select aria-label={`Part on MIDI channel ${part.channel + 1}`} value={valueOf(pending.choices.get(part.channel))} onChange={(e) => choose(part.channel, e.target.value)}>
                      {part.channel === 9 ? (
                        <option value="drums">The game's drums: kick, snare, hi-hats, toms, crash</option>
                      ) : (
                        kit.instruments.flatMap((instrument) => [
                          <option key={instrument.sample} value={instrument.sample}>
                            {`${instrument.name}, ${voices(instrument.entries.size)}`}
                          </option>,
                          ...sidesOf(instrument, pending.choices.get(part.channel)).map(({ side, entry }) => (
                            <option key={`${instrument.sample}:${side}`} value={`${instrument.sample}:${entry}`}>
                              {`${instrument.name} (${side})`}
                            </option>
                          )),
                        ])
                      )}
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
          {pieces.map(({ index, pointer, name, where, music, sounds, custom, replaceable }) => {
            const shown = custom ? `${custom} (in place of the ${name.toLowerCase()})` : name
            const key = SNES_GAME_MUSIC[index].pointer
            return (
              <tr key={key}>
                <td>{shown}</td>
                <td>{where}</td>
                <td>{seconds(music!.seconds)}</td>
                <td>
                  <button onClick={() => player.toggle(key, snesMusicTune(music!), shown, () => snesMusicSound(project.bytes, pointer, sounds))}>
                    {player.playing === key ? 'Stop' : 'Play'}
                  </button>{' '}
                  <button onClick={() => download(snesMusicToMidi(music!, custom ?? name), `${name.toLowerCase().replace(/ /g, '_')}.mid`, 'audio/midi')}>Export MIDI</button>
                  {replaceable && (
                    <>
                      {' '}
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
                            if (file) void read(index, file)
                          }}
                        />
                      </label>
                    </>
                  )}
                  {custom !== null && (
                    <>
                      {' '}
                      <button
                        onClick={() => {
                          player.stop()
                          onChange(withOriginalSnesMusic(project, index))
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
