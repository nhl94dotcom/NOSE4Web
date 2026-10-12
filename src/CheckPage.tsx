import { useState } from 'react'
import type { Finding } from './core/check'
import { hasLeagueRules, NO_LEAGUE_RULES, type LeagueRules, type RuleLimit } from './core/leaguerules'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'

interface Props {
  project: RomProject
  findings: Finding[]
  onGoToTeam: (team: number) => void
  onChange: (project: RomProject) => void
}

// The limits a league can set, in pairs where there is a least and a most.
const RANGES: { label: string; min: RuleLimit; max: RuleLimit }[] = [
  { label: 'Players on a team', min: 'minPlayers', max: 'maxPlayers' },
  { label: 'Goalies', min: 'minGoalies', max: 'maxGoalies' },
  { label: 'Forwards', min: 'minForwards', max: 'maxForwards' },
  { label: 'Defencemen', min: 'minDefence', max: 'maxDefence' },
]
const CAPS: { label: string; key: RuleLimit; title: string }[] = [
  { label: "A player's overall rating", key: 'maxPlayerOverall', title: 'The highest overall rating any one player may have' },
  { label: "A first line's average overall", key: 'maxFirstLine', title: 'The skaters on the first line (NLC), the one that plays when line changes are off' },
  { label: "A team's skaters' average overall", key: 'maxSkaterAverage', title: 'Every forward and defenceman on the roster' },
  { label: "A team's overall ratings added up", key: 'maxTotalOverall', title: 'Every player on the roster, in the manner of a salary cap' },
]

export function CheckPage({ project, findings, onGoToTeam, onChange }: Props) {
  const rules = project.leagueRules
  // The rules fold away, open to begin with only where some are set.
  const [rulesOpen, setRulesOpen] = useState(() => hasLeagueRules(project.leagueRules))
  const labels = teamLabels(project.teams, project.game)
  const set = (change: Partial<LeagueRules>) => onChange({ ...project, leagueRules: { ...rules, ...change } })

  const limit = (key: RuleLimit, name: string) => (
    <input
      className="num"
      inputMode="decimal"
      aria-label={name}
      placeholder="any"
      value={rules[key] ?? ''}
      onChange={(e) => {
        const text = e.target.value.trim()
        const value = Number(text)
        // Emptied, or anything that is not a number, means no limit.
        set({ [key]: text === '' || !Number.isFinite(value) || value < 0 ? null : value })
      }}
    />
  )

  const groups = [
    { level: 'problem', title: 'Likely to cause trouble in the game' },
    { level: 'rule', title: "Against your league's rules" },
    { level: 'note', title: 'Unusual, and worth a look' },
  ] as const

  return (
    <main className="team help">
      <h2>Check ROM</h2>
      <p className="note">
        A look over everything in the editor for mistakes that are easy to make and hard to spot. It updates as you
        work, and nothing here stops you downloading.
      </p>
      <details className="rules" open={rulesOpen} onToggle={(e) => setRulesOpen(e.currentTarget.open)}>
        <summary>
          Your league's rules{' '}
          <span className="note">{hasLeagueRules(rules) ? 'are set; click to change them' : 'none set; click to set limits of your own'}</span>
        </summary>
        <p className="note">
          Limits your league keeps to, which the game itself does not care about. Fill in the ones you want and
          leave the rest empty; every team is then checked against them above. They are kept with your work in this
          browser and in a project file, not in the ROM.
          {project.game.overallIsEstimate &&
            ' This ROM works out overall ratings in its own way, so limits on overall here go by a plain average of each player\'s values.'}
        </p>
        <table className="left">
          <thead>
            <tr>
              <th />
              <th>At least</th>
              <th>At most</th>
            </tr>
          </thead>
          <tbody>
            {RANGES.map((range) => (
              <tr key={range.label}>
                <td>{range.label}</td>
                <td>{limit(range.min, `${range.label}, at least`)}</td>
                <td>{limit(range.max, `${range.label}, at most`)}</td>
              </tr>
            ))}
            {CAPS.map((cap) => (
              <tr key={cap.key} title={cap.title}>
                <td>{cap.label}</td>
                <td />
                <td>{limit(cap.key, `${cap.label}, at most`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <label className="choice">
            <input type="checkbox" checked={rules.uniquePlayers} onChange={(e) => set({ uniquePlayers: e.target.checked })} /> No
            player on more than one team
          </label>
          <label className="choice">
            <input type="checkbox" checked={rules.uniqueJerseys} onChange={(e) => set({ uniqueJerseys: e.target.checked })} /> No
            two players on a team with the same number
          </label>
        </p>
        <details>
          <summary>
            Teams the rules do not apply to ({rules.exempt.length === 0 ? 'none' : rules.exempt.length})
          </summary>
          <p className="note">Tick teams to leave out, such as All Stars teams or a pool of spare players.</p>
          <p>
            {labels.map((label, team) => (
              <label key={team} className="choice">
                <input
                  type="checkbox"
                  checked={rules.exempt.includes(team)}
                  onChange={(e) =>
                    set({ exempt: e.target.checked ? [...rules.exempt, team].sort((a, b) => a - b) : rules.exempt.filter((t) => t !== team) })
                  }
                />{' '}
                {label}
              </label>
            ))}
          </p>
        </details>
        <p>
          <button disabled={!hasLeagueRules(rules) && rules.exempt.length === 0} onClick={() => set(NO_LEAGUE_RULES)}>
            Clear the rules
          </button>
        </p>
      </details>
      {findings.length === 0 && <p>Nothing to report.</p>}
      {groups.map(({ level, title }) => {
        const list = findings.filter((finding) => finding.level === level)
        if (list.length === 0) return null
        return (
          <section key={level}>
            <h3>
              {title} ({list.length})
            </h3>
            <table className="left">
              <tbody>
                {list.map((finding, i) => (
                  <tr key={i}>
                    <td>
                      {finding.team === undefined ? (
                        finding.where
                      ) : (
                        <button className="link" onClick={() => onGoToTeam(finding.team!)}>
                          {finding.where}
                        </button>
                      )}
                    </td>
                    <td className="wrap">{finding.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

    </main>
  )
}
