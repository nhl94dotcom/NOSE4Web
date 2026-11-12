// Building a team's lines from its roster, when the commissioner asks for it:
// each line's skaters picked by what that line is for, from the players'
// ratings. It is a starting point: the ratings are only a guide to how a
// player plays, and owners have their own ideas.

import type { GameConfig } from './games'
import { goalieCount, type Team } from './team'
import { LINE_SLOTS, playerRole, repeatedLineSlots } from './lines'
import { overallRating } from './rating'

// The positions on a line, as lines.ts numbers them.
const G = 0
const LD = 1
const RD = 2
const LW = 3
const C = 4
const RW = 5
const EA = 6

// What a line is for, by its label in the game's Edit Lines.
type LineKind = 'best' | 'scoring' | 'checking' | 'powerPlay' | 'penaltyKill'
const LINE_KINDS: Record<string, LineKind> = {
  NLC: 'best',
  Sc1: 'scoring',
  Sc2: 'scoring',
  Chk: 'checking',
  PP1: 'powerPlay',
  PP2: 'powerPlay',
  PK1: 'penaltyKill',
  PK2: 'penaltyKill',
}

// How much each rating counts for a kind of player, by the rating's label.
type Weights = Record<string, number>
const FORWARD_SCORING: Weights = { OfA: 2, ShP: 1.5, ShA: 1.5, StH: 1.5, Pas: 1.5, Spd: 1, Agl: 1 }
const FORWARD_CHECKING: Weights = { Chk: 2, DfA: 2, Spd: 1, Agl: 1, Agr: 1, Rgh: 0.5, Wgt: 0.5, End: 0.5 }
const FORWARD_PENALTY_KILL: Weights = { DfA: 2, Spd: 1.5, Agl: 1, Chk: 1, StH: 0.5, End: 0.5 }
const DEFENCE: Weights = { DfA: 2, Chk: 1.5, Spd: 1, Agl: 1, Wgt: 0.5, Pas: 0.5, ShP: 0.5 }
const DEFENCE_POWER_PLAY: Weights = { OfA: 1.5, ShP: 1.5, Pas: 1.5, ShA: 1, StH: 1, DfA: 0.5, Spd: 0.5 }
const DEFENCE_PENALTY_KILL: Weights = { DfA: 2, Chk: 1.5, Spd: 1, Agl: 1, Wgt: 0.5 }
// The centre of three forwards: the one who sets up the others.
const CENTRE: Weights = { Pas: 2, StH: 1.5, OfA: 1 }

// Which side of the ice a player goes to by the hand he shoots with: his
// shooting side (a left shot on the left), his off side (a left shot on the
// right, as many players like their wingers), or either.
export type HandSide = 'shooting' | 'off' | 'either'
export interface LineBuilderOptions {
  wings: HandSide
  defence: HandSide
}
export const DEFAULT_LINE_OPTIONS: LineBuilderOptions = { wings: 'shooting', defence: 'shooting' }
export const HAND_SIDES: { value: HandSide; label: string }[] = [
  { value: 'shooting', label: 'Shooting side (left shot on the left)' },
  { value: 'off', label: 'Off side (left shot on the right)' },
  { value: 'either', label: 'Either side' },
]
// For the defence, what each side does when he turns right around: a skater's
// hand decides which way he turns on a straight reversal (doplayeracc's
// noturn0: a left shot clockwise, to his right; a right shot to his left), so
// a left-shot LD and a right-shot RD turn toward the middle, whichever way the
// team attacks (Match Viewer, from the code of both systems and in play on the
// Genesis: 19 of 19 and 8 of 8).
export const DEFENCE_SIDES: { value: HandSide; label: string }[] = [
  { value: 'shooting', label: 'Shooting side: they turn toward the middle' },
  { value: 'off', label: 'Off side: they turn toward the boards' },
  { value: 'either', label: 'Either side' },
]

// Whether this ROM's players have a shooting hand the builder can read.
export function knowsHands(game: GameConfig): boolean {
  const hand = game.playerAttributeLabels.indexOf('H/F')
  return hand >= 0 && game.playerAttributeKinds[hand] === 'handedFighting'
}

export interface BuiltLines {
  lines: number[][]
  // The lines that changed.
  changed: number[]
}

// A team's lines built afresh, for the lines in `which` only (the others kept
// as they are). `empty` is the positions this ROM leaves empty on every team
// (emptyLineSlots): those stay empty.
export function buildLines(team: Team, game: GameConfig, which: number[], empty: boolean[][] = [], options: LineBuilderOptions = DEFAULT_LINE_OPTIONS): BuiltLines {
  const plan = planLines(team, game, options)
  const lines = team.lines.map((line, l) => {
    if (!which.includes(l) || !plan[l]) return line
    const next = line.slice()
    for (let slot = 0; slot < LINE_SLOTS; slot++) next[slot] = empty[l]?.[slot] ? 0 : plan[l][slot]
    return next
  })
  const changed = lines.map((_, l) => l).filter((l) => lines[l].some((v, i) => v !== team.lines[l][i]))
  return { lines, changed }
}

// The lines that look like mistakes: a position empty that the ROM does not
// leave empty, one past the end of the roster, a goalie who is not one, or a
// skater twice on one line.
export function brokenLines(team: Team, empty: boolean[][] = []): number[] {
  const count = team.players.length
  const goalies = goalieCount(team)
  return team.lines
    .map((_, l) => l)
    .filter((l) => {
      const line = team.lines[l]
      for (let slot = 0; slot < LINE_SLOTS; slot++) {
        const position = line[slot]
        if (position === 0 ? !empty[l]?.[slot] : position > count) return true
        if (slot === G && position !== 0 && position > goalies) return true
        if (slot !== G && position !== 0 && position <= goalies) return true
      }
      return repeatedLineSlots(line).length > 0
    })
}

// Every line's positions (roster positions counted from 1), by what each line
// is for; null for a line this does not know.
function planLines(team: Team, game: GameConfig, options: LineBuilderOptions): (number[] | null)[] {
  const labels = game.playerAttributeLabels
  const score = (position: number, weights: Weights) =>
    labels.reduce((sum, label, a) => sum + (weights[label] ?? 0) * team.players[position - 1].attributes[a], 0)
  const overall = (position: number, goalie: boolean) => overallRating(team.players[position - 1].attributes, goalie, game)
  const positions = team.players.map((_, i) => i + 1)
  const goalies = positions.filter((p) => playerRole(team, p) === 'goalie')
  const forwards = positions.filter((p) => playerRole(team, p) === 'forward')
  const defence = positions.filter((p) => playerRole(team, p) === 'defence')
  // Too few of a kind (a 3 on 3 ROM, a short roster): the others fill in.
  const skaters = [...forwards, ...defence]
  const byScore = (pool: number[], weights: Weights) =>
    pool.slice().sort((a, b) => score(b, weights) - score(a, weights) || a - b)
  const byOverall = (pool: number[]) => pool.slice().sort((a, b) => overall(b, false) - overall(a, false) || a - b)
  // The goalie: the one the first line has now, the starter being the owner's call; else the best rated.
  const current = team.lines[0]?.[G] ?? 0
  const goalie = goalies.includes(current) ? current : (goalies.slice().sort((a, b) => overall(b, true) - overall(a, true) || a - b)[0] ?? 0)

  // `count` players from `ranked`, first those not in `avoid`, never one in `onLine`.
  const pick = (ranked: number[], count: number, avoid: Set<number>, onLine: Set<number>, fallback: number[]) => {
    const chosen: number[] = []
    for (const pass of [ranked.filter((p) => !avoid.has(p)), ranked, fallback]) {
      for (const p of pass) {
        if (chosen.length === count) break
        if (!onLine.has(p) && !chosen.includes(p)) chosen.push(p)
      }
    }
    chosen.forEach((p) => onLine.add(p))
    return chosen
  }
  const hand = labels.indexOf('H/F')
  const shootsRight = (p: number) => knowsHands(game) && team.players[p - 1].attributes[hand] % 2 === 1
  // Two players to the left and right of a pair of positions, as `side` has it; where both shoot with the same
  // hand, or it is either side, in the order given.
  const sides = (two: number[], side: HandSide) => {
    if (two.length < 2 || side === 'either' || shootsRight(two[0]) === shootsRight(two[1])) return two
    const leftShotFirst = shootsRight(two[1])
    return leftShotFirst === (side === 'shooting') ? two : [two[1], two[0]]
  }
  // Three forwards to LW, C, RW: the best playmaker at centre, a left shot on the left wing where there is one.
  const forwardSlots = (trio: number[]) => {
    const [centre, ...wings] = trio.slice().sort((a, b) => score(b, CENTRE) - score(a, CENTRE) || trio.indexOf(a) - trio.indexOf(b))
    const ordered = sides(wings, options.wings)
    return { lw: ordered[0] ?? 0, c: centre ?? 0, rw: ordered[1] ?? 0 }
  }
  const pairSlots = (pair: number[]) => {
    const ordered = sides(pair, options.defence)
    return { ld: ordered[0] ?? 0, rd: ordered[1] ?? 0 }
  }
  const line = (pair: number[], trio: number[], extra: number) => {
    const d = pairSlots(pair)
    const f = forwardSlots(trio)
    const next = new Array<number>(LINE_SLOTS).fill(0)
    ;[next[G], next[LD], next[RD], next[LW], next[C], next[RW], next[EA]] = [goalie, d.ld, d.rd, f.lw, f.c, f.rw, extra]
    return next
  }
  // The extra attacker, who comes on for the goalie: the best scoring forward not on the line.
  const extraFor = (onLine: Set<number>) => pick(byScore(forwards, FORWARD_SCORING), 1, new Set(), onLine, skaters)[0] ?? 0

  const scorers = byScore(forwards, FORWARD_SCORING)
  const checkers = byScore(forwards, FORWARD_CHECKING)
  const killers = byScore(forwards, FORWARD_PENALTY_KILL)
  const defenders = byScore(defence, DEFENCE)
  const pointMen = byScore(defence, DEFENCE_POWER_PLAY)
  const killingD = byScore(defence, DEFENCE_PENALTY_KILL)

  // Each kind of line in turn takes players not already on another line of its kind, while there are some.
  const used: Record<LineKind, { f: Set<number>; d: Set<number> }> = {
    best: { f: new Set(), d: new Set() },
    scoring: { f: new Set(), d: new Set() },
    checking: { f: new Set(), d: new Set() },
    powerPlay: { f: new Set(), d: new Set() },
    penaltyKill: { f: new Set(), d: new Set() },
  }
  // The checking line takes forwards the scoring lines do not need, and defence after theirs.
  const scoringLines = game.lineLabels.filter((label) => LINE_KINDS[label] === 'scoring').length
  return game.lineLabels.map((label) => {
    const kind = LINE_KINDS[label]
    if (!kind) return null
    const onLine = new Set<number>()
    const take = (ranked: number[], count: number, set: Set<number>, fallback: number[]) => {
      const chosen = pick(ranked, count, set, onLine, fallback)
      chosen.forEach((p) => set.add(p))
      return chosen
    }
    if (kind === 'best') {
      const pair = take(byOverall(defence), 2, used.best.d, skaters)
      const trio = take(byOverall(forwards), 3, used.best.f, skaters)
      return line(pair, trio, extraFor(onLine))
    }
    if (kind === 'scoring') {
      const pair = take(byOverall(defence), 2, used.scoring.d, skaters)
      const trio = take(scorers, 3, used.scoring.f, skaters)
      return line(pair, trio, extraFor(onLine))
    }
    if (kind === 'checking') {
      const avoidF = new Set([...used.checking.f, ...scorers.slice(0, 3 * scoringLines)])
      const avoidD = new Set([...used.checking.d, ...used.scoring.d])
      const pair = take(defenders, 2, avoidD, skaters)
      const trio = take(checkers, 3, avoidF, skaters)
      pair.forEach((p) => used.checking.d.add(p))
      trio.forEach((p) => used.checking.f.add(p))
      return line(pair, trio, extraFor(onLine))
    }
    if (kind === 'powerPlay') {
      const pair = take(pointMen, 2, used.powerPlay.d, skaters)
      const trio = take(scorers, 3, used.powerPlay.f, skaters)
      return line(pair, trio, extraFor(onLine))
    }
    // Penalty kill: two defence and two forwards on the ice (LW and C, as Edit Lines shows them), and in RW the
    // forward who comes on when the team pulls its goalie while short-handed.
    // The power play's forwards rest where the roster has others, as the original game's lines have it.
    const pair = take(killingD, 2, used.penaltyKill.d, skaters)
    const pairOut = take(killers, 2, new Set([...used.penaltyKill.f, ...used.powerPlay.f]), skaters)
    pairOut.forEach((p) => used.penaltyKill.f.add(p))
    const [first, second] = pairOut.slice().sort((a, b) => score(b, CENTRE) - score(a, CENTRE) || a - b)
    const pulled = pick(scorers, 1, new Set(), onLine, skaters)[0] ?? 0
    const d = pairSlots(pair)
    const next = new Array<number>(LINE_SLOTS).fill(0)
    ;[next[G], next[LD], next[RD], next[LW], next[C], next[RW], next[EA]] = [goalie, d.ld, d.rd, second ?? 0, first ?? 0, pulled, extraFor(onLine)]
    return next
  })
}

