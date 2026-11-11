import { readU16, readU32, writeU16, writeU32 } from './bytes'
import { find, one } from './genesisscorelogos'
import type { RomProject } from './rom'
import { claimSpace, fullRomReason, releaseSpace } from './space'

// Head bleeding for the Genesis game, an idea from NHLPA '93: in '93 a player
// hurt by a check lies on the ice with blood spreading from his head, drawn as
// small sprite pieces in the arena colours over his lying frames. NHL '94 kept
// the frames and took the blood out. Here a player hurt for the game bleeds:
// '94 has him fall and lie still (SPAinjuryfall, which only a game injury keeps;
// a period injury goes on to SPAinjury1), and this gives the lying frame two
// new versions, a little blood as he lands and more after half a second. A
// player out for the period lies as before, without blood.
//
// The blood is NOSE4Web's own drawing, after '93's: the same size and place,
// in the same two arena colours (13 and 14 of the arena palette, the dark reds
// $04A and $006 in the original game).
//
// From the disassembly (abdulahmad/NHL94Genesis):
//   - addframe2 finds the frame table from the sprite header (Sprites): a long
//     at +4 is the table's offset from the header, and the tiles start at +10.
//     A frame's pieces are at the table plus its word (signed); how many there
//     are comes from the next frame's word, so a frame's pieces end where the
//     next frame's begin. A piece is x, y, tile (signed, from the tiles) and
//     attributes, 8 bytes.
//   - Frames 369-372 are empty, one piece each, used by no animation (they
//     were '93's fight frames).
//   - SPAinjuryfall's two lists: fallback, fallback + 1, fallback + 2 for 30
//     sixtieths, then fallback + 2 held; and the same from fallback + 16 for
//     the other directions.
//   - GetHot reads a hot spot byte pair per frame from HotList.
//   - addframe2 takes a piece's tile as a signed word (ext.l d2; asl.l #5,d2;
//     addi.l #Spritetiles,d2), so it reaches only tiles within 1 MB after the
//     sprite tiles, up to $15DE64, and league ROMs have no room left there.
//     That becomes mulu.w #32,d2, the same 4 bytes, which takes it unsigned
//     and so reaches all of a 2 MB ROM. Every tile the game has is a positive
//     number, which both read alike.
// There is no room near the frame table to add pieces, so the table and all
// its pieces are copied to room at the end of the ROM, the new frames' pieces
// with them, and the header points there. The old table is left as it was.

// addframe2: move.w frame(a3),d4; andi.w #$7FF,d4; movea.l #Sprites,a2;
// adda.l 4(a2),a2; add.w d4,d4; cmp.w 2(a2),d4.
const ADDFRAME = '382b.... 024407ff 247c(........) d5ea0004 d844 b86a0002'
// GetHot: tst.w frame(a0); ble.w .ex; movea.l #HotList,a1; move.w frame(a0),d0.
const GET_HOT = '4a68.... 6f00.... 227c(........) 3028'
// SPAinjuryfall's lists, with the lying frames as groups.
const FALL_LISTS = '0111 0006 0112 0006 (....) 001e (....) fc00 0121 0006 0122 0006 (....) 001e (....) fc00'
const LYING = [0x113, 0x123]
// addframe2: add.w VRchar(a3),d3; ext.l d2; asl.l #5,d2 (or mulu.w #32,d2);
// addi.l #Spritetiles,d2; asl.w #4,d4; asl.w #5,d3; move.l d2,(a5)+.
const TILE_CODE = 'd66b.... (........) 0682(........) e944eb432ac2'
const SIGNED = 0x48c2eb82
const UNSIGNED = 0xc4fc0020
// The new frames: per list, a little blood, then more.
const SLOTS = [369, 370, 371, 372]
const MARK = 'NOSEBLD1'
// After the mark: the old table's offset, the slots' old hot spots, where the
// added room starts and ends, and the tile code as it was.
const HEADER = 8 + 4 + 8 + 4 + 4 + 4
const TILE = 32
const PIECE = 8

// '#' arena colour 14, 'o' colour 13. Each 8 pixels high, columns of tiles.
const ART: { x: number; y: number; rows: string[] }[] = [
  // Lying with his head below: a little, then more.
  {
    x: -8,
    y: 5,
    rows: ['................', '.......##.......', '......####o.....', '.....o#####o....', '......####oo#...', '.......o###.....', '.........#......', '................'],
  },
  {
    x: -11,
    y: 6,
    rows: [
      '........................',
      '.........##.....#.......',
      '.......#######o###......',
      '......o##########o#o....',
      '.......o##o#########o...',
      '.........###o####o......',
      '...........o###.........',
      '........................',
    ],
  },
  // Lying with his head above.
  {
    x: -6,
    y: -16,
    rows: ['................', '........#.......', '......o###......', '.....####o#.....', '......o####.....', '.......o##......', '................', '................'],
  },
  {
    x: -3,
    y: -16,
    rows: ['.....#....##....', '....####o####...', '...o#########o..', '....o##########.', '.....###o####o..', '......o####.....', '.......o##......', '................'],
  },
]

function artTiles(rows: string[]): Uint8Array {
  const columns = rows[0].length / 8
  const out = new Uint8Array(columns * TILE)
  for (let column = 0; column < columns; column++) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = rows[y][column * 8 + x]
        const v = c === '#' ? 13 : c === 'o' ? 12 : 0
        out[column * TILE + y * 4 + (x >> 1)] |= x % 2 === 0 ? v << 4 : v
      }
    }
  }
  return out
}

interface Sites {
  sprites: number
  // Where ext.l / asl.l or mulu.w is, and the sprite tiles.
  tileCode: number
  spriteTiles: number
  hotList: number
  fallLists: number
}

// updateanim's movea.l #SPAList,a0 at $AEFA, which the fighting patch points
// at its own copy of the animation lists, leaving the original's in place.
const SPA_LIST_AT = 0xaefa
const SPA_LIST_BYTES = 0x2000

// SPAinjuryfall's lists: the one place, or where there are two (the fighting
// patch's copy and the original's), the one in the lists the game reads.
function fallLists(rom: Uint8Array): { at: number } | null {
  const all = find(rom, FALL_LISTS)
  if (all.length === 1) return all[0]
  if (rom.length < SPA_LIST_AT + 6 || readU16(rom, SPA_LIST_AT) !== 0x207c) return null
  const lists = readU32(rom, SPA_LIST_AT + 2)
  const used = all.filter((f) => f.at >= lists && f.at < lists + SPA_LIST_BYTES)
  return used.length === 1 ? used[0] : null
}

function readSites(rom: Uint8Array): Sites | null {
  const add = one(rom, ADDFRAME)
  const hot = one(rom, GET_HOT)
  const fall = fallLists(rom)
  const tile = one(rom, TILE_CODE)
  if (!add || !hot || !fall || !tile) return null
  if (tile.groups[0] !== SIGNED && tile.groups[0] !== UNSIGNED) return null
  const sprites = add.groups[0]
  if (sprites + 10 > rom.length || hot.groups[0] >= rom.length || tile.groups[1] !== sprites + 10) return null
  return { sprites, tileCode: tile.at + 4, spriteTiles: tile.groups[1], hotList: hot.groups[0], fallLists: fall.at }
}

const tableOf = (rom: Uint8Array, s: Sites) => s.sprites + readU32(rom, s.sprites + 4)
const frameCount = (rom: Uint8Array, table: number) => readU16(rom, table + 2) / 2
const offset = (rom: Uint8Array, table: number, frame: number) => (readU16(rom, table + frame * 2) << 16) >> 16

function pieces(rom: Uint8Array, table: number, frame: number): Uint8Array {
  const from = table + offset(rom, table, frame)
  return rom.slice(from, table + offset(rom, table, frame + 1))
}

function readState(rom: Uint8Array): { sites: Sites; added: { header: number; start: number; end: number } | null } | null {
  // end: where the room taken ends.
  const s = readSites(rom)
  if (!s) return null
  const lying = [readU16(rom, s.fallLists + 8), readU16(rom, s.fallLists + 12), readU16(rom, s.fallLists + 24), readU16(rom, s.fallLists + 28)]
  const table = tableOf(rom, s)
  if (table < 0 || table + 4 > rom.length) return null
  if (lying[0] === LYING[0] && lying[1] === LYING[0] && lying[2] === LYING[1] && lying[3] === LYING[1]) {
    // As the game has it: the new frames' places must be empty.
    const count = frameCount(rom, table)
    if (count <= SLOTS[SLOTS.length - 1] + 1) return null
    if (!SLOTS.every((frame) => offset(rom, table, frame + 1) - offset(rom, table, frame) === PIECE)) return null
    // No tile is a negative number, which the unsigned read would take elsewhere.
    for (let frame = 1; frame < count - 1; frame++) {
      const list = pieces(rom, table, frame)
      for (let at = 0; at + PIECE <= list.length; at += PIECE) if (list[at + 4] & 0x80) return null
    }
    return { sites: s, added: null }
  }
  if (lying.join() !== SLOTS.join() || readU32(rom, s.tileCode) !== UNSIGNED) return null
  const header = table - HEADER
  if (header < 0 || String.fromCharCode(...rom.subarray(header, header + 8)) !== MARK) return null
  const start = readU32(rom, header + 20)
  const end = readU32(rom, header + 24)
  if (start > header || end < table || end > rom.length) return null
  return { sites: s, added: { header, start, end } }
}

const stateOf = new WeakMap<Uint8Array, ReturnType<typeof readState>>()
function state(rom: Uint8Array) {
  if (!stateOf.has(rom)) stateOf.set(rom, readState(rom))
  return stateOf.get(rom)!
}

export function canAddGenesisBlood(project: RomProject): boolean {
  if (project.game.platform === 'snes') return false
  const s = state(project.bytes)
  return s !== null && s.added === null
}

export function hasGenesisBlood(project: RomProject): boolean {
  return project.game.platform !== 'snes' && state(project.bytes)?.added != null
}

export function withGenesisBloodAdded(project: RomProject): RomProject {
  if (!canAddGenesisBlood(project)) throw new Error('This ROM does not have the frames and animation that head bleeding goes into.')
  return { ...project, bytes: bloodAdded(project.bytes) }
}

// Whether a Genesis ROM has the head bleeding NOSE4Web adds.
export const bloodIn = (rom: Uint8Array) => state(rom)?.added != null
// For the Hacks page: whether it is in, or undefined where the ROM lacks the frames and animation it goes into.
export const bloodChoice = (rom: Uint8Array): boolean | undefined => {
  const found = state(rom)
  return found === null ? undefined : found.added !== null
}

// The ROM with head bleeding added.
export function bloodAdded(rom0: Uint8Array): Uint8Array {
  const found = state(rom0)
  if (!found || found.added) throw new Error('This ROM does not have the frames and animation that head bleeding goes into.')
  const s = found.sites
  const table = tableOf(rom0, s)
  const count = frameCount(rom0, table)
  const tiles = ART.map((art) => artTiles(art.rows))
  const tileBytes = tiles.reduce((sum, t) => sum + t.length, 0)
  // The new frames: the blood first, so that it shows over him, then the lying frame's own pieces.
  const lyingFrames = [LYING[0], LYING[0], LYING[1], LYING[1]]
  const lists = new Map<number, Uint8Array>()
  // Tile numbers are filled in once the room is known.
  const build = (firstTile: number) => {
    let tile = firstTile
    SLOTS.forEach((frame, i) => {
      const art = ART[i]
      const own = pieces(rom0, table, lyingFrames[i])
      const list = new Uint8Array(PIECE + own.length)
      writeU16(list, 0, art.x & 0xffff)
      writeU16(list, 2, art.y & 0xffff)
      writeU16(list, 4, tile)
      writeU16(list, 6, 0x2000 | ((art.rows[0].length / 8 - 1) << 2)) // arena colours, 8 high
      list.set(own, PIECE)
      lists.set(frame, list)
      tile += tiles[i].length / TILE
    })
  }
  build(0)
  const listBytes = (frame: number) => lists.get(frame) ?? pieces(rom0, table, frame)
  let piecesSize = 0
  for (let frame = 1; frame < count - 1; frame++) piecesSize += listBytes(frame).length
  const tableSize = count * 2
  // Room: up to 31 bytes to line the tiles up with the sprite tiles, the tiles, the header, the table, the pieces.
  const size = TILE - 1 + tileBytes + HEADER + tableSize + piecesSize
  const claimed = claimSpace(rom0, size)
  if (!claimed) throw new Error(`This ROM has no room left for head bleeding.${fullRomReason(rom0)}`)
  const rom = claimed.rom
  const spriteTiles = s.spriteTiles
  const tilesAt = claimed.at + ((((spriteTiles - claimed.at) % TILE) + TILE) % TILE)
  const firstTile = (tilesAt - spriteTiles) / TILE
  if (firstTile + tileBytes / TILE > 0xffff) throw new Error('The room at the end of this ROM is too far from the sprite tiles for the game to reach.')
  build(firstTile)
  let at = tilesAt
  for (const t of tiles) {
    rom.set(t, at)
    at += t.length
  }
  const header = at
  const newTable = header + HEADER
  for (let i = 0; i < 8; i++) rom[header + i] = MARK.charCodeAt(i)
  writeU32(rom, header + 8, readU32(rom0, s.sprites + 4))
  SLOTS.forEach((frame, i) => writeU16(rom, header + 12 + i * 2, readU16(rom0, s.hotList + frame * 2)))
  writeU32(rom, header + 20, claimed.at)
  writeU32(rom, header + 24, claimed.at + size)
  writeU32(rom, header + 28, readU32(rom0, s.tileCode))
  // The table: frame 0 is the table itself, as in the game's.
  let next = tableSize
  writeU16(rom, newTable, 0)
  for (let frame = 1; frame < count; frame++) {
    if (next > 0x7fff) throw new Error('The frame table would be too large for the game to read.')
    writeU16(rom, newTable + frame * 2, next)
    if (frame < count - 1) {
      const list = listBytes(frame)
      rom.set(list, newTable + next)
      next += list.length
    }
  }
  writeU32(rom, s.sprites + 4, newTable - s.sprites)
  writeU32(rom, s.tileCode, UNSIGNED)
  // Hot spots as the lying frames have them, and the fall's lying frames replaced.
  SLOTS.forEach((frame, i) => writeU16(rom, s.hotList + frame * 2, readU16(rom0, s.hotList + lyingFrames[i] * 2)))
  writeU16(rom, s.fallLists + 8, SLOTS[0])
  writeU16(rom, s.fallLists + 12, SLOTS[1])
  writeU16(rom, s.fallLists + 24, SLOTS[2])
  writeU16(rom, s.fallLists + 28, SLOTS[3])
  return rom
}

// Taken out: the game as it was, but for the ROM's size.
export function withGenesisBloodTakenOut(project: RomProject): RomProject {
  return { ...project, bytes: bloodTakenOut(project.bytes) }
}

// The ROM with the head bleeding NOSE4Web added taken out.
export function bloodTakenOut(rom0: Uint8Array): Uint8Array {
  const found = state(rom0)
  if (!found?.added) throw new Error('This ROM has no head bleeding that NOSE4Web added.')
  const { sites: s, added } = found
  const rom = rom0.slice()
  writeU32(rom, s.sprites + 4, readU32(rom, added.header + 8))
  writeU32(rom, s.tileCode, readU32(rom, added.header + 28))
  SLOTS.forEach((frame, i) => writeU16(rom, s.hotList + frame * 2, readU16(rom, added.header + 12 + i * 2)))
  writeU16(rom, s.fallLists + 8, LYING[0])
  writeU16(rom, s.fallLists + 12, LYING[0])
  writeU16(rom, s.fallLists + 24, LYING[1])
  writeU16(rom, s.fallLists + 28, LYING[1])
  // What was written: up to the end of the copied pieces. The room taken may
  // run a few bytes further, unused, where something added later may begin.
  const table = added.header + HEADER
  const written = table + offset(rom, table, frameCount(rom, table) - 1)
  // NOSE's end mark, where adding moved it to follow the room and nothing follows it, goes back.
  releaseSpace(rom, [{ start: added.start, end: written }])
  return rom
}
