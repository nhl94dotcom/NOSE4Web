import { useState } from 'react'
import { attributeText } from './core/attributes'
import { hex } from './core/bytes'
import { playerRole, teamSummaries } from './core/league'
import { overallRating } from './core/rating'
import type { RomProject } from './core/rom'
import { overfullTeams, teamLabels, teamSpace } from './core/team'
import { FREE_AGENTS, linePositionsLost, trade, tradeSummary, type TradeSide } from './core/trade'

interface Props {
  project: RomProject
  // The team the user was last looking at, to start one side on.
  startTeam: number
  // Whether attributes show as the numbers stored, as on a team's page.
  rawAttributes: boolean
  onRawAttributesChange: (raw: boolean) => void
  onChange: (project: RomProject) => void
  onGoToTeam: (team: number) => void
}

interface Row {
  // Place on the roster or among the free agents, which a tick goes by.
  index: number
  name: string
  role: string
  jersey: number
  overall: number
  attributes: number[]
}

const one = (value: number | null) => (value === null ? '–' : value.toFixed(1))

export function TradePage({ project, startTeam, rawAttributes, onRawAttributesChange, onChange, onGoToTeam }: Props) {
  const { game } = project
  const [showAttributes, setShowAttributes] = useState(true)
  const storedOnly = game.playerAttributeKinds.every((kind) => kind === 'value')
  const count = project.teams.length
  const first = startTeam >= 0 && startTeam < count ? startTeam : 0
  const [sides, setSides] = useState<[TradeSide, TradeSide]>([
    { team: first, picks: [] },
    { team: first === 0 ? 1 : 0, picks: [] },
  ])
  const [notice, setNotice] = useState('')
  const labels = teamLabels(project.teams, project.game)
  const label = (team: number) => (team === FREE_AGENTS ? 'Free agents' : labels[team])

  // Undo can shorten a roster under the ticks, so ticks past its end are dropped.
  const rowsOf = (team: number): Row[] =>
    team === FREE_AGENTS
      ? project.freeAgents.map((agent, index) => ({
          index,
          name: agent.player.name,
          role: agent.role,
          jersey: agent.player.jersey,
          overall: overallRating(agent.player.attributes, agent.role === 'G', project.game),
          attributes: agent.player.attributes,
        }))
      : project.teams[team].players.map((player, index) => {
          const role = playerRole(project.teams[team], index)
          const overall = overallRating(player.attributes, role === 'G', project.game)
          return { index, name: player.name, role, jersey: player.jersey, overall, attributes: player.attributes }
        })
  const live = sides.map((side) => ({ ...side, picks: side.picks.filter((i) => i < rowsOf(side.team).length) })) as [TradeSide, TradeSide]

  const setSide = (which: number, next: TradeSide) => {
    setSides(sides.map((side, i) => (i === which ? next : side)) as [TradeSide, TradeSide])
    setNotice('')
  }

  // What the trade would do, or why it cannot be made.
  const picked = live[0].picks.length + live[1].picks.length
  let result: RomProject | null = null
  let problem = ''
  if (picked > 0) {
    try {
      result = trade(project, live[0], live[1])
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e)
    }
  }
  const before = teamSummaries(project)
  const after = result ? teamSummaries(result) : null
  const space = result ? teamSpace(result.teams, result.layout) : null
  const tooBig = result ? overfullTeams(result.teams, result.layout) : []
  const overBy = space && !result?.layout.slots && space.used > space.available ? space.used - space.available : 0

  function make() {
    if (!result) return
    const said = tradeSummary(project, live[0], live[1])
    onChange(result)
    setSides([
      { ...live[0], picks: [] },
      { ...live[1], picks: [] },
    ])
    setNotice(`Done. ${said} Undo takes it back.`)
  }

  return (
    <main className="team help">
      <h2>Trade</h2>
      <p className="note">
        Choose two sides, tick the players each gives up, and see what the trade would do before making it. Either
        side can give nothing, which makes it a straight move. Skaters keep their role as forward or defenceman.
        Goalies change places one for one. <b>Free agents</b> are players you are holding on no team: release a
        player to them, or sign one from them, by choosing Free agents as one side.
      </p>
      <h3>What it would do</h3>
      {picked === 0 && <p className="note">{notice || 'Tick the players each side gives up.'}</p>}
      {problem && <p className="error">{problem}</p>}
      {result && after && (
        <>
          <p>{tradeSummary(project, live[0], live[1])}</p>
          <table className="left">
            <thead>
              <tr>
                <th />
                <th>Players</th>
                <th title="Average overall of the skaters on the first line (NLC)">First line</th>
                <th title="Average overall of every skater on the roster">Skaters</th>
                <th title="Highest overall among the goalies">Best goalie</th>
              </tr>
            </thead>
            <tbody>
              {live
                .filter((side) => side.team !== FREE_AGENTS)
                .map((side) => {
                  const [was, now] = [before[side.team], after[side.team]]
                  const change = (a: number | null, b: number | null, text: (v: number | null) => string) =>
                    a === b ? text(b) : `${text(a)} to ${text(b)}`
                  return (
                    <tr key={side.team}>
                      <td>
                        <strong>{labels[side.team]}</strong>
                      </td>
                      <td>{change(was.players, now.players, String)}</td>
                      <td>{change(was.startingSkaters, now.startingSkaters, one)}</td>
                      <td>{change(was.skaters, now.skaters, one)}</td>
                      <td>{change(was.bestGoalie, now.bestGoalie, (v) => (v === null ? '–' : String(v)))}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          {live.map((side) => {
            const lost = linePositionsLost(project, side)
            return (
              lost > 0 && (
                <p key={side.team} className="note">
                  {labels[side.team]}: {lost === 1 ? '1 position' : `${lost} positions`} on the lines{' '}
                  {lost === 1 ? 'is' : 'are'} held by players who would leave. Another player is put in each, so look
                  over that team's lines afterwards.
                </p>
              )
            )
          })}
          {live.some((side) => side.team === FREE_AGENTS) && (
            <p className="note">
              Free agents are kept with your work in this browser and in a project file. They are not in the ROM.
            </p>
          )}
          {overBy > 0 && <p className="error">The rosters would then be {overBy} bytes too large for the ROM. Longer names take more room.</p>}
          {tooBig.map((entry) => (
            <p key={entry.team} className="error">
              {labels[entry.team]} would then be {entry.over} bytes too large for its place in the ROM.
            </p>
          ))}
          <p>
            <button onClick={make}>Make this trade</button>
          </p>
        </>
      )}
      <p>
        <label className="choice">
          <input type="checkbox" checked={showAttributes} onChange={(e) => setShowAttributes(e.target.checked)} /> Show
          attributes
        </label>
        {showAttributes && !storedOnly && (
          <label className="choice">
            <input type="checkbox" checked={rawAttributes} onChange={(e) => onRawAttributesChange(e.target.checked)} /> as
            stored values (0–15)
          </label>
        )}
        <span className="note">Hover a column heading for the attribute's full name.</span>
      </p>
      <div className="trade">
        {live.map((side, which) => {
          const rows = rowsOf(side.team)
          const other = live[1 - which].team
          return (
            <section key={which}>
              <p>
                <select
                  className="wide"
                  aria-label={which === 0 ? 'First side of the trade' : 'Second side of the trade'}
                  value={side.team}
                  onChange={(e) => setSide(which, { team: Number(e.target.value), picks: [] })}
                >
                  {project.teams.map((_, team) => (
                    <option key={team} value={team} disabled={team === other}>
                      {labels[team]}
                    </option>
                  ))}
                  <option value={FREE_AGENTS} disabled={other === FREE_AGENTS}>
                    Free agents ({project.freeAgents.length})
                  </option>
                </select>{' '}
                {side.team !== FREE_AGENTS && (
                  <button className="link" onClick={() => onGoToTeam(side.team)}>
                    Go to team
                  </button>
                )}
              </p>
              {rows.length === 0 ? (
                <p className="note">
                  There are no free agents. To release a player, choose his team as the other side, tick him, and
                  make the trade.
                </p>
              ) : (
                // Goalies and skaters have different attributes, so each has its own table.
                [true, false].map((isGoalies) => {
                  const group = rows.filter((row) => (row.role === 'G') === isGoalies)
                  if (group.length === 0) return null
                  const kinds = isGoalies ? game.goalieAttributeKinds : game.playerAttributeKinds
                  const attributeLabels = isGoalies ? game.goalieAttributeLabels : game.playerAttributeLabels
                  const attributeNames = isGoalies ? game.goalieAttributeNames : game.playerAttributeNames
                  return (
                    <div key={String(isGoalies)} className="scroll">
                    <table className={showAttributes ? 'left attributes' : 'left'}>
                      <thead>
                        <tr>
                          <th />
                          <th>Pos</th>
                          <th className="pin">{isGoalies ? 'Goalies' : 'Skaters'}</th>
                          <th>No.</th>
                          <th>Ovr</th>
                          {showAttributes &&
                            attributeLabels.map((text, a) => (
                              <th key={a} title={attributeNames[a]}>
                                {text}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((row) => (
                          <tr key={row.index} className={side.picks.includes(row.index) ? 'picked' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`${row.name} leaves ${label(side.team)}`}
                                checked={side.picks.includes(row.index)}
                                onChange={(e) =>
                                  setSide(which, {
                                    ...side,
                                    picks: e.target.checked
                                      ? [...side.picks, row.index].sort((a, b) => a - b)
                                      : side.picks.filter((p) => p !== row.index),
                                  })
                                }
                              />
                            </td>
                            <td>{row.role}</td>
                            <td className="pin">{row.name}</td>
                            <td>{hex(row.jersey)}</td>
                            <td>{row.overall}</td>
                            {showAttributes &&
                              row.attributes.map((value, a) => (
                                <td key={a}>{rawAttributes ? value : (attributeText(kinds[a], value) ?? `! ${value}`)}</td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )
                })
              )}
            </section>
          )
        })}
      </div>

    </main>
  )
}
