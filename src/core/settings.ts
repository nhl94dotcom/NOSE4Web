import { readAscii, readU16, readU32, writeAscii, writeU16 } from './bytes'
import { parseCredits, writeCredits, type Credits } from './credits'
import type { GameConfig } from './games'
import { parseMenuTeams, writeMenuTeams, type MenuTeams } from './menuteams'

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
  // How many of the teams the menu offers, where the editor finds that.
  menuTeams: MenuTeams | null
  // When a computer team pulls its goalie, where the editor finds it (SNES).
  cpuPullGoalie?: CpuPullGoalie | null
  // The credits on the title screen, where the editor finds them (credits.ts, snescredits.ts).
  credits?: Credits | null
}

// A computer team pulls its goalie in the third period when it is behind by
// at least one goal and fewer than `goalsUnder`, with fewer than `secondsUnder`
// left: the game's own two numbers (3 and 61 in the original SNES game).
export interface CpuPullGoalie {
  goalsUnder: number
  secondsUnder: number
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

// The main menu's tables. A rebuilt menu (McMarkis's menu patch, as chaos's
// fighting patch has it) moves the captions, keeping the pointer, and puts
// the choices' movea.l #SubMenuItems,a0 in a routine of its own, called by a
// jsr where it was, before its rts.
const OP_JSR = 0x4eb9
const OP_MOVEA_A0 = 0x207c
const OP_RTS = 0x4e75
function optionsTable(rom: Uint8Array, game: GameConfig): number {
  const at = game.menuOptionsPointerOffset
  if (readU16(rom, at - 6) === OP_JSR) {
    const routine = readU32(rom, at - 4)
    for (let o = routine; o < routine + 0x40 && o + 8 <= rom.length; o += 2) {
      if (readU16(rom, o) === OP_MOVEA_A0 && readU16(rom, o + 6) === OP_RTS) return readU32(rom, o + 2)
    }
  }
  return readU32(rom, at)
}

function menuAddresses(rom: Uint8Array, game: GameConfig) {
  return {
    defaults: readU32(rom, game.menuDefaultsPointerOffset),
    captions: readU32(rom, game.menuCaptionsPointerOffset),
    options: optionsTable(rom, game),
  }
}

// Where each period length's text is. ChangeOption compares against the
// menu's (cmpa.l #PeriodLengths,a0 at $F7BB8), which in the original game is
// the editor's own place for them, and which a rebuilt menu moves to a copy of
// the first three; the fourth, which the menu never shows, stays where it was.
const PERIOD_CMPA = 0xf7bb8
const OP_CMPA_A0 = 0xb1fc
function periodLabels(rom: Uint8Array, game: GameConfig): number[] {
  const labels: number[] = []
  let label = game.periodLengthTextOffset
  for (let i = 0; i < PERIOD_LENGTHS; i++) {
    labels.push(label)
    label += readU16(rom, label)
  }
  if (rom.length >= PERIOD_CMPA + 6 && readU16(rom, PERIOD_CMPA) === OP_CMPA_A0) {
    const moved = readU32(rom, PERIOD_CMPA + 2)
    if (moved !== labels[0] && moved + 0x60 <= rom.length) {
      let at = moved
      for (let i = 0; i < PERIOD_LENGTHS - 1; i++) {
        labels[i] = at
        at += readU16(rom, at)
      }
    }
  }
  return labels
}

function parseMenu(rom: Uint8Array, game: GameConfig): MenuItem[] {
  const at = menuAddresses(rom, game)
  const starts: number[] = []
  for (let i = 0; i < game.menuItemCount; i++) starts.push(at.options + readU16(rom, at.options + i * 2))
  // The table's offsets come first, so the first says how many there are: a
  // rebuilt menu has more items than the editor shows, whose choices follow.
  const count = Math.min(32, readU16(rom, at.options) / 2)
  const more: number[] = []
  for (let i = game.menuItemCount; i < count; i++) more.push(at.options + readU16(rom, at.options + i * 2))

  // Every choice is the same size, so the list ends where that stops being true.
  const optionSize = readU16(rom, Math.min(...starts))
  let end = Math.max(...starts)
  while (optionSize > 0 && end + 2 <= rom.length && readU16(rom, end) === optionSize) end += optionSize

  const items: MenuItem[] = []
  let caption = at.captions
  for (let i = 0; i < game.menuItemCount; i++) {
    let options: string[] | null = null
    if (!game.menuTeamItems.includes(i) && i !== game.menuPeriodLengthItem) {
      // The team lines have no choices of their own and point anywhere (into
      // the penalties' in a rebuilt menu), so they end no other line's.
      const ends = [...starts.filter((_, j) => !game.menuTeamItems.includes(j)), ...more]
      const stop = Math.min(end, ...ends.filter((s) => s > starts[i]))
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

// For ROMs whose settings are not where the editor can find them.
export const NO_SETTINGS: Settings = { playoffDraws: [], rules: [], periodLengths: [], overtimeSeconds: 0, shootoutSeconds: 0, menu: [], menuTeams: null }

export function parseSettings(rom: Uint8Array, game: GameConfig): Settings {
  const playoffs = readU32(rom, game.playoffDrawPointerOffsets[0])
  const playoffDraws: number[][] = []
  for (let i = 0; i < game.playoffDrawCount; i++) {
    const o = playoffs + i * PLAYOFF_SLOTS
    playoffDraws.push(Array.from(rom.subarray(o, o + PLAYOFF_SLOTS)))
  }

  const periodLengths: PeriodLength[] = periodLabels(rom, game).map((label, i) => ({
    seconds: readU16(rom, game.periodLengthSecondsOffset + i * 2),
    ...readFixedText(rom, label),
  }))

  return {
    playoffDraws,
    rules: parseRules(rom, game),
    periodLengths,
    overtimeSeconds: readU16(rom, game.overtimeSecondsOffset),
    shootoutSeconds: readU16(rom, game.shootoutSecondsOffset),
    menu: parseMenu(rom, game),
    menuTeams: parseMenuTeams(rom, game),
    credits: parseCredits(rom),
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

  const labels = periodLabels(rom, game)
  settings.periodLengths.forEach((period, i) => {
    writeU16(rom, game.periodLengthSecondsOffset + i * 2, period.seconds)
    writeFixedText(rom, labels[i], period)
  })
  writeU16(rom, game.overtimeSecondsOffset, settings.overtimeSeconds)
  writeU16(rom, game.shootoutSecondsOffset, settings.shootoutSeconds)

  const defaults = menuAddresses(rom, game).defaults
  settings.menu.forEach((item, i) => writeU16(rom, defaults + i * 2, item.value))
  writeMenuTeams(rom, game, settings.menuTeams, settings.playoffDraws)
  // Only when changed, so that credits as the ROM has them keep their bytes.
  const credits = settings.credits
  if (credits && JSON.stringify(parseCredits(rom)?.pages) !== JSON.stringify(credits.pages)) writeCredits(rom, credits)
}

// Whether the project has game settings to edit: all of them, or for the
// SNES game only the main menu's starting choices.
export function hasSettings(game: GameConfig, settings: Settings): boolean {
  return game.settingsSupported || settings.menu.length > 0
}

// The choices to show for a menu item, taking edited period lengths into account.
export function menuOptions(settings: Settings, game: GameConfig, index: number, teamNames: string[]): string[] {
  if (game.menuTeamItems.includes(index)) return teamNames
  // As many as the menu offers, where it says (the SNES game offers three of its four).
  if (index === game.menuPeriodLengthItem && settings.periodLengths.length > 0) {
    const offered = settings.menu[index]?.options?.length ?? settings.periodLengths.length
    return settings.periodLengths.slice(0, offered).map((period) => period.text)
  }
  return settings.menu[index].options ?? []
}

// When a computer team pulls its goalie, in words.
export function pullGoalieText({ goalsUnder, secondsUnder }: CpuPullGoalie): string {
  if (goalsUnder <= 1 || secondsUnder === 0) return 'never'
  const goals = goalsUnder === 2 ? '1 goal' : `1 to ${goalsUnder - 1} goals`
  return `behind by ${goals} with ${secondsUnder - 1} seconds or less left`
}
