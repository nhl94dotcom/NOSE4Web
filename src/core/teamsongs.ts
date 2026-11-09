// Each Genesis team's organ songs (Match Viewer, from the disassembly).
// ChooseSong plays TeamSongs[home team x 6 + slot], found by its opening
// instructions, movea.l #TeamSongs,a0 / movea.l #RandomSongs,a1 / move.w
// (HmTeam).w,d0 / mulu.w #6,d0; nothing else reads the table. A 0 plays one of
// the 8 RandomSongs, picked at random. In the original game and every 30-team
// ROM the table sits just before RandomSongs with room for 28 teams, so teams
// 28 and 29 of a 30-team ROM read RandomSongs and the code after it; giving
// them songs of their own moves the table to free room and repoints that one
// movea.l, leaving RandomSongs and its own pointer as they are.

import { claimSpace } from './space'

// What each of a team's six songs is for. The power plays are as LeadSong
// picks them (Match Viewer, in the game): slot 1 when the home team has more
// players, 4 when the visitors do, the other way round from the
// disassembly's names. They may never play in a real power play: LeadSong
// stops when sflags2 bit 5 is set, which the power-play display sets.
export const SONG_SLOTS = [
  'Period start',
  'Home team on the power play',
  'Faceoff (once a period, and the shootout)',
  'Home goal',
  'Visitors on the power play',
  'Late in the third period',
]
// The organ songs, $30 to $77, as the disassembly names them (from the forum
// list by Jkline3 and Tony Ouradnik): the tune, its key, and who has it.
export const SONG_NAMES: Record<number, string> = {
  0x30: "Go Team Go [E-flat] (BOS)",
  0x31: "Here We Go [E-flat] (BOS)",
  0x32: "Charge [E-flat] (BOS)",
  0x33: "Rally Time [F] (BUF)",
  0x34: "Sabre Dance (BUF)",
  0x35: "O'Malley's Steps [G] (CGY)",
  0x36: "Kalinka [Em] (CGY)",
  0x37: "You Say It's Your Birthday {Claps} (CGY)",
  0x38: "Here Come the Hawks (CHI)",
  0x39: "Gypsy Spain [G, rising] (CHI)",
  0x3a: "Las Chiapanecas {Mexican Hat Dance} [C] (CHI)",
  0x3b: "La Raspa [C] (DET)",
  0x3c: "O'Malleys Steps / Charge [C] (DET)",
  0x3d: "Las Chiapanecas {Mexican Hat Dance} [F] (DET)",
  0x3e: "O'Malleys Steps [F] (EDM)",
  0x3f: "Here We Go [C] (EDM)",
  0x40: "Brass Bonanza (HFD)",
  0x41: "Let's Go [C] (HFD)",
  0x42: "William Tell Overture (HFD)",
  0x43: "O'Malley's Steps [C] (LA)",
  0x44: "You Say It's Your Birthday (LA)",
  0x45: "Las Chiapanecas {Mexican Hat Dance} [G] (LA)",
  0x46: "Go Team Go [C] (LA)",
  0x47: "Rally Time [C] (NYI)",
  0x48: "Charge [B-flat only] (NYI)",
  0x49: "?Islanders? / Charge [B-flat] (NYI)",
  0x4a: "Here We Go [G] (DAL)",
  0x4b: "Charge [C] (DAL)",
  0x4c: "Let's Go Claps [C only] (MTL)",
  0x4d: "Halte la Les Canadiens sont la (MTL)",
  0x4e: "Gypsy Spain [E] (MTL)",
  0x4f: "O'Malley's Steps [F] (MTL)",
  0x50: "Let's Go [F] (NJ)",
  0x51: "Buildup [C] (NJ)",
  0x52: "La Raspa [F] (NJ)",
  0x53: "Let's Go [F] {Shorter} (NYR, ASE, ASW)",
  0x54: "Here We Go [C] {Slower} (NYR, ASE, ASW)",
  0x55: "Charge [C] {Slower} (NYR)",
  0x56: "Let's Go [C] {Alternate} (PHI)",
  0x57: "Buildup [F] (PHI)",
  0x58: "Zorba the Greek / Charge [C] (PHI)",
  0x59: "O'Malley's Steps [G] {Faster} (PIT)",
  0x5a: "Defense [C] (all but CGY, PHI and SJ)",
  0x5b: "Let's Go / Rally Time [G] (PIT)",
  0x5c: "What Do You Do With A Drunken Sailor? (PIT)",
  0x5d: "Let's Go Claps [C] (QUE)",
  0x5e: "Kalinka [Em] {Alternate} (QUE)",
  0x5f: "Charge [C] (SJ)",
  0x60: "Jaws Theme (SJ)",
  0x61: "Let's Go Claps [F] (SJ)",
  0x62: "Go Team Go [C] (Longer)",
  0x63: "Blue Danube Waltz [C] (SJ)",
  0x64: "Buildup / Charge [F only] (SJ)",
  0x65: "Hava Nagila (CHI, SJ)",
  0x66: "Tarantella Napoletana [Cm] / O'Malley's Steps [F]",
  0x67: "When the Saints Go Marching In [C] (STL)",
  0x68: "Buildup / O'Malley's Steps [F] (STL)",
  0x69: "Let's Go Claps [C] {Alternate} (STL)",
  0x6a: "Here We Go [F] (TB)",
  0x6b: "Cavalry Charge [C] (TB)",
  0x6c: "O'Malley's Steps [C] {Slower} (TOR)",
  0x6d: "?Quick Buildup? [F] (TOR)",
  0x6e: "Let's Go Claps [C] {Shorter} (VAN)",
  0x6f: "Buildup [D-flat] (VAN)",
  0x70: "Charge Fanfare [C] (VAN)",
  0x71: "O'Malley's Steps [F] {Alternate} (WSH)",
  0x72: "Go Team Go [C] {Alternate}",
  0x73: "Rally Time [F] {Alternate} (WSH)",
  0x74: "Charge / O'Malley's Steps [F] (WSH)",
  0x75: "O'Malley's Steps [G] {Alternate} (ANA, FLA, OTT, WPG)",
  0x76: "Gypsy Spain [E] / Charge [F-sharp] (ANA, FLA, OTT, WPG)",
  0x77: "Rally Time [F] {Longer} (ANA, FLA, OTT, WPG)",
}
export const RANDOM_SONG = 0
const FIRST_SONG = 0x30
const LAST_SONG = 0x77
export const isSong = (value: number) => value === RANDOM_SONG || (value >= FIRST_SONG && value <= LAST_SONG)
export const SONG_NUMBERS = Array.from({ length: LAST_SONG - FIRST_SONG + 1 }, (_, i) => FIRST_SONG + i)

// A song as the editor names it: its number from 1, as the forum lists them, and its name.
export function songName(value: number): string {
  if (value === RANDOM_SONG) return 'one of the random songs'
  if (!isSong(value)) return 'no song'
  return `${value - FIRST_SONG + 1}. ${SONG_NAMES[value]}`
}

const CODE = [0x20, 0x7c, -1, -1, -1, -1, 0x22, 0x7c, -1, -1, -1, -1, 0x30, 0x38, -1, -1, 0xc0, 0xfc, 0x00, 0x06]
const SLOTS = 6

interface SongTable {
  // Where the movea.l's address is, the table, and how many teams it has room for.
  pointerAt: number
  at: number
  room: number
}

const readLong = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0

function findSongTable(rom: Uint8Array, teamCount: number): SongTable | null {
  for (let o = 0; o + CODE.length <= rom.length; o += 2) {
    if (rom[o] !== 0x20 || rom[o + 1] !== 0x7c) continue
    if (!CODE.every((byte, i) => byte < 0 || rom[o + i] === byte)) continue
    const at = readLong(rom, o + 2)
    const random = readLong(rom, o + 8)
    if (at <= 0 || at + SLOTS > rom.length) return null
    // Just before RandomSongs: room up to it. Elsewhere it was moved for this many teams.
    const room = random > at && (random - at) % SLOTS === 0 && random - at <= SLOTS * 64 ? (random - at) / SLOTS : teamCount
    return { pointerAt: o + 2, at, room }
  }
  return null
}

// Each team's six songs, as the game reads them (past the table's room, what
// follows it), or null where the table is not found.
export function readTeamSongs(rom: Uint8Array, teamCount: number): number[][] | null {
  const table = findSongTable(rom, teamCount)
  if (!table || table.at + teamCount * SLOTS > rom.length) return null
  return Array.from({ length: teamCount }, (_, t) => Array.from(rom.subarray(table.at + t * SLOTS, table.at + (t + 1) * SLOTS)))
}

// How many teams the table has room for, or null where it is not found.
export function teamSongsRoom(rom: Uint8Array, teamCount: number): number | null {
  return findSongTable(rom, teamCount)?.room ?? null
}

// Writes the songs of the teams the table has room for, only where changed.
export function writeTeamSongs(rom: Uint8Array, songs: (number[] | undefined)[]): void {
  const table = findSongTable(rom, songs.length)
  if (!table) return
  songs.forEach((six, t) => {
    if (!six || t >= table.room || six.length !== SLOTS) return
    six.forEach((value, s) => {
      if (rom[table.at + t * SLOTS + s] !== value) rom[table.at + t * SLOTS + s] = value & 0xff
    })
  })
}

// The ROM with the table moved to free room big enough for every team, its
// songs as the game reads them now, and ChooseSong pointed at it; the ROM as
// it is where the table has room already, or null where there is no room.
export function withRoomForTeamSongs(rom: Uint8Array, teamCount: number): Uint8Array | null {
  const table = findSongTable(rom, teamCount)
  if (!table) return null
  if (table.room >= teamCount) return rom
  const songs = readTeamSongs(rom, teamCount)!
  const claimed = claimSpace(rom, teamCount * SLOTS)
  if (!claimed) return null
  const next = claimed.rom
  songs.forEach((six, t) => next.set(six, claimed.at + t * SLOTS))
  next.set([(claimed.at >>> 24) & 0xff, (claimed.at >>> 16) & 0xff, (claimed.at >>> 8) & 0xff, claimed.at & 0xff], table.pointerAt)
  return next
}
