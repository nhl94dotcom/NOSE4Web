import { useState } from 'react'
import { checkProject } from './core/check'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'
import { alphabeticalOrder, teamMovedTo, teamMoveRange, withTeamOrder, type TeamOrder } from './core/teamorder'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// Giving teams new team numbers: the order the Game Setup menu offers them in,
// the order they are kept in the ROM, and so the order the spreadsheet files
// list them in. Everything the game keeps by team number moves with them.
export function MoveTeamsSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const range = teamMoveRange(project)
  const names = teamLabels(project.teams, project.game)
  const count = project.teams.length
  const snes = project.game.platform === 'snes'

  function move(order: TeamOrder, done: string) {
    try {
      const next = withTeamOrder(project, order)
      onChange(next)
      // A team moved into or out of the playoff teams can leave one that no draw has.
      const freezes = (p: RomProject) => checkProject(p).filter((f) => f.where === 'Playoff draws' && f.level === 'problem').length
      const warning = freezes(next) > freezes(project) ? ' Check ROM now finds a problem with the playoff draws: see it before downloading.' : ''
      setNotice(`${done} Undo takes it back.${warning}`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  const intro = (
    <p className="note">
      Gives teams new team numbers. The Game Setup menu offers the teams in their new order, the team list here shows
      them so, and the spreadsheet files list them so. Everything the game keeps by team number goes with each team: its
      players, lines, names and colours,{' '}
      {snes
        ? 'its logo and centre ice logo, its banner name and colours, its player photos and their colours, its organ songs and its score logo.'
        : 'its logos, banners and menu colours, its player photos, organ songs and score logos, and the team rating on its player cards.'}{' '}
      The playoff draws, the main menu's starting teams, the start of the season and the league rules' exempt teams
      follow their teams too. A game saved in the emulator's battery save keeps what it saves for a team (such as saved
      lines) by team number, so start a new save after downloading.
    </p>
  )

  if ('reason' in range) {
    return (
      <section>
        <h2>Move teams</h2>
        {intro}
        <p className="note">{range.reason}</p>
      </section>
    )
  }
  const { league, offered, playoffTeams } = range
  const sorted = alphabeticalOrder(project, league)
  const isSorted = sorted.every((team, n) => team === n)
  const moved = project.teamOrder?.some((team, n) => team !== n) ?? false

  return (
    <section>
      <h2>Move teams</h2>
      {intro}
      <p>
        <button disabled={isSorted} onClick={() => move(sorted, `The first ${league} teams are now in alphabetical order.`)}>
          Put the first {league} teams in alphabetical order
        </button>{' '}
        {moved && (
          <button onClick={() => move(project.teamOrder!.map((_, n) => project.teamOrder!.indexOf(n)), 'The teams are back in the order of the ROM you opened.')}>
            Put the teams back as the ROM had them
          </button>
        )}
      </p>
      <p className="note">
        The first {league} are the league's teams: those the Game Setup menu offers, up to the last playoff team. The
        rest, such as the All-Star teams, stay after them when sorting.
        {offered < count && ` The menu offers the first ${offered} teams, so a team moved past team ${offered} cannot be picked there.`}
        {playoffTeams < count &&
          ` New playoffs are for the first ${playoffTeams}: a team moved past team ${playoffTeams} is not a playoff team, and Check ROM says if the playoff draws need changing for it.`}
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <table className="left">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Move</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, team) => (
            <tr key={team} className={team === league ? 'divider' : undefined}>
              <td>{team + 1}</td>
              <td>{name}</td>
              <td>
                <button aria-label={`Move ${name} up`} disabled={team === 0} onClick={() => move(teamMovedTo(count, team, team - 1), `${name} is now team ${team}.`)}>
                  ▲
                </button>{' '}
                <button aria-label={`Move ${name} down`} disabled={team === count - 1} onClick={() => move(teamMovedTo(count, team, team + 1), `${name} is now team ${team + 2}.`)}>
                  ▼
                </button>{' '}
                <select
                  aria-label={`Move ${name} to number`}
                  value={team}
                  onChange={(e) => {
                    const to = Number(e.target.value)
                    move(teamMovedTo(count, team, to), `${name} is now team ${to + 1}.`)
                  }}
                >
                  {names.map((_, n) => (
                    <option key={n} value={n}>
                      {n === team ? `Team ${n + 1}` : `To ${n + 1}`}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
