// Sections that change every team at once, shown on the Bulk changes page: every team's lines built from the
// players' ratings, and one Home and Away rating pair for every team.
import { useState } from 'react'
import { brokenLines, buildLines, knowsHands } from './core/linebuilder'
import { emptyLineSlots } from './core/lines'
import type { RomProject } from './core/rom'
import { setTeamRating, teamRatings } from './core/teamratings'
import { LineOptionsPicker } from './LineOptions'
import { useLineOptions } from './useLineOptions'

// The Home and Away team ratings, which the game adds to the home team's and takes off the away team's
// Offensive and Defensive Awareness, Stickhandling, Shot Accuracy and Passing as each player comes on the ice
// (teamratings.ts): how they differ across the league, and one pair set for every team.
const HOME = 4
const AWAY = 5
export function LineBuilder({ project, names, onChange }: { project: RomProject; names: string[]; onChange: (project: RomProject) => void }) {
  const [done, setDone] = useState('')
  const [options, setOptions] = useLineOptions()
  const empty = emptyLineSlots(project.teams)
  const broken = project.teams.map((team) => brokenLines(team, empty))
  const brokenTeams = broken.filter((lines) => lines.length > 0).length
  const run = (onlyBroken: boolean) => {
    let lines = 0
    let teams = 0
    const next = project.teams.map((team, t) => {
      const which = onlyBroken ? broken[t] : team.lines.map((_, l) => l)
      const built = buildLines(team, project.game, which, empty, options)
      if (built.changed.length === 0) return team
      lines += built.changed.length
      teams++
      return { ...team, lines: built.lines }
    })
    if (teams > 0) onChange({ ...project, teams: next })
    setDone(teams > 0 ? `Built ${lines} ${lines === 1 ? 'line' : 'lines'} on ${teams} ${teams === 1 ? 'team' : 'teams'}. Undo takes it back.` : 'Nothing to change.')
  }
  return (
    <section id="line-builder">
      <h3>Lines for every team</h3>
      <p className="note">
        Builds teams' lines from the players' ratings, by what each line is for: the best players on the first line
        (NLC, the one played with line changes off), scorers on the scoring and power-play lines, checkers on the
        checking line, defensive players on the penalty kill, and the team's current starting goalie in goal. The
        ratings are only a guide to how a player plays, so take it as a starting point; each team's page has the same
        for one team or chosen lines.
      </p>
      {knowsHands(project.game) && (
        <p>
          <LineOptionsPicker options={options} onChange={setOptions} />{' '}
          <span className="note">Which side each player goes to by the hand he shoots with, where a line's two wingers or its pair shoot differently.</span>
        </p>
      )}
      <p>
        <button type="button" onClick={() => run(false)}>
          Build every team's lines
        </button>{' '}
        <button type="button" disabled={brokenTeams === 0} onClick={() => run(true)}>
          Fix broken lines only
        </button>{' '}
        <span className="note">
          {brokenTeams === 0
            ? 'No team has a broken line.'
            : `Broken: ${broken.flatMap((lines, t) => (lines.length > 0 ? [`${names[t]} (${lines.map((l) => project.game.lineLabels[l]).join(', ')})`] : [])).join('; ')}.`}
        </span>{' '}
        {done && <span className="note">{done}</span>}
      </p>
    </section>
  )
}

export function HomeAway({ project, names, onChange }: { project: RomProject; names: string[]; onChange: (project: RomProject) => void }) {
  const [home, setHome] = useState(0)
  const [away, setAway] = useState(0)
  const [done, setDone] = useState('')
  const pairs = project.teams.map((team) => [teamRatings(team)[HOME], teamRatings(team)[AWAY]] as const)
  const counts = (index: 0 | 1) => {
    const tally = new Map<number, number>()
    for (const pair of pairs) tally.set(pair[index], (tally.get(pair[index]) ?? 0) + 1)
    return [...tally.entries()].sort((a, b) => a[0] - b[0]).map(([value, n]) => `${value} (${n} ${n === 1 ? 'team' : 'teams'})`).join(', ')
  }
  const same = pairs.every((pair) => pair[0] === pairs[0][0] && pair[1] === pairs[0][1])
  const apply = () => {
    onChange({ ...project, teams: project.teams.map((team) => setTeamRating(setTeamRating(team, HOME, home), AWAY, away)) })
    setDone(`Every team now has Home ${home} and Away ${away}. Undo takes it back.`)
  }
  return (
    <section id="home-away">
      <h3>Home and away</h3>
      <p className="note">
        As each player comes on the ice, the home team adds its <b>Home</b> rating to his Offensive and Defensive
        Awareness, Stickhandling, Shot Accuracy and Passing, and the away team takes its <b>Away</b> rating off the
        same five, by a small amount (less than half a rating point). In the original game they differ by team. Give
        every team the same pair to make the advantage the same in every game, or 0 and 0 to have none.
      </p>
      <p>
        Now: Home {counts(0)}; Away {counts(1)}.{same ? ' Every team has the same pair.' : ''}
      </p>
      <p>
        <label>
          Home{' '}
          <select aria-label="Home rating for every team" value={home} onChange={(e) => setHome(Number(e.target.value))}>
            {[0, 1, 2].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>{' '}
        <label>
          Away{' '}
          <select aria-label="Away rating for every team" value={away} onChange={(e) => setAway(Number(e.target.value))}>
            {[0, 1, 2, 3].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>{' '}
        <button type="button" onClick={apply}>
          Set for every team
        </button>{' '}
        {done && <span className="note">{done}</span>}
      </p>
      {!same && (
        <details>
          <summary>Each team's</summary>
          <ul>
            {pairs.map((pair, t) => (
              <li key={t}>
                {names[t]}: Home {pair[0]}, Away {pair[1]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
