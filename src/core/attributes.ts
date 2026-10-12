// What each stored attribute value (0-15) means in the game, ported from
// NOSE's ini\hextext.ini. Values the game does not expect have no text.

// 'value' is for hacks that use all sixteen values for something the editor
// has no wording for: it is shown and edited as the number stored.
// A weight can name the weight its lowest value stands for, as 'weight:144',
// for ROMs set up for another era; plain 'weight' is the original game's 140.
export type AttributeKind = 'weight' | `weight:${number}` | 'rating' | 'handedFighting' | 'gloveHand' | 'zero' | 'value'

const ORIGINAL_BASE_WEIGHT = 140
const WEIGHT_STEP = 8

export const isWeight = (kind: AttributeKind): boolean => kind === 'weight' || kind.startsWith('weight:')
export const weightKind = (base: number): AttributeKind => (base === ORIGINAL_BASE_WEIGHT ? 'weight' : `weight:${base}`)

const RATINGS = ['25-29', '29-38', '38-47', '47-62', '63-80', '81-98', '99']
const FIGHTING = [0, 14, 28, 42, 57, 71, 85, 100]

export function attributeText(kind: AttributeKind, value: number): string | null {
  if (isWeight(kind)) {
    const base = kind === 'weight' ? ORIGINAL_BASE_WEIGHT : Number(kind.slice('weight:'.length))
    return `${base + value * WEIGHT_STEP}`
  }
  switch (kind) {
    case 'rating':
      return RATINGS[value] ?? null
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
    handedFighting: 'shooting hand, then fighting ability',
    gloveHand: 'left or right',
    zero: 'not used by the game',
    value: 'the value stored, 0 to 15',
  }
  return notes[kind] ?? ''
}
