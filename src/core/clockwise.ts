import { CLOCKWISE_GAPS, CLOCKWISE_LENGTHS, CLOCKWISE_ORIGINAL, CLOCKWISE_PATCHED } from './clockwisedata'
import { fightState } from './fight'
import { unpackTiles } from './genesisunpack'
import { FACEOFF_PACKED_TAPE, FACEOFF_PACKED_TAPE_FIRST, FACEOFF_TAPE, FACEOFF_TAPE_FIRST, FIGHT_TAPE, SPRITE_TAPE, type Tape } from './tapedata'

// Clockwise's sprite edit for NHL 94 on the Genesis, Clockwise's IPS patch from the
// NHL94 forum: touch-ups to the players' sprite tiles (stick tape, eye colour
// and other small details), pixels only, in the tiles from Spritetiles
// ($5DE84 in the original game) on. See clockwisedata.ts.
//
// Many league ROMs have some or all of it already, and some have redrawn a
// few of the same tiles themselves. So each of its records is taken alone:
// putting it in changes a record only where the ROM has the original game's
// bytes, and taking it out changes one back only where the ROM has Clockwise's.
// A record with neither is the league's own art and is left as it is.
//
// The fighting patch (fight.ts) keeps these tiles where they are (its frames
// and the sprites' colours go elsewhere), head bleeding adds its tiles at the
// end of the ROM and the goalie stick fix changes HotList, so none of them
// touches these bytes.
//
// NOSE4Web adds touch-ups of its own in the same style, below: tape in the
// frames Clockwise left untaped, in the faceoff close-up, and in chaos's fight
// frames where the fighting patch is in.

interface SpriteRecord {
  at: number
  original: Uint8Array
  patched: Uint8Array
}

const decode = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
let records: SpriteRecord[] | null = null
function spriteRecords(): SpriteRecord[] {
  if (records) return records
  const [original, patched] = [decode(CLOCKWISE_ORIGINAL), decode(CLOCKWISE_PATCHED)]
  const out: SpriteRecord[] = []
  let at = 0
  let from = 0
  CLOCKWISE_GAPS.forEach((gap, i) => {
    at += gap
    const length = CLOCKWISE_LENGTHS[i]
    out.push({ at, original: original.subarray(from, from + length), patched: patched.subarray(from, from + length) })
    at += length
    from += length
  })
  records = out
  return out
}

// Where the last record ends.
const end = () => {
  const last = spriteRecords().at(-1)!
  return last.at + last.original.length
}

const is = (rom: Uint8Array, at: number, bytes: Uint8Array) => bytes.every((byte, i) => rom[at + i] === byte)

// The records, as the editor reads them (for the tests and Compare ROMs).
export function clockwiseRecords(): readonly SpriteRecord[] {
  return spriteRecords()
}

// The records the edit leaves alone: those in a sprite tile the league has
// redrawn itself, where some record has neither the original game's bytes nor
// Clockwise's. Left alone both ways: CDL Season 12's own nets have, in tile
// 3886, 3 bytes that are Clockwise's too, which taking the edit out turned
// into the original game's, in the middle of CDL's net (Match Viewer).
const SPRITE_TILES = 0x5de84
const tilesOf = (r: SpriteRecord) => {
  const first = Math.floor((r.at - SPRITE_TILES) / 32)
  const last = Math.floor((r.at + r.original.length - 1 - SPRITE_TILES) / 32)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}
function used(rom: Uint8Array): SpriteRecord[] {
  const own = new Set<number>()
  for (const r of spriteRecords()) if (!is(rom, r.at, r.original) && !is(rom, r.at, r.patched)) for (const tile of tilesOf(r)) own.add(tile)
  return own.size === 0 ? spriteRecords() : spriteRecords().filter((r) => !tilesOf(r).some((tile) => own.has(tile)))
}

// On where no record it uses has the original game's bytes and at least one
// has Clockwise's; off otherwise, so that turning it on finishes a ROM that
// has part of it. Undefined only where the ROM is too short to hold the tiles.
export function clockwiseState(rom: Uint8Array): boolean | undefined {
  if (rom.length < end()) return undefined
  let patched = false
  for (const r of used(rom)) {
    if (is(rom, r.at, r.original)) return false
    if (!patched && is(rom, r.at, r.patched)) patched = true
  }
  return patched
}

// Where a ROM already had some of Clockwise's records before the edit went in
// (several league ROMs have most of it: NHL2008, nhl94juiced), taking the edit
// out must leave those as they were. So putting it in then gives back a block to
// keep in the ROM: a mark and one bit per record, set for each that had
// Clockwise's bytes before. A ROM that had none needs no block.
const KEPT_MARK = Uint8Array.from('NOSECLW1', (char) => char.charCodeAt(0))
const keptLength = () => KEPT_MARK.length + Math.ceil(spriteRecords().length / 8)
// The block, if the ROM has one: where it is and its bits.
export function clockwiseKept(rom: Uint8Array): { at: number; length: number; had: Uint8Array } | null {
  const length = keptLength()
  let found: number | null = null
  for (let at = rom.indexOf(KEPT_MARK[0]); at >= 0 && at + length <= rom.length; at = rom.indexOf(KEPT_MARK[0], at + 1)) {
    if (!is(rom, at, KEPT_MARK)) continue
    if (found !== null) return null
    found = at
  }
  return found === null ? null : { at: found, length, had: rom.slice(found + KEPT_MARK.length, found + length) }
}
const bit = (bits: Uint8Array, i: number) => (bits[i >> 3] >> (i & 7)) & 1

// Clockwise's bytes in each record it uses that has the original game's, and
// NOSE4Web's tape in the faceoff close-up (the fight frames' goes in after the
// fighting patch: putFightTape). Gives back the block to keep (above), or null.
export function putClockwise(rom: Uint8Array): Uint8Array | null {
  const all = spriteRecords()
  const uses = new Set(used(rom))
  const kept = new Uint8Array(keptLength())
  kept.set(KEPT_MARK)
  let any = false
  all.forEach((r, i) => {
    if (!uses.has(r)) return
    if (is(rom, r.at, r.original)) rom.set(r.patched, r.at)
    else if (is(rom, r.at, r.patched)) {
      kept[KEPT_MARK.length + (i >> 3)] |= 1 << (i & 7)
      any = true
    }
  })
  putSpriteTape(rom)
  putFaceoffTape(rom)
  return any ? kept : null
}

// The original game's bytes back in each record it uses that has Clockwise's (but for those the block says the
// ROM had before), and the faceoff close-up's.
export function takeOutClockwise(rom: Uint8Array, had?: Uint8Array): void {
  const uses = new Set(used(rom))
  spriteRecords().forEach((r, i) => {
    if (uses.has(r) && is(rom, r.at, r.patched) && !(had && bit(had, i))) rom.set(r.original, r.at)
  })
  takeOutSpriteTape(rom)
  takeOutFaceoffTape(rom)
}

// ---------------------------------------------------- NOSE4Web's additions
// NOSE4Web's touch-ups in Clockwise's style (tapedata.ts), which go in and out
// with Clockwise's: tape and eyes in sprite frames they left untaped, tape on the
// sticks in the faceoff close-up, and in the fight frames of chaos's fighting
// patch with the eye of the overhand punch.
// They do not change whether the edit reads on (clockwiseState), so a ROM made
// before they were added gets them when its hacks are next put in.

interface Touch {
  at: number
  original: Uint8Array
  patched: Uint8Array
}
const hex = (text: string) => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
const touches = (tapes: readonly Tape[]): Touch[] => tapes.map(([at, original, patched]) => ({ at, original: hex(original), patched: hex(patched) }))
interface Tapes {
  sprite: Touch[]
  fight: Touch[]
  faceoff: Touch[]
  packed: Touch[]
  // The first faceoff tape's (tapedata.ts), to take out.
  firstFaceoff: Touch[]
  firstPacked: Touch[]
}
let tape: Tapes | null = null
const tapes = (): Tapes =>
  (tape ??= {
    sprite: touches(SPRITE_TAPE),
    fight: touches(FIGHT_TAPE),
    faceoff: touches(FACEOFF_TAPE),
    packed: touches(FACEOFF_PACKED_TAPE),
    firstFaceoff: touches(FACEOFF_TAPE_FIRST),
    firstPacked: touches(FACEOFF_PACKED_TAPE_FIRST),
  })
const fits = (rom: Uint8Array, at: number, bytes: Uint8Array) => at >= 0 && at + bytes.length <= rom.length && is(rom, at, bytes)

// Each alone, as Clockwise's records: in where the ROM has the bytes before, out where it has the tape's.
const putEach = (rom: Uint8Array, list: Touch[], base = 0) => {
  for (const t of list) if (fits(rom, base + t.at, t.original)) rom.set(t.patched, base + t.at)
}
const takeOutEach = (rom: Uint8Array, list: Touch[], base = 0) => {
  for (const t of list) if (fits(rom, base + t.at, t.patched)) rom.set(t.original, base + t.at)
}

// The untaped frames' tape, in the sprite tiles as Clockwise's records are, and like them each alone, leaving
// alone any tile a league has redrawn (where one of Clockwise's records or one of these has neither its bytes before
// nor after). And only where the ROM has the sprite tiles where the original game does (at least half of Clockwise's
// records with their bytes or the original game's), as a ROM with other things there could match a few by chance.
const tileSpan = (at: number, length: number) => {
  const first = Math.floor((at - SPRITE_TILES) / 32)
  const last = Math.floor((at + length - 1 - SPRITE_TILES) / 32)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}
function spriteTapeUsed(rom: Uint8Array): Touch[] {
  const all = spriteRecords()
  if (rom.length < end() || all.filter((r) => is(rom, r.at, r.original) || is(rom, r.at, r.patched)).length * 2 < all.length) return []
  const own = new Set<number>()
  for (const r of all) if (!is(rom, r.at, r.original) && !is(rom, r.at, r.patched)) for (const tile of tilesOf(r)) own.add(tile)
  const { sprite } = tapes()
  for (const t of sprite) if (!fits(rom, t.at, t.original) && !fits(rom, t.at, t.patched)) for (const tile of tileSpan(t.at, t.original.length)) own.add(tile)
  return sprite.filter((t) => !tileSpan(t.at, t.original.length).some((tile) => own.has(tile)))
}
const putSpriteTape = (rom: Uint8Array) => putEach(rom, spriteTapeUsed(rom))
const takeOutSpriteTape = (rom: Uint8Array) => takeOutEach(rom, spriteTapeUsed(rom))

// FaceOffSprites, found from checkfo, which draws the close-up:
// movea.l #FaceOffSprites,a2; adda.l 4(a2),a2; add.w d4,d4; move.w 2(a2,d4.w),d5.
// (The tiles are loaded by two movea.l #FaceOffSprites+8,a2 before
// DecompressGraphicsPlain, in the faceoff's setup and ReloadFaceOffTiles; the
// edit changes the tiles where they are, so none of the three moves.) The anim:
// a long at +4, its frames' distance from it; at +8 the tiles' count word
// (bit 15 set where they are packed), the tiles from +10.
const CHECKFO = [0x24, 0x7c, -1, -1, -1, -1, 0xd5, 0xea, 0x00, 0x04, 0xd8, 0x44, 0x3a, 0x32, 0x40, 0x02]
const FACEOFF_TILES = 179
export function faceoffAnim(rom: Uint8Array): number | null {
  let found: number | null = null
  for (let at = rom.indexOf(0xd5, 6); at >= 0; at = rom.indexOf(0xd5, at + 1)) {
    const start = at - 6
    if (start % 2 !== 0 || start + CHECKFO.length > rom.length || !CHECKFO.every((byte, i) => byte < 0 || rom[start + i] === byte)) continue
    if (found !== null) return null
    found = ((rom[start + 2] << 24) | (rom[start + 3] << 16) | (rom[start + 4] << 8) | rom[start + 5]) >>> 0
  }
  return found !== null && found + 10 <= rom.length ? found : null
}

// The close-up's tiles: where they start, and whether they are packed (as the original game has them)
// or plain (as the CDL ROMs do); null where the ROM has other tiles there.
function faceoffSite(rom: Uint8Array): { tiles: number; packed: boolean } | null {
  const anim = faceoffAnim(rom)
  if (anim === null) return null
  const word = (rom[anim + 8] << 8) | rom[anim + 9]
  if (word === (0x8000 | FACEOFF_TILES)) return { tiles: anim + 10, packed: true }
  return word === FACEOFF_TILES ? { tiles: anim + 10, packed: false } : null
}

// Packed, the stream's changes go in all together where it has all of EA's bytes, and only if it then
// unpacks to the taped tiles. The first tape comes out first, where the ROM has it.
function putFaceoffTape(rom: Uint8Array): void {
  const site = faceoffSite(rom)
  if (!site) return
  takeOutFirstFaceoffTape(rom, site)
  const { faceoff, packed } = tapes()
  if (!site.packed) return putEach(rom, faceoff, site.tiles)
  if (!packed.every((t) => fits(rom, site.tiles + t.at, t.original))) return
  const before = rom.slice(site.tiles, site.tiles + packed.at(-1)!.at + packed.at(-1)!.original.length)
  for (const t of packed) rom.set(t.patched, site.tiles + t.at)
  const tiles = unpackTiles(rom, site.tiles - 2)?.tiles
  if (!tiles || !faceoff.every((t) => is(tiles, t.at, t.patched))) rom.set(before, site.tiles)
}

const takeOutAll = (rom: Uint8Array, list: Touch[], base: number) => {
  if (list.every((t) => fits(rom, base + t.at, t.patched))) for (const t of list) rom.set(t.original, base + t.at)
}
// The first tape out: plain, each record of it in full (as the toe-end tape's records sit inside its blades,
// it comes out before the toe-end tape does); packed, its stream changes together.
function takeOutFirstFaceoffTape(rom: Uint8Array, site: { tiles: number; packed: boolean }): void {
  const { firstFaceoff, firstPacked } = tapes()
  if (site.packed) takeOutAll(rom, firstPacked, site.tiles)
  else takeOutEach(rom, firstFaceoff, site.tiles)
}

function takeOutFaceoffTape(rom: Uint8Array): void {
  const site = faceoffSite(rom)
  if (!site) return
  takeOutFirstFaceoffTape(rom, site)
  const { faceoff, packed } = tapes()
  if (!site.packed) return takeOutEach(rom, faceoff, site.tiles)
  takeOutAll(rom, packed, site.tiles)
}

// The fight frames' tape, where the fighting patch is in (it writes the frames at fixed places in the first MB).
const fighting = (rom: Uint8Array) => {
  const state = fightState(rom)
  return state !== undefined && state !== 'none'
}
export function putFightTape(rom: Uint8Array): void {
  if (fighting(rom)) putEach(rom, tapes().fight)
}
export function takeOutFightTape(rom: Uint8Array): void {
  if (fighting(rom)) takeOutEach(rom, tapes().fight)
}

// NOSE4Web's additions, as the editor reads them (for the tests).
export function clockwiseExtras(): Readonly<Tapes> {
  return tapes()
}
