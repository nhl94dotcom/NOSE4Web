// A league's own rules about its teams: limits the game does not care about,
// but the people playing do. They are part of the user's work, kept with it
// in the browser and in project files, and are not written to the ROM.

import type { Finding } from './check'
import { leaguePlayers, teamSummaries } from './league'
import type { RomProject } from './rom'
import { goalieCount, teamLabels } from './team'

export interface LeagueRules {
  // Each limit is a number, or null for no limit.
  minPlayers: number | null
  maxPlayers: number | null
  minGoalies: number | null
  maxGoalies: number | null
  minForwards: number | null
  maxForwards: number | null
  minDefence: number | null
  maxDefence: number | null
  // The highest overall rating any one player may have.
  maxPlayerOverall: number | null
  // The highest a team's ratings may average, over its first line and over all its skaters.
  maxFirstLine: number | null
  maxSkaterAverage: number | null
  // The most a team's overall ratings may add up to, in the manner of a salary cap.
  maxTotalOverall: number | null
  // Nobody may be on two teams, or two players on a team wear one number.
  uniquePlayers: boolean
  uniqueJerseys: boolean
  // Teams the rules do not apply to, such as All Stars teams.
  exempt: number[]
}

export const NO_LEAGUE_RULES: LeagueRules = {
  minPlayers: null,
  maxPlayers: null,
  minGoalies: null,
  maxGoalies: null,
  minForwards: null,
  maxForwards: null,
  minDefence: null,
  maxDefence: null,
  maxPlayerOverall: null,
  maxFirstLine: null,
  maxSkaterAverage: null,
  maxTotalOverall: null,
  uniquePlayers: false,
  uniqueJerseys: false,
  exempt: [],
}

export type RuleLimit = Exclude<keyof LeagueRules, 'uniquePlayers' | 'uniqueJerseys' | 'exempt'>
const LIMITS = Object.keys(NO_LEAGUE_RULES).filter((key) => NO_LEAGUE_RULES[key as keyof LeagueRules] === null) as RuleLimit[]

export function hasLeagueRules(rules: LeagueRules): boolean {
  return rules.uniquePlayers || rules.uniqueJerseys || LIMITS.some((key) => rules[key] !== null)
}

// Rules read from a file or from stored work, with anything unusable dropped.
export function cleanLeagueRules(value: unknown, teamCount: number): LeagueRules {
  const from = (value ?? {}) as Partial<Record<keyof LeagueRules, unknown>>
  const rules: LeagueRules = { ...NO_LEAGUE_RULES }
  for (const key of LIMITS) {
    const limit = from[key]
    rules[key] = typeof limit === 'number' && Number.isFinite(limit) && limit >= 0 ? limit : null
  }
  rules.uniquePlayers = from.uniquePlayers === true
  rules.uniqueJerseys = from.uniqueJerseys === true
  rules.exempt = Array.isArray(from.exempt)
    ? [...new Set(from.exempt.filter((team): team is number => Number.isInteger(team) && team >= 0 && team < teamCount))].sort((a, b) => a - b)
    : []
  return rules
}

const count = (n: number, noun: string) => `${n} ${n === 1 ? noun : noun === 'defenceman' ? 'defencemen' : `${noun}s`}`
const one = (value: number) => value.toFixed(1)
const number = (jersey: number) => jersey.toString(16).padStart(2, '0')

// Where the project breaks the league's rules. Empty when there are no rules.
export function checkLeagueRules(project: RomProject): Finding[] {
  const rules = project.leagueRules
  if (!hasLeagueRules(rules)) return []
  const labels = teamLabels(project.teams, project.game)
  const applies = (team: number) => !rules.exempt.includes(team)
  const findings: Finding[] = []
  const add = (team: number, message: string) => findings.push({ level: 'rule', where: labels[team], team, message })
  // A count against its two limits, said the way the rule was set.
  const range = (team: number, have: number, min: number | null, max: number | null, noun: string) => {
    if (min !== null && have < min) add(team, `Has ${count(have, noun)}; the league's rules ask for at least ${min}.`)
    if (max !== null && have > max) add(team, `Has ${count(have, noun)}; the league's rules allow at most ${max}.`)
  }

  const everyone = leaguePlayers(project)
  const summaries = teamSummaries(project)
  project.teams.forEach((team, t) => {
    if (!applies(t)) return
    const roster = everyone.filter((p) => p.team === t)
    range(t, team.players.length, rules.minPlayers, rules.maxPlayers, 'player')
    range(t, goalieCount(team), rules.minGoalies, rules.maxGoalies, 'goalie')
    range(t, roster.filter((p) => p.role === 'F').length, rules.minForwards, rules.maxForwards, 'forward')
    range(t, roster.filter((p) => p.role === 'D').length, rules.minDefence, rules.maxDefence, 'defenceman')

    if (rules.maxPlayerOverall !== null) {
      for (const p of roster) {
        if (p.overall > rules.maxPlayerOverall) add(t, `${p.player.name} is rated ${p.overall} overall; the league's rules allow at most ${rules.maxPlayerOverall}.`)
      }
    }
    const { startingSkaters, skaters } = summaries[t]
    if (rules.maxFirstLine !== null && startingSkaters !== null && startingSkaters > rules.maxFirstLine) {
      add(t, `The first line averages ${one(startingSkaters)} overall; the league's rules allow at most ${rules.maxFirstLine}.`)
    }
    if (rules.maxSkaterAverage !== null && skaters !== null && skaters > rules.maxSkaterAverage) {
      add(t, `The skaters average ${one(skaters)} overall; the league's rules allow at most ${rules.maxSkaterAverage}.`)
    }
    const total = roster.reduce((sum, p) => sum + p.overall, 0)
    if (rules.maxTotalOverall !== null && total > rules.maxTotalOverall) {
      add(t, `The overall ratings add up to ${total}; the league's rules allow at most ${rules.maxTotalOverall}.`)
    }

    if (rules.uniqueJerseys) {
      const worn = new Map<number, string[]>()
      for (const p of roster) worn.set(p.player.jersey, [...(worn.get(p.player.jersey) ?? []), p.player.name])
      for (const [jersey, names] of worn) {
        if (names.length > 1) add(t, `${names.join(' and ')} both wear number ${number(jersey)}.`)
      }
    }
  })

  if (rules.uniquePlayers) {
    // Told apart by name, with the spacing and capitals a typist might vary ignored.
    const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()
    const teamsOf = new Map<string, { name: string; teams: number[] }>()
    for (const p of everyone) {
      if (!applies(p.team)) continue
      const entry = teamsOf.get(key(p.player.name)) ?? { name: p.player.name, teams: [] }
      entry.teams.push(p.team)
      teamsOf.set(key(p.player.name), entry)
    }
    for (const { name, teams } of teamsOf.values()) {
      const distinct = [...new Set(teams)]
      if (distinct.length > 1) {
        findings.push({
          level: 'rule',
          where: labels[distinct[0]],
          team: distinct[0],
          message: `${name} is on ${distinct.length} teams: ${distinct.map((t) => labels[t]).join(', ')}.`,
        })
      } else if (teams.length > 1) {
        add(distinct[0], `${name} is on the roster ${teams.length} times.`)
      }
    }
    for (const agent of project.freeAgents) {
      const taken = teamsOf.get(key(agent.player.name))
      if (taken) {
        findings.push({
          level: 'rule',
          where: 'Free agents',
          message: `${agent.player.name} is a free agent and also on ${labels[taken.teams[0]]}.`,
        })
      }
    }
  }
  return findings
}
