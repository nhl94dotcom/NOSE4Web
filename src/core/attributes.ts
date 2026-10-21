// What each stored attribute value (0-15) means in the game, ported from
// NOSE's ini\hextext.ini. Values the game does not expect have no text.

// 'value' is for hacks that use all sixteen values for something the editor
// has no wording for: it is shown and edited as the number stored.
// A weight can name the weight its lowest value stands for, as 'weight:144',
// for ROMs set up for another era; plain 'weight' is the original game's 140.
// 'snesRating' is a 0 to 6 rating in the SNES game, whose screens show its
// top steps a little higher than the Genesis game's do.
export type AttributeKind = 'weight' | `weight:${number}` | 'rating' | 'snesRating' | 'handedFighting' | 'gloveHand' | 'zero' | 'value'

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

export function attributeText(kind: AttributeKind, value: number): string | null {
  if (isWeight(kind)) {
    const base = kind === 'weight' ? ORIGINAL_BASE_WEIGHT : Number(kind.slice('weight:'.length))
    return `${base + value * WEIGHT_STEP}`
  }
  switch (kind) {
    case 'rating':
      return RATINGS[value] ?? null
    case 'snesRating':
      return SNES_RATINGS[value] ?? null
    case 'handedFighting':
      return `${value % 2 ? 'R' : 'L'}/${FIGHTING[value >> 1]}`
    case 'gloveHand':
      return value < 2 ? (value ? 'R' : 'L') : null
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
    zero: 'not used by the game',
    value: 'the value stored, 0 to 15',
  }
  return notes[kind] ?? ''
}
