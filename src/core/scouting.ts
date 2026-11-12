import { one } from './genesisscorelogos'
import { findCodeAll, loRomOffset } from './snes'

// What Ron Barr says on the pregame matchup screen (the scouting report): one
// script of lines, each ended by $0D, that the game types out word by word.
// The game picks lines by their number, counting from the script's start, so
// a line keeps its number: the editor changes what lines say, never how many
// there are. A few characters are stand-ins the game fills in (team names,
// the goalies, the hot and cold players); the editor shows them as {labels}.
//
// Genesis (UpdateScoutingDisplay in setup94.asm): movea.l #ScoutingReportText,a1
// at $1774A; lines 0-25 empty, the script from line 26; the boxes wrap at 30
// columns. Its stand-ins are single characters, so those can't be words.
// SNES (UpdateScoutingDisplay.asm): lda #PregameText>>16 / lda #PregameText,
// $97:88DC in every build; lines 0-27 are the team places, which nothing
// reads, the script from line 28; the box wraps at 20 columns (Match Viewer:
// a 21st letter lands on the frame and stays there as the text scrolls). Its
// stand-ins are % and a letter or digit.
//
// Neither game can start a line with a stand-in: it would carry on from the
// script's start, so the rest of the line is lost (the SNES original starts
// its hot team line with a space for that). The editor puts a space before one.
//
// The script is rewritten where it is, in the room its lines take: up to the
// $0D that ends its last line (the next bytes are other data: the Genesis
// main menu picture, the SNES music). The rest of the room is filled with
// $0D, more empty lines past the last, which nothing reads. Where the code is
// the original's, the editor knows which lines the game shows, so those past
// them are room, and the lines before the script that hold text (the SNES
// team places) are emptied when more room is wanted. Where it is not (EVO's
// own matchup screen), every line is kept and the room is what is left.

export type ScoutingPlatform = 'genesis' | 'snes'

export interface ScoutingLine {
  text: string
  // What the original game shows it for; null where this ROM's code is not the original's.
  role: string | null
  // The original's empty line between paragraphs, which it shows several times: text there shows each time.
  blank?: boolean
}

// The order the original game shows its lines in, by line number (the empty line between each), and the lines it never shows.
const SHOW_ORDER: Record<ScoutingPlatform, number[]> = { genesis: [27, 26, 34, 35, 30, 31, 32, 33, 28, 29], snes: [29, 28, 30, 31, 32, 33] }

// The lines in the order to show them in the editor: the game's where its code is the original's.
export function scoutingOrder(scouting: Scouting): number[] {
  const first = FIRST_LINE[scouting.platform]
  const all = scouting.lines.map((_, i) => i)
  if (scouting.lines.some((line) => line.role === null)) return all
  const order = SHOW_ORDER[scouting.platform].map((n) => n - first).filter((i) => i < scouting.lines.length)
  return [...order, ...all.filter((i) => !order.includes(i))]
}

export interface Scouting {
  platform: ScoutingPlatform
  lines: ScoutingLine[]
  // How many letters the lines may take.
  room: number
  // How many lines fewer the script has than the original's code reads (a line taken out by hand).
  missing?: number
}

interface Stand {
  label: string
  code: string
}

// Each stand-in: the label the editor shows, and the game's code.
const GENESIS_STANDS: Stand[] = [
  { label: 'home city', code: '{' },
  { label: 'visitors city', code: '}' },
  { label: 'home nickname', code: '=' },
  { label: 'visitors nickname', code: '*' },
  { label: 'home arena', code: '^' },
  { label: 'visitors arena', code: ';' },
  { label: 'home goalie', code: '[' },
  { label: 'visitors goalie', code: ']' },
  { label: 'home hot player', code: '<' },
  { label: 'visitors hot player', code: '>' },
  { label: 'home cold player', code: '|' },
  { label: 'visitors cold player', code: '\\' },
  { label: 'hotter team', code: '$' },
  { label: 'crowd record', code: '@' },
  { label: 'home played by', code: '#' },
  { label: 'visitors played by', code: '%' },
]
// The original's other codes for the same: '_' is '{' and '+' is '}'.
const GENESIS_ALSO: Record<string, string> = { _: '{', '+': '}' }

const SNES_STANDS: Stand[] = [
  { label: 'home city', code: '%h' },
  { label: 'visitors city', code: '%v' },
  { label: 'home name', code: '%H' },
  { label: 'visitors name', code: '%V' },
  { label: 'home nickname', code: '%n' },
  { label: 'visitors nickname', code: '%m' },
  { label: 'home arena', code: '%r' },
  { label: 'hotter team has', code: '%t' },
  { label: 'extremely', code: '%e' },
  ...['home hot player', 'home cold player', 'visitors hot player', 'visitors cold player'].flatMap((who, w) =>
    [1, 2, 3].map((n) => ({ label: `${who} ${n}`, code: `%${'0123456789ab'[w * 3 + n - 1]}` })),
  ),
]

export const scoutingStands = (platform: ScoutingPlatform) => (platform === 'snes' ? SNES_STANDS : GENESIS_STANDS)

// What each stand-in shows, for the help beside the editor.
export const SCOUTING_STAND_NOTES: Record<ScoutingPlatform, Record<string, string>> = {
  genesis: {
    'home hot player': 'the next of the home team’s hot players each time it is used',
    'home cold player': 'the next of its cold players',
    'hotter team': 'the city of the team that came out hotter this game',
    'crowd record': 'the home crowd’s record noise, in dB',
    'home played by': '"(played by <name>)" for a person with a saved record playing the home team, else nothing',
  },
  snes: {
    'home name': 'the team’s place, as "Montreal" ("New York Islanders" and "New York Rangers" for the two New York teams)',
    'hotter team has': 'the hotter team’s name and "has" (or "have")',
    extremely: '"extremely " when one team is much hotter, else nothing',
  },
}

const FIRST_LINE: Record<ScoutingPlatform, number> = { genesis: 26, snes: 28 }
// Where the box wraps to a new line: longer words don't fit.
export const SCOUTING_WIDTH: Record<ScoutingPlatform, number> = { genesis: 30, snes: 20 }
const MOST_BYTES = 0x1000

// The original games' choices of lines, from their code, with what each is for.
const GENESIS_LIST = '30fc001b 30fc001d 30fc001a 30fc001d'
const GENESIS_ROLES: Record<number, string> = {
  26: 'Second: the welcome',
  27: 'First: the greeting',
  28: 'Not shown by the original game',
  29: 'The empty line between paragraphs: keep it empty, as text here shows several times',
  30: 'The home team’s hot and cold players',
  31: 'The visitors’ hot and cold players (not when a team plays itself)',
  32: 'The crowd record',
  33: 'Last: how to start',
  // ScoutingReport's CompareHotColdTotals: one of these only when the teams' totals of this game's hot and cold
  // values (new random tables each game) differ by $5E or more ($BD for 35), so they come and go.
  34: 'Only when one team comes out hotter this game, by its hot and cold rolls, so not every game',
  35: 'Instead of the line above when one team comes out much hotter this game',
}
const GENESIS_BLANK = 29
const SNES_LIST = 'a91d0087..e6..e6..a91c0087'
const SNES_ROLES: Record<number, string> = {
  28: 'Second: the welcome',
  29: 'First: the greeting',
  // ScoutingReport queues it only when hotterteam is set: the two teams' sums of this game's hot and cold values
  // differ by 4 or more (8 or more is "extremely"). Those values are rolled afresh each game, so it comes and goes.
  30: 'Only when one team comes out hotter this game, by its hot and cold rolls, so not every game',
  31: 'The home team’s hot and cold players',
  32: 'The visitors’ hot and cold players (not when a team plays itself)',
  33: 'Last: how to start',
}

// The Genesis text player: cmpi.w #$1000,(ScoutingReportTimer).w ... movea.l #ScoutingReportText,a1.
const GENESIS_POINTER = '0c781000 .... 6e00 .... 4a78 .... 6b00 .... 5378 .... 6a00 .... 227c (........)'
// The SNES one: dec ScoutingReportTimer / bpl; lda #bank / sta a1+2 / lda #address / sta a1 / lda PlayerScrollCtr / sta d0 / bpl.
const SNES_POINTER = 'ce....10..a9(..)0085..a9(....)85..ad....85..10'

interface Found {
  platform: ScoutingPlatform
  at: number
  // Every line as bytes are read, without the $0D.
  lines: string[]
  // From `at` to the end of the last line's $0D.
  size: number
  roles: Record<number, string> | null
  blank: number | null
}

const isText = (byte: number) => byte >= 0x20 && byte < 0x7f

// The script from `at`: lines of text up to the last $0D before anything that is not text.
function readScript(rom: Uint8Array, at: number, first: number): { lines: string[]; size: number } | null {
  const limit = Math.min(rom.length, at + MOST_BYTES)
  let end = -1
  for (let o = at; o < limit; o++) {
    if (rom[o] === 0x0d) end = o + 1
    else if (!isText(rom[o])) break
  }
  if (end < 0) return null
  const lines = String.fromCharCode(...rom.subarray(at, end - 1)).split('\r')
  return lines.length > first ? { lines, size: end - at } : null
}

function locate(rom: Uint8Array, platform: ScoutingPlatform): Found | null {
  const first = FIRST_LINE[platform]
  let at = -1
  if (platform === 'genesis') {
    const pointer = one(rom, GENESIS_POINTER)
    if (pointer) at = pointer.groups[0]
  } else {
    const places = new Set(findCodeAll(rom, SNES_POINTER).map(({ groups: [bank, address] }) => (address >= 0x8000 ? loRomOffset(bank, address) : -1)))
    if (places.size === 1) at = [...places][0]
  }
  if (at <= 0 || at >= rom.length) return null
  const script = readScript(rom, at, first)
  if (!script) return null
  const original = platform === 'genesis' ? one(rom, GENESIS_LIST) !== null : findCodeAll(rom, SNES_LIST).length === 1
  const roles = original ? (platform === 'genesis' ? GENESIS_ROLES : SNES_ROLES) : null
  const blank = original && platform === 'genesis' ? GENESIS_BLANK : null
  return { platform, at, ...script, roles, blank }
}

// From the game's codes to the editor's labels.
export function scoutingFromGame(platform: ScoutingPlatform, text: string): string {
  if (platform === 'snes') {
    return text.replace(/%([0-9a-zA-Z])/g, (whole, code: string) => {
      const stand = SNES_STANDS.find((s) => s.code === `%${code}`)
      return stand ? `{${stand.label}}` : whole
    })
  }
  return Array.from(text, (char) => {
    const stand = GENESIS_STANDS.find((s) => s.code === (GENESIS_ALSO[char] ?? char))
    return stand ? `{${stand.label}}` : char
  }).join('')
}

// What is wrong with a line as typed in the editor, or null.
export function scoutingLineProblem(platform: ScoutingPlatform, text: string): string | null {
  const stands = scoutingStands(platform)
  for (const [, label] of text.matchAll(/\{([^{}]*)\}/g)) {
    if (!stands.some((s) => s.label === label.trim().toLowerCase())) return `{${label}} is not one of the stand-ins.`
  }
  const rest = text.replace(/\{[^{}]*\}/g, '')
  if (/[{}]/.test(rest)) return 'A { or } is only for a stand-in, as {home city}.'
  // The font has no &: it shows as a blank (Match Viewer), and on the SNES one starting a row indents it.
  if (rest.includes('&')) return 'The game has no "&": it shows as a blank. Write "and".'
  const bad = Array.from(rest).find((char) => !isText(char.charCodeAt(0)) || (platform === 'genesis' ? GENESIS_CODES.has(char) : char === '%'))
  if (bad) return `The game can't show "${bad}" here${platform === 'genesis' && GENESIS_CODES.has(bad) ? ': it is one of its stand-ins' : ''}.`
  const width = SCOUTING_WIDTH[platform]
  const long = rest.split(' ').find((word) => word.length > width)
  if (long) return `"${long}" is longer than the box is wide (${width}).`
  return null
}

const GENESIS_CODES = new Set([...GENESIS_STANDS.map((s) => s.code), ...Object.keys(GENESIS_ALSO)])

// From the editor's labels to the game's codes; null where a line has a problem.
export function scoutingToGame(platform: ScoutingPlatform, text: string): string | null {
  if (scoutingLineProblem(platform, text)) return null
  const stands = scoutingStands(platform)
  const out = text.replace(/\{([^{}]*)\}/g, (_, label: string) => stands.find((s) => s.label === label.trim().toLowerCase())!.code)
  // A line can't start with a stand-in.
  return /^\{/.test(text) ? ` ${out}` : out
}

// The last line the original's code shows, and one past it.
const shownLines = (found: Found) => (found.roles ? Math.max(...Object.keys(found.roles).map(Number)) + 1 : found.lines.length)
// How many lines are kept: up to the last the original's code shows (the rest is room), or every line read where the
// code is not the original's. A script with fewer lines keeps as many as it has.
const neededLines = (found: Found) => Math.min(shownLines(found), found.lines.length)

export function parseScouting(rom: Uint8Array, platform: ScoutingPlatform): Scouting | null {
  const found = locate(rom, platform)
  if (!found) return null
  const first = FIRST_LINE[platform]
  const needed = neededLines(found)
  // Where the code is not the original's, the empty lines at the end are kept but not shown.
  let last = needed - 1
  if (!found.roles) while (last > first && found.lines[last] === '') last--
  const lines = found.lines.slice(first, last + 1).map((text, i) => {
    const n = first + i
    const line: ScoutingLine = { text: scoutingFromGame(platform, text), role: found.roles?.[n] ?? null }
    if (n === found.blank) line.blank = true
    return line
  })
  const missing = shownLines(found) - needed
  return { platform, lines, room: textRoom(found), ...(missing > 0 ? { missing } : {}) }
}

// The letters the editor's lines may take: the room less every needed line's $0D, and less
// the text of the lines before the script where the code is not the original's (so they are kept).
function textRoom(found: Found): number {
  const first = FIRST_LINE[found.platform]
  const kept = found.roles ? 0 : found.lines.slice(0, first).reduce((sum, text) => sum + text.length, 0)
  return found.size - neededLines(found) - kept
}

// The editor's lines as the game's bytes, without their $0D; null where a line has a problem.
function gameLines(scouting: Scouting): string[] | null {
  const out: string[] = []
  for (const line of scouting.lines) {
    const text = scoutingToGame(scouting.platform, line.text)
    if (text === null) return null
    out.push(text)
  }
  return out
}

// How many letters the lines take; null where a line has a problem.
export function scoutingUsed(scouting: Scouting): number | null {
  const lines = gameLines(scouting)
  return lines && lines.reduce((sum, text) => sum + text.length, 0)
}

export const scoutingFits = (scouting: Scouting) => {
  const used = scoutingUsed(scouting)
  return used !== null && used <= scouting.room
}

// Writes the lines where the script is, if they fit; the ROM is left as it is otherwise.
export function writeScouting(rom: Uint8Array, scouting: Scouting): boolean {
  const found = locate(rom, scouting.platform)
  const script = gameLines(scouting)
  if (!found || !script) return false
  const first = FIRST_LINE[scouting.platform]
  // Up to every line the code reads: a script missing a line can have it put back (scoutingWithMissingLines).
  const needed = Math.max(neededLines(found), Math.min(shownLines(found), first + script.length))
  if (first + script.length > needed) return false
  // The needed lines after the editor's, as they are (empty ones).
  const after = found.lines.slice(first + script.length, needed)
  let before = found.lines.slice(0, first)
  const lines = () => [...before, ...script, ...after]
  const size = () => lines().reduce((sum, text) => sum + text.length + 1, 0)
  // The lines before the script are emptied only for room, and only where the code is the original's.
  if (size() > found.size && found.roles) before = before.map(() => '')
  if (size() > found.size) return false
  const bytes = Array.from(lines().map((text) => `${text}\r`).join(''), (char) => char.charCodeAt(0))
  // The rest of the room: more empty lines, which nothing reads.
  rom.fill(0x0d, found.at, found.at + found.size)
  rom.set(bytes, found.at)
  return true
}

// The script with its missing lines put back, empty, where the empty line between paragraphs is (as on the five
// league ROMs that merged two lines by hand), so that every line is where the game reads it again. Each needs a
// letter of the room. Match Viewer found that on those ROMs the last line, read past the script's end, freezes the game.
export function scoutingWithMissingLines(scouting: Scouting): Scouting {
  if (!scouting.missing) return scouting
  const { platform } = scouting
  const blank = scouting.lines.findIndex((line) => line.blank)
  const at = blank >= 0 ? blank : scouting.lines.length
  const texts = [...scouting.lines.slice(0, at).map((line) => line.text), ...Array<string>(scouting.missing).fill(''), ...scouting.lines.slice(at).map((line) => line.text)]
  // The texts move down; each place keeps the role the game gives it.
  const roles = platform === 'genesis' ? GENESIS_ROLES : SNES_ROLES
  const lines = texts.map((text, i) => {
    const n = FIRST_LINE[platform] + i
    const line: ScoutingLine = { text, role: roles[n] ?? null }
    if (platform === 'genesis' && n === GENESIS_BLANK) line.blank = true
    return line
  })
  const fixed: Scouting = { platform, lines, room: scouting.room - scouting.missing }
  // Those ROMs fill the room to the letter, so each line put back costs a letter of the text: a space from the
  // longest run of two or more (CDL's greeting pads with 22; the others have a double space after a full stop).
  for (let over = (scoutingUsed(fixed) ?? 0) - fixed.room; over > 0; over--) {
    let best: { line: number; at: number; length: number } | null = null
    fixed.lines.forEach((line, i) => {
      for (const run of line.text.matchAll(/ {2,}/g)) if (!best || run[0].length > best.length) best = { line: i, at: run.index!, length: run[0].length }
    })
    if (!best) break
    const { line, at } = best as { line: number; at: number }
    fixed.lines[line] = { ...fixed.lines[line], text: fixed.lines[line].text.slice(0, at) + fixed.lines[line].text.slice(at + 1) }
  }
  return fixed
}

// Ron Barr's lines, only when changed, so that lines as the ROM has them keep their bytes.
export function writeScoutingIfChanged(rom: Uint8Array, scouting: Scouting | null | undefined): void {
  if (!scouting) return
  const texts = (s: Scouting | null) => s && s.lines.map((line) => line.text)
  if (JSON.stringify(texts(parseScouting(rom, scouting.platform))) !== JSON.stringify(texts(scouting))) writeScouting(rom, scouting)
}

// ------------------------------------------------------------------ preview
// Example names for the preview: Montreal at home to Boston.
const SAMPLE: Record<string, string> = {
  'home city': 'Montreal',
  'visitors city': 'Boston',
  'home nickname': 'Canadiens',
  'visitors nickname': 'Bruins',
  'home name': 'Montreal Canadiens',
  'visitors name': 'Boston Bruins',
  'home arena': 'Montreal Forum',
  'visitors arena': 'Boston Garden',
  'home goalie': 'Patrick Roy',
  'visitors goalie': 'Andy Moog',
  'home hot player': 'Damphousse',
  'visitors hot player': 'Oates',
  'home cold player': 'Muller',
  'visitors cold player': 'Wesley',
  'hotter team': 'Montreal',
  'crowd record': '118',
  'home played by': '',
  'visitors played by': '',
  'hotter team has': 'Montreal Canadiens has',
  extremely: 'extremely ',
  'home hot player 1': 'Damphousse',
  'home hot player 2': 'Bellows',
  'home hot player 3': 'Desjardins',
  'home cold player 1': 'Muller',
  'home cold player 2': 'Keane',
  'home cold player 3': 'Brunet',
  'visitors hot player 1': 'Oates',
  'visitors hot player 2': 'Bourque',
  'visitors hot player 3': 'Juneau',
  'visitors cold player 1': 'Wesley',
  'visitors cold player 2': 'Smolinski',
  'visitors cold player 3': 'Donato',
}

// What the box shows, row by row, with the example names, where the code is the original's:
// each line the game shows, in its order, wrapped at the box's width, an empty row between.
export function scoutingPreview(scouting: Scouting): string[] | null {
  if (scouting.lines.some((line) => line.role === null)) return null
  const { platform } = scouting
  const first = FIRST_LINE[platform]
  const width = SCOUTING_WIDTH[platform]
  const line = (n: number) => scouting.lines[n - first]?.text ?? ''
  const shown = platform === 'genesis' ? [27, 26, 34, 30, 31, 32, 33] : [29, 28, 30, 31, 32, 33]
  const rows: string[] = []
  shown.forEach((n, i) => {
    if (i > 0) {
      // The Genesis game's empty line between paragraphs is line 29, which has text in some ROMs.
      if (platform === 'genesis') rows.push(...wrap(line(29), width))
      else rows.push('')
    }
    rows.push(...wrap(line(n), width))
  })
  return rows
}

// A line's words, the example names in (each name kept together, as the Genesis game prints it), wrapped.
function wrap(text: string, width: number): string[] {
  const filled = text.replace(/\{([^{}]*)\}/g, (_, label: string) => (SAMPLE[label.trim().toLowerCase()] ?? '').replace(/ /g, ' ')).trimStart()
  if (!filled) return ['']
  const rows: string[] = []
  let row = ''
  for (const word of filled.match(/[^ ]+ */g) ?? []) {
    if (row && row.length + word.trimEnd().length > width) {
      rows.push(row.trimEnd())
      row = ''
    }
    row += word
  }
  rows.push(row.trimEnd())
  return rows.map((r) => r.replace(/ /g, ' '))
}
