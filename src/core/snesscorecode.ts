import { colorRgb, nearestColorWord, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks, snesLogo } from './snespictures'
import { blankScoreLogo, SCORE_BLACK, SCORE_FIRST_OWN, SCORE_LOGO, SCORE_LOGO_ROWS, SCORE_RING, withSnesScoreLogo } from './snesscorelogos'

// Score box logos for the original SNES game and ROMs laid out like it,
// adapted, with McMarkis's permission, from his 32-team build
// (NHL94SNES-SA1, src/routines/hockey/ScoreLogo.asm). Where the game prints a
// team's three letters in the score box, and its name in the clock box on a
// power play, it draws the team's small logo; a team without one keeps its
// letters. Match Viewer checked in the game that what this uses is free:
// the 12 tiles at ExtraChars (VRAM $5720-$57DF) are never shown by any map,
// and only Edit Lines and Crowd Level overwrite them, both returning through
// the rink reload that loads them again; background palette 7 is unused in a
// game and palette 4 uses only colours 1 to 4 (the line change box); the
// reload's colours reach the screen before play resumes (ClrHor); and the
// horizontal scoreboard shows full name banners, which keep theirs.
//
// Four places in the game call the new code:
//   setupice and the rink reload (ExitStatsScreen), after the text tiles go
//     to VRAM: jsl DMAToVRAM becomes a call that does that, then copies both
//     teams' logo tiles to ExtraChars and their colours 4-15 to palettes 7
//     (home) and 4 (visitors) in palbuffer;
//   printscores1, the vertical score box: each jsl printscores1_ps becomes a
//     call that draws the logo and the score, or the letters as before;
//   updatepwrplay: ldx a3; lda tmdata,x becomes a call that draws the logo
//     of the team on the power play and leaves the routine, or does those two
//     instructions as before.
// The logos' table (ScoreLogoTable, 8 bytes a team) is the same as the
// 32-team build's, so they are edited the same way (snesscorelogos.ts).

// RAM, as the original game has it (abdulahmad/NHL94SNES ram94s.asm).
const RAM = {
  extraChars: 0x7e35c2,
  charofs: 0x7e35aa,
  palbuffer: 0x7e35f4,
  textmap: 0x7e37f4,
  textdirtylo: 0x0cd5,
  textdirtyhi: 0x0cd7,
  printx: 0x0d0f,
  printy: 0x0d11,
  printm: 0x0cd9,
  tmteam: 0x1ce0,
  homeTeam: 0x1c98,
  visTeam: 0x1c9a,
}
// Direct page.
const DP = { r0: 0x00, r1: 0x04, p0: 0x0c, r3: 0x14, d3: 0xb1 }

// The places, found by the code around them (the same in the original game,
// SDL16 and NHL94 Classic). Each group is a long address the place calls.
const SETUPICE = 'a0ffff22(....)(..)22......a9e7038d'
const RELOAD = 'a0ffff22(....)(..)ad....693c00'
const SCORE_HOME = '64b1649122(....)(..)'
const SCORE_VISITORS = 'e6b1e691e69122(....)(..)'
// jsl PushTime; jsl print; ldx a3; lda tmdata,x.
const POWER_PLAY = '22......22......a6(..)bddc1c'
// tmdata, the team data addresses (ram94s.asm).
const TMDATA = 0x1cdc

const long = (address: number) => [address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff]
const word = (value: number) => [value & 0xff, (value >> 8) & 0xff]

// A little 65816 assembler: bytes, labels and branches within the code.
class Code {
  bytes: number[] = []
  labels = new Map<string, number>()
  fixups: { at: number; label: string; kind: 'rel' | 'abs' }[] = []
  readonly base: number
  constructor(base: number) {
    this.base = base
  }
  emit(...values: (number | number[])[]) {
    for (const value of values) this.bytes.push(...(typeof value === 'number' ? [value] : value))
    return this
  }
  label(name: string) {
    this.labels.set(name, this.bytes.length)
    return this
  }
  branch(op: number, label: string) {
    this.emit(op, 0)
    this.fixups.push({ at: this.bytes.length - 1, label, kind: 'rel' })
    return this
  }
  jsr(label: string) {
    this.emit(0x20, 0, 0)
    this.fixups.push({ at: this.bytes.length - 2, label, kind: 'abs' })
    return this
  }
  // The long address of a label.
  address(label: string) {
    return this.base + this.labels.get(label)!
  }
  finish(): Uint8Array {
    for (const { at, label, kind } of this.fixups) {
      const to = this.labels.get(label)
      if (to === undefined) throw new Error(`no label ${label}`)
      if (kind === 'rel') {
        const distance = to - (at + 1)
        if (distance < -128 || distance > 127) throw new Error(`branch to ${label} too far`)
        this.bytes[at] = distance & 0xff
      } else {
        const [lo, hi] = word((this.base + to) & 0xffff)
        this.bytes[at] = lo
        this.bytes[at + 1] = hi
      }
    }
    return Uint8Array.from(this.bytes)
  }
}

interface Sites {
  setupice: number
  reload: number
  home: number
  visitors: number
  powerPlay: number
  // What the places called, and what the power play place did.
  dmaToVram: number
  printScore: number
  a3: number
  tmdata: number
}

// The routines, at long address `base`, with the logos' table after them.
function assemble(
  base: number,
  sites: Sites,
  teamCount: number,
): { code: Uint8Array; table: number; tiles: number; team: number; powerPlay: number; powerPlayName: number } {
  const c = new Code(base)
  const TABLE = 'table'
  const tableAt = () => c.address(TABLE)
  // Placeholders for the table's address, set once it is known.
  const tableRefs: { at: number; plus: number }[] = []
  const ldaTable = (plus: number) => {
    c.emit(0xbf, 0, 0, 0)
    tableRefs.push({ at: c.bytes.length - 4, plus })
  }

  // jsl DMAToVRAM, as the place did; then both teams' logos.
  c.label('tiles').emit(0x22, long(sites.dmaToVram))
  c.emit(0x08, 0xc2, 0x30, 0x48, 0xda, 0x5a) // php; rep #$30; pha; phx; phy
  c.emit(0xa5, DP.p0, 0x48, 0xa5, DP.p0 + 2, 0x48) // p0 kept
  c.emit(0xaf, long(RAM.extraChars), 0x0a, 0x0a, 0x0a, 0x0a, 0x69, word(0x1000), 0x85, DP.r0) // VRAM word address
  c.emit(0xa9, word(0x00e8), 0x85, DP.r1) // palette 7, colour 4
  c.emit(0xad, word(RAM.homeTeam)).jsr('team')
  c.emit(0xa5, DP.r0, 0x18, 0x69, word(0x0060), 0x85, DP.r0) // 6 tiles on
  c.emit(0xa9, word(0x0088), 0x85, DP.r1) // palette 4, colour 4
  c.emit(0xad, word(RAM.visTeam)).jsr('team')
  c.emit(0x68, 0x85, DP.p0 + 2, 0x68, 0x85, DP.p0, 0x7a, 0xfa, 0x68, 0x28, 0x6b) // p0 back; ply; plx; pla; plp; rtl

  // Team A's tiles to VRAM r0, its colours 4-15 to palbuffer + r1.
  c.label('team').emit(0x0a, 0x0a, 0x0a, 0xaa)
  ldaTable(2)
  c.branch(0xf0, 'teamDone').emit(0x85, DP.p0 + 2)
  ldaTable(0)
  c.emit(0x85, DP.p0, 0xda, 0xa4, DP.r0, 0xa2, word(0x00c0), 0x22, long(sites.dmaToVram), 0xfa)
  ldaTable(6)
  c.emit(0x85, DP.p0 + 2)
  ldaTable(4)
  c.emit(0x85, DP.p0, 0xa6, DP.r1, 0xa0, word(0x0008))
  c.label('colour').emit(0xb7, DP.p0, 0x9f, long(RAM.palbuffer), 0xe8, 0xe8, 0xc8, 0xc8, 0xc0, word(0x0020)).branch(0xd0, 'colour')
  c.label('teamDone').emit(0x60)

  // In place of jsl printscores1_ps (side d3): the logo and the score, or the letters.
  c.label('score').emit(0xda, 0xa5, DP.d3).jsr('has').branch(0xb0, 'scoreLogo')
  c.emit(0xfa, 0x5c, long(sites.printScore))
  c.label('scoreLogo').emit(0xa5, DP.d3).jsr('put')
  c.emit(0xee, word(RAM.printy), 0xee, word(RAM.printy), 0xfa, 0x5c, long(sites.printScore + 4)) // the score two rows down

  // In place of ldx a3; lda tmdata,x in updatepwrplay: the logo of the team on
  // the power play, then out of updatepwrplay; or those two, as before.
  c.label('powerPlay').emit(0xa6, sites.a3, 0x8a, 0x4a, 0x48).jsr('has').emit(0x68).branch(0x90, 'powerPlayName')
  c.emit(0xa2, word(0x0001), 0x8e, word(RAM.printx), 0xa2, word(0x0019), 0x8e, word(RAM.printy)).jsr('put')
  c.emit(0x68, 0xe2, 0x20, 0x68, 0xc2, 0x20, 0x6b) // this call's return address dropped: back from updatepwrplay
  c.label('powerPlayName').emit(0xa6, sites.a3, 0xbd, word(sites.tmdata), 0x6b)

  // Carry set if side A's team has a logo.
  c.label('has').emit(0x0a, 0xaa, 0xbd, word(RAM.tmteam), 0x0a, 0x0a, 0x0a, 0xaa)
  ldaTable(2)
  c.emit(0x18).branch(0xf0, 'hasDone').emit(0x38)
  c.label('hasDone').emit(0x60)

  // Side A's logo, 3 x 2 tiles, at printx, rows printy and printy + 1.
  c.label('put').emit(0xaa, 0xa9, word(0x3c00), 0xe0, word(0)).branch(0xf0, 'putHome')
  c.emit(0xa9, word(0x3000 + 6))
  c.label('putHome').emit(0x18, 0x6f, long(RAM.extraChars), 0x6f, long(RAM.charofs), 0x85, DP.r3)
  c.emit(0xad, word(RAM.printy), 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x6d, word(RAM.printx), 0x0a, 0x6d, word(RAM.printm), 0xaa)
  c.emit(0x4a, 0xcd, word(RAM.textdirtylo)).branch(0xb0, 'put2').emit(0x8d, word(RAM.textdirtylo))
  c.label('put2').emit(0x18, 0x69, word(0x0022), 0xcd, word(RAM.textdirtyhi)).branch(0x90, 'put3').emit(0x8d, word(RAM.textdirtyhi))
  c.label('put3').emit(0xa5, DP.r3)
  // sta.l textmap+offset,x for each tile, the next tile number (inc a) each time.
  for (const offset of [0, 2, 4, 0x40, 0x42, 0x44]) {
    if (offset) c.emit(0x1a)
    c.emit(0x9f, long(RAM.textmap + offset))
  }
  c.emit(0x60)

  c.label(TABLE)
  c.emit(new Array(teamCount * 8).fill(0))
  const code = c.finish()
  for (const { at, plus } of tableRefs) code.set(long(tableAt() + plus), at + 1)
  return {
    code,
    table: tableAt(),
    tiles: c.address('tiles'),
    team: c.address('score'),
    powerPlay: c.address('powerPlay'),
    powerPlayName: c.address('powerPlayName'),
  }
}

const sitesFound = new WeakMap<Uint8Array, Sites | null>()

function findSites(rom: Uint8Array): Sites | null {
  if (!sitesFound.has(rom)) sitesFound.set(rom, readSites(rom))
  return sitesFound.get(rom)!
}

function readSites(rom: Uint8Array): Sites | null {
  const setupice = findCode(rom, SETUPICE)
  const reload = findCode(rom, RELOAD)
  const home = findCode(rom, SCORE_HOME)
  const visitors = findCode(rom, SCORE_VISITORS)
  const powerPlay = findCode(rom, POWER_PLAY)
  if (!setupice || !reload || !home || !visitors || !powerPlay) return null
  const dmaToVram = (setupice.groups[1] << 16) | setupice.groups[0]
  const reloadDma = (reload.groups[1] << 16) | reload.groups[0]
  const printScore = (home.groups[1] << 16) | home.groups[0]
  if (reloadDma !== dmaToVram || ((visitors.groups[1] << 16) | visitors.groups[0]) !== printScore) return null
  return {
    setupice: setupice.at + 3,
    reload: reload.at + 3,
    home: home.at + 4,
    visitors: visitors.at + 6,
    powerPlay: powerPlay.at + 8,
    dmaToVram,
    printScore,
    a3: powerPlay.groups[0],
    tmdata: TMDATA,
  }
}

// Whether score box logos can be added to this ROM: one laid out as the
// original game, without them.
export function canAddScoreLogos(project: RomProject): boolean {
  return project.game.platform === 'snes' && findSites(project.bytes) !== null
}

// The ROM with the score box logos' code in, every team given a score logo
// made from its team logo (see scoreLogoFromTeamLogo).
export function withScoreLogosAdded(project: RomProject): RomProject {
  const sites = findSites(project.bytes)
  if (!sites) throw new Error('This ROM does not have the code the score logos go into.')
  const rom = project.bytes.slice()
  const size = assemble(0x808000, sites, project.teams.length).code.length
  const at = freeSpace(rom, size, keptBanks(rom))
  if (at < 0) throw new Error('This ROM has no free space left for the score logos.')
  const base = (loRomBank(at, 0x80) << 16) | loRomAddress(at)
  const built = assemble(base, sites, project.teams.length)
  rom.set(built.code, at)
  const call = (place: number, to: number) => rom.set([0x22, ...long(to)], place)
  call(sites.setupice, built.tiles)
  call(sites.reload, built.tiles)
  call(sites.home, built.team)
  call(sites.visitors, built.team)
  rom.set([0x22, ...long(built.powerPlay), 0xea], sites.powerPlay)
  let next: RomProject = { ...project, bytes: rom }
  for (let team = 0; team < project.teams.length; team++) {
    const made = scoreLogoFromTeamLogo(project, team)
    next = withSnesScoreLogo(next, team, made.picture, made.palette)
  }
  return next
}

// The power play place once the code is in: jsl PushTime; jsl print; jsl powerPlay; nop; sta a0.
const POWER_PLAY_ADDED = '22......22......22(....)(..)ea85'

// Where the added code is, if NOSE4Web added it: the setupice place calls
// it, and rebuilt where it is, it is byte for byte the same.
function added(rom: Uint8Array, teamCount: number): { at: number; size: number; original: Sites } | null {
  const tilesCall = findCode(rom, SETUPICE)
  const home = findCode(rom, SCORE_HOME)
  const powerPlay = findCode(rom, POWER_PLAY_ADDED)
  if (!tilesCall || !home || !powerPlay || tilesCall.groups[0] < 0x8000 || home.groups[0] < 0x8000 || powerPlay.groups[0] < 0x8000) return null
  const at = loRomOffset(tilesCall.groups[1], tilesCall.groups[0])
  const team = loRomOffset(home.groups[1], home.groups[0])
  const pp = loRomOffset(powerPlay.groups[1], powerPlay.groups[0])
  if (rom[at] !== 0x22 || rom[team] !== 0xda || rom[team + 8] !== 0xfa || rom[team + 9] !== 0x5c || rom[pp] !== 0xa6) return null
  const read = (place: number) => rom[place] | (rom[place + 1] << 8) | (rom[place + 2] << 16)
  // The power play routine's way without a logo: ldx a3; lda tmdata,x; rtl.
  const layout = assemble(0, { setupice: 0, reload: 0, home: 0, visitors: 0, powerPlay: 0, dmaToVram: 0, printScore: 0, a3: 0, tmdata: 0 }, 1)
  const name = pp + layout.powerPlayName - layout.powerPlay
  const original: Sites = {
    setupice: 0, reload: 0, home: 0, visitors: 0, powerPlay: 0,
    dmaToVram: read(at + 1),
    printScore: read(team + 10),
    a3: rom[name + 1],
    tmdata: rom[name + 3] | (rom[name + 4] << 8),
  }
  const base = (loRomBank(at, 0x80) << 16) | loRomAddress(at)
  const built = assemble(base, original, teamCount)
  const codeLength = built.table - base
  if (!built.code.subarray(0, codeLength).every((byte, i) => rom[at + i] === byte)) return null
  return { at, size: built.code.length, original }
}

const addedFound = new WeakMap<Uint8Array, boolean>()

export function hasAddedScoreLogos(project: RomProject): boolean {
  if (project.game.platform !== 'snes') return false
  if (!addedFound.has(project.bytes)) addedFound.set(project.bytes, added(project.bytes, project.teams.length) !== null)
  return addedFound.get(project.bytes)!
}

// The score box logos' code taken out again, and the logos with it: the game
// prints the letters as before, and the ROM is as it was.
export function withScoreLogosTakenOut(project: RomProject): RomProject {
  const found = added(project.bytes, project.teams.length)
  if (!found) throw new Error('This ROM has no score logos that NOSE4Web added.')
  const rom = project.bytes.slice()
  const { original } = found
  const restore = (pattern: string, offset: number, bytes: number[]) => {
    const place = findCode(rom, pattern)
    if (place) rom.set(bytes, place.at + offset)
  }
  restore(SETUPICE, 3, [0x22, ...long(original.dmaToVram)])
  restore(RELOAD, 3, [0x22, ...long(original.dmaToVram)])
  restore(SCORE_HOME, 4, [0x22, ...long(original.printScore)])
  restore(SCORE_VISITORS, 6, [0x22, ...long(original.printScore)])
  restore(POWER_PLAY_ADDED, 8, [0xa6, original.a3, 0xbd, ...word(original.tmdata)])
  // Each team's tiles and colours, which the editor put in free space, are freed too.
  const table = found.at + found.size - project.teams.length * 8
  for (let team = 0; team < project.teams.length; team++) {
    for (const [slot, size] of [[0, 192], [4, 32]]) {
      const at = table + team * 8 + slot
      const address = rom[at] | (rom[at + 1] << 8)
      if (address >= 0x8000) rom.fill(0xff, loRomOffset(rom[at + 2], address), loRomOffset(rom[at + 2], address) + size)
    }
  }
  rom.fill(0xff, found.at, found.at + found.size)
  return { ...project, bytes: rom }
}

// A team's score logo made from its team logo: the logo's drawn part fitted
// into 22 by 11 pixels, keeping its shape, each pixel the average of what it
// covers; its most used colours, up to ten, as its own; a white ring round
// it and the box's black elsewhere, as McMarkis's are.
export function scoreLogoFromTeamLogo(project: RomProject, team: number): { picture: Picture; palette: number[] } {
  const { picture: big, palette: bigPalette } = snesLogo(project.bytes, project.teams.length, project.snesPictures ?? { logos: {}, centreIce: {} }, team)
  const blank = blankScoreLogo()
  const solid: [number, number][] = []
  for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) if (big.pixels[y * big.width + x]) solid.push([x, y])
  if (solid.length === 0) return blank
  const xs = solid.map(([x]) => x)
  const ys = solid.map(([, y]) => y)
  const [left, top] = [Math.min(...xs), Math.min(...ys)]
  const [w, h] = [Math.max(...xs) - left + 1, Math.max(...ys) - top + 1]
  const scale = Math.max(w / (SCORE_LOGO.width - 2), h / (SCORE_LOGO_ROWS - 2))
  const [cols, rows] = [Math.max(1, Math.round(w / scale)), Math.max(1, Math.round(h / scale))]
  const [ox, oy] = [Math.floor((SCORE_LOGO.width - cols) / 2), Math.floor((SCORE_LOGO_ROWS - rows) / 2)]
  const rgb = bigPalette.map((colour) => colorRgb(colour, SNES_COLORS))
  // Each pixel of the small logo: its colour, where at least half of what it covers is drawn.
  const cells: (number[] | null)[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const sum = [0, 0, 0]
      let [drawn, count] = [0, 0]
      for (let sy = Math.floor(y * scale); sy < Math.max(Math.floor(y * scale) + 1, Math.floor((y + 1) * scale)); sy++) {
        for (let sx = Math.floor(x * scale); sx < Math.max(Math.floor(x * scale) + 1, Math.floor((x + 1) * scale)); sx++) {
          count++
          const p = sx < w && sy < h ? big.pixels[(top + sy) * big.width + left + sx] : 0
          if (!p) continue
          drawn++
          rgb[p].forEach((v, k) => (sum[k] += v))
        }
      }
      cells.push(drawn * 2 >= count ? sum.map((v) => v / drawn) : null)
    }
  }
  // Its own colours: the most used, matched to what the console can show.
  const word = (c: number[]) => nearestColorWord('#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''), SNES_COLORS)
  const counts = new Map<number, number>()
  for (const cell of cells) if (cell) counts.set(word(cell), (counts.get(word(cell)) ?? 0) + 1)
  const own = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 16 - SCORE_FIRST_OWN).map(([w]) => w)
  const palette = blank.palette.slice()
  own.forEach((w, i) => (palette[SCORE_FIRST_OWN + i] = w))
  const ownRgb = own.map((w) => colorRgb(w, SNES_COLORS))
  const pixels = new Uint8Array(SCORE_LOGO.width * SCORE_LOGO.height).fill(SCORE_BLACK)
  cells.forEach((cell, i) => {
    if (!cell) return
    let best = 0
    ownRgb.forEach((c, k) => {
      const d = (v: number[]) => (v[0] - cell[0]) ** 2 + (v[1] - cell[1]) ** 2 + (v[2] - cell[2]) ** 2
      if (d(c) < d(ownRgb[best])) best = k
    })
    pixels[(oy + Math.floor(i / cols)) * SCORE_LOGO.width + ox + (i % cols)] = SCORE_FIRST_OWN + best
  })
  // The ring: the box's black next to the logo.
  const logo = (x: number, y: number) => x >= 0 && y >= 0 && x < SCORE_LOGO.width && y < SCORE_LOGO_ROWS && pixels[y * SCORE_LOGO.width + x] >= SCORE_FIRST_OWN
  for (let y = 0; y < SCORE_LOGO_ROWS; y++) {
    for (let x = 0; x < SCORE_LOGO.width; x++) {
      if (pixels[y * SCORE_LOGO.width + x] !== SCORE_BLACK) continue
      if (logo(x - 1, y) || logo(x + 1, y) || logo(x, y - 1) || logo(x, y + 1)) pixels[y * SCORE_LOGO.width + x] = SCORE_RING
    }
  }
  return { picture: { ...SCORE_LOGO, pixels }, palette }
}
