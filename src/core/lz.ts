// The SNES game's other packed format, which its routine DecompressLZ
// unpacks, used by ROMs rebuilt from the disassembly for their centre ice
// logos. As described by the 32-team build's tools (NHL94SNES-SA1, from
// NHL94SNES by abdulahmad):
//
//   two bytes, $10 $FB, then the unpacked size (3 bytes, high byte first)
//   commands, each followed by the 0-3 literal bytes it carries, if any:
//     $00-$7F, 2 bytes: n = b0 & 3 literals, then a copy of ((b0 >> 2) & 7) + 3
//       bytes from ((b0 & $60) << 3) + b1 + 1 back
//     $80-$BF, 3 bytes: n = b1 >> 6 literals, then a copy of (b0 & $3F) + 4
//       bytes from ((b1 & $3F) << 8) + b2 + 1 back
//     $C0-$DF, 4 bytes: n = b0 & 3 literals, then a copy of ((b0 & $0C) << 6)
//       + b3 + 5 bytes from ((b0 & $10) << 12) + (b1 << 8) + b2 + 1 back
//     $E0-$FB: ((b0 & $1F) + 1) * 4 literal bytes
//     $FC-$FF: the end, with b0 & 3 last literal bytes
//   A copy may overlap what it is making, repeating it.

export const LZ_FORMAT = 0xfb10
const HEADER = 5

export class LzError extends Error {}

export function isLz(rom: Uint8Array, at: number): boolean {
  return at + HEADER < rom.length && rom[at] === (LZ_FORMAT & 0xff) && rom[at + 1] === LZ_FORMAT >> 8
}

export function unpackLz(rom: Uint8Array, at: number): { data: Uint8Array; packedSize: number } {
  if (!isLz(rom, at)) throw new LzError(`There is no packed picture at 0x${at.toString(16)}.`)
  const size = (rom[at + 2] << 16) | (rom[at + 3] << 8) | rom[at + 4]
  const out = new Uint8Array(size)
  let length = 0
  let i = at + HEADER
  const byte = () => {
    if (i >= rom.length) throw new LzError('The packed picture runs past the end of the ROM.')
    return rom[i++]
  }
  const literals = (n: number) => {
    if (length + n > size) throw new LzError('The packed picture is longer than it says.')
    for (let k = 0; k < n; k++) out[length++] = byte()
  }
  for (;;) {
    const b0 = byte()
    let copy: number
    let distance: number
    if (b0 < 0x80) {
      const b1 = byte()
      literals(b0 & 3)
      ;[copy, distance] = [((b0 >> 2) & 7) + 3, ((b0 & 0x60) << 3) + b1 + 1]
    } else if (b0 < 0xc0) {
      const [b1, b2] = [byte(), byte()]
      literals(b1 >> 6)
      ;[copy, distance] = [(b0 & 0x3f) + 4, ((b1 & 0x3f) << 8) + b2 + 1]
    } else if (b0 < 0xe0) {
      const [b1, b2, b3] = [byte(), byte(), byte()]
      literals(b0 & 3)
      ;[copy, distance] = [((b0 & 0x0c) << 6) + b3 + 5, ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1]
    } else if (b0 < 0xfc) {
      literals(((b0 & 0x1f) + 1) * 4)
      continue
    } else {
      literals(b0 & 3)
      break
    }
    if (distance > length || length + copy > size) throw new LzError('This is not a packed picture.')
    for (let k = 0; k < copy; k++, length++) out[length] = out[length - distance]
  }
  if (length !== size) throw new LzError('The packed picture is shorter than it says.')
  return { data: out, packedSize: i - at }
}

const MOST_DISTANCE = 0x20000
const MOST_COPY = 1028
const CANDIDATES = 256

// Packs `data` as the game's decoder reads it: each copy the longest found
// among recent places with the same next three bytes, in the shortest
// command that holds it; other bytes as literals.
export function packLz(data: Uint8Array): Uint8Array {
  const n = data.length
  if (n >= 1 << 24) throw new LzError('Too much to pack.')
  const out: number[] = [LZ_FORMAT & 0xff, LZ_FORMAT >> 8, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  let pending: number[] = []
  // Literal runs of four or more go out on their own, leaving up to three for the next command.
  const flush = (keep: number) => {
    while (pending.length - keep >= 4) {
      const run = Math.min(112, Math.floor((pending.length - keep) / 4) * 4)
      out.push(0xe0 | (run / 4 - 1), ...pending.slice(0, run))
      pending = pending.slice(run)
    }
  }
  const heads = new Map<number, number[]>()
  const key = (i: number) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
  const remember = (i: number) => {
    const places = heads.get(key(i))
    if (places) places.push(i)
    else heads.set(key(i), [i])
  }
  for (let i = 0; i < n; ) {
    let best = 0
    let bestDistance = 0
    if (i + 3 <= n) {
      const places = heads.get(key(i)) ?? []
      for (let p = places.length - 1; p >= 0 && p >= places.length - CANDIDATES; p--) {
        const distance = i - places[p]
        if (distance > MOST_DISTANCE) break
        let length = 0
        while (i + length < n && length < MOST_COPY && data[places[p] + length] === data[i + length]) length++
        const usable = length >= 5 || (length >= 4 && distance <= 0x4000) || (length >= 3 && distance <= 0x400)
        if (usable && length > best) [best, bestDistance] = [length, distance]
        if (best === MOST_COPY) break
      }
    }
    if (best < 3) {
      pending.push(data[i])
      if (i + 3 <= n) remember(i)
      i++
      continue
    }
    flush(pending.length % 4)
    const [carried, d] = [pending.length, bestDistance - 1]
    if (best <= 10 && bestDistance <= 0x400) out.push((((d >> 8) & 3) << 5) | ((best - 3) << 2) | carried, d & 0xff)
    else if (best <= 67 && bestDistance <= 0x4000) out.push(0x80 | (best - 4), (carried << 6) | ((d >> 8) & 0x3f), d & 0xff)
    else {
      const length = best - 5
      out.push(0xc0 | (((d >> 16) & 1) << 4) | (((length >> 8) & 3) << 2) | carried, (d >> 8) & 0xff, d & 0xff, length & 0xff)
    }
    out.push(...pending)
    pending = []
    for (let k = 0; k < best; k++) {
      if (i + k + 3 <= n) remember(i + k)
    }
    i += best
  }
  flush(pending.length % 4)
  out.push(0xfc | pending.length, ...pending)
  return Uint8Array.from(out)
}
