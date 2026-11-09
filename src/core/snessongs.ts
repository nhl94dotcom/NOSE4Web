// Each SNES team's organ songs (Match Viewer, from the disassembly).
// PlayTeamSong plays TeamSongs[(home team x 6 + slot) x 4]: a long pointer
// straight to the song's data, or $FFFFFFFF (any pointer whose bank word is
// negative) for one of the 8 DefaultSongs, picked at random. DefaultSongs
// follows TeamSongs, so the table has room for 28 teams in the original game,
// Classic and SDL16, and 32 in the 2026 builds. Both are found by
// PlayTeamSong's code: lda.l TeamSongs+2,x / bmi / sta / lda.l TeamSongs,x /
// sta / jsl, and lda #8 / jsl randoma8 / asl / asl / tax / lda.l DefaultSongs,x.

import { findCodeAll, loRomOffset } from './snes'

// What each of a team's six songs is for, as the disassembly names them.
export const SNES_SONG_SLOTS = [
  'First faceoff of a period',
  'Faceoff on a home power play',
  'Other faceoffs',
  'Home goal',
  'Faceoff on a home penalty kill',
  'Random, in the third period',
]
export const SNES_RANDOM_SONG = 0xffffffff
const SLOTS = 6

// The songs by a checksum of their first 64 bytes (FNV-1a), named as the
// disassembly names them, from the forum list of the Genesis game's songs.
// The SNES has 53. The checksum finds a song wherever a build keeps it.
const SNES_SONG_NAMES: Record<number, string> = {
  0x78bcbe56: '?Quick Buildup? [F]',
  0xd1256abb: 'Blue Danube Waltz [C]',
  0x4f7a4b3e: 'Brass Bonanza',
  0xc2af1f74: 'Buildup / Charge [F only]',
  0x19fc117b: "Buildup / O'Malley's Steps [F]",
  0x0a4452de: 'Buildup [C]',
  0x7a9c25d9: 'Buildup [F]',
  0xa2c3e89f: 'Buildup, then Charge',
  0xcee56bae: 'Cavalry Charge [C]',
  0xb25926e1: 'Charge',
  0xb3a6d591: 'Charge Fanfare [C]',
  0x4cb84336: 'Charge [C] {Slower}',
  0x555d8fc0: 'Charge [E-flat]',
  0x755905a3: 'Defense [C]',
  0x7e0a0afc: 'Go Team Go [C]',
  0xb314f6e7: 'Go Team Go [E-flat]',
  0x01d17d78: 'Gypsy Spain [E]',
  0x80a7c3de: 'Gypsy Spain [E] / Charge [F-sharp]',
  0x5dde3b85: 'Gypsy Spain [G, rising]',
  0xf242633f: 'Halte la',
  0x3fa3eb03: 'Hava Nagila',
  0xe5827b2e: 'Here Come the Hawks',
  0xbfed5b54: 'Here We Go',
  0x673ceae3: 'Here We Go [F]',
  0x9f380714: 'Jaws Theme',
  0x04aaba2d: 'Kalinka [Em]',
  0x4049d38b: 'La Raspa',
  0xe53dfbe9: 'Las Chiapanecas {Mexican Hat Dance}',
  0x789e17c9: "Let's Go / Rally Time [G]",
  0x9b48550a: "Let's Go Claps [C only]",
  0x7953669a: "Let's Go Claps [C]",
  0xb1f40ebc: "Let's Go Claps [C] {Alternate}",
  0x7bad7c1f: "Let's Go Claps [C] {Shorter}",
  0x7aa01575: "Let's Go Claps [F]",
  0x5e2f2d6c: "Let's Go [C]",
  0xf535a11f: "Let's Go [C] {Alternate}",
  0x97d52372: "Let's Go [F]",
  0x3c60b67f: 'NYI / Charge [B-flat]',
  0x47d41f84: "O'Malley's Steps",
  0x61705b84: "O'Malley's Steps [C]",
  0x72d71cd7: "O'Malley's Steps [C] {Slower}",
  0xc8ea7f55: "O'Malley's Steps [F]",
  0xff49191d: "O'Malley's Steps [G]",
  0xc039fc08: "O'Malley's Steps [G] {Faster}",
  0x05ddcaa1: 'Rally Time',
  0x5fc3006e: 'Rally Time [F] {Alternate}',
  0xd9198b2a: 'Sabre Dance',
  0xc3010eb0: "Tarantella Napoletana [Cm] / O'Malley's Steps [F]",
  0x77e6ad22: 'What Do You Do With A Drunken Sailor?',
  0x9a3a2179: 'When the Saints Go Marching In [C]',
  0xcfc61b01: 'William Tell Overture',
  0x98f231bd: "You Say It's Your Birthday",
  0x44696e81: 'Zorba the Greek / Charge [C]',
}

const long = (rom: Uint8Array, at: number) => (rom[at] | (rom[at + 1] << 8) | (rom[at + 2] << 16) | (rom[at + 3] << 24)) >>> 0
const offsetOf = (pointer: number) => loRomOffset((pointer >>> 16) & 0xff, pointer & 0xffff)

function fnv(bytes: Uint8Array): number {
  let h = 0x811c9dc5
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  return h
}

interface Tables {
  teamSongs: number
  defaultSongs: number
  room: number
}

function findTables(rom: Uint8Array): Tables | null {
  const play = findCodeAll(rom, 'bf......30..85..bf......85..22')
  const random = findCodeAll(rom, 'a9080022......0a0aaabf......')
  if (play.length !== 1 || random.length !== 1) return null
  const pointer = (at: number) => rom[at] | (rom[at + 1] << 8) | (rom[at + 2] << 16)
  const teamSongs = offsetOf(pointer(play[0].at + 9))
  if (offsetOf(pointer(play[0].at + 1)) !== teamSongs + 2) return null
  const defaultSongs = offsetOf(pointer(random[0].at + 11))
  const span = defaultSongs - teamSongs
  if (span <= 0 || span % (SLOTS * 4) !== 0 || defaultSongs + 32 > rom.length) return null
  return { teamSongs, defaultSongs, room: span / (SLOTS * 4) }
}

const isRandom = (pointer: number) => pointer >>> 16 >= 0x8000

// A song's name, or where it is when it is not one of the 53.
export function snesSongName(rom: Uint8Array, pointer: number): string {
  if (isRandom(pointer)) return 'Random'
  const at = offsetOf(pointer)
  const name = at >= 0 && at + 64 <= rom.length ? SNES_SONG_NAMES[fnv(rom.subarray(at, at + 64))] : undefined
  const bank = ((pointer >>> 16) & 0xff).toString(16).toUpperCase()
  return name ?? `The song at $${bank}:${(pointer & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`
}

// Each team's six songs, for the teams the table has room for, or null where it is not found.
export function readSnesTeamSongs(rom: Uint8Array, teamCount: number): (number[] | undefined)[] | null {
  const tables = findTables(rom)
  if (!tables) return null
  return Array.from({ length: teamCount }, (_, t) =>
    t < tables.room ? Array.from({ length: SLOTS }, (_, s) => long(rom, tables.teamSongs + (t * SLOTS + s) * 4)) : undefined,
  )
}

export function snesTeamSongsRoom(rom: Uint8Array): number | null {
  return findTables(rom)?.room ?? null
}

// Writes the songs of the teams the table has room for, only where changed.
export function writeSnesTeamSongs(rom: Uint8Array, songs: (number[] | undefined)[]): void {
  const tables = findTables(rom)
  if (!tables) return
  songs.forEach((six, t) => {
    if (!six || t >= tables.room || six.length !== SLOTS) return
    six.forEach((pointer, s) => {
      const at = tables.teamSongs + (t * SLOTS + s) * 4
      if (long(rom, at) !== pointer >>> 0) rom.set([pointer & 0xff, (pointer >>> 8) & 0xff, (pointer >>> 16) & 0xff, (pointer >>> 24) & 0xff], at)
    })
  })
}

// The songs a team may be given: every song the tables point at, in `roms`
// (the ROM as it is and as it was opened), by name.
export function snesSongChoices(...roms: Uint8Array[]): { pointer: number; name: string }[] {
  const found = new Map<number, string>()
  for (const rom of roms) {
    const tables = findTables(rom)
    if (!tables) continue
    for (let at = tables.teamSongs; at < tables.defaultSongs + 32; at += 4) {
      const pointer = long(rom, at)
      if (!isRandom(pointer) && !found.has(pointer)) found.set(pointer, snesSongName(rom, pointer))
    }
  }
  return [...found].map(([pointer, name]) => ({ pointer, name })).sort((a, b) => a.name.localeCompare(b.name))
}

// A song of `from` as the same song in `to`, by its data; null where `to` has no such song.
export function sameSnesSong(from: Uint8Array, pointer: number, to: Uint8Array): number | null {
  if (isRandom(pointer)) return SNES_RANDOM_SONG
  const name = snesSongName(from, pointer)
  return snesSongChoices(to).find((choice) => choice.name === name)?.pointer ?? null
}
