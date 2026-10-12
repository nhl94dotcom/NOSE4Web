import { readAscii, readText, readU16, readU32, writeAscii, writeU16, writeU32 } from './bytes'
import { findGame, type GameConfig } from './games'
import { createIps } from './ips'
import { parseSettings, writeSettings, type Settings } from './settings'
import { parseTeams, writeTeams, type Team, type TeamLayout } from './team'

const HEADER_CONSOLE = 0x100
const HEADER_PRODUCT_CODE = 0x180
const PRODUCT_CODE_LENGTH = 14
const HEADER_CHECKSUM = 0x18e
const HEADER_ROM_END = 0x1a4
const CHECKSUM_START = 0x200

const SMD_HEADER = 512
const SMD_BLOCK = 16384

const OP_JSR = 0x4eb9
const OP_NOP = 0x4e71
const OP_LOOP = 0x60fe
const OP_MOVEA_A1 = 0x227c
const CHECKSUM_ROUTINE_START = 0x700091c8

export interface RomProject {
  game: GameConfig
  // The ROM exactly as opened (converted from SMD if need be), for making patches.
  source: Uint8Array
  // The ROM as loaded, with the game's self-check switched off.
  bytes: Uint8Array
  teams: Team[]
  layout: TeamLayout
  // Sixteen ice colours, then sixteen arena colours.
  rinkPalette: number[]
  settings: Settings
  wasSmd: boolean
}

const RINK_COLORS = 32

function isBin(b: Uint8Array): boolean {
  return b.length > 0x200 && readAscii(b, HEADER_CONSOLE, 4) === 'SEGA'
}

// Super Magic Drive dumps have a 512-byte header and store each 16 KB block
// with its odd bytes first, then its even bytes.
function isSmd(b: Uint8Array): boolean {
  if (b.length <= 0x2281) return false
  if (b[0x8] === 0xaa && b[0x9] === 0xbb && b[0xa] === 0x06) return true
  return b[0x2280] === 0x53 && b[0x280] === 0x45 && b[0x2281] === 0x47 && b[0x281] === 0x41
}

function smdToBin(smd: Uint8Array): Uint8Array {
  const blocks = Math.floor((smd.length - SMD_HEADER) / SMD_BLOCK)
  const bin = new Uint8Array(blocks * SMD_BLOCK)
  const half = SMD_BLOCK / 2
  for (let block = 0; block < blocks; block++) {
    const from = SMD_HEADER + block * SMD_BLOCK
    const to = block * SMD_BLOCK
    for (let i = 0; i < half; i++) {
      bin[to + i * 2] = smd[from + half + i]
      bin[to + i * 2 + 1] = smd[from + i]
    }
  }
  return bin
}

// The game refuses to run if its own checksum routine finds the ROM changed.
// Like NOSE, this removes the call to that routine and clears the routine out.
function disableSelfCheck(rom: Uint8Array, game: GameConfig): void {
  const call = game.checksumCallOffset - 2
  const instruction = readU16(rom, call)
  if (instruction === OP_NOP && readU16(rom, call + 2) === OP_NOP && readU16(rom, call + 4) === OP_NOP) return

  const routine = readU32(rom, game.checksumCallOffset)
  if (instruction !== OP_JSR || routine + 4 > rom.length || readU32(rom, routine) !== CHECKSUM_ROUTINE_START) {
    throw new Error('The ROM\'s self-check code is not where it is expected, so this ROM is not supported.')
  }
  for (let i = 0; i < 3; i++) writeU16(rom, call + i * 2, OP_NOP)
  writeU16(rom, routine, OP_LOOP)
  rom.fill(0xff, routine + 2)
}

export function openRom(file: Uint8Array): RomProject {
  const wasSmd = isSmd(file)
  const bytes = wasSmd ? smdToBin(file) : file.slice()
  if (!isBin(bytes)) throw new Error('This file is not a Sega Genesis ROM.')
  const source = bytes.slice()

  let productCode = readAscii(bytes, HEADER_PRODUCT_CODE, PRODUCT_CODE_LENGTH).trimEnd()
  // ROMs saved by NOSE before version 1.2 were marked H0, H1 or H2 instead of GM.
  if (/^H[012]/.test(productCode)) {
    productCode = 'GM' + productCode.slice(2)
    writeAscii(bytes, HEADER_PRODUCT_CODE, 'GM')
  }
  const game = findGame(productCode)
  if (!game) throw new Error(`This game is not supported yet (product code "${productCode}").`)

  disableSelfCheck(bytes, game)
  const { teams, layout } = parseTeams(bytes, game)
  const rinkPalette: number[] = []
  for (let i = 0; i < RINK_COLORS; i++) rinkPalette.push(readU16(bytes, game.rinkPaletteOffset + i * 2))
  return { game, source, bytes, teams, layout, rinkPalette, settings: parseSettings(bytes, game), wasSmd }
}

// Points the game's built-in team text at the right place. While a redirected
// team's location still begins the built-in text ("New York" in "New York
// Rangers") the built-in text is used; once renamed, the team's own name is.
function updateTeamNameRedirects(rom: Uint8Array, game: GameConfig): void {
  for (const redirect of game.teamNameRedirects) {
    if (readU16(rom, redirect.pointerOffset - 2) !== OP_MOVEA_A1) continue // removed by a hack
    const team = readU32(rom, game.teamTableOffset + redirect.team * 4)
    const names = team + readU16(rom, team + 4)
    const usesBuiltIn = readText(rom, redirect.defaultTextOffset).text.startsWith(readText(rom, names).text)
    writeU32(rom, redirect.pointerOffset, usesBuiltIn ? redirect.defaultTextOffset : names)
  }
}

function headerChecksum(rom: Uint8Array): number {
  const end = readU32(rom, HEADER_ROM_END)
  let sum = 0
  for (let o = CHECKSUM_START; o < end; o += 2) sum = (sum + readU16(rom, o)) & 0xffff
  return sum
}

// A patch that turns the ROM as opened into the finished ROM.
export function buildPatch(project: RomProject): Uint8Array {
  return createIps(project.source, buildRom(project))
}

// Produces the finished ROM file from the project's current state.
export function buildRom(project: RomProject): Uint8Array {
  const rom = project.bytes.slice()
  writeTeams(rom, project.game, project.teams, project.layout)
  updateTeamNameRedirects(rom, project.game)
  project.rinkPalette.forEach((word, i) => writeU16(rom, project.game.rinkPaletteOffset + i * 2, word))
  writeSettings(rom, project.game, project.settings)
  writeU32(rom, HEADER_ROM_END, rom.length - 1)
  writeU16(rom, HEADER_CHECKSUM, headerChecksum(rom))
  return rom
}
