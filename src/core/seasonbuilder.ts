// Rosters from a real NHL season: each team's players with ratings worked out from that season's stats. The stats
// come from the NHL's public stats service, fetched by scripts/fetch-seasons.mjs into public/seasons/.
//
// How a rating is worked out. Each stat is first turned into where the player stands among that season's players of
// his group (forwards, defencemen or goalies): 0 the lowest, 1 the highest. Standing within the season is what lets
// any era be rated alike: 50 goals meant more in 1998 than in 1982. A player's score for each attribute is a weighted
// sum of those standings, and the players are then given that attribute's values in the same proportions as the
// original NHL 94's players have them: the best scores get as many 6s as EA gave out, and so on down.
//
// The weights were fitted to the original NHL 94, whose ratings EA made from the 1992-93 season: given that season's
// stats, they give back EA's ratings within one step for 85 to 100 per cent of the players, depending on the
// attribute. Offensive Awareness, Shot Accuracy, Roughness (shoot or pass) and Aggression come back almost exactly;
// Checking, Speed and Agility, which no stat measures, the least well.
import { handedFighting } from './archetypes'
import { isHandedFighting, isRating, isWeight, weightBase } from './attributes'
import type { GameConfig } from './games'
import { buildLines } from './linebuilder'
import { emptyLineSlots } from './lines'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { MAX_ROSTER } from './roster'
import { teamDisplayName, teamSpace, type Player, type Team } from './team'
import { expandTeamSpace, nextExpansion } from './expand'
import { setTeamRating, TEAM_RATINGS, teamRatings } from './teamratings'

export interface SeasonSkater {
  first: string
  last: string
  // C, L, R or D.
  pos: string
  number: number | null
  shoots: string | null
  inches: number | null
  pounds: number | null
  born: number | null
  gp: number
  g: number
  a: number
  pm: number | null
  pim: number
  shots: number | null
  ppg: number | null
  shg: number | null
}

export interface SeasonGoalie {
  first: string
  last: string
  number: number | null
  catches: string | null
  inches: number | null
  pounds: number | null
  born: number | null
  gp: number
  gs: number | null
  w: number | null
  l: number | null
  t: number | null
  ga: number | null
  sa: number | null
  so: number | null
  seconds: number | null
}

export interface SeasonTeam {
  code: string
  location: string
  name: string
  franchise: number | null
  // Wins, losses, ties, overtime losses, goals for, goals against.
  record: number[]
  // Each with his games for this team only.
  skaters: SeasonSkater[]
  goalies: SeasonGoalie[]
}

export interface Season {
  // "1987-88".
  season: string
  teams: SeasonTeam[]
}

// The files keep players as arrays, in these orders (scripts/fetch-seasons.mjs).
const SKATER_FIELDS = ['first', 'last', 'pos', 'number', 'shoots', 'inches', 'pounds', 'born', 'gp', 'g', 'a', 'pm', 'pim', 'shots', 'ppg', 'shg'] as const
const GOALIE_FIELDS = ['first', 'last', 'number', 'catches', 'inches', 'pounds', 'born', 'gp', 'gs', 'w', 'l', 't', 'ga', 'sa', 'so', 'seconds'] as const

const fromArray = <T,>(fields: readonly string[], row: unknown[]): T => Object.fromEntries(fields.map((f, i) => [f, row[i] ?? null])) as T

interface SeasonFile {
  season: string
  teams: { code: string; location: string; name: string; franchise: number | null; record: number[]; skaters: unknown[][]; goalies: unknown[][] }[]
}

export function parseSeason(file: SeasonFile): Season {
  return {
    season: file.season,
    teams: file.teams.map((t) => ({
      ...t,
      skaters: t.skaters.map((row) => fromArray<SeasonSkater>(SKATER_FIELDS, row)),
      goalies: t.goalies.map((row) => fromArray<SeasonGoalie>(GOALIE_FIELDS, row)),
    })),
  }
}

// The file name of a season, from its first year: 1987 is 19871988.json.
export const seasonFile = (firstYear: number) => `${firstYear}${firstYear + 1}.json`
export const seasonLabel = (id: string) => `${id.slice(0, 4)}-${id.slice(6)}`

type Weights = { c: number; count: number[] } & { [standing: string]: number | number[] }

// Fitted to the original NHL 94 against 1992-93 (see the top of this file). Each entry: a constant, a weight for each
// standing, and how many of the original game's players have each value of the attribute (0 up).
const WEIGHTS: Record<'F' | 'D' | 'G', Record<string, Weights>> = {
  F: {
    Agl: { c: 1.38, gp: 0.5, g: 0.65, a: 0.81, shots: 0.99, shpct: -0.01, pim: -0.08, pm: 0.08, ppg: -0.08, shg: 0.27, h: -0.12, w: -0.4, age: 0.52, count: [0, 29, 100, 96, 87, 24, 2] },
    Spd: { c: 1.93, gp: 0.52, g: 0.76, a: 0.33, shots: 1.07, shpct: -0.26, pim: -0.24, pm: 0.29, ppg: -0.05, shg: 0.05, h: -0.34, w: -0.23, age: 0.12, count: [0, 18, 106, 115, 83, 12, 4] },
    OfA: { c: 0.97, gp: 0.16, g: 0.51, a: 1.87, shots: 0.74, shpct: 0.55, pm: 0.11, ppg: 0.05, shg: 0.1, h: -0.1, w: -0.09, age: -0.01, count: [4, 25, 89, 121, 78, 17, 4] },
    DfA: { c: 0.94, gp: 1.06, g: -0.06, a: 0.76, shots: 0.47, shpct: 0.21, pim: -0.01, pm: -0.03, ppg: -0.14, shg: 0.75, h: 0.26, w: -0.19, age: 0.78, count: [5, 25, 66, 165, 68, 8, 1] },
    ShP: { c: 1.22, gp: 0.32, g: 0.56, a: 0.53, shots: 0.94, shpct: 0.28, pim: -0.15, pm: -0.03, ppg: 0.16, shg: -0.18, h: -0.24, w: 0.37, age: 0.22, count: [1, 28, 141, 111, 48, 8, 1] },
    Chk: { c: 1.23, gp: 0.37, g: -0.16, a: 0.29, shots: 0.15, shpct: 0.18, pim: 0.6, pm: -0.06, ppg: -0.41, shg: 0.14, h: 0.26, w: 0.3, age: 0.95, count: [0, 41, 133, 113, 45, 6] },
    StH: { c: 1.31, gp: 0.1, g: 0.47, a: 1.26, shots: 1.0, shpct: 0.13, pim: -0.21, pm: 0.05, ppg: -0.02, h: -0.04, w: -0.13, age: 0.45, count: [0, 24, 117, 109, 67, 19, 2] },
    ShA: { c: 0.85, gp: 0.19, g: 0.69, a: 0.22, shots: -0.14, shpct: 2.96, pim: 0.03, pm: 0.01, ppg: 0.02, shg: 0.08, h: -0.01, w: 0.02, age: -0.01, count: [6, 36, 81, 121, 63, 27, 4] },
    End: { c: 0.85, gp: 1.21, g: 0.46, a: 0.78, shots: 0.76, shpct: 0.26, pim: -0.05, pm: 0.04, ppg: -0.06, shg: 0.4, h: 0.12, w: 0.02, age: 0.62, count: [3, 25, 58, 120, 108, 18, 6] },
    Rgh: { c: 4.17, gp: 0.01, g: 1.78, a: -6.32, shots: 2.94, shpct: -1.09, pim: 0.03, pm: -0.38, ppg: 0.12, shg: 0.09, h: -0.06, w: 0.09, age: -0.25, count: [41, 50, 70, 63, 55, 59] },
    Pas: { c: 1.14, gp: 0.25, g: 0.16, a: 1.47, shots: 0.64, shpct: 0.14, pim: -0.32, pm: 0.08, ppg: 0.15, shg: 0.16, h: -0.21, w: -0.02, age: 0.55, count: [0, 43, 119, 105, 57, 11, 3] },
    Agr: { c: 0.66, gp: 0.2, g: -0.12, a: -0.05, shots: 0.04, shpct: 0.12, pim: 3.47, pm: 0.04, ppg: -0.13, shg: -0.01, h: -0.12, w: 0.37, age: -0.06, count: [15, 44, 111, 95, 59, 12, 2] },
    Fgt: { c: 0.9, gp: -0.66, g: 0.07, a: -1.09, shots: -0.24, shpct: 0.16, pim: 2.35, pm: 0.12, ppg: 0.15, shg: -0.15, h: -0.2, w: 1.0, age: 0.47, count: [64, 83, 75, 73, 30, 10, 3] },
  },
  D: {
    Agl: { c: 1.78, gp: 0.67, g: 0.83, a: 0.72, shots: 0.45, shpct: -0.74, pim: -0.24, pm: 0.12, ppg: -0.09, shg: 0.14, h: 0.05, w: -0.18, age: 0.3, count: [1, 10, 71, 68, 34, 6, 3] },
    Spd: { c: 1.62, gp: 0.86, g: 0.71, a: 0.45, shots: 0.14, shpct: -0.41, pim: -0.1, pm: 0.18, ppg: 0.12, shg: 0.06, h: 0.03, w: -0.14, age: 0.07, count: [1, 10, 80, 78, 22, 2] },
    OfA: { c: 0.38, gp: 0.53, g: 0.84, a: 1.63, shots: 0.41, shpct: 0.01, pim: -0.05, pm: 0.23, ppg: 0.07, shg: -0.03, h: -0.05, w: 0.01, age: 0.05, count: [6, 39, 77, 51, 20] },
    DfA: { c: 1.32, gp: 1.71, g: 0.58, a: 0.65, shots: 0.06, shpct: -0.42, pim: 0.04, pm: 0.33, ppg: -0.01, shg: 0.05, h: 0.1, w: 0.03, age: 0.4, count: [1, 12, 34, 80, 58, 6, 2] },
    ShP: { c: 0.83, gp: 0.63, g: 1.31, a: 0.31, shots: 0.86, shpct: -0.87, pim: -0.05, pm: 0.43, ppg: 0.09, shg: 0.03, h: 0.21, w: 0.24, age: 0.32, count: [1, 31, 72, 45, 34, 7, 3] },
    Chk: { c: 1.62, gp: 0.78, g: 0.32, a: 0.02, shots: 0.15, shpct: -0.34, pim: 0.31, pm: 0.57, ppg: -0.12, shg: -0.01, h: 0.17, w: 0.15, age: 0.48, count: [1, 8, 51, 95, 35, 2, 1] },
    StH: { c: 1.54, gp: 0.7, g: 0.97, a: 0.59, shots: 0.51, shpct: -0.9, pim: -0.26, pm: 0.26, ppg: -0.12, shg: 0.25, h: 0.01, w: -0.05, age: 0.25, count: [1, 14, 82, 58, 33, 3, 2] },
    ShA: { c: -0.28, gp: 0.26, g: 1.48, a: -0.15, shots: -0.05, shpct: 1.32, pim: -0.27, pm: 0.23, ppg: -0.09, shg: -0.22, h: 0.08, w: 0.02, age: 0.2, count: [48, 86, 48, 10, 0, 1] },
    End: { c: 1.01, gp: 1.58, g: 1.0, a: 0.61, shots: 0.22, shpct: -0.47, pim: 0.18, pm: 0.31, ppg: 0.01, shg: -0.1, h: 0.42, w: -0.01, age: 0.48, count: [0, 13, 38, 66, 64, 10, 2] },
    Rgh: { c: 3.42, gp: 0.06, g: 1.52, a: -5.48, shots: 2.44, shpct: -0.94, pim: 0.26, pm: -0.47, ppg: 0.28, shg: 0.35, h: 0.07, w: 0.18, count: [15, 45, 39, 32, 36, 26] },
    Pas: { c: 1.19, gp: 1.0, g: 0.75, a: 0.9, shots: 0.38, shpct: -0.79, pim: -0.57, pm: 0.41, ppg: -0.01, shg: 0.16, h: 0.14, w: -0.12, age: 0.4, count: [2, 30, 66, 63, 28, 3, 1] },
    Agr: { c: 1.5, gp: 0.19, g: 0.16, a: -0.17, shots: -0.08, shpct: -0.11, pim: 2.58, ppg: 0.09, shg: -0.02, h: 0.01, w: 0.14, age: 0.04, count: [1, 9, 54, 78, 45, 5, 1] },
    Fgt: { c: 1.78, gp: -0.66, g: 0.13, a: -0.28, shots: -0.14, shpct: -0.19, pim: 1.45, pm: 0.2, ppg: 0.03, shg: -0.04, h: 0.3, w: 0.07, age: 0.22, count: [8, 35, 64, 63, 19, 2, 2] },
  },
  G: {
    Agl: { c: 1.31, gp: 1.43, svp: 0.43, gaa: 0.56, wp: -0.11, so: 0.27, h: 0.27, w: 0.16, age: 0.36, count: [0, 0, 21, 13, 13, 1, 2] },
    Spd: { c: 2.73, gp: 0.46, svp: 0.32, gaa: 0.25, wp: 0.05, so: 0.24, h: -0.18, w: 0.2, age: 0.08, count: [0, 0, 0, 28, 22] },
    OfA: { c: 1.65, gp: 0.47, svp: 2.61, gaa: 0.75, wp: 0.32, so: -0.15, h: -0.15, w: 0.01, age: -0.29, count: [2, 3, 7, 12, 14, 9, 3] },
    DfA: { c: 1.65, gp: 0.47, svp: 2.61, gaa: 0.75, wp: 0.32, so: -0.15, h: -0.15, w: 0.01, age: -0.29, count: [2, 3, 7, 12, 14, 9, 3] },
    PkC: { c: 1.25, gp: 1.43, svp: 0.66, gaa: 0.33, wp: -0.21, so: 0.34, h: -0.03, w: 0.47, age: 0.27, count: [0, 3, 20, 11, 13, 2, 1] },
    StR: { c: 1.09, gp: 1.1, svp: 0.25, gaa: 0.54, wp: -0.06, so: 0.45, h: 0.14, w: 0.75, age: 0.27, count: [0, 3, 22, 10, 13, 1, 1] },
    StL: { c: 1.06, gp: 1.17, svp: 0.55, gaa: 0.28, wp: -0.12, so: 0.55, h: 0.34, w: 0.43, age: 0.1, count: [0, 3, 24, 10, 11, 1, 1] },
    GvR: { c: 1.02, gp: 1.11, svp: 0.49, gaa: 0.67, wp: -0.31, so: 0.36, h: 0.15, w: 0.65, age: 0.49, count: [0, 2, 23, 12, 9, 3, 1] },
    GvL: { c: 1.27, gp: 1.22, svp: 0.67, gaa: 0.54, wp: -0.27, so: 0.29, h: 0.14, w: 0.3, age: 0.25, count: [0, 1, 23, 13, 10, 2, 1] },
  },
}

// Where each value stands among the others, from 0 to 1; equal values stand together, and a missing one in the middle.
function standing(values: (number | null)[]): number[] {
  const known = values.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] !== null && Number.isFinite(p[0]))
  const out = new Array<number>(values.length).fill(0.5)
  known.sort((a, b) => a[0] - b[0])
  for (let k = 0; k < known.length; ) {
    let end = k
    while (end + 1 < known.length && known[end + 1][0] === known[k][0]) end++
    const at = ((k + end) / 2 + 0.5) / known.length
    for (let j = k; j <= end; j++) out[known[j][1]] = at
    k = end + 1
  }
  return out
}

// Gives the players values in the proportions `count` has them: the lowest scores the lowest values.
function shareOut(scores: number[], count: number[]): number[] {
  const total = count.reduce((s, n) => s + n, 0)
  const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b])
  const out = new Array<number>(scores.length).fill(0)
  order.forEach((player, k) => {
    const at = ((k + 0.5) / order.length) * total
    let value = 0
    for (let sum = count[0]; sum < at && value < count.length - 1; ) sum += count[++value]
    out[player] = value
  })
  return out
}

function score(weights: Weights, standings: Record<string, number[]>, i: number): number {
  let total = weights.c
  for (const [key, list] of Object.entries(standings)) total += ((weights[key] as number | undefined) ?? 0) * list[i]
  return total
}

// A rate per game, drawn toward the group's average for a player with few games.
function rates(totals: (number | null)[], games: number[], priorGames = 20): (number | null)[] {
  const sum = totals.reduce<number>((s, v) => s + (v ?? 0), 0)
  const gp = games.reduce((s, v) => s + v, 0)
  if (totals.every((v) => v === null) || gp === 0) return totals.map(() => null)
  const mean = sum / gp
  return totals.map((v, i) => (v === null ? null : (v + mean * priorGames) / (games[i] + priorGames)))
}

interface Rated {
  // By attribute label (and Fgt for fighting, 0 to 7).
  values: Record<string, number>
}

// A player's whole season, over every team they played for.
const playerKey = (p: { first: string; last: string; born: number | null }) => `${p.first}|${p.last}|${p.born ?? ''}`

function sumSkaters(list: SeasonSkater[]): SeasonSkater {
  const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))
  return list.reduce((s, p) => ({
    ...s,
    gp: s.gp + p.gp,
    g: s.g + p.g,
    a: s.a + p.a,
    pim: s.pim + p.pim,
    pm: add(s.pm, p.pm),
    shots: add(s.shots, p.shots),
    ppg: add(s.ppg, p.ppg),
    shg: add(s.shg, p.shg),
  }))
}

function sumGoalies(list: SeasonGoalie[]): SeasonGoalie {
  const add = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))
  return list.reduce((s, p) => ({
    ...s,
    gp: s.gp + p.gp,
    gs: add(s.gs, p.gs),
    w: add(s.w, p.w),
    l: add(s.l, p.l),
    t: add(s.t, p.t),
    ga: add(s.ga, p.ga),
    sa: add(s.sa, p.sa),
    so: add(s.so, p.so),
    seconds: add(s.seconds, p.seconds),
  }))
}

// Games played, as a standing: any player with 70 per cent of the most games counts as a regular, so a star who
// missed some (Mario Lemieux's 60 of 84 in 1992-93) is not marked down for it.
const regular = (gp: number[]) => {
  const most = Math.max(...gp)
  return standing(gp.map((g) => Math.min(g, most * 0.7)))
}

function rateSkaters(players: SeasonSkater[], group: 'F' | 'D', year: number): Rated[] {
  const gp = players.map((p) => Math.max(1, p.gp))
  const shpct = players.map((p) => (p.shots === null ? null : (p.g + 3) / (p.shots + 30)))
  const standings: Record<string, number[]> = {
    gp: regular(gp),
    g: standing(rates(players.map((p) => p.g), gp)),
    a: standing(rates(players.map((p) => p.a), gp)),
    shots: standing(rates(players.map((p) => p.shots), gp)),
    shpct: standing(shpct),
    pim: standing(rates(players.map((p) => p.pim), gp)),
    pm: standing(rates(players.map((p) => p.pm), gp)),
    ppg: standing(rates(players.map((p) => p.ppg), gp)),
    shg: standing(rates(players.map((p) => p.shg), gp)),
    h: standing(players.map((p) => p.inches)),
    w: standing(players.map((p) => p.pounds)),
    age: standing(players.map((p) => (p.born === null ? null : year - p.born))),
  }
  return rateGroup(players.length, WEIGHTS[group], standings)
}

function rateGoalies(players: SeasonGoalie[], year: number): Rated[] {
  const gp = players.map((p) => Math.max(1, p.gp))
  const standings: Record<string, number[]> = {
    gp: regular(gp),
    svp: standing(players.map((p) => (p.sa === null || p.ga === null || p.sa === 0 ? null : (p.sa - p.ga + 0.88 * 600) / (p.sa + 600)))),
    gaa: standing(players.map((p, i) => (p.ga === null ? null : -(p.ga + 3.5 * 20) / ((p.seconds ?? gp[i] * 3600) / 3600 + 20)))),
    wp: standing(players.map((p) => (p.w === null ? null : (p.w + 4.5) / (p.w + (p.l ?? 0) + (p.t ?? 0) + 10)))),
    so: standing(players.map((p, i) => (p.so === null ? null : p.so / gp[i]))),
    h: standing(players.map((p) => p.inches)),
    w: standing(players.map((p) => p.pounds)),
    age: standing(players.map((p) => (p.born === null ? null : year - p.born))),
  }
  return rateGroup(players.length, WEIGHTS.G, standings)
}

function rateGroup(count: number, weights: Record<string, Weights>, standings: Record<string, number[]>): Rated[] {
  const rated: Rated[] = Array.from({ length: count }, () => ({ values: {} }))
  for (const [label, w] of Object.entries(weights)) {
    const values = shareOut(rated.map((_, i) => score(w, standings, i)), w.count)
    values.forEach((v, i) => (rated[i].values[label] = v))
  }
  return rated
}

// A name as the game can show it: plain letters, spaces, full stops and apostrophes (the letters the original
// game's names use), and no longer than its longest, 19 letters; a longer one gives only the first initial.
export const NAME_ROOM = 19
export function gameName(first: string, last: string): string {
  const clean = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ').replace(/[^A-Za-z .']/g, '').replace(/\s+/g, ' ').trim()
  const [f, l] = [clean(first), clean(last)]
  const full = `${f} ${l}`.trim()
  if (full.length <= NAME_ROOM) return full
  const short = `${f.charAt(0)}. ${l}`
  return short.length <= NAME_ROOM ? short : l.slice(0, NAME_ROOM).trim()
}

// A jersey number as the game keeps it: two decimal digits in one byte, so 33 is 0x33. None is 00.
const jersey = (n: number | null) => {
  const number = n !== null && n >= 0 && n <= 99 ? n : 0
  return (Math.floor(number / 10) << 4) | number % 10
}

// NHL '95's stick handling (0 to 15) for each 0 to 6 rating: the middle of the values that play folds to it.
const STICK_HANDLING_95 = [0, 1, 4, 7, 10, 13, 15]

function attributes(game: GameConfig, isGoalie: boolean, values: Record<string, number>, pounds: number | null, hand: string | null): number[] {
  return capped(game, isGoalie, uncapped(game, isGoalie, values, pounds, hand))
}

function uncapped(game: GameConfig, isGoalie: boolean, values: Record<string, number>, pounds: number | null, hand: string | null): number[] {
  const kinds = isGoalie ? game.goalieAttributeKinds : game.playerAttributeKinds
  const labels = isGoalie ? game.goalieAttributeLabels : game.playerAttributeLabels
  return kinds.map((kind, i) => {
    const label = labels[i]
    if (isWeight(kind)) {
      const lbs = pounds ?? (isGoalie ? 182 : 195)
      return Math.max(0, Math.min(15, Math.round((lbs - (weightBase(kind) ?? 140)) / 8)))
    }
    if (isHandedFighting(kind)) return handedFighting(kind, Math.min(7, values.Fgt ?? 1), hand === 'R')
    if (kind === 'gloveHand') return hand === 'R' ? 1 : 0
    const rating = values[label]
    if (rating === undefined || kind === 'zero') return 0
    if (isRating(kind)) return rating
    if (kind === 'stickHandling95') return STICK_HANDLING_95[rating]
    return 0
  })
}

// The best overall ratings in the original game: 100 for a skater (Mario Lemieux), 98 for a goalie (Ed Belfour). A
// player top in everything would come out higher, so his best attributes come down a step at a time to it. Roughness
// and Aggression are not marks of quality (the first is shooting rather than passing), so they stay.
const MOST_OVERALL = { skater: 100, goalie: 98 }
const KEEP = new Set(['Rgh', 'Agr'])
function capped(game: GameConfig, isGoalie: boolean, values: number[]): number[] {
  const kinds = isGoalie ? game.goalieAttributeKinds : game.playerAttributeKinds
  const labels = isGoalie ? game.goalieAttributeLabels : game.playerAttributeLabels
  const most = isGoalie ? MOST_OVERALL.goalie : MOST_OVERALL.skater
  const out = values.slice()
  for (let guard = 0; guard < 100 && overallRating(out, isGoalie, game) > most; guard++) {
    let at = -1
    out.forEach((v, i) => {
      if (isRating(kinds[i]) && !KEEP.has(labels[i]) && v > 0 && (at < 0 || v > out[at])) at = i
    })
    if (at < 0) break
    out[at]--
  }
  return out
}

// Whether a game's players can be rated this way: those with the original game's attributes (not NHL 94 EVO's).
export function seasonBuilderSupported(game: GameConfig): boolean {
  const needed = ['Agl', 'Spd', 'OfA', 'DfA', 'ShP', 'Chk', 'StH', 'ShA', 'End', 'Rgh', 'Pas', 'Agr']
  return !game.overallIsEstimate && needed.every((label) => game.playerAttributeLabels.includes(label))
}

export interface SeasonOptions {
  goalies: number
  forwards: number
  defence: number
  // Whether a team takes that season's location, initials and nickname too.
  names: boolean
}

// The original game's rosters: two goalies, 15 forwards and 8 defencemen for most teams.
export const DEFAULT_SEASON_OPTIONS: SeasonOptions = { goalies: 2, forwards: 15, defence: 8, names: true }

export interface BuiltPlayer {
  player: Player
  isGoalie: boolean
  forward: boolean
  // Games for this team.
  games: number
  // His season with this team, for the page to show: "70 GP, 40 G, 109 A" and the like.
  line: string
}

export interface BuiltTeam {
  team: SeasonTeam
  players: BuiltPlayer[]
}

// Each season team's roster, with its players rated against every player chosen in the league that season.
export function buildSeasonRosters(game: GameConfig, season: Season, options: SeasonOptions = DEFAULT_SEASON_OPTIONS): BuiltTeam[] {
  const year = Number(season.season.slice(0, 4))
  // Each player goes to the team they played the most games for.
  const skaterTeams = new Map<string, { team: number; gp: number; parts: SeasonSkater[] }>()
  const goalieTeams = new Map<string, { team: number; gp: number; parts: SeasonGoalie[] }>()
  season.teams.forEach((team, t) => {
    for (const p of team.skaters) {
      const k = playerKey(p)
      const was = skaterTeams.get(k)
      if (!was) skaterTeams.set(k, { team: t, gp: p.gp, parts: [p] })
      else {
        was.parts.push(p)
        if (p.gp > was.gp) Object.assign(was, { team: t, gp: p.gp })
      }
    }
    for (const p of team.goalies) {
      const k = playerKey(p)
      const was = goalieTeams.get(k)
      if (!was) goalieTeams.set(k, { team: t, gp: p.gp, parts: [p] })
      else {
        was.parts.push(p)
        if (p.gp > was.gp) Object.assign(was, { team: t, gp: p.gp })
      }
    }
  })
  // A goalie who also shows as a skater is a goalie.
  for (const k of goalieTeams.keys()) skaterTeams.delete(k)

  // Each team's choice: its goalies, forwards and defencemen with the most games for it.
  const byGames = <T extends { gp: number }>(a: T, b: T) => b.gp - a.gp
  const chosen = season.teams.map((_, t) => {
    const mine = [...skaterTeams.values()].filter((s) => s.team === t).map((s) => s.parts.find((p) => season.teams[t].skaters.includes(p))!)
    const goalies = [...goalieTeams.values()].filter((s) => s.team === t).map((s) => s.parts.find((p) => season.teams[t].goalies.includes(p))!)
    const forwards = mine.filter((p) => p.pos !== 'D').sort(byGames)
    const defence = mine.filter((p) => p.pos === 'D').sort(byGames)
    const skaterRoom = Math.min(options.forwards + options.defence, MAX_ROSTER - Math.min(options.goalies, goalies.length))
    // A team short of one kind fills its places with more of the other.
    let f = Math.min(options.forwards, forwards.length)
    let d = Math.min(options.defence, defence.length)
    f = Math.min(forwards.length, f + Math.max(0, skaterRoom - f - d))
    d = Math.min(defence.length, d + Math.max(0, skaterRoom - f - d))
    return { goalies: goalies.sort(byGames).slice(0, options.goalies), forwards: forwards.slice(0, f), defence: defence.slice(0, d) }
  })

  // Rated with their whole seasons, among all the chosen players of their kind.
  const whole = <T extends { first: string; last: string; born: number | null }, S>(p: T, map: Map<string, { parts: S[] }>, sum: (l: S[]) => S) =>
    sum(map.get(playerKey(p))!.parts)
  const ratedGroup = <T,>(lists: T[][], rate: (all: T[]) => Rated[]) => {
    const all = lists.flat()
    const rated = rate(all)
    const out = new Map<T, Rated>()
    all.forEach((p, i) => out.set(p, rated[i]))
    return out
  }
  const fRated = ratedGroup(chosen.map((c) => c.forwards), (all) => rateSkaters(all.map((p) => whole(p, skaterTeams, sumSkaters)), 'F', year))
  const dRated = ratedGroup(chosen.map((c) => c.defence), (all) => rateSkaters(all.map((p) => whole(p, skaterTeams, sumSkaters)), 'D', year))
  const gRated = ratedGroup(chosen.map((c) => c.goalies), (all) => rateGoalies(all.map((p) => whole(p, goalieTeams, sumGoalies)), year))

  const points = (p: SeasonSkater) => p.g + p.a
  return season.teams.map((team, t) => {
    const c = chosen[t]
    const skater = (p: SeasonSkater, forward: boolean, rated: Map<SeasonSkater, Rated>): BuiltPlayer => ({
      player: { name: gameName(p.first, p.last), jersey: jersey(p.number), attributes: attributes(game, false, rated.get(p)!.values, p.pounds, p.shoots) },
      isGoalie: false,
      forward,
      games: p.gp,
      line: `${p.pos}, ${p.gp} GP, ${p.g} G, ${p.a} A, ${p.pim} PIM${p.pm === null ? '' : `, ${p.pm > 0 ? '+' : ''}${p.pm}`}`,
    })
    const goalie = (p: SeasonGoalie): BuiltPlayer => ({
      player: { name: gameName(p.first, p.last), jersey: jersey(p.number), attributes: attributes(game, true, gRated.get(p)!.values, p.pounds, p.catches) },
      isGoalie: true,
      forward: false,
      games: p.gp,
      line: `G, ${p.gp} GP${p.ga !== null && p.seconds ? `, ${((p.ga * 3600) / p.seconds).toFixed(2)} GAA` : ''}${p.sa ? `, ${((p.sa - (p.ga ?? 0)) / p.sa).toFixed(3).replace(/^0/, '')} SV%` : ''}`,
    })
    return {
      team,
      players: ownNumbers([
        ...c.goalies.map(goalie),
        ...[...c.forwards].sort((a, b) => points(b) - points(a)).map((p) => skater(p, true, fRated)),
        ...[...c.defence].sort((a, b) => points(b) - points(a)).map((p) => skater(p, false, dRated)),
      ]),
    }
  })
}

// Teammates who wore the same number at different times that season: the one with more games keeps it, the other
// takes the next number no teammate has.
function ownNumbers(players: BuiltPlayer[]): BuiltPlayer[] {
  const taken = new Set<number>()
  const out = players.slice()
  for (const i of players.map((_, i) => i).sort((a, b) => players[b].games - players[a].games)) {
    let number = players[i].player.jersey
    if (number === 0) continue
    const decimal = (n: number) => (n >> 4) * 10 + (n & 0x0f)
    for (let tries = 0; taken.has(number) && tries < 99; tries++) number = jersey((decimal(number) % 99) + 1)
    taken.add(number)
    if (number !== players[i].player.jersey) out[i] = { ...players[i], player: { ...players[i].player, jersey: number } }
  }
  return out
}

// For each team in the ROM, the season team to put there, or null to keep it as it is. A team goes where the ROM has
// the same team (by full name or nickname), or failing that one of its franchise, as the Atlanta Flames are the
// Calgary Flames (`franchises`: each franchise's names over the years); the rest go to the ROM's teams left over, in
// order, but not to its All-Star teams.
export function defaultPlacement(project: RomProject, season: Season, franchises: Record<string, string[]> = {}): (number | null)[] {
  const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  const romFull = project.teams.map((t) => plain(`${t.names[0] ?? ''}${t.names[2] ?? ''}`))
  const romNick = project.teams.map((t) => plain(t.names[2] ?? ''))
  const placement: (number | null)[] = project.teams.map(() => null)
  const placed = new Set<number>()
  const put = (slot: number, s: number) => {
    placement[slot] = s
    placed.add(s)
  }
  const tries: ((slot: number, team: SeasonTeam) => boolean)[] = [
    (slot, team) => romFull[slot] === plain(team.location + team.name),
    (slot, team) => team.franchise !== null && (franchises[team.franchise] ?? []).some((name) => plain(name) === romFull[slot]),
    (slot, team) => romNick[slot] !== '' && romNick[slot] === plain(team.name),
  ]
  for (const matches of tries) {
    season.teams.forEach((team, s) => {
      if (placed.has(s)) return
      const slot = project.teams.findIndex((_, i) => placement[i] === null && matches(i, team))
      if (slot >= 0) put(slot, s)
    })
  }
  const allStar = (t: Team) => /all.?stars?/i.test(teamDisplayName(t)) || /all.?stars?/i.test(t.names.join(' '))
  season.teams.forEach((_, s) => {
    if (placed.has(s)) return
    const slot = project.teams.findIndex((t, i) => placement[i] === null && !allStar(t))
    if (slot >= 0) put(slot, s)
  })
  return placement
}

// The fewest skaters a team is cut to, to fit the ROM: four lines' worth of forwards and three pairs.
const MIN_SKATERS = 18

export interface SeasonResult {
  project: RomProject
  notes: string[]
}

// Puts the season's teams into the ROM as `placement` says, each with its roster, newly built lines and, from its
// goals for and against, the Offence and Defence ratings (the values the ROM's teams already have, shared out by
// rank). Undo takes it back as one change.
export function applySeason(project: RomProject, season: Season, placement: (number | null)[], options: SeasonOptions = DEFAULT_SEASON_OPTIONS, built = buildSeasonRosters(project.game, season, options)): SeasonResult {
  const notes: string[] = []
  const slots = placement.flatMap((s, slot) => (s === null ? [] : [slot]))
  if (slots.length === 0) throw new Error('Choose at least one team to bring in.')
  const empty = emptyLineSlots(project.teams)
  const nameLabels = project.game.teamNameLabels
  const canName = nameLabels[0] === 'Location' && nameLabels[1] === 'Initials' && nameLabels[2] === 'Name'
  const rosters = new Map(slots.map((slot) => [slot, built[placement[slot]!].players]))
  const make = (slot: number): Team => {
    const b = built[placement[slot]!]
    const players = rosters.get(slot)!
    const goalies = players.filter((p) => p.isGoalie)
    if (goalies.length === 0) throw new Error(`The ${b.team.location} ${b.team.name} have no goalie that season.`)
    const forwards = players.filter((p) => !p.isGoalie && p.forward).length
    let team: Team = {
      ...project.teams[slot],
      players: players.map((p) => p.player),
      forwards,
      defense: players.length - goalies.length - forwards,
      goalieNibbles: [0, 1, 2, 3].map((i) => (i < goalies.length ? 1 : 0)),
    }
    team = { ...team, lines: buildLines(team, project.game, team.lines.map((_, l) => l), empty).lines }
    if (options.names && canName) {
      const names = team.names.slice()
      names[0] = b.team.location
      names[1] = b.team.code
      names[2] = b.team.name
      team = { ...team, names }
    }
    return team
  }
  const teams = project.teams.slice()
  for (const slot of slots) teams[slot] = make(slot)

  // Room in the ROM: made, where the editor can make more; failing that, the skaters with the fewest games left out,
  // one at a time from the biggest rosters.
  let current = project
  let trimmed = 0
  for (;;) {
    const space = teamSpace(teams, current.layout)
    if (space.used <= space.available) break
    const grown = nextExpansion(current) ? expandTeamSpace(current) : current
    if (grown !== current) {
      current = grown
      continue
    }
    const skatersOf = (slot: number) => rosters.get(slot)!.filter((p) => !p.isGoalie)
    const slot = [...slots].sort((a, b) => skatersOf(b).length - skatersOf(a).length)[0]
    const players = rosters.get(slot)!
    const skaters = skatersOf(slot)
    if (skaters.length <= MIN_SKATERS) throw new Error('These rosters do not fit in the ROM. Choose fewer players a team.')
    const fewest = skaters.reduce((a, b) => (b.games < a.games ? b : a))
    rosters.set(slot, players.filter((p) => p !== fewest))
    teams[slot] = make(slot)
    trimmed++
  }
  if (current !== project) notes.push('The ROM was given more roster space, as the Add bytes of roster space button does.')
  if (trimmed > 0) notes.push(`To fit the ROM, ${trimmed} ${trimmed === 1 ? 'skater' : 'skaters'} with the fewest games ${trimmed === 1 ? 'was' : 'were'} left out.`)
  // Offence and Defence by goals for and against a game, from the values these ROM teams had.
  for (const [index, stat] of [
    [0, 4],
    [1, 5],
  ] as const) {
    const better = TEAM_RATINGS[index].higherIsBetter
    const values = slots.map((slot) => teamRatings(project.teams[slot])[index]).sort((a, b) => (better ? b - a : a - b))
    const perGame = (slot: number) => {
      const r = built[placement[slot]!].team.record
      const gp = r[0] + r[1] + r[2] + r[3]
      return gp > 0 ? r[stat] / gp : 0
    }
    // The most goals for is the best offence; the fewest against, the best defence.
    const ranked = [...slots].sort((a, b) => (stat === 4 ? perGame(b) - perGame(a) : perGame(a) - perGame(b)))
    ranked.forEach((slot, k) => (teams[slot] = setTeamRating(teams[slot], index, values[k])))
  }
  const left = built.flatMap((b, s) => (placement.includes(s) ? [] : [`${b.team.location} ${b.team.name}`]))
  notes.push(`${slots.length} ${slots.length === 1 ? 'team' : 'teams'} from ${season.season} brought in.`)
  if (left.length > 0) notes.push(`Not brought in: ${left.join(', ')}.`)
  if (options.names && canName) notes.push("Logos, colours and arena names are kept: change them on each team's page.")
  return { project: { ...current, teams }, notes }
}
