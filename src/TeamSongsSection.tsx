import { useState } from 'react'
import type { RomProject } from './core/rom'
import { resetTeamPart, teamPartChanged } from './core/reset'
import { RANDOM_SONG, SONG_NUMBERS, SONG_SLOTS, isSong, songName, teamSongsRoom, withRoomForTeamSongs } from './core/teamsongs'
import type { Team } from './core/team'
import { ResetButton } from './ResetButton'

interface Props {
  project: RomProject
  team: number
  // The team as it is in the ROM that was opened.
  original: Team
  onChange: (project: RomProject) => void
}

// A Genesis team's six organ songs, played in its home games.
export function TeamSongsSection({ project, team, original, onChange }: Props) {
  const [error, setError] = useState('')
  const songs = project.teams[team].songs
  if (!songs) return null
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
    <section>
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
        song names are the community's, as the game's disassembly lists them, with the teams that have each in the
        original game. The two power-play songs may seldom or never be heard: the game's power-play display stops
        them (from the game's code; being checked in play).
        {outside &&
          ` In this ROM the song table has room for only ${room} teams, so this team plays songs from whatever follows it. Choosing a song moves the table to free space in the ROM, so that every team has six of its own.`}
      </p>
      <table className="left">
        <tbody>
          {SONG_SLOTS.map((label, slot) => (
            <tr key={slot}>
              <td>{label}</td>
              <td>
                <select className="wide" aria-label={`Organ song: ${label}`} value={songs[slot]} onChange={(e) => setSong(slot, Number(e.target.value))}>
                  {!isSong(songs[slot]) && <option value={songs[slot]}>No song (it plays nothing)</option>}
                  <option value={RANDOM_SONG}>Random</option>
                  {SONG_NUMBERS.map((number) => (
                    <option key={number} value={number}>
                      {songName(number)}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
