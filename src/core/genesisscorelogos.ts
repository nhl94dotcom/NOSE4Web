import { readU16, readU32, writeU16, writeU32 } from './bytes'
import { colorRgb } from './color'
import type { Picture } from './graphics'
import { rinkLogo } from './graphics'
import type { RomProject } from './rom'
import { inBetweenShades } from './snesscorecode'
import { claimSpace, fullRomReason, releaseSpace } from './space'

// Score box logos for the Genesis game: where it prints a team's three
// letters in the vertical rink's score box, a small logo, 24 by 16 pixels,
// the logo in the top 13 rows. The idea is McMarkis's, from his 32-team
// SNES build; the Genesis code is NOSE4Web's own, from the disassembly
// (abdulahmad/NHL94Genesis: printscores1, printscores1_ps, print, xyVmMap,
// LoadHomeTeamGfx, SetLCmode2) and Match Viewer's checks in the game:
//   - The box grows from 8 x 5 cells at ($17, $17) to 8 x 7 at ($17, $15),
//     so that each team has two rows: the visitors' logo on rows $16-$17,
//     the home team's on $19-$1A, each score beside its logo's lower row.
//   - A logo is drawn in its team's uniform colours, the palette line the
//     game gives them in play (setplayercolors): the home team's home
//     colours on line 2, the visitors' away colours on line 3. So each team
//     has two, a home and an away logo. Its background is colour 2 (black in
//     every original uniform), as the box's own background is black and a
//     see-through pixel would show the ice. The tiles have the priority bit,
//     as the box's letters do, so that players skate under them.
//   - The tiles go to video memory $5280-$53FF (tiles $294-$29F, unused all
//     game): the home logo, then the visitors', from LoadHomeTeamGfx, which
//     setupice, ClrHor and ReloadRinkGraphics call, and which writes video
//     memory already.
//   - The lower line change box covers rows $16 to $1B of the box, not its
//     new top row, which is blanked when that box opens (SetLCmode2).
// A team without a logo prints its letters as before.

export const GENESIS_SCORE_LOGO = { width: 24, height: 16 }
export const GENESIS_SCORE_LOGO_ROWS = 13
// The background colour of the uniform palettes.
export const SCORE_BACKGROUND = 2
const TILES = 6
const TILE = 32
const ENTRY = 8
const VRAM = 0x5280
const FIRST_TILE = VRAM / TILE
const HOME_ATTRIBUTE = 0x8000 | 0x4000 // priority, palette line 2
const VISITOR_ATTRIBUTE = 0x8000 | 0x6000 // priority, palette line 3

// ---------------------------------------------------------------- finding the code

// A pattern of hex bytes, '..' any byte, '(....)' a big-endian group.
function find(rom: Uint8Array, pattern: string): { at: number; groups: number[] }[] {
  const bytes: (number | null)[] = []
  const groups: { at: number; size: number }[] = []
  for (const [, fixed, group] of pattern.replace(/\s/g, '').matchAll(/([0-9a-f]{2})|\(((?:\.\.)+)\)|\.\./g)) {
    if (fixed) bytes.push(parseInt(fixed, 16))
    else if (group) {
      groups.push({ at: bytes.length, size: group.length / 2 })
      for (let i = 0; i < group.length / 2; i++) bytes.push(null)
    } else bytes.push(null)
  }
  const out: { at: number; groups: number[] }[] = []
  const key = bytes.findIndex((b) => b !== null)
  for (let found = rom.indexOf(bytes[key]!, key); found >= 0 && found - key + bytes.length <= rom.length; found = rom.indexOf(bytes[key]!, found + 1)) {
    const at = found - key
    if (at % 2 !== 0) continue
    if (bytes.every((b, i) => b === null || rom[at + i] === b)) {
      out.push({ at, groups: groups.map((g) => (g.size === 4 ? readU32(rom, at + g.at) : g.size === 2 ? readU16(rom, at + g.at) : rom[at + g.at])) })
    }
  }
  return out
}
// The one place a pattern is; null where it is nowhere or in more than one place.
export const one = (rom: Uint8Array, pattern: string) => {
  const all = find(rom, pattern)
  return all.length === 1 ? all[0] : null
}
const branch = (rom: Uint8Array, at: number) => at + 2 + ((readU16(rom, at + 2) << 16) >> 16)

// printscores1's score box: bsr printz; String ctrl,$17,$17; moveq #8,d0;
// moveq #5,d1; bsr Framer; bsr printz; String ctrl,$18,$1A; movea.w
// #tmstruct,a2; bsr printscores1_ps; bsr printz; String ctrl,$18,$18; adda.w
// #tmsize,a2; bsr printscores1_ps. Groups: frame y, frame rows, visitors' y,
// the two calls' first words.
const SCORE_BOX = '6100.... 0006..17(..)00 7008 72(..) 6100.... 6100.... 0006..181a00 (....)(....)(....)(....) 6100.... 0006..18(..)00 (....)(....)(....)(....)'
// printscores1_ps: movea.l tmdata(a2),a1; adda.w Teamname(a1),a1; adda.w (a1),a1; bsr print; move.w #$1C,printx.
const SCORE_ROUTINE = '226a.... d2e9.... d2d1 6100.... 31fc001c(....)'
// print: move.w disflags,-(sp); bset #dfng,disflags; movem.l d0-d3/a0/a2,-(sp); bsr xyVmMap.
const PRINT = '3f38(....) 08f8(....)(....) 48e7f0a0 6100....'
// xyVmMap: movem.l d0-d2,-(sp); move.w printx,d0; move.w printy,d1.
const XY = '48e7e000 3038(....) 3238(....)'
// LoadHomeTeamGfx: move.w d0,-(sp); subi.w #$18,d4; movea.l #TeamGfxList,a2; move.w HomeTeam,d0; asl.w #2,d0;
// movea.l 0(a2,d0.w),a2; addq.w #8,a2; jsr DecompressGraphicsPlain; move.w (sp)+,d0; rts.
const LOAD = '3f0004440018247c........ 3038(....) e540 24720000 504a 4eb9(........) 301f4e75'
// DecompressGraphicsPlain ... tst.l remapTablePtr; beq.w DoDMApro.
const DECOMPRESS = '42b8.... 48e7c0fe 204a 3204 eb41 3018 6700.... 6b00.... d840 e940 4879........ 4ab8.... 6700....'
// SetLCmode2: cmpi.w #$F,printy; blt.w .box; bset #sf3llcs,sflags3.
const LINE_CHANGE = '0c78000f.... 6d00000c (....)(....)(....)'

interface Sites {
  scoreBox: number
  frameY: number
  frameRows: number
  visitorsY: number
  home: number
  visitors: number
  load: number
  lineChange: number
  // What the places did, and the routines and variables they use.
  tmstruct: number
  tmsize: number
  printScores: number
  print: number
  printz: number
  xyVmMap: number
  printx: number
  printy: number
  disflags: number
  dfng: number
  homeTeam: number
  decompress: number
  doDmaPro: number
  sflags3: number
  control: number
}

function readSites(rom: Uint8Array): Sites | null {
  const box = one(rom, SCORE_BOX)
  const load = one(rom, LOAD)
  const lc = one(rom, LINE_CHANGE)
  if (!box || !load || !lc) return null
  const at = box.at
  const homeCall = at + 28
  const visitorsCall = at + 46
  // The original or the hooked form of each place.
  const hooked = readU16(rom, homeCall) === 0x4eb9
  if (!hooked && (readU16(rom, homeCall) !== 0x347c || readU16(rom, homeCall + 4) !== 0x6100 || readU16(rom, visitorsCall) !== 0xd4fc || readU16(rom, visitorsCall + 4) !== 0x6100)) return null
  if (!hooked && (box.groups[0] !== 0x17 || box.groups[1] !== 0x05 || box.groups[6] !== 0x18)) return null
  const lcHooked = readU16(rom, lc.at + 10) === 0x4eb9
  if (!lcHooked && (readU16(rom, lc.at + 10) !== 0x08f8 || readU16(rom, lc.at + 12) !== 0)) return null
  // Where the code is in, the original values are in the added code (see added).
  if (hooked || lcHooked) return null
  const printScores = branch(rom, homeCall + 4)
  if (branch(rom, visitorsCall + 4) !== printScores) return null
  const routine = find(rom, SCORE_ROUTINE).find((m) => m.at === printScores)
  const printAt = routine ? branch(rom, printScores + 10) : -1
  const print = find(rom, PRINT).find((m) => m.at === printAt)
  const xyAt = print ? branch(rom, printAt + 14) : -1
  const xy = find(rom, XY).find((m) => m.at === xyAt)
  const decompress = find(rom, DECOMPRESS).find((m) => m.at === load.groups[1])
  if (!routine || !print || !xy || !decompress) return null
  if (print.groups[0] !== print.groups[2]) return null
  return {
    scoreBox: at,
    frameY: at + 8,
    frameRows: at + 13,
    visitorsY: at + 44,
    home: homeCall,
    visitors: visitorsCall,
    load: load.at + 24,
    lineChange: lc.at + 10,
    tmstruct: readU16(rom, homeCall + 2),
    tmsize: readU16(rom, visitorsCall + 2),
    printScores,
    print: printAt,
    printz: branch(rom, at),
    xyVmMap: xyAt,
    printx: xy.groups[0],
    printy: xy.groups[1],
    disflags: print.groups[0],
    dfng: print.groups[1],
    homeTeam: load.groups[0],
    decompress: load.groups[1],
    doDmaPro: branch(rom, decompress.at + 0x26),
    sflags3: lc.groups[2],
    control: rom[at + 6],
  }
}

// ---------------------------------------------------------------- the code

class Code {
  bytes: number[] = []
  labels = new Map<string, number>()
  fixups: { at: number; label: string; kind: 'short' | 'long' }[] = []
  readonly base: number
  constructor(base: number) {
    this.base = base
  }
  w(...words: number[]) {
    for (const word of words) this.bytes.push((word >> 8) & 0xff, word & 0xff)
    return this
  }
  l(value: number) {
    return this.w((value >>> 16) & 0xffff, value & 0xffff)
  }
  label(name: string) {
    this.labels.set(name, this.bytes.length)
    return this
  }
  // Where a value about to be emitted goes, for reading it back.
  marks = new Map<string, number>()
  mark(name: string) {
    this.marks.set(name, this.bytes.length)
    return this
  }
  // A short branch (bra.s, beq.s ...) to a label.
  short(op: number, label: string) {
    this.bytes.push(op, 0)
    this.fixups.push({ at: this.bytes.length - 1, label, kind: 'short' })
    return this
  }
  // A long address of a label.
  addressOf(label: string) {
    this.fixups.push({ at: this.bytes.length, label, kind: 'long' })
    return this.l(0)
  }
  address(label: string) {
    return this.base + this.labels.get(label)!
  }
  finish(): Uint8Array {
    for (const { at, label, kind } of this.fixups) {
      const to = this.labels.get(label)!
      if (kind === 'short') {
        const distance = to - (at + 1)
        if (distance < -128 || distance > 127 || distance === 0) throw new Error(`branch to ${label}`)
        this.bytes[at] = distance & 0xff
      } else {
        const value = this.base + to
        this.bytes.splice(at, 4, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
      }
    }
    return Uint8Array.from(this.bytes)
  }
}

function assemble(base: number, s: Sites, teamCount: number) {
  const c = new Code(base)
  const visTeam = s.homeTeam + 2
  // In place of movea.w #tmstruct,a2; bsr printscores1_ps: the home team.
  c.label('home').w(0x347c).mark('tmstruct').w(s.tmstruct, 0x3038).mark('homeTeam').w(s.homeTeam, 0x343c, HOME_ATTRIBUTE | FIRST_TILE, 0x7600).short(0x60, 'team')
  // In place of adda.w #tmsize,a2; bsr printscores1_ps: the visitors.
  c.label('visitors').w(0xd4fc).mark('tmsize').w(s.tmsize, 0x3038, visTeam, 0x343c, VISITOR_ATTRIBUTE | (FIRST_TILE + TILES), 0x7604)
  // d0 = team, d2 = first tile word, d3 = 0 home logo, 4 away logo.
  c.label('team').w(0xe748, 0xd043, 0x41f9).addressOf('table').w(0x2230, 0x0000).short(0x66, 'logo')
  c.w(0x4ef9).mark('printScores').l(s.printScores)
  // The logo, 3 x 2 cells, on the row above printy and printy, then the score beside it.
  c.label('logo').w(0x3f38).mark('disflags').w(s.disflags, 0x08f8).mark('dfng').w(s.dfng, s.disflags, 0x5378).mark('printy').w(s.printy, 0x4eb9).mark('xyVmMap').l(s.xyVmMap)
  c.w(0x3082, 0x5242, 0x3082, 0x5242, 0x3082, 0x5242)
  c.w(0x5278, s.printy, 0x4eb9).l(s.xyVmMap)
  c.w(0x3082, 0x5242, 0x3082, 0x5242, 0x3082, 0x5242)
  c.w(0x31df, s.disflags, 0x4ef9).l(s.printScores + 14)

  // In place of jsr DecompressGraphicsPlain in LoadHomeTeamGfx: that, then the two logos to video memory.
  c.label('load').w(0x4eb9).mark('decompress').l(s.decompress).w(0x48e7, 0xc0c0, 0x43f9).addressOf('table')
  c.w(0x3038, s.homeTeam, 0xe748, 0x2231, 0x0000).short(0x67, 'loadVisitors')
  c.w(0x2041, 0x323c, VRAM, 0x7000 | (TILES * TILE) / 2, 0x4eb9).mark('doDmaPro').l(s.doDmaPro)
  c.label('loadVisitors').w(0x43f9).addressOf('table').w(0x3038, visTeam, 0xe748, 0x2231, 0x0004).short(0x67, 'loaded')
  c.w(0x2041, 0x323c, VRAM + TILES * TILE, 0x7000 | (TILES * TILE) / 2, 0x4eb9).l(s.doDmaPro)
  c.label('loaded').w(0x4cdf, 0x0303, 0x4e75)

  // In place of bset #sf3llcs,sflags3 in SetLCmode2: that, then the box's top row blanked.
  c.label('blank').w(0x08f8, 0x0000).mark('sflags3').w(s.sflags3, 0x2f38).mark('printx').w(s.printx, 0x2f38, s.printy + 2, 0x4eb9).mark('printz').l(s.printz)
  c.w(0x000e).mark('control').w((s.control << 8) | 0x17, 0x1540, 0x4040, 0x4040, 0x4040, 0x4000)
  c.w(0x21df, s.printy + 2, 0x21df, s.printx, 0x4e75)

  c.label('table')
  for (let i = 0; i < teamCount * 2; i++) c.l(0)
  const code = c.finish()
  return {
    code,
    marks: c.marks,
    table: c.address('table'),
    home: c.address('home'),
    visitors: c.address('visitors'),
    load: c.address('load'),
    blank: c.address('blank'),
  }
}

// ---------------------------------------------------------------- adding and taking out

const sitesOf = new WeakMap<Uint8Array, Sites | null>()
function sites(rom: Uint8Array): Sites | null {
  if (!sitesOf.has(rom)) sitesOf.set(rom, readSites(rom))
  return sitesOf.get(rom)!
}

export function canAddGenesisScoreLogos(project: RomProject): boolean {
  return project.game.platform !== 'snes' && project.graphicsSupported && sites(project.bytes) !== null
}

// The ROM with the code in and every team given home and away logos made
// from its centre-ice logo.
export function withGenesisScoreLogosAdded(project: RomProject): RomProject {
  const s = sites(project.bytes)
  if (!s) throw new Error('This ROM does not have the code the score logos go into.')
  const teams = project.teams.length
  const size = assemble(0, s, teams).code.length
  const claimed = claimSpace(project.bytes, size)
  if (!claimed) throw new Error(`This ROM has no room left for the score logos.${fullRomReason(project.bytes)}`)
  const rom = claimed.rom
  const built = assemble(claimed.at, s, teams)
  rom.set(built.code, claimed.at)
  rom[s.frameY] = 0x15
  rom[s.frameRows] = 0x07
  rom[s.visitorsY] = 0x17
  const call = (place: number, to: number, nop: boolean) => {
    writeU16(rom, place, 0x4eb9)
    writeU32(rom, place + 2, to)
    if (nop) writeU16(rom, place + 6, 0x4e71)
  }
  call(s.home, built.home, true)
  call(s.visitors, built.visitors, true)
  call(s.load, built.load, false)
  call(s.lineChange, built.blank, false)
  let next: RomProject = { ...project, bytes: rom }
  for (let team = 0; team < teams; team++) {
    const made = genesisScoreLogoFromCentreIce(next, team)
    next = withGenesisScoreLogo(next, team, made)
  }
  return next
}

// Sites for building the code only to see where its values go.
const PROBE: Sites = {
  scoreBox: 0, frameY: 0, frameRows: 0, visitorsY: 0, home: 0, visitors: 0, load: 0, lineChange: 0, tmstruct: 0, tmsize: 0,
  printScores: 0, print: 0, printz: 0, xyVmMap: 0, printx: 0, printy: 0, disflags: 0, dfng: 0, homeTeam: 0, decompress: 0,
  doDmaPro: 0, sflags3: 0, control: 0,
}

// Where the added code is: the home place calls it, and rebuilt where it is it is the same.
interface Added {
  at: number
  size: number
  table: number
  original: Sites
}

const addedOf = new WeakMap<Uint8Array, Added | null>()
function added(rom: Uint8Array, teamCount: number): Added | null {
  if (addedOf.has(rom)) return addedOf.get(rom)!
  addedOf.set(rom, readAdded(rom, teamCount))
  return addedOf.get(rom)!
}

function readAdded(rom: Uint8Array, teamCount: number): Added | null {
  const box = one(rom, SCORE_BOX)
  if (!box || readU16(rom, box.at + 28) !== 0x4eb9) return null
  const at = readU32(rom, box.at + 30)
  if (at + 4 > rom.length || readU16(rom, at) !== 0x347c) return null
  // The original values are those the added code has.
  const load = one(rom, LOAD)
  const lc = one(rom, LINE_CHANGE)
  if (!load || !lc) return null
  if (readU16(rom, load.at + 24) !== 0x4eb9 || readU16(rom, lc.at + 10) !== 0x4eb9) return null
  // Where each value is in the code, from the same code built anywhere.
  const marks = assemble(0, PROBE, 1).marks
  const word = (name: string) => readU16(rom, at + marks.get(name)!)
  const long = (name: string) => readU32(rom, at + marks.get(name)!)
  const s: Sites = {
    scoreBox: box.at,
    frameY: box.at + 8,
    frameRows: box.at + 13,
    visitorsY: box.at + 44,
    home: box.at + 28,
    visitors: box.at + 46,
    load: load.at + 24,
    lineChange: lc.at + 10,
    tmstruct: word('tmstruct'),
    tmsize: word('tmsize'),
    printScores: long('printScores'),
    print: 0,
    printz: long('printz'),
    xyVmMap: long('xyVmMap'),
    printx: word('printx'),
    printy: word('printy'),
    disflags: word('disflags'),
    dfng: word('dfng'),
    homeTeam: word('homeTeam'),
    decompress: long('decompress'),
    doDmaPro: long('doDmaPro'),
    sflags3: word('sflags3'),
    control: rom[at + marks.get('control')!],
  }
  const built = assemble(at, s, teamCount)
  const codeLength = built.table - at
  if (!built.code.subarray(0, codeLength).every((byte, i) => rom[at + i] === byte)) return null
  return { at, size: built.code.length, table: built.table, original: s }
}

// Where the added code's table of each team's two score logos is (8 bytes a
// team), or null where the ROM has none.
export function genesisScoreLogoTable(rom: Uint8Array, teamCount: number): number | null {
  return added(rom, teamCount)?.table ?? null
}
export const SCORE_LOGO_ENTRY = ENTRY

export function hasGenesisScoreLogos(project: RomProject): boolean {
  return project.game.platform !== 'snes' && added(project.bytes, project.teams.length) !== null
}

// The code taken out, and the logos with it: the ROM as it was, but for its size.
export function withGenesisScoreLogosTakenOut(project: RomProject): RomProject {
  const found = added(project.bytes, project.teams.length)
  if (!found) throw new Error('This ROM has no score logos that NOSE4Web added.')
  const rom = project.bytes.slice()
  const s = found.original
  rom[s.frameY] = 0x17
  rom[s.frameRows] = 0x05
  rom[s.visitorsY] = 0x18
  writeU16(rom, s.home, 0x347c)
  writeU16(rom, s.home + 2, s.tmstruct)
  writeU16(rom, s.home + 4, 0x6100)
  writeU16(rom, s.home + 6, (s.printScores - (s.home + 6)) & 0xffff)
  writeU16(rom, s.visitors, 0xd4fc)
  writeU16(rom, s.visitors + 2, s.tmsize)
  writeU16(rom, s.visitors + 4, 0x6100)
  writeU16(rom, s.visitors + 6, (s.printScores - (s.visitors + 6)) & 0xffff)
  writeU16(rom, s.load, 0x4eb9)
  writeU32(rom, s.load + 2, s.decompress)
  writeU16(rom, s.lineChange, 0x08f8)
  writeU16(rom, s.lineChange + 2, 0)
  writeU16(rom, s.lineChange + 4, s.sflags3)
  const parts = [{ start: found.at, end: found.at + found.size }]
  for (let team = 0; team < project.teams.length * 2; team++) {
    const tiles = readU32(rom, found.table + team * 4)
    if (tiles) parts.push({ start: tiles, end: tiles + TILES * TILE })
  }
  releaseSpace(rom, parts)
  return { ...project, bytes: rom }
}

// ---------------------------------------------------------------- the logos

export interface GenesisScoreLogo {
  // In the home colours (the team's palette 0-15) and the away colours (16-31).
  home: Picture
  away: Picture
}

function decode(rom: Uint8Array, at: number): Picture {
  const picture: Picture = { ...GENESIS_SCORE_LOGO, pixels: new Uint8Array(GENESIS_SCORE_LOGO.width * GENESIS_SCORE_LOGO.height) }
  for (let tile = 0; tile < TILES; tile++) {
    const [left, top] = [(tile % 3) * 8, Math.floor(tile / 3) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const byte = rom[at + tile * TILE + y * 4 + (x >> 1)]
        picture.pixels[(top + y) * GENESIS_SCORE_LOGO.width + left + x] = x & 1 ? byte & 15 : byte >> 4
      }
    }
  }
  return picture
}

function encode(picture: Picture): Uint8Array {
  const out = new Uint8Array(TILES * TILE)
  for (let tile = 0; tile < TILES; tile++) {
    const [left, top] = [(tile % 3) * 8, Math.floor(tile / 3) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x += 2) {
        const pixel = (dx: number) => picture.pixels[(top + y) * GENESIS_SCORE_LOGO.width + left + x + dx] & 15
        out[tile * TILE + y * 4 + (x >> 1)] = (pixel(0) << 4) | pixel(1)
      }
    }
  }
  return out
}

// A team's logos, or null for one that shows its letters.
export function genesisScoreLogo(project: RomProject, team: number): GenesisScoreLogo | null {
  const found = added(project.bytes, project.teams.length)
  if (!found) return null
  const [home, away] = [readU32(project.bytes, found.table + team * ENTRY), readU32(project.bytes, found.table + team * ENTRY + 4)]
  if (!home || !away) return null
  return { home: decode(project.bytes, home), away: decode(project.bytes, away) }
}

// A team's logos set, each where it was if it had one, else at the end of the ROM.
export function withGenesisScoreLogo(project: RomProject, team: number, logo: GenesisScoreLogo): RomProject {
  const found = added(project.bytes, project.teams.length)
  if (!found) throw new Error('This ROM has no score logos.')
  let rom: Uint8Array = project.bytes.slice()
  for (const [slot, picture] of [[0, logo.home], [4, logo.away]] as const) {
    const entry = found.table + team * ENTRY + slot
    let at = readU32(rom, entry)
    if (!at) {
      const claimed = claimSpace(rom, TILES * TILE)
      if (!claimed) throw new Error(`This ROM has no room left for this score logo.${fullRomReason(rom)}`)
      rom = claimed.rom
      at = claimed.at
      writeU32(rom, entry, at)
    }
    rom.set(encode(picture), at)
  }
  return { ...project, bytes: rom }
}

// A team shown by its letters: its logos' room freed, its entry emptied.
export function withoutGenesisScoreLogo(project: RomProject, team: number): RomProject {
  const found = added(project.bytes, project.teams.length)
  if (!found) throw new Error('This ROM has no score logos.')
  const rom = project.bytes.slice()
  const parts = []
  for (const slot of [0, 4]) {
    const at = readU32(rom, found.table + team * ENTRY + slot)
    if (at) parts.push({ start: at, end: at + TILES * TILE })
    writeU32(rom, found.table + team * ENTRY + slot, 0)
  }
  releaseSpace(rom, parts)
  return { ...project, bytes: rom }
}

// The away logo from the home one: each colour matched to the nearest of the away colours.
export function awayFromHome(home: Picture, palette: number[]): Picture {
  const rgb = palette.map((word) => colorRgb(word))
  const away = (p: number) => {
    if (p === SCORE_BACKGROUND) return 16 + SCORE_BACKGROUND
    let best = 17
    for (let k = 17; k < 32; k++) {
      const d = (i: number) => (rgb[i][0] - rgb[p][0]) ** 2 + (rgb[i][1] - rgb[p][1]) ** 2 + (rgb[i][2] - rgb[p][2]) ** 2
      if (d(k) < d(best)) best = k
    }
    return best - 16
  }
  return { ...home, pixels: Uint8Array.from(home.pixels, away) }
}

// The logos from an image 24 wide and 13 or 16 high: each pixel the nearest
// of the home colours (and then the away colours), see-through pixels the background.
export function genesisScoreLogoFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, palette: number[]): GenesisScoreLogo {
  if (width !== GENESIS_SCORE_LOGO.width || (height !== GENESIS_SCORE_LOGO.height && height !== GENESIS_SCORE_LOGO_ROWS)) {
    throw new Error(
      `A score logo is imported as a picture ${GENESIS_SCORE_LOGO.width} pixels wide and ${GENESIS_SCORE_LOGO.height} high (or ${GENESIS_SCORE_LOGO_ROWS}), as the editor exports it; this one is ${width} by ${height}.`,
    )
  }
  const rgb = palette.slice(0, 16).map((word) => colorRgb(word))
  const pixels = new Uint8Array(GENESIS_SCORE_LOGO.width * GENESIS_SCORE_LOGO.height).fill(SCORE_BACKGROUND)
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    let best = 1
    for (let k = 1; k < 16; k++) {
      const d = (j: number) => (rgb[j][0] - rgba[i * 4]) ** 2 + (rgb[j][1] - rgba[i * 4 + 1]) ** 2 + (rgb[j][2] - rgba[i * 4 + 2]) ** 2
      if (d(k) < d(best)) best = k
    }
    pixels[i] = best
  }
  const home = { ...GENESIS_SCORE_LOGO, pixels }
  return { home, away: awayFromHome(home, palette) }
}

// A team's logos made from its centre-ice logo, which is drawn in its home
// colours: fitted into 22 by 11 pixels keeping its shape, each pixel the
// colour of what it covers nearest their mix, on the black background.
export function genesisScoreLogoFromCentreIce(project: RomProject, team: number): GenesisScoreLogo {
  const palette = project.teams[team].palette
  const blank = () => ({ ...GENESIS_SCORE_LOGO, pixels: new Uint8Array(GENESIS_SCORE_LOGO.width * GENESIS_SCORE_LOGO.height).fill(SCORE_BACKGROUND) })
  let big: Picture
  try {
    big = rinkLogo(project, team)
  } catch {
    const home = blank()
    return { home, away: awayFromHome(home, palette) }
  }
  const rgb = palette.slice(0, 16).map((word) => colorRgb(word))
  // Left out where there is another: the logo's in-between shades (as for
  // the SNES), and the colours every team's uniform has the same, such as the
  // skin tones, which a centre-ice logo uses at its edges and which stand out
  // on the black box (Match Viewer).
  const inBetween = inBetweenShades(big, rgb)
  for (let slot = 1; slot < 16; slot++) {
    if (project.teams.length > 1 && project.teams.every((other) => other.palette[slot] === palette[slot])) inBetween.add(slot)
  }
  const solid: [number, number][] = []
  for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) if (big.pixels[y * big.width + x]) solid.push([x, y])
  const home = blank()
  if (solid.length > 0) {
    const [left, top] = [Math.min(...solid.map(([x]) => x)), Math.min(...solid.map(([, y]) => y))]
    const [w, h] = [Math.max(...solid.map(([x]) => x)) - left + 1, Math.max(...solid.map(([, y]) => y)) - top + 1]
    const scale = Math.max(w / (GENESIS_SCORE_LOGO.width - 2), h / (GENESIS_SCORE_LOGO_ROWS - 2))
    const [cols, rows] = [Math.max(1, Math.round(w / scale)), Math.max(1, Math.round(h / scale))]
    const [ox, oy] = [Math.floor((GENESIS_SCORE_LOGO.width - cols) / 2), Math.floor((GENESIS_SCORE_LOGO_ROWS - rows) / 2)]
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const uses = new Map<number, number>()
        let [drawn, count] = [0, 0]
        for (let sy = Math.floor(y * scale); sy < Math.max(Math.floor(y * scale) + 1, Math.floor((y + 1) * scale)); sy++) {
          for (let sx = Math.floor(x * scale); sx < Math.max(Math.floor(x * scale) + 1, Math.floor((x + 1) * scale)); sx++) {
            count++
            const p = sx < w && sy < h ? big.pixels[(top + sy) * big.width + left + sx] : 0
            if (!p) continue
            drawn++
            uses.set(p, (uses.get(p) ?? 0) + 1)
          }
        }
        if (drawn * 2 < count) continue
        const mix = [0, 1, 2].map((k) => [...uses].reduce((sum, [p, n]) => sum + rgb[p][k] * n, 0) / drawn)
        const distance = (p: number) => rgb[p].reduce((sum, v, k) => sum + (v - mix[k]) ** 2, 0)
        const main = [...uses.keys()].filter((p) => !inBetween.has(p))
        home.pixels[(oy + y) * GENESIS_SCORE_LOGO.width + ox + x] = (main.length > 0 ? main : [...uses.keys()]).sort((a, b) => distance(a) - distance(b))[0]
      }
    }
  }
  return { home, away: awayFromHome(home, palette) }
}
