// Made-up attributes for a player: an archetype (a sniper, a grinder, a stay-at-home defenceman...) at a level (a
// superstar to a weak depth player), or random ones at that level. For filling a roster or making rookies; the
// player keeps his name, number and, unless random, his shooting or glove hand.
//
// Each attribute is worked out as a share of its range (0 the lowest, 1 the highest): the level's share, moved up
// or down by the archetype, give or take a little so that two players of a kind are not the same. It is then put
// in the ROM's own terms, so the same choice suits NHL 94 (0 to 6 ratings, or 0 to 15 with wide ratings), the SNES
// and NHL '95 (stick handling in 16 steps). What each rating does in play is in ratinguse.ts; it is why snipers
// get a high Rgh (shoot rather than pass) and playmakers a low one.
import { isHandedFighting, isRating, isWeight, weightBase, type AttributeKind } from './attributes'
import type { GameConfig } from './games'

export interface Level {
  value: string
  label: string
  // The share of each range a skater, and a goalie, of this level has.
  share: number
  goalieShare: number
}

// Set against the original NHL 94's players, whose overall ratings run (skaters, then goalies) about 40 and 40 for
// the weakest twentieth, 55 and 50 in the middle, 85 and 94 for the best twentieth, and 100 and 98 at most. An
// all-round player comes out at about 95, 85, 72, 60, 50 and 42 overall; a goalie at about 95, 85, 72, 58, 48, 40.
export const LEVELS: Level[] = [
  { value: 'superstar', label: 'Superstar', share: 0.78, goalieShare: 0.92 },
  { value: 'star', label: 'Star', share: 0.71, goalieShare: 0.82 },
  { value: 'good', label: 'Good', share: 0.61, goalieShare: 0.7 },
  { value: 'average', label: 'Average', share: 0.51, goalieShare: 0.56 },
  { value: 'depth', label: 'Depth', share: 0.41, goalieShare: 0.45 },
  { value: 'weak', label: 'Weak', share: 0.31, goalieShare: 0.33 },
]

// A level anywhere from Weak to Superstar, for a player made wholly at random.
export const RANDOM_LEVEL = 'random'
export function randomLevel(random: () => number = Math.random): Level {
  const [top, bottom] = [LEVELS[0], LEVELS[LEVELS.length - 1]]
  const at = random()
  return {
    value: RANDOM_LEVEL,
    label: 'Random',
    share: bottom.share + at * (top.share - bottom.share),
    goalieShare: bottom.goalieShare + at * (top.goalieShare - bottom.goalieShare),
  }
}

// How often he takes penalties (Agr), as a share of its range. Kept to the lower half: the original game wraps
// Aggression round above that (ratinguse.ts), so a high value would not mean more penalties there.
const DISCIPLINE = { low: 0.17, mid: 0.33, high: 0.5 }

export interface Archetype {
  value: string
  label: string
  // What the archetype adds to the level's share, by column label.
  more: Record<string, number>
  pounds: number
  // Fighting, 0 to 7 (0 to 100 on the editor's scale): how long the men he injures are out, on the Genesis.
  fighting: number
  discipline: keyof typeof DISCIPLINE
}

export const SKATER_ARCHETYPES: Archetype[] = [
  { value: 'balanced', label: 'All-round', more: {}, pounds: 190, fighting: 2, discipline: 'mid' },
  {
    value: 'sniper',
    label: 'Sniper',
    more: { ShA: 0.25, ShP: 0.15, OfA: 0.1, Spd: 0.05, StH: 0.05, Rgh: 0.3, Pas: -0.05, DfA: -0.15, Chk: -0.2 },
    pounds: 185,
    fighting: 1,
    discipline: 'low',
  },
  {
    value: 'playmaker',
    label: 'Playmaker',
    more: { Pas: 0.25, StH: 0.2, OfA: 0.15, Agl: 0.1, ShP: -0.1, DfA: -0.05, Chk: -0.2, Rgh: -0.3 },
    pounds: 180,
    fighting: 1,
    discipline: 'low',
  },
  {
    value: 'speedster',
    label: 'Speedster',
    more: { Spd: 0.3, Agl: 0.25, StH: 0.05, End: 0.1, ShP: -0.1, Chk: -0.2 },
    pounds: 172,
    fighting: 1,
    discipline: 'low',
  },
  {
    value: 'power',
    label: 'Power forward',
    more: { ShP: 0.2, Chk: 0.2, ShA: 0.05, OfA: 0.05, Rgh: 0.1, Spd: -0.05, Agl: -0.05 },
    pounds: 215,
    fighting: 4,
    discipline: 'mid',
  },
  {
    value: 'twoway',
    label: 'Two-way forward',
    more: { DfA: 0.15, End: 0.15, OfA: 0.05, Chk: 0.05, ShA: -0.05 },
    pounds: 192,
    fighting: 2,
    discipline: 'low',
  },
  {
    value: 'grinder',
    label: 'Grinder',
    more: { Chk: 0.25, DfA: 0.15, End: 0.15, ShP: -0.05, Pas: -0.1, OfA: -0.15, StH: -0.15, ShA: -0.2 },
    pounds: 200,
    fighting: 4,
    discipline: 'high',
  },
  {
    value: 'enforcer',
    label: 'Enforcer',
    more: { Chk: 0.2, ShP: 0.05, DfA: -0.1, Spd: -0.15, Agl: -0.15, Pas: -0.25, OfA: -0.3, ShA: -0.3, StH: -0.3 },
    pounds: 225,
    fighting: 7,
    discipline: 'high',
  },
  {
    value: 'offensiveD',
    label: 'Offensive defenceman',
    more: { ShP: 0.25, Pas: 0.15, OfA: 0.15, StH: 0.1, ShA: 0.05, DfA: -0.05, Chk: -0.1 },
    pounds: 195,
    fighting: 2,
    discipline: 'mid',
  },
  {
    value: 'defensiveD',
    label: 'Stay-at-home defenceman',
    more: { DfA: 0.25, Chk: 0.2, ShP: -0.05, Pas: -0.05, StH: -0.1, OfA: -0.2, ShA: -0.2 },
    pounds: 210,
    fighting: 4,
    discipline: 'mid',
  },
]

export const GOALIE_ARCHETYPES: Archetype[] = [
  { value: 'balanced', label: 'All-round', more: {}, pounds: 182, fighting: 0, discipline: 'low' },
  { value: 'quick', label: 'Quick', more: { Agl: 0.2, Spd: 0.1, PkC: -0.05, DfA: -0.1 }, pounds: 172, fighting: 0, discipline: 'low' },
  { value: 'positional', label: 'Positional', more: { DfA: 0.25, PkC: 0.05, Agl: -0.1 }, pounds: 190, fighting: 0, discipline: 'low' },
  { value: 'rebounds', label: 'Rebound control', more: { PkC: 0.25, Agl: -0.05 }, pounds: 185, fighting: 0, discipline: 'low' },
]

// No use for goalies has been found for Offensive Awareness, so it is set a little below the level.
const GOALIE_LOWER: Record<string, number> = { OfA: -0.2 }

export type Make = { archetype: Archetype } | { random: true }

const clamp = (share: number) => Math.max(0, Math.min(1, share))
const steps = (share: number, top: number) => Math.round(clamp(share) * top)

// Fighting 0 to 7 and a shooting hand, as a handed/fighting value of that kind.
export function handedFighting(kind: AttributeKind, fighting: number, right: boolean): number {
  const odd = kind === 'handedFighting93' ? !right : right
  return fighting * 2 + (odd ? 1 : 0)
}

// The attributes for one player. `current` is his attributes now, whose hand (and anything the editor does not know
// the meaning of) is kept; `random` gives a number from 0 to 1, as Math.random does.
export function madeAttributes(
  game: Pick<GameConfig, 'playerAttributeKinds' | 'goalieAttributeKinds' | 'playerAttributeLabels' | 'goalieAttributeLabels'>,
  isGoalie: boolean,
  current: number[],
  make: Make,
  level: Level,
  random: () => number = Math.random,
): number[] {
  const kinds = isGoalie ? game.goalieAttributeKinds : game.playerAttributeKinds
  const labels = isGoalie ? game.goalieAttributeLabels : game.playerAttributeLabels
  const archetype = 'archetype' in make ? make.archetype : null
  // Give or take: a little for an archetype, a lot for random.
  const spread = archetype ? 0.12 : 0.5
  const near = (share: number) => share + (random() - 0.5) * spread
  const pick = <T,>(list: T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
  const pounds = archetype ? archetype.pounds + Math.round((random() - 0.5) * 12) : 165 + Math.floor(random() * 61)
  const fighting = archetype ? archetype.fighting : pick([0, 0, 1, 1, 2, 2, 3, 4, 5])
  const discipline = DISCIPLINE[archetype ? archetype.discipline : pick(['low', 'mid', 'high'] as const)]

  return kinds.map((kind, i) => {
    const label = labels[i]
    const now = current[i] ?? 0
    if (isWeight(kind) || (label === 'Wgt' && kind === 'value')) {
      const base = weightBase(kind) ?? 140
      return Math.max(0, Math.min(15, Math.round((pounds - base) / 8)))
    }
    if (isHandedFighting(kind)) {
      const right = archetype ? (kind === 'handedFighting93' ? now % 2 === 0 : now % 2 === 1) : random() < 0.5
      return handedFighting(kind, fighting, right)
    }
    if (kind === 'gloveHand') return archetype ? now : random() < 0.5 ? 0 : 1
    if (kind === 'zero') return 0
    // A value whose meaning the editor does not know (in NHL 94 EVO, say) is left as it is.
    if (kind === 'value' && (label === 'H/F' || label === 'GlH' || /^G\d+$/.test(label))) return now
    // Aggression goes by the archetype (or at random), not the level, and stays in the lower half.
    const share =
      label === 'Agr'
        ? Math.min(DISCIPLINE.high, discipline + (random() - 0.5) * 0.12)
        : near((isGoalie ? level.goalieShare : level.share) + (archetype?.more[label] ?? 0) + (isGoalie ? (GOALIE_LOWER[label] ?? 0) : 0))
    if (isRating(kind)) return steps(share, 6)
    if (kind === 'value' || kind === 'stickHandling95') return steps(share, 15)
    return now
  })
}
