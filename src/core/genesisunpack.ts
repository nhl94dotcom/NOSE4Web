// Unpacking the Genesis game's packed tiles: DecompressGraphics and
// DecompressBytecode (abdulahmad/NHL94Genesis, src/decompress94.asm), which
// the game uses for pictures such as the faceoff close-up.
//
// The data starts with a word: the tile count, with bit 15 set where the
// tiles that follow are packed (otherwise they are plain, 32 bytes a tile).
// The packed stream is bytecode: each opcode's top four bits say what it does,
// written into a 256-byte ring buffer that goes to video memory as it fills:
//   0-1  copy (low 5 bits) + 1 bytes from the stream
//   2    (low 4 bits) + 1 zero bytes
//   3    the next byte (low 4 bits) + 3 times
//   4-7  copy (bits 0-2) + 2 bytes from (bits 3-5) + 1 back
//   8    copy (low 4 bits) + 3 bytes from the next byte back (0 is 256)
//   9    copy (low 4 bits, then the next byte's bit 7) + 3 bytes from (its low 7 bits) + 1 back
//   A    copy (low 4 bits, the next byte's top 2) + 3 from (its low 6 bits) + 1 back
//   B    copy (low 4 bits, the next byte's top 3) + 3 from (its low 5 bits) + 1 back
//   C-D  as 4-7, backwards through what was written: (bits 0-1) + 2 from (bits 2-4) + 1 back
//   E    as 8, backwards; distance 0 ends the stream
//   F    as 9, backwards
// A copy reads the ring buffer as it is being written, so it may overlap.

export interface Unpacked {
  tiles: Uint8Array
  packed: boolean
  // Where the data ends (after the end code, or the last plain tile).
  end: number
}

const TILE = 32

// The tiles of the data at `at` (its count word first); null where it does not unpack to its count's tiles.
export function unpackTiles(rom: Uint8Array, at: number): Unpacked | null {
  if (at + 2 > rom.length) return null
  const word = (rom[at] << 8) | rom[at + 1]
  const count = word & 0x7fff
  const size = count * TILE
  if (!(word & 0x8000)) return at + 2 + size <= rom.length ? { tiles: rom.slice(at + 2, at + 2 + size), packed: false, end: at + 2 + size } : null
  const out = new Uint8Array(size)
  let n = 0
  let i = at + 2
  // Each byte written; false once the stream would write past its tiles.
  const put = (byte: number) => {
    if (n >= size) return false
    out[n++] = byte
    return true
  }
  const copy = (length: number, distance: number, backwards: boolean) => {
    const from = n - distance
    if (from - (backwards ? length - 1 : 0) < 0) return false
    for (let k = 0; k < length; k++) if (!put(out[backwards ? from - k : from + k])) return false
    return true
  }
  for (;;) {
    if (i >= rom.length) return null
    const op = rom[i++]
    const kind = op >> 4
    const next = () => (i < rom.length ? rom[i++] : -1)
    let ok = true
    if (kind <= 1) {
      const length = (op & 0x1f) + 1
      if (i + length > rom.length) return null
      for (let k = 0; k < length && ok; k++) ok = put(rom[i++])
    } else if (kind === 2) {
      for (let k = 0; k <= (op & 15) && ok; k++) ok = put(0)
    } else if (kind === 3) {
      const byte = next()
      if (byte < 0) return null
      for (let k = 0; k < (op & 15) + 3 && ok; k++) ok = put(byte)
    } else if (kind <= 7) {
      ok = copy((op & 7) + 2, ((op >> 3) & 7) + 1, false)
    } else if (kind === 8 || kind === 14) {
      const distance = next()
      if (distance < 0) return null
      if (kind === 14 && distance === 0) return n === size ? { tiles: out, packed: true, end: i } : null
      ok = copy((op & 15) + 3, kind === 8 ? distance || 256 : distance, kind === 14)
    } else if (kind === 9 || kind === 15) {
      const byte = next()
      if (byte < 0) return null
      ok = copy((((op & 15) << 1) | (byte >> 7)) + 3, (byte & 0x7f) + 1, kind === 15)
    } else if (kind === 10 || kind === 11) {
      const byte = next()
      if (byte < 0) return null
      const word2 = (op << 8) | byte
      ok = kind === 10 ? copy(((word2 >> 6) & 0x3f) + 3, (byte & 0x3f) + 1, false) : copy(((word2 >> 5) & 0x7f) + 3, (byte & 0x1f) + 1, false)
    } else {
      ok = copy((op & 3) + 2, ((op >> 2) & 7) + 1, true)
    }
    if (!ok) return null
  }
}
