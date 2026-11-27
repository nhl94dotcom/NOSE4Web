import { useEffect, useState } from 'react'
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
  midiPitchBends,
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
  type MidiBend,
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
import { editedMusicOf, type EditedMusic } from './core/midiedit'
import { download } from './download'
import { MusicEditor } from './MusicEditor'
import { SongControls, useSongPlayer } from './SongPlayer'
import { snesMusicSound } from './snesplayer'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The game music sections: a MIDI file read and not yet put in, kept by the app while other pages show, so that it
// comes back with the section and a download can say it is not in (PendingChanges.tsx).
export interface HeldMusic {
  title: string
  held: unknown
}
interface MusicProps extends Props {
  kept?: HeldMusic | null
  onKeep?: (music: HeldMusic | null) => void
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

// The music editor (MusicEditor.tsx), under each section's own note.
const EDIT_NOTE = (
  <p className="note">
    <b>Edit</b> opens the music in the music editor, to change its notes on a piano roll; it then goes in as a MIDI file
    would with Replace. Not yet tested in the game.
  </p>
)

const seconds = (value: number) => `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`

// The Genesis game's organ songs, NHL 94's or NHL '95's: listen to them, export them as MIDI, or
// replace one with a MIDI file of your own.
export function OrganSongsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const player = useSongPlayer<number>()
  // A song open in the music editor.
  const [editing, setEditing] = useState<{ number: number; music: EditedMusic } | null>(null)
  const songs = genesisSongs(project.game)
  if (!songs || !songs.supported(project.bytes)) return null
  const nhl95 = project.game.edition === 95
  const usedBy = usage(project, (team) => team.songs, readRandomSongs(project.bytes, project.teams.length))
  const unused = songs.numbers.filter((number) => songs.canReplace(number) && !usedBy(number))
  const shown = (number: number) => songNumber(number, songs)

  const stop = () => player.stop()


  async function replace(number: number, file: File) {
    putIn(number, new Uint8Array(await file.arrayBuffer()), file.name)
  }

  // A MIDI file (or the music editor's) in place of song `number`; whether it went in.
  function putIn(number: number, bytes: Uint8Array, fileName: string): boolean {
    stop()
    try {
      const { notes, name } = readMidi(bytes)
      const made = songs!.fromMidi(notes)
      const title = (name || fileName.replace(/\.midi?$/i, '')).slice(0, 40)
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
      return true
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof SongError ? e.message : `${fileName} could not be read as a MIDI file.`)
      setFailed(true)
      return false
    }
  }

  return (
    <section data-tab="Music">
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
      {EDIT_NOTE}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {editing && (
        <MusicEditor
          key={editing.number}
          music={editing.music}
          title={`song ${shown(editing.number)}`}
          limit={{ most: songs.voices, text: `the organ plays ${songs.voices} notes at once, and no drums` }}
          doneLabel="Put it in"
          preview={(bytes) => ({ events: songs.fromMidi(readMidi(bytes).notes).events })}
          previewText={`Play plays it as it would go in: on the organ, at most ${songs.voices} notes at once, without drums, each note in the game's range. The sound is a rough idea of the console's organ.`}
          onDone={(bytes, name) => putIn(editing.number, bytes, name) && setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
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
                    <button
                      disabled={editing !== null}
                      onClick={() => {
                        stop()
                        setEditing({ number, music: editedMusicOf(songToMidi(song, song.custom?.name ?? songs.names[number])) })
                      }}
                    >
                      Edit…
                    </button>
                  )}{' '}
                  {songs.canReplace(number) && (
                    <label className={editing ? 'button disabled' : 'button'}>
                      Replace…
                      <input
                        type="file"
                        accept=".mid,.midi,audio/midi"
                        disabled={editing !== null}
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
export function GameMusicSection({ project, onChange, kept, onKeep }: MusicProps) {
  const player = useSongPlayer<number>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // A MIDI file read for a piece, waiting for its parts' instruments to be chosen.
  type Pending = { number: number; title: string; notes: MidiNote[]; end: number; parts: MusicPart[]; choices: Map<number, PartChoice> }
  const [pending, setPending] = useState<Pending | null>(() => (kept?.held as Pending | undefined) ?? null)
  useEffect(() => onKeep?.(pending ? { title: pending.title, held: pending } : null), [onKeep, pending])
  // A piece open in the music editor.
  const [editing, setEditing] = useState<{ number: number; music: EditedMusic } | null>(null)
  const nhl95 = project.game.edition === 95
  if (project.game.platform !== 'genesis' || !(nhl95 ? nhl95SongsSupported : genesisSongsSupported)(project.bytes)) return null
  const list = nhl95 ? NHL95_GAME_MUSIC : GAME_MUSIC
  const pieces = list.map((piece) => ({ ...piece, song: (nhl95 ? readNhl95Music : readSong)(project.bytes, piece.number) })).filter((piece) => piece.song)
  if (!pieces.length) return null
  const pieceName = (number: number) => list.find((piece) => piece.number === number)!.name

  async function read(number: number, file: File) {
    readBytes(number, new Uint8Array(await file.arrayBuffer()), file.name)
  }

  // A MIDI file (or the music editor's) for piece `number`, its parts' instruments to choose next; whether it was read.
  function readBytes(number: number, bytes: Uint8Array, fileName: string): boolean {
    player.stop()
    try {
      const { notes, name, end, programs } = readMidi(bytes)
      const parts = musicParts(notes)
      if (!parts.length) throw new MidiError('This MIDI file has no notes.')
      const choices = nhl95 ? nhl95PartChoices(parts, notes, programs) : defaultPartChoices(parts, programs)
      setPending({ number, title: (name || fileName.replace(/\.midi?$/i, '')).slice(0, 40), notes, end, parts, choices })
      setNotice('')
      setFailed(false)
      return true
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${fileName} could not be read as a MIDI file.`)
      setFailed(true)
      return false
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
    <section data-tab="Music">
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
      {EDIT_NOTE}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {editing && !pending && (
        <MusicEditor
          key={editing.number}
          music={editing.music}
          title={`the ${pieceName(editing.number).toLowerCase()}`}
          limit={
            nhl95
              ? { most: 1, perPart: true, text: "each of the game's instruments plays one note at a time, one part to an instrument (the square wave three at once, so red on a part for it may be fine)" }
              : { most: 5, counts: (n) => n.channel !== 9 || n.note === 35 || n.note === 36, text: 'the console plays five notes at once, a kick drum among them' }
          }
          doneLabel="Choose the instruments"
          preview={(bytes, name) => {
            const { notes, end, programs } = readMidi(bytes)
            const parts = musicParts(notes)
            if (nhl95) {
              const made = nhl95MusicFromMidi(notes, nhl95PartChoices(parts, notes, programs), end)
              const song = readNhl95Music(withNhl95Music(project.bytes, editing.number, made, name), editing.number)
              return { events: song ? gameMusicTune(song, 95) : [] }
            }
            return { events: gameMusicTune(gameMusicFromMidi(notes, defaultPartChoices(parts, programs), end), 94) }
          }}
          previewText="Play plays it as it would go in, on the instruments first chosen for its parts (you can change them after), within the console's limits. The sound is a rough idea in the browser, without the drums."
          onDone={(bytes, name) => readBytes(editing.number, bytes, name) && setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
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
                  <button
                    disabled={editing !== null || pending !== null}
                    onClick={() => {
                      player.stop()
                      setPending(null)
                      setEditing({ number, music: editedMusicOf(gameMusicToMidi(song!, song!.custom?.name ?? name, nhl95 ? 95 : 94)) })
                    }}
                  >
                    Edit…
                  </button>{' '}
                  <label className={editing ? 'button disabled' : 'button'}>
                    Replace…
                    <input
                      type="file"
                      accept=".mid,.midi,audio/midi"
                      disabled={editing !== null}
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
  // A song open in the music editor.
  const [editing, setEditing] = useState<{ pointer: number; name: string; music: EditedMusic } | null>(null)
  const choices = snesSongChoices(project.bytes)
  if (choices.length === 0) return null
  const usedBy = usage(project, (team) => team.snesSongs, readSnesRandomSongs(project.bytes))
  const unused = choices.filter((c) => !usedBy(c.pointer))

  const stop = () => player.stop()


  async function replace(pointer: number, oldName: string, file: File) {
    putIn(pointer, oldName, new Uint8Array(await file.arrayBuffer()), file.name)
  }

  // A MIDI file (or the music editor's) in place of the song at `pointer`; whether it went in.
  function putIn(pointer: number, oldName: string, bytes: Uint8Array, fileName: string): boolean {
    stop()
    try {
      const { notes, name } = readMidi(bytes)
      const made = snesSongFromMidi(notes)
      const title = (name || fileName.replace(/\.midi?$/i, '')).slice(0, 40)
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
      return true
    } catch (e) {
      setNotice(e instanceof MidiError || e instanceof Error ? e.message : `${fileName} could not be read as a MIDI file.`)
      setFailed(true)
      return false
    }
  }

  return (
    <section data-tab="Music">
      <h2>Organ songs</h2>
      <p className="note">
        The songs the teams' organ songs and the random songs use. Play plays one on the game's own organ. Export MIDI
        saves it as a MIDI file. <b>Replace</b> puts a MIDI file of your own in its place, played on the game's two
        organ sounds, left and right, at most {SNES_SONG_VOICES} notes at once (where more sound at once the highest
        are kept); drums are left out, and notes are moved by octaves into the organ's range. Every team with that
        song in a slot plays the new one. Help, in the list on the left, has tips on preparing a MIDI file. Works on
        the original game and McMarkis's 32-team builds. Tested in the game by the NHL94 Match Viewer project.
      </p>
      {EDIT_NOTE}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {editing && (
        <MusicEditor
          key={editing.pointer}
          music={editing.music}
          title={editing.name}
          limit={{ most: SNES_SONG_VOICES, text: `the organ plays ${SNES_SONG_VOICES} notes at once, and no drums` }}
          doneLabel="Put it in"
          preview={(bytes, name) => {
            const made = snesSongFromMidi(readMidi(bytes).notes)
            // The ROM with it put in, and where it went: the song the teams' songs now point at.
            const next = withSnesSong(project, editing.pointer, made, name).bytes
            const before = new Set(choices.map((c) => c.pointer >>> 0))
            const to = snesSongChoices(next).find((c) => !before.has(c.pointer >>> 0))?.pointer
            return { events: made.events, sound: to === undefined ? undefined : () => snesMusicSound(next, to, 'game') }
          }}
          previewText="Play plays it as it would go in, on the game's own organ: at most four notes at once, without drums, each note in the organ's range."
          onDone={(bytes, name) => putIn(editing.pointer, editing.name, bytes, name) && setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
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
                  <button
                    disabled={editing !== null}
                    onClick={() => {
                      stop()
                      setEditing({ pointer, name, music: editedMusicOf(songToMidi(song, song.custom?.name ?? name)) })
                    }}
                  >
                    Edit…
                  </button>{' '}
                  <label className={editing ? 'button disabled' : 'button'}>
                    Replace…
                    <input
                      type="file"
                      accept=".mid,.midi,audio/midi"
                      disabled={editing !== null}
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
export function SnesGameMusicSection({ project, onChange, kept, onKeep }: MusicProps) {
  const player = useSongPlayer<number>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // A MIDI file read for a piece, waiting for its parts' instruments to be chosen.
  type Pending = {
    index: number
    title: string
    notes: MidiNote[]
    end: number
    loop: number
    bends: MidiBend[]
    parts: MusicPart[]
    choices: Map<number, SnesPartChoice>
    own: SnesOwnMidi | null
  }
  const [pending, setPending] = useState<Pending | null>(() => (kept?.held as Pending | undefined) ?? null)
  useEffect(() => onKeep?.(pending ? { title: pending.title, held: pending } : null), [onKeep, pending])
  // A piece open in the music editor.
  const [editing, setEditing] = useState<{ index: number; music: EditedMusic } | null>(null)
  if (project.game.platform !== 'snes') return null
  const pieces = SNES_GAME_MUSIC.map((piece, index) => {
    const pointer = snesMusicPointer(project.bytes, index)
    return { ...piece, index, pointer, music: readSnesMusic(project.bytes, pointer), custom: snesCustomMusicName(project.bytes, index), replaceable: snesMusicReplaceable(project.bytes, index) }
  }).filter((piece) => piece.music)
  if (!pieces.length) return null
  const kit = pending ? snesMusicKit(project.bytes, SNES_GAME_MUSIC[pending.index].sounds) : null

  async function read(index: number, file: File) {
    readBytes(index, new Uint8Array(await file.arrayBuffer()), file.name)
  }

  // A MIDI file (or the music editor's, with its parts' track names beside it) for piece `index`, its parts'
  // instruments to choose next; whether it was read.
  function readBytes(index: number, bytes: Uint8Array, fileName: string, names = midiPartNames(bytes)): boolean {
    player.stop()
    try {
      const { notes, name, end, programs } = readMidi(bytes)
      const parts = musicParts(notes)
      const found = snesMusicKit(project.bytes, SNES_GAME_MUSIC[index].sounds)
      if (!parts.length) throw new MidiError('This MIDI file has no notes.')
      if (!found) throw new MidiError("The editor cannot find this ROM's instruments.")
      setPending({
        index,
        title: (name || fileName.replace(/\.midi?$/i, '')).slice(0, 40),
        notes,
        end,
        loop: midiLoopStart(bytes),
        bends: midiPitchBends(bytes),
        parts,
        choices: defaultSnesPartChoices(found, parts, programs, names),
        own: snesOwnMidi(found, bytes),
      })
      setNotice('')
      setFailed(false)
      return true
    } catch (e) {
      setNotice(e instanceof MidiError ? e.message : `${fileName} could not be read as a MIDI file.`)
      setFailed(true)
      return false
    }
  }

  function putIn() {
    if (!pending || !kit) return
    const name = SNES_GAME_MUSIC[pending.index].name.toLowerCase()
    try {
      const made = snesMusicFromMidi(kit, pending.notes, pending.choices, pending.end, { tempo: snesMusicTempo(project.bytes, pending.index), loop: pending.loop, bends: pending.bends }, pending.own)
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
    <section data-tab="Music">
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
      {EDIT_NOTE}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {editing && !pending && (
        <MusicEditor
          key={editing.index}
          music={editing.music}
          title={`the ${SNES_GAME_MUSIC[editing.index].name.toLowerCase()}`}
          limit={{ most: 8, counts: () => true, text: 'the console has eight voices for the music and its drums, and each instrument only some of them' }}
          doneLabel="Choose the instruments"
          preview={(bytes, name, names) => {
            const index = editing.index
            const found = snesMusicKit(project.bytes, SNES_GAME_MUSIC[index].sounds)
            if (!found) throw new MidiError("the editor cannot find this ROM's instruments")
            const { notes, end, programs } = readMidi(bytes)
            const choices = defaultSnesPartChoices(found, musicParts(notes), programs, names)
            const made = snesMusicFromMidi(found, notes, choices, end, { tempo: snesMusicTempo(project.bytes, index), loop: midiLoopStart(bytes), bends: midiPitchBends(bytes) }, null)
            const next = withSnesMusic(project, index, made, name).bytes
            const pointer = snesMusicPointer(next, index)
            const music = readSnesMusic(next, pointer)
            return { events: music ? snesMusicTune(music) : [], sound: () => snesMusicSound(next, pointer, SNES_GAME_MUSIC[index].sounds) }
          }}
          previewText="Play plays it as it would go in, on the game's own instruments first chosen for its parts (you can change them after), within the console's voices. A piece edited here goes back on its parts' own instruments and sides, but at the game's usual loudness for each, and its crash and other percussion tracks play from the drum track."
          onDone={(bytes, name, names) => readBytes(editing.index, bytes, name, names) && setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
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
                      <button
                        disabled={editing !== null || pending !== null}
                        onClick={() => {
                          player.stop()
                          setPending(null)
                          setEditing({ index, music: editedMusicOf(snesMusicToMidi(music!, custom ?? name)) })
                        }}
                      >
                        Edit…
                      </button>{' '}
                      <label className={editing ? 'button disabled' : 'button'}>
                        Replace…
                        <input
                          type="file"
                          accept=".mid,.midi,audio/midi"
                          disabled={editing !== null}
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
