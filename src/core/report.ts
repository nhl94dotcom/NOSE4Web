// A summary of what changed between two ROMs, written to be read by the
// people in a league: who moved, who is new, whose ratings changed.

import { compareProjects } from './compare'
import { leaguePlayers, ROLE_NAMES, type LeaguePlayer } from './league'
import type { RomProject } from './rom'
import { teamLabels } from './team'

export interface Move {
  name: string
  from: string
  to: string
  overall: number
}

export interface Arrival {
  name: string
  team: string
  role: string
  overall: number
  // For a player gone from his team, that he is now a free agent; for one new
  // to a team, that he was one.
  freeAgent: boolean
}

export interface Rerating {
  name: string
  team: string
  from: number
  to: number
}

export interface ChangeReport {
  moves: Move[]
  arrivals: Arrival[]
  departures: Arrival[]
  // Biggest change first.
  reratings: Rerating[]
  // Everything, team by team, as on the Compare page.
  details: { heading: string; changes: string[] }[]
}

// Players are matched by name. Where a name appears more than once, players
// who stayed on their team are paired first, so a common name on two teams
// does not read as two trades.
function pairPlayers(before: LeaguePlayer[], after: LeaguePlayer[]) {
  const pairs: [LeaguePlayer, LeaguePlayer][] = []
  const left = new Set(before)
  const unmatched: LeaguePlayer[] = []
  const take = (wanted: (old: LeaguePlayer) => boolean) => {
    const found = [...left].find(wanted)
    if (found) left.delete(found)
    return found
  }
  const later: LeaguePlayer[] = []
  for (const now of after) {
    const old = take((p) => p.player.name === now.player.name && p.team === now.team)
    if (old) pairs.push([old, now])
    else later.push(now)
  }
  for (const now of later) {
    const old = take((p) => p.player.name === now.player.name)
    if (old) pairs.push([old, now])
    else unmatched.push(now)
  }
  return { pairs, arrived: unmatched, departed: [...left] }
}

export function changeReport(before: RomProject, after: RomProject): ChangeReport {
  const labels = new Map([before, after].map((project) => [project, teamLabels(project.teams, project.game)]))
  const teamName = (project: RomProject, team: number) => labels.get(project)![team]
  const { pairs, arrived, departed } = pairPlayers(leaguePlayers(before), leaguePlayers(after))
  // `pool` is the other project's free agents: where a new player came from, or a gone one went.
  const arrival = (project: RomProject, pool: RomProject) => (p: LeaguePlayer): Arrival => ({
    name: p.player.name,
    team: teamName(project, p.team),
    role: ROLE_NAMES[p.role],
    overall: p.overall,
    freeAgent: pool.freeAgents.some((agent) => agent.player.name === p.player.name),
  })
  const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name))

  return {
    moves: byName(
      pairs
        .filter(([old, now]) => old.team !== now.team)
        .map(([old, now]) => ({ name: now.player.name, from: teamName(before, old.team), to: teamName(after, now.team), overall: now.overall })),
    ),
    arrivals: byName(arrived.map(arrival(after, before))),
    departures: byName(departed.map(arrival(before, after))),
    reratings: pairs
      .filter(([old, now]) => old.overall !== now.overall)
      .map(([old, now]) => ({ name: now.player.name, team: teamName(after, now.team), from: old.overall, to: now.overall }))
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.name.localeCompare(b.name)),
    details: compareProjects(before, after),
  }
}

// One line of the report for a player new to a team, and for one gone from his.
export const arrivalText = (a: Arrival) => `${a.name}: ${a.team}, ${a.role}, overall ${a.overall}${a.freeAgent ? ', signed from the free agents' : ''}`
export const departureText = (d: Arrival) => `${d.name}: was with ${d.team}, ${d.role}, overall ${d.overall}${d.freeAgent ? ', now a free agent' : ''}`

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

export function reportIsEmpty(report: ChangeReport): boolean {
  return report.details.length === 0
}

// The report as plain text, ready to paste into a message or a forum post.
export function reportText(report: ChangeReport, beforeName: string, afterName: string): string {
  const lines: string[] = [`Changes from ${beforeName} to ${afterName}`, '']
  if (reportIsEmpty(report)) return [...lines, 'Nothing changed.', ''].join('\n')

  lines.push(
    [
      count(report.moves.length, 'player') + ' changed teams',
      count(report.arrivals.length, 'new player'),
      count(report.departures.length, 'player') + ' gone',
      count(report.reratings.length, 'overall rating') + ' changed',
    ].join(', ') + '.',
    '',
  )
  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return
    lines.push(title.toUpperCase(), ...rows.map((row) => `  ${row}`), '')
  }
  section('Changed teams', report.moves.map((m) => `${m.name}: ${m.from} to ${m.to} (overall ${m.overall})`))
  section('New players', report.arrivals.map(arrivalText))
  section('No longer on a team', report.departures.map(departureText))
  section(
    'Overall ratings, biggest change first',
    report.reratings.map((r) => `${r.name} (${r.team}): ${r.from} to ${r.to} (${signed(r.to - r.from)})`),
  )
  lines.push('EVERYTHING, TEAM BY TEAM', '')
  for (const detail of report.details) lines.push(detail.heading, ...detail.changes.map((change) => `  ${change}`), '')
  return lines.join('\n')
}
