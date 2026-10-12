import { attributeText, type AttributeKind } from './attributes'
import type { Team } from './team'

// NOSE's quick edit keys: with players selected, each key along the top row of
// the keyboard raises one attribute by a step, or lowers it with Shift held.
// The keys are identified by position, so they work on any keyboard layout.

const ATTRIBUTE_KEYS = [
  'Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
  'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace',
]
// Shown beside each attribute so the keys can be learned.
export const QUICK_EDIT_KEY_LABELS = ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace']
export const QUICK_EDIT_JERSEY_LABEL = 'numpad + and -'

function stepJersey(jersey: number, step: number): number {
  const digits = [jersey >> 4, jersey & 0x0f]
  const number = digits.every((d) => d <= 9) ? digits[0] * 10 + digits[1] : 0
  const next = (number + step + 100) % 100
  return (Math.floor(next / 10) << 4) | next % 10
}

// Applies a key to the players at `indexes`. Returns null if the key is not a
// quick edit key. `kindsFor` gives a player's attribute kinds when steps
// should stop at the values the game expects, or null to allow all of 0-15.
export function quickEdit(
  team: Team,
  indexes: number[],
  keyCode: string,
  shift: boolean,
  kindsFor: (index: number) => AttributeKind[] | null,
): Team | null {
  const jerseyStep = keyCode === 'NumpadAdd' ? 1 : keyCode === 'NumpadSubtract' ? -1 : 0
  const attribute = keyCode === 'Backslash' ? 13 : ATTRIBUTE_KEYS.indexOf(keyCode)
  if (jerseyStep === 0 && attribute < 0) return null

  const players = team.players.slice()
  for (const index of indexes) {
    const player = players[index]
    if (jerseyStep !== 0) {
      players[index] = { ...player, jersey: stepJersey(player.jersey, jerseyStep) }
      continue
    }
    const value = player.attributes[attribute] + (shift ? -1 : 1)
    const kinds = kindsFor(index)
    if (value < 0 || value > 15 || (kinds && attributeText(kinds[attribute], value) === null)) continue
    players[index] = { ...player, attributes: player.attributes.map((v, i) => (i === attribute ? value : v)) }
  }
  return { ...team, players }
}
