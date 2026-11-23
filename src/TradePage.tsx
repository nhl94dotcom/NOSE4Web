import { useEffect, useState } from 'react'
import { ATTRIBUTE_VIEWS, attributeText, isRating, type AttributeView } from './core/attributes'
import { hex } from './core/bytes'
import { playerRole, teamSummaries } from './core/league'
import { hasLeagueValue, leagueValue, LEAGUE_VALUE_TITLE, type Role } from './core/leaguevalue'
import { overallRating } from './core/rating'
import type { RomProject } from './core/rom'
import { overfullTeams, teamLabels, teamSpace } from './core/team'
import { FREE_AGENTS, linePositionsLost, trade, tradeSummary, type TradeSide } from './core/trade'
import { ColumnOrderButton } from './ColumnOrder'
import { keptSides, liveSides, tradeKept, type TradeKept } from './pagedrafts'
import { useAttributeOrder } from './useColumnOrder'

interface Props {
  project: RomProject
  // The team the user was last looking at, to start one side on.
  startTeam: number
  // How attributes show, as on a team's page.
  attributeView: AttributeView
  onAttributeViewChange: (view: AttributeView) => void
  onChange: (project: RomProject) => void
  onGoToTeam: (team: number) => void
  // The sides as they were left, kept while other pages show (pagedrafts.ts).
  kept: TradeKept | null
  onKeep: (kept: TradeKept) => void
}

interface Row {
  // Place on the roster or among the free agents, which a tick goes by.
  index: number
  name: string
  role: string
  jersey: number
  overall: number
  // Match Viewer's league value, where the ROM has one.
  value: number | null
  attributes: number[]
}

const one = (value: number | null) => (value === null ? '–' : value.toFixed(1))

export function TradePage({ project, startTeam, attributeView, onAttributeViewChange, onChange, onGoToTeam, kept, onKeep }: Props) {
  const rawAttributes = attributeView === 'stored'
  const { game } = project
  const [showAttributes, setShowAttributes] = useState(true)
  const orders = { skaters: useAttributeOrder(game, 'skaters'), goalies: useAttributeOrder(game, 'goalies') }
  const storedOnly = !game.playerAttributeKinds.some(isRating)
  const count = project.teams.length
  const first = startTeam >= 0 && startTeam < count ? startTeam : 0
  // Kept sides come back while players are still ticked on them; otherwise the page starts on the team just looked at.
  const [sides, setSides] = useState<[TradeSide, TradeSide]>(() => {
    const back = kept ? keptSides(project, kept) : null
    return back && back.some((side) => side.picks.length > 0)
      ? back
      : [
          { team: first, picks: [] },
          { team: first === 0 ? 1 : 0, picks: [] },
        ]
  })
  useEffect(() => onKeep(tradeKept(project, sides)), [project, sides, onKeep])
  const [notice, setNotice] = useState('')
  const labels = teamLabels(project.teams, project.game)
  const label = (team: number) => (team === FREE_AGENTS ? 'Free agents' : labels[team])
  const showValue = hasLeagueValue(project.game)
  const valueOf = (attributes: number[], role: string) => (showValue ? leagueValue(attributes, role as Role, project.game.platform) : null)

  // Undo can shorten a roster under the ticks, so ticks past its end are dropped.
  const rowsOf = (team: number): Row[] =>
    team === FREE_AGENTS
      ? project.freeAgents.map((agent, index) => ({
          index,
          name: agent.player.name,
          role: agent.role,
          jersey: agent.player.jersey,
          overall: overallRating(agent.player.attributes, agent.role === 'G', project.game),
          value: valueOf(agent.player.attributes, agent.role),
          attributes: agent.player.attributes,
        }))
      : project.teams[team].players.map((player, index) => {
          const role = playerRole(project.teams[team], index)
          const overall = overallRating(player.attributes, role === 'G', project.game)
          return { index, name: player.name, role, jersey: player.jersey, overall, value: valueOf(player.attributes, role), attributes: player.attributes }
        })
  const live = liveSides(project, sides)

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
        Choose two sides, select the players each gives up, and see what the trade would do before making it. Either
        side can give nothing, which makes it a straight move. Skaters keep their role as forward or defenceman.
        A goalie traded for a goalie takes their place; a team keeps 1 to 4 goalies. <b>Free agents</b> are players you are holding on no team: release a
        player to them, or sign one from them, by choosing Free agents as one side.
      </p>
      <h3>What it would do</h3>
      {picked === 0 && <p className="note">{notice || 'Select the players each side gives up.'}</p>}
      {problem && <p className="error">{problem}</p>}
      {result && after && (
        <>
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
            const lost = linePositionsLost(project, side, live.find((s) => s !== side))
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
        </>
      )}
      <p>
        <label className="choice">
          <input type="checkbox" checked={showAttributes} onChange={(e) => setShowAttributes(e.target.checked)} /> Show
          attributes
        </label>
        {showAttributes && !storedOnly && (
          <label className="choice">
            as{' '}
            <select aria-label="Show attributes as" value={attributeView} onChange={(e) => onAttributeViewChange(e.target.value as AttributeView)}>
              {ATTRIBUTE_VIEWS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="note">Hover a column heading for the attribute's full name.</span>
      </p>
      {showAttributes && <ColumnOrderButton game={game} />}
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
                  There are no free agents. To release a player, choose their team as the other side, select them, and
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
                  const order = orders[isGoalies ? 'goalies' : 'skaters']
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
                          {showValue && <th title={LEAGUE_VALUE_TITLE}>LV</th>}
                          {showAttributes &&
                            order.map((a) => (
                              <th key={a} title={attributeNames[a]}>
                                {attributeLabels[a]}
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
                            {showValue && <td>{row.value}</td>}
                            {showAttributes &&
                              order.map((a) => (
                                <td key={a}>{rawAttributes ? row.attributes[a] : (attributeText(kinds[a], row.attributes[a], attributeView === 'ranges') ?? `! ${row.attributes[a]}`)}</td>
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
      {/* While players are selected, what the trade does and its button stay in view at the bottom of the window. */}
      {picked > 0 && (
        <div className="ticked-tools">
          {result ? (
            <p>
              <b>{tradeSummary(project, live[0], live[1])}</b> <button onClick={make}>Make this trade</button>
            </p>
          ) : (
            <p>
              <b>This trade cannot be made.</b> <span className="note">The reason is under What it would do, at the top.</span>
            </p>
          )}
        </div>
      )}
    </main>
  )
}
