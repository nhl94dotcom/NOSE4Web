import { CLOCKWISE_GAPS, CLOCKWISE_LENGTHS, CLOCKWISE_ORIGINAL, CLOCKWISE_PATCHED } from './clockwisedata'

// Clockwise's sprite edit for NHL 94 on the Genesis, his IPS patch from the
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

// On where no record has the original game's bytes and at least one has
// Clockwise's; off otherwise, so that turning it on finishes a ROM that has
// part of it. Undefined only where the ROM is too short to hold the tiles.
export function clockwiseState(rom: Uint8Array): boolean | undefined {
  if (rom.length < end()) return undefined
  let patched = false
  for (const r of spriteRecords()) {
    if (is(rom, r.at, r.original)) return false
    if (!patched && is(rom, r.at, r.patched)) patched = true
  }
  return patched
}

// Clockwise's bytes in each record that has the original game's.
export function putClockwise(rom: Uint8Array): void {
  for (const r of spriteRecords()) if (is(rom, r.at, r.original)) rom.set(r.patched, r.at)
}

// The original game's bytes back in each record that has Clockwise's.
export function takeOutClockwise(rom: Uint8Array): void {
  for (const r of spriteRecords()) if (is(rom, r.at, r.patched)) rom.set(r.original, r.at)
}
