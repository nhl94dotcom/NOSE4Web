import { readU16LE, writeU16LE } from './bytes'
import type { FixedText, PeriodLength, Rule, Settings } from './settings'
import { findCode, loRomOffset } from './snes'
import { parseSnesMenu, refreshSnesMenu, snesChoiceTextPlaces, writeSnesMenu } from './snesmenu'

// The SNES game's settings, as the Genesis game's are edited: the clock, the
// penalty and stoppage messages, the playoff draws and the main menu's
// starting choices (snesmenu.ts). Each is found by the code that reads it.

// GetPeriodTime: lda.l Optperlen; asl; tax; lda.l GetPeriodTime_timetab,x; sta d0.
const PERIOD_TIMES = 'afc234..0aaabf(....)(..)85a5fa6b'
// ResetClock: a shootout's clock (lda #25), and overtime's in the regular season (lda #300).
const RESET_CLOCK = 'ad....f007a9(....)85a58013ad....c90300300bafbc34..d005a9(....)85a5'
const SHOOTOUT_AT = 6
const OVERTIME_AT = 27
// The penalties and stoppages: lda #bank; sta $8F; lda #Penaltylist; sta $8D; lda [$8D],y ...
const PENALTY_LIST = 'a8a9(..)00858fa9(....)858db78d18658d858da78d29'
// NewPO: a random draw of 32 (and #$1F), 16 teams each (times 16, plus playoffseats).
const PLAYOFF_DRAWS = '291f0085a5a5a51a291f0085a50a0a0a0a69(....)8589a9(..)00858ba90f00'

const PERIOD_LENGTHS = 4
const PERIOD_LINE = 3
const PLAYOFF_DRAWS_COUNT = 32
const PLAYOFF_SLOTS = 16
const MOST_RULES = 64

function readText(rom: Uint8Array, at: number): FixedText {
  const maxLength = readU16LE(rom, at) - 2
  return { text: String.fromCharCode(...rom.subarray(at + 2, at + 2 + maxLength)).replace(/\0/g, ' ').trimEnd(), maxLength }
}

// Writes only when the text differs, padded with spaces to its room.
function writeText(rom: Uint8Array, at: number, value: FixedText): void {
  if (readText(rom, at).text === value.text) return
  const text = value.text.slice(0, value.maxLength).padEnd(value.maxLength, ' ')
  for (let i = 0; i < text.length; i++) rom[at + 2 + i] = text.charCodeAt(i)
}

interface Places {
  periods: { seconds: number; texts: number[] } | null
  clock: { shootout: number; overtime: number } | null
  rules: number[]
  playoffs: number | null
}

function places(rom: Uint8Array): Places {
  const times = findCode(rom, PERIOD_TIMES)
  const texts = snesChoiceTextPlaces(rom, PERIOD_LINE, PERIOD_LENGTHS)
  const reset = findCode(rom, RESET_CLOCK)
  const list = findCode(rom, PENALTY_LIST)
  const draws = findCode(rom, PLAYOFF_DRAWS)
  const inRom = (at: number, size: number) => at >= 0 && at + size <= rom.length

  const periodSeconds = times ? loRomOffset(times.groups[1], times.groups[0]) : -1
  const periods = inRom(periodSeconds, PERIOD_LENGTHS * 2) && texts.length === PERIOD_LENGTHS ? { seconds: periodSeconds, texts } : null

  const rules: number[] = []
  if (list && list.groups[1] >= 0x8000) {
    const table = loRomOffset(list.groups[0], list.groups[1])
    const offsets = new Set<number>()
    for (let i = 1; i < MOST_RULES && inRom(table + i * 2, 2) && readU16LE(rom, table + i * 2) !== 0; i++) {
      offsets.add(table + readU16LE(rom, table + i * 2))
    }
    // Each with its text: the minutes, the delay, then the text's length word and the text.
    rules.push(...[...offsets].sort((a, b) => a - b).filter((at) => inRom(at, 4) && readU16LE(rom, at + 2) > 2 && inRom(at, 2 + readU16LE(rom, at + 2))))
  }

  const seats = draws && draws.groups[0] >= 0x8000 ? loRomOffset(draws.groups[1], draws.groups[0]) : -1
  return {
    periods,
    clock: reset ? { shootout: reset.at + SHOOTOUT_AT, overtime: reset.at + OVERTIME_AT } : null,
    rules,
    playoffs: inRom(seats, PLAYOFF_DRAWS_COUNT * PLAYOFF_SLOTS) ? seats : null,
  }
}

export function parseSnesSettings(rom: Uint8Array): Settings {
  const at = places(rom)
  const periodLengths: PeriodLength[] =
    at.periods && at.clock
      ? at.periods.texts.map((text, i) => ({ seconds: readU16LE(rom, at.periods!.seconds + i * 2), ...readText(rom, text) }))
      : []
  const rules: Rule[] = at.rules.map((offset) => ({ offset, penaltyMinutes: rom[offset], delay: rom[offset + 1], ...readText(rom, offset + 2) }))
  const playoffs = at.playoffs
  const playoffDraws =
    playoffs === null
      ? []
      : Array.from({ length: PLAYOFF_DRAWS_COUNT }, (_, d) => Array.from(rom.subarray(playoffs + d * PLAYOFF_SLOTS, playoffs + (d + 1) * PLAYOFF_SLOTS)))
  return {
    playoffDraws,
    rules,
    periodLengths,
    overtimeSeconds: periodLengths.length > 0 ? readU16LE(rom, at.clock!.overtime) : 0,
    shootoutSeconds: periodLengths.length > 0 ? readU16LE(rom, at.clock!.shootout) : 0,
    menu: parseSnesMenu(rom),
  }
}

export function writeSnesSettings(rom: Uint8Array, settings: Settings): void {
  const at = places(rom)
  if (at.periods && at.clock && settings.periodLengths.length === PERIOD_LENGTHS) {
    settings.periodLengths.forEach((period, i) => {
      writeU16LE(rom, at.periods!.seconds + i * 2, period.seconds)
      writeText(rom, at.periods!.texts[i], period)
    })
    writeU16LE(rom, at.clock.overtime, settings.overtimeSeconds)
    writeU16LE(rom, at.clock.shootout, settings.shootoutSeconds)
  }
  for (const rule of settings.rules) {
    if (!at.rules.includes(rule.offset)) continue
    rom[rule.offset] = rule.penaltyMinutes
    rom[rule.offset + 1] = rule.delay
    writeText(rom, rule.offset + 2, rule)
  }
  if (at.playoffs !== null && settings.playoffDraws.length === PLAYOFF_DRAWS_COUNT) {
    settings.playoffDraws.forEach((draw, d) => rom.set(draw.slice(0, PLAYOFF_SLOTS), at.playoffs! + d * PLAYOFF_SLOTS))
  }
  writeSnesMenu(rom, settings.menu)
}

// The settings once a hack has changed the ROM from `before` to `after`: the
// menu's choices as the ROM now offers them, and the penalty lengths and
// delays the hack changed.
export function refreshSnesSettings(before: Uint8Array, after: Uint8Array, settings: Settings): Settings {
  const fresh = (at: number, value: number) => (before[at] !== after[at] ? after[at] : value)
  return {
    ...settings,
    menu: refreshSnesMenu(after, settings.menu),
    rules: settings.rules.map((rule) => ({ ...rule, penaltyMinutes: fresh(rule.offset, rule.penaltyMinutes), delay: fresh(rule.offset + 1, rule.delay) })),
  }
}
