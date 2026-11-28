import { useState } from 'react'
import { GOAL_SIREN, GOAL_SOUNDS, GoalSoundError, goalSoundsSupported, readGoalSounds, withGoalSounds, type GoalSounds } from './core/goalsounds'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The Music page's goal sounds (goalsounds.ts): the sound each home team's goals make, and visitors' goals.
export function GoalSoundsSection({ project, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)
  if (project.game.platform !== 'genesis' || !goalSoundsSupported(project)) return null
  const read = readGoalSounds(project)
  const sounds: GoalSounds = read ?? { home: project.teams.map(() => GOAL_SIREN), visitors: GOAL_SIREN }

  const put = (next: GoalSounds | null, done: string | null) => {
    try {
      onChange(withGoalSounds(project, next))
      setMessage(done ? { text: done, failed: false } : null)
    } catch (e) {
      setMessage({ text: e instanceof GoalSoundError ? e.message : String(e), failed: true })
    }
  }
  const choices = (value: number, label: string, onPick: (value: number) => void) => (
    <select aria-label={label} value={value} onChange={(e) => onPick(Number(e.target.value))}>
      {GOAL_SOUNDS.map((sound) => (
        <option key={sound.number} value={sound.number}>
          {sound.name}
        </option>
      ))}
      {!GOAL_SOUNDS.some((sound) => sound.number === value) && <option value={value}>Sound {value}</option>}
    </select>
  )

  return (
    <section>
      <h2>Goal sounds</h2>
      <p className="note">
        The sound when a goal goes in, in place of the goal siren: the home team's choice when they score, and one for
        every visiting team's goal. A home goal also gets the crowd's own cheer, whatever is chosen, and its organ song
        still follows. The end of period horn is louder than the siren. Tested in the game by the NHL94 Match Viewer
        project.
      </p>
      {message && <p className={message.failed ? 'error' : 'note'}>{message.text}</p>}
      <p>
        <label>
          Visitors' goals, in every arena:{' '}
          {choices(sounds.visitors, "Goal sound: visitors' goals", (value) => put({ ...sounds, visitors: value }, null))}
        </label>
      </p>
      <table className="left">
        <thead>
          <tr>
            <th>Home team</th>
            <th>When they score at home</th>
          </tr>
        </thead>
        <tbody>
          {project.teams.map((team, t) => (
            <tr key={t}>
              <td>{teamDisplayName(team)}</td>
              <td>
                {choices(sounds.home[t], `Goal sound: ${teamDisplayName(team)}`, (value) => {
                  const home = sounds.home.slice()
                  home[t] = value
                  put({ ...sounds, home }, null)
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {read && (
        <p>
          <button onClick={() => put(null, 'Every goal plays the goal siren again. Undo takes it back.')}>The goal siren for every goal</button>
        </p>
      )}
    </section>
  )
}
