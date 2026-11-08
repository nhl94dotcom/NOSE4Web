import { readU16, readU16LE, readU32, writeU16, writeU16LE } from './bytes'
import type { GameConfig } from './games'
import { findCodeAll } from './snes'
import { snesChoiceCountsPlace } from './snesmenu'

// How many teams the main menu offers: the first so many of the ROM's teams,
// for a league smaller than the ROM. The game keeps the number in its table of
// how many choices each menu line has, and counts the teams again where it
// picks two random teams after the demo, where it limits the team for new
// playoffs, and where it picks the teams of the other games of the day (whose
// scores the ticker shows). Each is found by the code around it, read from
// abdulahmad's disassemblies (NHL94Genesis optsetup94.asm and setup94.asm;
// NHL94SNES setoptions.asm, NewPO.asm and InitializeGameStructures.asm).

export interface MenuTeams {
  // The menu offers teams 0 to offered - 1.
  offered: number
}

// A place the game keeps a team count, and what is kept there.
interface Place {
  at: number
  size: 1 | 2
  kind: 'menu' | 'demo' | 'playoffs' | 'lastPlayoff' | 'others'
}

// The fewest teams the menu may offer: the demo picks two different teams.
export const FEWEST_MENU_TEAMS = 2
// The other games of the day take 16 teams besides the two playing, and the
// game marks the teams it has taken in 32 bits.
const OTHER_GAMES_TEAMS = 18
const MOST_MARKED_TEAMS = 32

// ---- Genesis (big-endian words; moveq keeps its byte in the second byte).
// ChangeOption: movea.l #OptionLimits,a3; tst.w FourWayPlay; beq.w; movea.l #OptionLimits4Way,a3; clr.w d5.
const G_LIMITS = '267c(........)4a78....6700....267c(........)4245'
const G_LIMITS_4WAY_AT = 14
// ChangeOption: cmp.w #4,d7; bne.w; moveq #NumPlayoffTeams,d4.
const G_PLAYOFFS = 'be7c00046600....78(..)'
// NewPO: cmp.w #NumPlayoffTeams-1,d2; bls.w; moveq #NumPlayoffTeams-1,d2; cmp.b (a0)+,d2.
const G_LAST_PLAYOFF = 'b47c(....)6300....74(..)b418'
// GetRandomUnusedTeam: moveq #NumPlayoffTeams,d0; bsr.w randomd0; bset d0,d3; bne.s back.
const G_OTHERS = '70(..)6100....01c366f6'
// GameSetUp after a demo: moveq #NumTeams,d0; jsr randomd0; move.w d0,Opt1team; the same for Opt2team.
const G_DEMO = '70(..)4eb9........31c0(....)70(..)4eb9........31c0(....)'
// The Home and Visitor lines' words in the tables.
const G_TEAM_LINES = [2, 3]

// ---- SNES (little-endian words, after the opcode).
// setoptions after the demo: lda #NumTeams; jsl randoma8; sta.l Opt1team; sta HomeTeam.
const S_DEMO_HOME = 'a9(....)22......8f......8d....'
// ... then lda #NumTeams; jsl randoma8; cmp.l Opt1team; beq; sta.l Opt2team; sta VisTeam.
const S_DEMO_VISITOR = 'a9(....)22......cf......f0..8f......8d....'
// setoptions: cmp #2; bcc; cmp #4; beq; cpy #2; bne; lda #playoff teams; sta d4.
const S_PLAYOFFS = 'c90200(90..)c90400f0..c00200d0..a9(....)85..'
const S_PLAYOFFS_AT = 15
// NewPO: cmp #playoff teams; bcc; lda #last playoff team; sta d2; lda [a0].
const S_LAST_PLAYOFF = 'c9(....)90..a9(....)85..a7..'
// InitializeGameStructures: lda #playoff teams; sta d0; jsl randomd0; jsr; lda teamtaken; cmp #0; bne.
const S_OTHERS = 'a9(....)85..22......20....ad....c90000d0'
const S_TEAM_LINES = [1, 2]

// The one place a pattern is, or none where it is not found once.
function only(rom: Uint8Array, pattern: string, even: boolean): number | null {
  const all = findCodeAll(rom, pattern).filter((match) => !even || match.at % 2 === 0)
  return all.length === 1 ? all[0].at : null
}

function genesisPlaces(rom: Uint8Array): Place[] {
  const limits = only(rom, G_LIMITS, true)
  if (limits === null) return []
  const tables = [readU32(rom, limits + 2), readU32(rom, limits + G_LIMITS_4WAY_AT + 2)]
  if (tables.some((table) => table + 8 > rom.length)) return []
  const places: Place[] = tables.flatMap((table) => G_TEAM_LINES.map((line): Place => ({ at: table + line * 2, size: 2, kind: 'menu' })))
  const demo = only(rom, G_DEMO, true)
  if (demo !== null) places.push({ at: demo + 1, size: 1, kind: 'demo' }, { at: demo + 13, size: 1, kind: 'demo' })
  const playoffs = only(rom, G_PLAYOFFS, true)
  const last = only(rom, G_LAST_PLAYOFF, true)
  // Both or neither, so the limit and the clamp agree.
  if (playoffs !== null && last !== null) {
    places.push({ at: playoffs + 9, size: 1, kind: 'playoffs' }, { at: last + 2, size: 2, kind: 'lastPlayoff' }, { at: last + 9, size: 1, kind: 'lastPlayoff' })
  }
  const others = only(rom, G_OTHERS, true)
  if (others !== null) places.push({ at: others + 1, size: 1, kind: 'others' })
  return places
}

function snesPlaces(rom: Uint8Array): Place[] {
  const counts = snesChoiceCountsPlace(rom)
  if (counts < 0) return []
  const places: Place[] = S_TEAM_LINES.map((line): Place => ({ at: counts + line * 2, size: 2, kind: 'menu' }))
  const home = only(rom, S_DEMO_HOME, false)
  const visitor = only(rom, S_DEMO_VISITOR, false)
  if (home !== null && visitor !== null) places.push({ at: home + 1, size: 2, kind: 'demo' }, { at: visitor + 1, size: 2, kind: 'demo' })
  const playoffs = only(rom, S_PLAYOFFS, false)
  const last = only(rom, S_LAST_PLAYOFF, false)
  if (playoffs !== null && last !== null) {
    places.push({ at: playoffs + S_PLAYOFFS_AT + 1, size: 2, kind: 'playoffs' }, { at: last + 1, size: 2, kind: 'playoffs' }, { at: last + 6, size: 2, kind: 'lastPlayoff' })
  }
  const others = only(rom, S_OTHERS, false)
  if (others !== null) places.push({ at: others + 1, size: 2, kind: 'others' })
  return places
}

function placesFor(rom: Uint8Array, game: GameConfig): Place[] {
  return game.platform === 'snes' ? snesPlaces(rom) : genesisPlaces(rom)
}

function read(rom: Uint8Array, game: GameConfig, place: Place): number {
  if (place.size === 1) return rom[place.at]
  return game.platform === 'snes' ? readU16LE(rom, place.at) : readU16(rom, place.at)
}

function write(rom: Uint8Array, game: GameConfig, place: Place, value: number): void {
  if (place.size === 1) rom[place.at] = value
  else if (game.platform === 'snes') writeU16LE(rom, place.at, value)
  else writeU16(rom, place.at, value)
}

// How many teams the menu offers, or null where the editor cannot find where
// the game keeps it (or what it finds does not make sense).
export function parseMenuTeams(rom: Uint8Array, game: GameConfig): MenuTeams | null {
  const menu = placesFor(rom, game).find((place) => place.kind === 'menu')
  if (!menu) return null
  const offered = read(rom, game, menu)
  return offered >= FEWEST_MENU_TEAMS && offered <= game.teamCount ? { offered } : null
}

// How many teams new playoffs can start with: those the menu offers, as far
// as the playoff draws have them. The game looks through the draws for the
// team, and freezes if no draw has it.
export function playoffTeamCount(offered: number, draws: number[][]): number {
  const highest = Math.max(-1, ...draws.flat())
  return Math.min(offered, highest + 1)
}

// The teams the menu offers that no playoff draw has: picking one of these
// for new playoffs freezes the game.
export function teamsMissingFromDraws(offered: number, draws: number[][]): number[] {
  if (draws.length === 0) return []
  const drawn = new Set(draws.flat())
  return Array.from({ length: playoffTeamCount(offered, draws) }, (_, team) => team).filter((team) => !drawn.has(team))
}

// Writes the number only when it changed, so a ROM whose counts were set by
// another tool keeps them until the number is changed here.
export function writeMenuTeams(rom: Uint8Array, game: GameConfig, menuTeams: MenuTeams | null, draws: number[][]): void {
  if (!menuTeams) return
  const places = placesFor(rom, game)
  const menu = places.find((place) => place.kind === 'menu')
  if (!menu || read(rom, game, menu) === menuTeams.offered) return
  const offered = Math.max(FEWEST_MENU_TEAMS, Math.min(game.teamCount, menuTeams.offered))
  const playoffs = draws.length > 0 ? playoffTeamCount(offered, draws) : 0
  for (const place of places) {
    if (place.kind === 'menu' || place.kind === 'demo') write(rom, game, place, offered)
    else if (playoffs < 1) continue
    else if (place.kind === 'playoffs') write(rom, game, place, playoffs)
    else if (place.kind === 'lastPlayoff') write(rom, game, place, playoffs - 1)
    // Too few teams for the other games of the day: they keep the teams they had.
    else if (place.kind === 'others' && playoffs >= OTHER_GAMES_TEAMS) write(rom, game, place, Math.min(MOST_MARKED_TEAMS, playoffs))
  }
}

// Playoff draws of the first `teams` teams only, each team in at least one
// draw: for a league smaller than the ROM. `random` returns 0 <= x < 1.
export function leagueDraws(teams: number[], drawCount: number, slots: number, random: () => number = Math.random): number[][] {
  if (teams.length < slots) throw new Error(`A playoff draw needs ${slots} different teams; the league has ${teams.length}.`)
  const shuffled = () => {
    const out = teams.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out.slice(0, slots)
  }
  const draws = Array.from({ length: drawCount }, shuffled)
  // Put any team no draw has in place of a team that more than one draw has.
  const times = new Map<number, number>()
  draws.flat().forEach((team) => times.set(team, (times.get(team) ?? 0) + 1))
  teams.forEach((team, i) => {
    if (times.has(team)) return
    const draw = draws[i % drawCount]
    const slot = draw.findIndex((other) => (times.get(other) ?? 0) > 1)
    if (slot < 0) return
    times.set(draw[slot], times.get(draw[slot])! - 1)
    draw[slot] = team
    times.set(team, 1)
  })
  return draws
}
