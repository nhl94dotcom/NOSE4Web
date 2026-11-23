// What each stored attribute value (0-15) means in the game, ported from
// NOSE's ini\hextext.ini. Values the game does not expect have no text.

// 'value' is for hacks that use all sixteen values for something the editor
// has no wording for: it is shown and edited as the number stored.
// A weight can name the weight its lowest value stands for, as 'weight:144',
// for ROMs set up for another era; plain 'weight' is the original game's 140.
// 'snesRating' is a 0 to 6 rating in the SNES game, whose screens show its
// top steps a little higher than the Genesis game's do.
// NHL '95 keeps two its own way (NOSE's hextext.ini, confirmed in the game by the NHL94 Match Viewer project):
// 'handedFighting93' as NHL '93, an odd value a left-handed shot; and 'stickHandling95' in sixteen steps, which
// play folds to the seven of the other ratings. Its glove hand is NHL 94's (1 catches right: Fuhr, Barrasso and
// Puppa), not the reverse that NOSE's file gives.
export type AttributeKind =
  | 'weight'
  | `weight:${number}`
  | 'rating'
  | 'snesRating'
  | 'handedFighting'
  | 'handedFighting93'
  | 'gloveHand'
  | 'stickHandling95'
  | 'zero'
  | 'value'

export const isRating = (kind: AttributeKind): boolean => kind === 'rating' || kind === 'snesRating'

const ORIGINAL_BASE_WEIGHT = 140
const WEIGHT_STEP = 8

export const isWeight = (kind: AttributeKind): boolean => kind === 'weight' || kind.startsWith('weight:')
// The weight a kind's lowest value stands for, or null if it is not a weight.
export const weightBase = (kind: AttributeKind): number | null =>
  kind === 'weight' ? ORIGINAL_BASE_WEIGHT : kind.startsWith('weight:') ? Number(kind.slice('weight:'.length)) : null

// The bases a ROM can be set up with: 102 to 152 pounds, in twos.
export const WEIGHT_BASES = Array.from({ length: 26 }, (_, i) => 102 + i * 2)

// A stored weight under one base, as the stored weight nearest the same
// pounds under another. Weights go in steps of eight pounds, so between bases
// that are not eight apart the nearest can be up to four pounds out.
export function convertWeight(value: number, fromBase: number, toBase: number): number {
  const pounds = fromBase + value * WEIGHT_STEP
  return Math.max(0, Math.min(15, Math.round((pounds - toBase) / WEIGHT_STEP)))
}

export const weightKind = (base: number): AttributeKind => (base === ORIGINAL_BASE_WEIGHT ? 'weight' : `weight:${base}`)

// The numbers the games' screens show for each step, as the NHL94 Match
// Viewer project worked them out: 18 times the step, give or take the
// rating's hot or cold value, squashed to half plus 25 below 50.
const RATINGS = ['25-29', '29-38', '38-47', '47-62', '63-80', '81-98', '99']
const SNES_RATINGS = ['25-29', '29-38', '38-47', '47-63', '63-81', '81-99', '99-100']
const FIGHTING = [0, 14, 28, 42, 57, 71, 85, 100]
// NHL '95's stick handling steps (0 to 15), folded to the 0 to 6 ratings as play folds them (its table at $83C9E;
// Match Viewer): 0 | 1-2 | 3-5 | 6-8 | 9-11 | 12-14 | 15.
const STICK_HANDLING_95_STEP = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6]
export const stickHandling95Step = (value: number): number => STICK_HANDLING_95_STEP[value] ?? 0

// Whether a player shoots right, by their handed/fighting value.
export function shootsRight(kind: AttributeKind, value: number): boolean {
  return kind === 'handedFighting93' ? value % 2 === 0 : value % 2 === 1
}
export const isHandedFighting = (kind: AttributeKind): boolean => kind === 'handedFighting' || kind === 'handedFighting93'

// How the roster tables and the Trade page show attributes: the ratings as their steps 0-6 (the default), as the
// ranges the game's screens show (25-29 to 99), or every attribute as the value stored (0-15). Weight, hands and
// fighting read the same in the first two.
export type AttributeView = 'ratings' | 'ranges' | 'stored'
export const ATTRIBUTE_VIEWS: { value: AttributeView; label: string }[] = [
  { value: 'ratings', label: 'ratings 0-6' },
  { value: 'ranges', label: "the game's ranges (25-29 to 99)" },
  { value: 'stored', label: 'stored values (0-15)' },
]

// The text for a stored value, or null where the game does not expect it. `ranges` false shows the seven-step ratings
// as their steps, 0 to 6, in place of the ranges the game's screens show.
export function attributeText(kind: AttributeKind, value: number, ranges = true): string | null {
  if (isWeight(kind)) {
    const base = kind === 'weight' ? ORIGINAL_BASE_WEIGHT : Number(kind.slice('weight:'.length))
    return `${base + value * WEIGHT_STEP}`
  }
  switch (kind) {
    case 'rating':
    case 'snesRating':
      if (!(value >= 0 && value <= 6)) return null
      return ranges ? (kind === 'rating' ? RATINGS : SNES_RATINGS)[value] : String(value)
    case 'handedFighting':
    case 'handedFighting93':
      return `${shootsRight(kind, value) ? 'R' : 'L'}/${FIGHTING[value >> 1]}`
    case 'gloveHand':
      return value < 2 ? (value ? 'R' : 'L') : null
    case 'stickHandling95':
      return value >= 0 && value <= 15 ? `${ranges ? RATINGS[stickHandling95Step(value)] : stickHandling95Step(value)} (${value})` : null
    case 'zero':
      return value === 0 ? '0' : null
    case 'value':
      return value >= 0 && value <= 15 ? String(value) : null
    default:
      return null
  }
}

// A note on how to read a kind of value, where its name alone is not enough.
export function attributeNote(kind: AttributeKind): string {
  if (isWeight(kind)) return 'pounds'
  const notes: Partial<Record<AttributeKind, string>> = {
    handedFighting: 'shooting hand, then fighting',
    gloveHand: 'left or right',
    handedFighting93: 'shooting hand, then fighting',
    stickHandling95: 'NHL 95 keeps it in 16 steps',
    zero: 'not used by the game',
    value: 'the value stored, 0 to 15',
  }
  return notes[kind] ?? ''
}

// NHL 94's 0 to 6 stick handling as NHL '95's sixteen steps: the lowest of the steps play folds to it.
const STICK_HANDLING_95_UP = [0, 1, 3, 6, 9, 12, 15]

// What changed when values went from one game's kinds of attribute to another's.
export interface AttributeConversion {
  values: number[]
  // The kinds of change made: a weight moved to another base, a shooting hand turned (the two games keep it the
  // other way round), stick handling restated between seven steps and sixteen.
  weights: boolean
  hands: boolean
  stickHandling: boolean
  // Places whose kinds differ in a way that cannot be converted: the value is kept as stored.
  unconverted: number[]
}

// A player's stored values, from attributes of kinds `from` to kinds `to`, so that they play as they did.
export function convertAttributes(values: number[], from: AttributeKind[], to: AttributeKind[]): AttributeConversion {
  const result: AttributeConversion = { values: [], weights: false, hands: false, stickHandling: false, unconverted: [] }
  values.forEach((value, i) => {
    const [a, b] = [from[i], to[i]]
    let next = value
    if (a === undefined || b === undefined || a === b) next = value
    else if (isWeight(a) && isWeight(b)) {
      next = convertWeight(value, weightBase(a)!, weightBase(b)!)
      result.weights ||= next !== value || weightBase(a) !== weightBase(b)
    } else if (isHandedFighting(a) && isHandedFighting(b)) {
      next = shootsRight(a, value) === shootsRight(b, value) ? value : value ^ 1
      result.hands = true
    } else if (isRating(a) && b === 'stickHandling95' && value <= 6) {
      next = STICK_HANDLING_95_UP[value]
      result.stickHandling = true
    } else if (a === 'stickHandling95' && isRating(b)) {
      next = stickHandling95Step(value)
      result.stickHandling = true
    } else if (isRating(a) && isRating(b)) next = value
    else result.unconverted.push(i)
    result.values.push(next)
  })
  return result
}
