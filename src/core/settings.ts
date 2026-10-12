import { readAscii, readU16, readU32, writeAscii, writeU16 } from './bytes'
import type { GameConfig } from './games'

// Game-wide data outside the team blocks: playoff draws, on-screen rule
// messages, clock lengths and the main menu's starting choices. Unlike names
// in the rosters, the text here sits in fixed-size slots padded with spaces.

const PLAYOFF_SLOTS = 16
const PERIOD_LENGTHS = 4
export const MAX_SECONDS = 5999

export interface FixedText {
  text: string
  maxLength: number
}

export interface Rule extends FixedText {
  offset: number
  // How long the message stays on screen.
  delay: number
  penaltyMinutes: number
}

export interface PeriodLength extends FixedText {
  seconds: number
}

export interface MenuItem {
  caption: string
  // The choices on offer; null when the choices are the teams or the period lengths.
  options: string[] | null
  value: number
}

export interface Settings {
  // Each draw lists 16 team numbers in seeding order.
  playoffDraws: number[][]
  rules: Rule[]
  // The first three are the main menu's choices; the game's code uses the fourth.
  periodLengths: PeriodLength[]
  overtimeSeconds: number
  shootoutSeconds: number
  menu: MenuItem[]
}

function readFixedText(rom: Uint8Array, o: number): FixedText {
  const maxLength = readU16(rom, o) - 2
  const text = readAscii(rom, o + 2, maxLength).replace(/\0/g, ' ').trimEnd()
  return { text, maxLength }
}

// Writes only when the text differs, so padding the game already has is kept.
function writeFixedText(rom: Uint8Array, o: number, value: FixedText): void {
  if (readFixedText(rom, o).text === value.text) return
  writeAscii(rom, o + 2, value.text.slice(0, value.maxLength).padEnd(value.maxLength, ' '))
}

function parseRules(rom: Uint8Array, game: GameConfig): Rule[] {
  const offsets = new Set<number>()
  for (let i = 1; i <= game.ruleCount; i++) offsets.add(game.rulesOffset + readU16(rom, game.rulesOffset + i * 2))
  return [...offsets]
    .sort((a, b) => a - b)
    .map((offset) => ({ offset, delay: rom[offset], penaltyMinutes: rom[offset + 1], ...readFixedText(rom, offset + 2) }))
    .filter((rule) => rule.maxLength > 0)
}

function menuAddresses(rom: Uint8Array, game: GameConfig) {
  return {
    defaults: readU32(rom, game.menuDefaultsPointerOffset),
    captions: readU32(rom, game.menuCaptionsPointerOffset),
    options: readU32(rom, game.menuOptionsPointerOffset),
  }
}

function parseMenu(rom: Uint8Array, game: GameConfig): MenuItem[] {
  const at = menuAddresses(rom, game)
  const starts: number[] = []
  for (let i = 0; i < game.menuItemCount; i++) starts.push(at.options + readU16(rom, at.options + i * 2))

  // Every choice is the same size, so the list ends where that stops being true.
  const optionSize = readU16(rom, Math.min(...starts))
  let end = Math.max(...starts)
  while (readU16(rom, end) === optionSize) end += optionSize

  const items: MenuItem[] = []
  let caption = at.captions
  for (let i = 0; i < game.menuItemCount; i++) {
    let options: string[] | null = null
    if (!game.menuTeamItems.includes(i) && i !== game.menuPeriodLengthItem) {
      const stop = Math.min(end, ...starts.filter((s) => s > starts[i]))
      options = []
      for (let o = starts[i]; o < stop; o += optionSize) options.push(readFixedText(rom, o).text)
    }
    items.push({
      caption: readFixedText(rom, caption).text,
      options,
      value: readU16(rom, at.defaults + i * 2),
    })
    caption += readU16(rom, caption)
  }
  return items
}

export function parseSettings(rom: Uint8Array, game: GameConfig): Settings {
  const playoffs = readU32(rom, game.playoffDrawPointerOffsets[0])
  const playoffDraws: number[][] = []
  for (let i = 0; i < game.playoffDrawCount; i++) {
    const o = playoffs + i * PLAYOFF_SLOTS
    playoffDraws.push(Array.from(rom.subarray(o, o + PLAYOFF_SLOTS)))
  }

  const periodLengths: PeriodLength[] = []
  let label = game.periodLengthTextOffset
  for (let i = 0; i < PERIOD_LENGTHS; i++) {
    periodLengths.push({
      seconds: readU16(rom, game.periodLengthSecondsOffset + i * 2),
      ...readFixedText(rom, label),
    })
    label += readU16(rom, label)
  }

  return {
    playoffDraws,
    rules: parseRules(rom, game),
    periodLengths,
    overtimeSeconds: readU16(rom, game.overtimeSecondsOffset),
    shootoutSeconds: readU16(rom, game.shootoutSecondsOffset),
    menu: parseMenu(rom, game),
  }
}

export function writeSettings(rom: Uint8Array, game: GameConfig, settings: Settings): void {
  const playoffs = readU32(rom, game.playoffDrawPointerOffsets[0])
  settings.playoffDraws.forEach((draw, i) => rom.set(draw, playoffs + i * PLAYOFF_SLOTS))

  for (const rule of settings.rules) {
    rom[rule.offset] = rule.delay
    rom[rule.offset + 1] = rule.penaltyMinutes
    writeFixedText(rom, rule.offset + 2, rule)
  }

  let label = game.periodLengthTextOffset
  settings.periodLengths.forEach((period, i) => {
    writeU16(rom, game.periodLengthSecondsOffset + i * 2, period.seconds)
    writeFixedText(rom, label, period)
    label += readU16(rom, label)
  })
  writeU16(rom, game.overtimeSecondsOffset, settings.overtimeSeconds)
  writeU16(rom, game.shootoutSecondsOffset, settings.shootoutSeconds)

  const defaults = menuAddresses(rom, game).defaults
  settings.menu.forEach((item, i) => writeU16(rom, defaults + i * 2, item.value))
}

// The choices to show for a menu item, taking edited period lengths into account.
export function menuOptions(settings: Settings, game: GameConfig, index: number, teamNames: string[]): string[] {
  if (game.menuTeamItems.includes(index)) return teamNames
  if (index === game.menuPeriodLengthItem) return settings.periodLengths.map((period) => period.text)
  return settings.menu[index].options ?? []
}
