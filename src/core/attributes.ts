// What each stored attribute value (0-15) means in the game, ported from
// NOSE's ini\hextext.ini. Values the game does not expect have no text.

export type AttributeKind = 'weight' | 'rating' | 'handedFighting' | 'gloveHand' | 'zero'

const RATINGS = ['25-29', '29-38', '38-47', '47-62', '63-80', '81-98', '99']
const FIGHTING = [0, 14, 28, 42, 57, 71, 85, 100]

export function attributeText(kind: AttributeKind, value: number): string | null {
  switch (kind) {
    case 'weight':
      return `${140 + value * 8}`
    case 'rating':
      return RATINGS[value] ?? null
    case 'handedFighting':
      return `${value % 2 ? 'R' : 'L'}/${FIGHTING[value >> 1]}`
    case 'gloveHand':
      return value < 2 ? (value ? 'R' : 'L') : null
    case 'zero':
      return value === 0 ? '0' : null
  }
}

// A note on how to read a kind of value, where its name alone is not enough.
export const ATTRIBUTE_NOTES: Record<AttributeKind, string> = {
  weight: 'pounds',
  rating: '',
  handedFighting: 'shooting hand, then fighting ability',
  gloveHand: 'left or right',
  zero: 'not used by the game',
}
