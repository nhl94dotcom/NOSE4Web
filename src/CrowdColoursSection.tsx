import { useState } from 'react'
import { cssHex, GENESIS_COLORS, nearestColorWord, SNES_COLORS } from './core/color'
import { CROWD_OWN, crowdColoursFromBanners, crowdColoursSupported, CrowdColoursError, crowdOwnColours, readCrowdColours, withCrowdColours } from './core/crowdcolours'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

const NAMES = ['First shirts', 'Second shirts']

// The Rink colours page's crowd colours by home team (crowdcolours.ts, NHL '95 and the SNES).
export function CrowdColoursSection({ project, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)
  if (!crowdColoursSupported(project)) return null
  const format = project.game.platform === 'snes' ? SNES_COLORS : GENESIS_COLORS
  const colours = readCrowdColours(project) ?? project.teams.map((): [number, number] => [CROWD_OWN, CROWD_OWN])
  const own = crowdOwnColours(project) ?? [0, 0]

  const put = (next: [number, number][] | null, text: string | null) => {
    try {
      onChange(withCrowdColours(project, next))
      setMessage(text ? { text, failed: false } : null)
    } catch (e) {
      setMessage({ text: e instanceof CrowdColoursError ? e.message : String(e), failed: true })
    }
  }
  const set = (team: number, slot: 0 | 1, value: number) => {
    const next = colours.map((pair) => [...pair] as [number, number])
    next[team][slot] = value
    put(next, null)
  }

  return (
    <section>
      <h2>Each home team's crowd colours</h2>
      <p className="note">
        The crowd in the stands, in the home team's colours: two colours a team, each on its own shirts with a darker
        shade of it beside, the faces and hair as they are.{' '}
        {project.game.platform === 'snes'
          ? 'On the SNES the free colours are the crowd’s blue and green shirts.'
          : "On NHL '95 the rink's other colours are shared with the score box and the referee's box, so the crowd's are the ones each team can have; they show in the goal celebration and at the game's end too."}{' '}
        A team left on <i>the crowd's own</i> keeps them. Tested in the game by the NHL94 Match Viewer project.
      </p>
      <p>
        <button onClick={() => put(crowdColoursFromBanners(project), "Every team's crowd now wears its banner's two colours. Undo takes it back.")}>
          From each team's banner colours
        </button>{' '}
        {readCrowdColours(project) && <button onClick={() => put(null, "Every team's crowd is as the game has it again. Undo takes it back.")}>Every team the crowd's own</button>}
      </p>
      {message && <p className={message.failed ? 'error' : 'note'}>{message.text}</p>}
      <table className="left">
        <thead>
          <tr>
            <th>Home team</th>
            {NAMES.map((name) => (
              <th key={name}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.teams.map((team, t) => (
            <tr key={t}>
              <td>{teamDisplayName(team)}</td>
              {([0, 1] as const).map((slot) => {
                const isOwn = colours[t][slot] === CROWD_OWN
                return (
                  <td key={slot}>
                    <input
                      type="color"
                      aria-label={`${NAMES[slot]}: ${teamDisplayName(team)}`}
                      value={cssHex(isOwn ? own[slot] : colours[t][slot], format)}
                      onChange={(e) => set(t, slot, nearestColorWord(e.target.value, format))}
                    />{' '}
                    {isOwn ? <span className="note">the crowd's own</span> : <button onClick={() => set(t, slot, CROWD_OWN)}>The crowd's own</button>}
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
