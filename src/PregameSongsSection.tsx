import { useState } from 'react'
import { GAME_MUSIC } from './core/genesismusic'
import { NHL95_GAME_MUSIC } from './core/nhl95music'
import { PREGAME_SILENCE, pregameOwnSong, pregameSongsSupported, PregameSongError, readPregameSongs, withPregameSongs } from './core/pregamesongs'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'
import { genesisSongs, songName, songNumber } from './core/teamsongs'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The Music page's pre-game songs (pregamesongs.ts): the music each home team's matchup screen plays.
export function PregameSongsSection({ project, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)
  if (project.game.platform !== 'genesis' || !pregameSongsSupported(project)) return null
  const nhl95 = project.game.edition === 95
  const own = pregameOwnSong(project)
  const songs = readPregameSongs(project) ?? project.teams.map(() => own)
  // Organ songs on NHL 94 only: NHL '95's matchup screen has not loaded the organ, so one plays silent (Match Viewer).
  const organ = genesisSongs(project.game)
  const offered = organ && !nhl95 ? organ.numbers : []
  const pieces = nhl95 ? NHL95_GAME_MUSIC : GAME_MUSIC
  // A song the ROM has that the lists above do not offer (an organ song put in on NHL '95 by the first build).
  const elsewhere = [...new Set(songs)].filter((song) => song !== PREGAME_SILENCE && !pieces.some((piece) => piece.number === song) && !offered.includes(song))
  const ownName = pieces.find((piece) => piece.number === own)?.name ?? 'Its own music'

  const set = (team: number, value: number) => {
    try {
      const next = songs.slice()
      next[team] = value
      onChange(withPregameSongs(project, next))
      setMessage(null)
    } catch (e) {
      setMessage({ text: e instanceof PregameSongError ? e.message : String(e), failed: true })
    }
  }
  const allOwn = () => {
    try {
      onChange(withPregameSongs(project, null))
      setMessage({ text: "Every team's matchup screen plays the game's own music again. Undo takes it back.", failed: false })
    } catch (e) {
      setMessage({ text: e instanceof PregameSongError ? e.message : String(e), failed: true })
    }
  }

  return (
    <section>
      <h2>Pre-game songs</h2>
      <p className="note">
        The music on the matchup screen before a game, where Ron Barr talks it up: the home team's choice, in place of the
        game's own ({ownName.toLowerCase()}). A piece of the game's music plays until the game starts, as the game's own
        does.{nhl95 ? '' : ' An organ song plays once, about 20 seconds, and then the screen is quiet until the game starts.'}{' '}
        Silence plays nothing. Not yet tested in the game.
      </p>
      {message && <p className={message.failed ? 'error' : 'note'}>{message.text}</p>}
      <table className="left">
        <thead>
          <tr>
            <th>Home team</th>
            <th>Pre-game song</th>
          </tr>
        </thead>
        <tbody>
          {project.teams.map((team, t) => (
            <tr key={t}>
              <td>{teamDisplayName(team)}</td>
              <td>
                <select aria-label={`Pre-game song: ${teamDisplayName(team)}`} value={songs[t]} onChange={(e) => set(t, Number(e.target.value))}>
                  <optgroup label="The game's music">
                    {pieces.map((piece) => (
                      <option key={piece.number} value={piece.number}>
                        {piece.name}
                        {piece.number === own ? " (the game's own)" : ''}
                      </option>
                    ))}
                  </optgroup>
                  {organ && offered.length > 0 && (
                    <optgroup label="Organ songs (play once)">
                      {offered.map((number) => (
                        <option key={number} value={number}>
                          {songNumber(number, organ)}. {songName(number, project.bytes, organ)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={PREGAME_SILENCE}>Silence</option>
                  {elsewhere.map((song) => (
                    <option key={song} value={song}>
                      {organ?.numbers.includes(song) ? `${songNumber(song, organ)}. ${songName(song, project.bytes, organ)} (plays nothing here)` : `Song ${song}`}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {readPregameSongs(project) && (
        <p>
          <button onClick={allOwn}>Every team the game's own music</button>
        </p>
      )}
    </section>
  )
}
