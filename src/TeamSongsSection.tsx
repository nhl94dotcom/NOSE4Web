import { useState } from 'react'
import type { SongEvent } from './core/genesismusic'
import type { SnesMusicRender } from './core/snesaudio'
import { readSnesSong } from './core/snesmusic'
import { SongControls, useSongPlayer } from './SongPlayer'
import type { RomProject } from './core/rom'
import { resetTeamPart, teamPartChanged } from './core/reset'
import { splitSnesFile } from './core/snes'
import { SNES_RANDOM_SONG, SNES_SONG_SLOTS, snesSongChoices, snesSongName } from './core/snessongs'
import { genesisSongs, RANDOM_SONG, SONG_SLOTS, songName, teamSongsRoom, withRoomForTeamSongs } from './core/teamsongs'
import type { Team } from './core/team'
import { ResetButton } from './ResetButton'
import { snesMusicSound } from './snesplayer'

interface Props {
  project: RomProject
  team: number
  // The team as it is in the ROM that was opened.
  original: Team
  onChange: (project: RomProject) => void
}

// A Genesis team's six organ songs, played in its home games.
// A button that plays a song in the browser, a rough idea of it (the console's organ sounds different).
// Pressed again, or when another starts, it stops.
// The team page's song player: a slot's song, or stopped if it is the one playing.
function usePlayer() {
  const player = useSongPlayer<number>()
  return { ...player, play: (slot: number, events: SongEvent[] | null, title: string, sound?: () => SnesMusicRender | null) => player.toggle(slot, events, title, sound) }
}

export function TeamSongsSection({ project, team, original, onChange }: Props) {
  const [error, setError] = useState('')
  const player = usePlayer()
  const songs = project.teams[team].songs
  const list = genesisSongs(project.game)
  if (!songs || !list) return null
  const nhl95 = project.game.edition === 95
  const room = teamSongsRoom(project.bytes, project.teams.length)
  const outside = room !== null && team >= room

  function setSong(slot: number, value: number) {
    let next = project
    if (outside) {
      // The table has no place for this team: move it where there is room for every team.
      const bytes = withRoomForTeamSongs(project.bytes, project.teams.length)
      if (!bytes) {
        setError('There is no room left in this ROM to give every team its own songs.')
        return
      }
      next = { ...project, bytes }
    }
    const teams = next.teams.map((t, i) => (i === team ? { ...t, songs: songs!.map((v, s) => (s === slot ? value : v)) } : t))
    setError('')
    onChange({ ...next, teams })
  }

  return (
    <section data-tab="Songs">
      <h2>Organ songs</h2>
      <p>
        <ResetButton
          what="organ songs"
          changed={teamPartChanged(project.teams[team], original, 'songs')}
          onReset={() => onChange({ ...project, teams: project.teams.map((t, i) => (i === team ? resetTeamPart(t, original, 'songs') : t)) })}
        />
      </p>
      <p className="note">
        The organ plays these in the team's home games. <b>Random</b> plays one of the game's eight random songs. The
        song names are the community's
        {nhl95
          ? ": NHL '95's songs are NHL 94's tunes"
          : ", with the teams that have each in the original game"}
        . The power play and penalty kill songs play at the faceoff after a penalty puts the home
        team a man up or a man short. <b>Play</b> gives a rough idea of the song chosen (the console's organ sounds different). To add a song of
        your own from a MIDI file, use <b>Organ songs</b> on the Music page; it then appears here by its name.
        {nhl95 && ' Tested in the game by the NHL94 Match Viewer project.'}
        {outside &&
          ` In this ROM only the first ${room} teams have songs of their own, so this team's songs are left to chance. Choosing a song here makes room so that every team has six of its own.`}
      </p>
      <table className="left">
        <tbody>
          {SONG_SLOTS.map((label, slot) => (
            <tr key={slot}>
              <td>{label}</td>
              <td>
                <select className="wide" aria-label={`Organ song: ${label}`} value={songs[slot]} onChange={(e) => setSong(slot, Number(e.target.value))}>
                  {!list.isSong(songs[slot]) && <option value={songs[slot]}>{nhl95 ? 'Not a song' : 'No song (it plays nothing)'}</option>}
                  <option value={RANDOM_SONG}>Random</option>
                  {list.numbers.map((number) => (
                    <option key={number} value={number}>
                      {songName(number, project.bytes, list)}
                    </option>
                  ))}
                </select>{' '}
                <button
                  disabled={songs[slot] === RANDOM_SONG || !list.isSong(songs[slot])}
                  aria-label={`${player.playing === slot ? 'Stop' : 'Play'} the song: ${label}`}
                  onClick={() => player.play(slot, list.read(project.bytes, songs[slot])?.events ?? null, songName(songs[slot], project.bytes, list))}
                >
                  {player.playing === slot ? 'Stop' : 'Play'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SongControls player={player} />
      {error && <p className="error">{error}</p>}
    </section>
  )
}

// An SNES team's six organ songs, played in its home games. Each points at
// one of the songs the ROM has, so the choices are those its song tables
// point at, as it is and as it was opened.
export function SnesTeamSongsSection({ project, team, original, onChange }: Props) {
  const player = usePlayer()
  const songs = project.teams[team].snesSongs
  if (!songs) return null
  const opened = splitSnesFile(project.source)?.rom
  const choices = snesSongChoices(project.bytes, ...(opened ? [opened] : []))
  // A song in the ROM as it is, or as it was opened: its notes, and its sound on the game's organ.
  const play = (slot: number) => {
    const rom = readSnesSong(project.bytes, songs![slot]) || !opened ? project.bytes : opened
    player.play(slot, readSnesSong(rom, songs![slot])?.events ?? null, snesSongName(project.bytes, songs![slot]), () => snesMusicSound(rom, songs![slot], 'game'))
  }

  function setSong(slot: number, value: number) {
    const teams = project.teams.map((t, i) => (i === team ? { ...t, snesSongs: songs!.map((v, s) => (s === slot ? value : v)) } : t))
    onChange({ ...project, teams })
  }

  return (
    <section data-tab="Songs">
      <h2>Organ songs</h2>
      <p>
        <ResetButton
          what="organ songs"
          changed={teamPartChanged(project.teams[team], original, 'songs')}
          onReset={() => onChange({ ...project, teams: project.teams.map((t, i) => (i === team ? resetTeamPart(t, original, 'songs') : t)) })}
        />
      </p>
      <p className="note">
        The organ plays these in the team's home games. <b>Random</b> plays one of the game's eight random songs. The
        song names are the community's. <b>Play</b> plays the song chosen on the game's own organ. To add a song of your
        own from a MIDI file, use <b>Organ songs</b> on the Music page; it then appears here by its name.
      </p>
      <table className="left">
        <tbody>
          {SNES_SONG_SLOTS.map((label, slot) => (
            <tr key={slot}>
              <td>{label}</td>
              <td>
                <select className="wide" aria-label={`Organ song: ${label}`} value={songs[slot]} onChange={(e) => setSong(slot, Number(e.target.value))}>
                  <option value={SNES_RANDOM_SONG}>Random</option>
                  {songs[slot] !== SNES_RANDOM_SONG && !choices.some((choice) => choice.pointer === songs[slot]) && (
                    <option value={songs[slot]}>{snesSongName(project.bytes, songs[slot])}</option>
                  )}
                  {choices.map((choice) => (
                    <option key={choice.pointer} value={choice.pointer}>
                      {choice.name}
                    </option>
                  ))}
                </select>{' '}
                <button
                  disabled={songs[slot] === SNES_RANDOM_SONG}
                  aria-label={`${player.playing === slot ? 'Stop' : 'Play'} the song: ${label}`}
                  onClick={() => play(slot)}
                >
                  {player.playing === slot ? 'Stop' : 'Play'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SongControls player={player} />
    </section>
  )
}
