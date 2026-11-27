import { useState } from 'react'
import { ARENA_SLOTS, arenaColoursSupported, ArenaColoursError, readArenaColours, RINK_OWN, withArenaColours } from './core/arenacolours'
import { colorRgb, nearestColorWord } from './core/color'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

const SLOT_NAMES = ['Boards trim', 'Red markings']
const cssHex = (word: number) => '#' + colorRgb(word).map((v) => v.toString(16).padStart(2, '0')).join('')

// The Rink colours page's per-team colours (arenacolours.ts, Genesis NHL 94): the two colours only the rink uses, each
// home team's own or the rink's.
export function ArenaColoursSection({ project, onChange }: Props) {
  const [message, setMessage] = useState('')
  if (!arenaColoursSupported(project)) return null
  const colours = readArenaColours(project) ?? project.teams.map((): [number, number] => [RINK_OWN, RINK_OWN])
  const rinks = ARENA_SLOTS.map((slot) => project.rinkPalette[slot])

  const set = (team: number, slot: 0 | 1, value: number) => {
    try {
      const next = colours.map((pair) => [...pair] as [number, number])
      next[team][slot] = value
      onChange(withArenaColours(project, next))
      setMessage('')
    } catch (e) {
      setMessage(e instanceof ArenaColoursError ? e.message : String(e))
    }
  }

  return (
    <section>
      <h2>Each home team's rink colours</h2>
      <p className="note">
        Two of the rink's colours are used by nothing else on the screen, so each home team can have its own: the{' '}
        <b>boards trim</b> (the band along the foot of the boards all round, and the edges of the benches and penalty
        boxes) and the <b>red markings</b> (the goal lines, the faceoff circles and dots and the centre line). Every
        other rink colour is shared with the score box, the clock, the EA logo or the crowd, so it stays the same for
        every team (above). A team left on <i>the rink's own</i> uses the colour above. The scoreboard seen from the
        side (pause and intermission) keeps the rink's own colours, as the boards trim is its frame too. Tested in the
        game by the NHL94 Match Viewer project.
      </p>
      {message && <p className="error">{message}</p>}
      <table className="left">
        <thead>
          <tr>
            <th>Home team</th>
            {SLOT_NAMES.map((name) => (
              <th key={name}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.teams.map((team, t) => (
            <tr key={t}>
              <td>{teamDisplayName(team)}</td>
              {([0, 1] as const).map((slot) => {
                const own = colours[t][slot] === RINK_OWN
                const shown = own ? rinks[slot] : colours[t][slot]
                return (
                  <td key={slot}>
                    <input
                      type="color"
                      aria-label={`${SLOT_NAMES[slot]}: ${teamDisplayName(team)}`}
                      value={cssHex(shown)}
                      onChange={(e) => set(t, slot, nearestColorWord(e.target.value))}
                    />{' '}
                    {own ? (
                      <span className="note">the rink's own</span>
                    ) : (
                      <button onClick={() => set(t, slot, RINK_OWN)}>The rink's own</button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
