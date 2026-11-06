// The SNES game's packed pictures are in EA's Huffman format, which its
// routine DecompressHuffman unpacks. As described by the SNES disassembly
// NHL94SNES (github.com/abdulahmad/NHL94SNES):
//
//   two bytes, $30 $FB, then the unpacked size (3 bytes, high byte first)
//   one byte, the "clue": a symbol that is not a byte of the picture
//   a bit stream, most significant bit first:
//     the number of codes of each length from 1 bit up, until the code
//       space is full
//     the symbols in code order, each as how many unused byte values to
//       skip past the last one, plus 1
//     the codes, canonical: within a length, in the order of the symbols
//   After the clue comes a number: n > 0 repeats the last byte n times; 0
//   then a 1 bit is the end; 0 then a 0 bit and 8 bits is that byte.
//
// Numbers in the stream: z zero bits, a 1 bit (or for z = 0 just the 1),
// then z + 2 bits, plus 2^(z + 2) - 4.

export const HUFFMAN_FORMAT = 0xfb30
const HEADER = 5
// The decoder's code lengths, and the most codes of any length it reads in one go.
const MAX_LENGTH = 16

export class HuffmanError extends Error {}

class BitReader {
  private bits = 0
  private count = 0
  at: number
  private data: Uint8Array
  constructor(data: Uint8Array, at: number) {
    this.data = data
    this.at = at
  }
  get(k: number): number {
    let value = 0
    for (let i = 0; i < k; i++) {
      if (this.count === 0) {
        if (this.at >= this.data.length) throw new HuffmanError('The packed picture runs past the end of the ROM.')
        this.bits = this.data[this.at++]
        this.count = 8
      }
      this.count--
      value = (value << 1) | ((this.bits >> this.count) & 1)
    }
    return value
  }
  number(): number {
    let z = 0
    if (!this.get(1)) {
      z = 1
      while (!this.get(1)) {
        if (++z > MAX_LENGTH) throw new HuffmanError('This is not a packed picture.')
      }
    }
    return this.get(z + 2) + (1 << (z + 2)) - 4
  }
}

class BitWriter {
  private bytes: number[] = []
  private bits = 0
  private count = 0
  put(value: number, k: number): void {
    for (let i = k - 1; i >= 0; i--) {
      this.bits = (this.bits << 1) | ((value >> i) & 1)
      if (++this.count === 8) {
        this.bytes.push(this.bits)
        this.bits = 0
        this.count = 0
      }
    }
  }
  number(n: number): void {
    // z is the smallest with n < 2^(z + 3) - 4.
    let z = 0
    while (n >= (1 << (z + 3)) - 4) z++
    if (z === 0) this.put(1, 1)
    else this.put(1, z + 1)
    this.put(n - ((1 << (z + 2)) - 4), z + 2)
  }
  finish(): number[] {
    if (this.count > 0) this.put(0, 8 - this.count)
    return this.bytes
  }
}

export function isHuffman(rom: Uint8Array, at: number): boolean {
  return at + HEADER + 1 < rom.length && rom[at] === (HUFFMAN_FORMAT & 0xff) && rom[at + 1] === HUFFMAN_FORMAT >> 8
}

// Unpacks the picture at `at`, and says how many bytes it took in the ROM.
export function unpackHuffman(rom: Uint8Array, at: number): { data: Uint8Array; packedSize: number } {
  if (!isHuffman(rom, at)) throw new HuffmanError(`There is no packed picture at 0x${at.toString(16)}.`)
  const size = (rom[at + 2] << 16) | (rom[at + 3] << 8) | rom[at + 4]
  const clue = rom[at + HEADER]
  const bits = new BitReader(rom, at + HEADER + 1)

  const counts: number[] = []
  let code = 0
  let total = 0
  for (;;) {
    code <<= 1
    const count = bits.number()
    counts.push(count)
    total += count
    code += count
    if ((count && code << (MAX_LENGTH - counts.length) >= 1 << MAX_LENGTH) || counts.length > MAX_LENGTH) break
  }
  if (counts.length > MAX_LENGTH || total > 256) throw new HuffmanError('This is not a packed picture.')

  const used = new Array<boolean>(256).fill(false)
  const symbols: number[] = []
  let x = -1
  for (let i = 0; i < total; i++) {
    let skip = (bits.number() + 1) & 0xff || 256
    while (skip > 0) {
      x = (x + 1) & 0xff
      if (!used[x]) skip--
    }
    used[x] = true
    symbols.push(x)
  }

  // Canonical codes: for each length, the first code and where its symbols start.
  const first: number[] = []
  const start: number[] = []
  code = 0
  let s = 0
  counts.forEach((count) => {
    first.push(code)
    start.push(s)
    code = (code + count) << 1
    s += count
  })

  const out = new Uint8Array(size)
  let length = 0
  let last = 0
  for (;;) {
    let value = 0
    let symbol = -1
    for (let ln = 0; ln < counts.length; ln++) {
      value = (value << 1) | bits.get(1)
      if (value - first[ln] < counts[ln]) {
        symbol = symbols[start[ln] + value - first[ln]]
        break
      }
    }
    if (symbol < 0) throw new HuffmanError('The packed picture has a code it does not define.')
    if (symbol !== clue) {
      if (length >= size) throw new HuffmanError('The packed picture is longer than it says.')
      out[length++] = last = symbol
      continue
    }
    const n = bits.number()
    if (n > 0) {
      if (length + n > size) throw new HuffmanError('The packed picture is longer than it says.')
      out.fill(last, length, length + n)
      length += n
    } else if (bits.get(1)) break
    else {
      if (length >= size) throw new HuffmanError('The packed picture is longer than it says.')
      out[length++] = last = bits.get(8)
    }
  }
  if (length !== size) throw new HuffmanError('The packed picture is shorter than it says.')
  return { data: out, packedSize: bits.at - at }
}

// Code lengths for the symbol counts, at most MAX_LENGTH bits, by building a
// Huffman tree and, where it is too deep, flattening it (the counts are
// halved until the tree fits, which is plenty for pictures).
function codeLengths(frequency: number[]): number[] {
  let weights = frequency.slice()
  for (;;) {
    const nodes = weights.flatMap((weight, symbol) => (weight > 0 ? [{ weight, symbols: [symbol] }] : []))
    const lengths = new Array<number>(256).fill(0)
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight)
      const [a, b] = nodes.splice(0, 2)
      for (const symbol of [...a.symbols, ...b.symbols]) lengths[symbol]++
      nodes.push({ weight: a.weight + b.weight, symbols: [...a.symbols, ...b.symbols] })
    }
    if (Math.max(...lengths) <= MAX_LENGTH) return lengths
    weights = weights.map((w) => (w > 0 ? Math.max(1, w >> 1) : 0))
  }
}

type Item = { kind: 'byte'; value: number } | { kind: 'repeat'; count: number }

// The bits a number takes in the stream.
function numberBits(n: number): number {
  let z = 0
  while (n >= (1 << (z + 3)) - 4) z++
  return (z === 0 ? 1 : z + 1) + z + 2
}

// The bytes and repeats to send, given what each symbol's code costs: a run
// of a byte is sent as the byte and a repeat where that takes fewer bits.
function plan(data: Uint8Array, clue: number, cost: number[]): Item[] {
  const items: Item[] = []
  for (let i = 0; i < data.length; ) {
    let run = 1
    while (i + run < data.length && data[i + run] === data[i]) run++
    items.push({ kind: 'byte', value: data[i] })
    const extra = run - 1
    if (extra > 0 && data[i] !== clue && cost[clue] + numberBits(extra) < extra * cost[data[i]]) items.push({ kind: 'repeat', count: extra })
    else for (let k = 0; k < extra; k++) items.push({ kind: 'byte', value: data[i] })
    i += run
  }
  return items
}

// The packed bytes for `items`, and the code lengths used.
function encode(items: Item[], clue: number, size: number): { packed: Uint8Array; lengths: number[] } {
  const frequency = new Array<number>(256).fill(0)
  frequency[clue] = 1
  for (const item of items) frequency[item.kind === 'byte' ? item.value : clue]++
  // At least two codes, so that every code has a length.
  if (frequency.filter((f) => f > 0).length < 2) frequency[(clue + 1) & 0xff] = 1
  const lengths = codeLengths(frequency)

  // Symbols by length, then by value; canonical codes in that order.
  const symbols = lengths.flatMap((length, symbol) => (length > 0 ? [{ symbol, length }] : [])).sort((a, b) => a.length - b.length || a.symbol - b.symbol)
  const maxLength = symbols[symbols.length - 1].length
  const perLength = new Array<number>(maxLength).fill(0)
  for (const { length } of symbols) perLength[length - 1]++
  const codes = new Map<number, { code: number; length: number }>()
  let code = 0
  let previous = 1
  for (const { symbol, length } of symbols) {
    code <<= length - previous
    previous = length
    codes.set(symbol, { code, length })
    code++
  }

  const bits = new BitWriter()
  for (const count of perLength) bits.number(count)
  const used = new Array<boolean>(256).fill(false)
  let x = -1
  for (const { symbol } of symbols) {
    let skip = 0
    while (x !== symbol) {
      x = (x + 1) & 0xff
      if (!used[x]) skip++
    }
    used[symbol] = true
    bits.number((skip - 1) & 0xff)
  }
  const send = (symbol: number) => {
    const c = codes.get(symbol)!
    bits.put(c.code, c.length)
  }
  for (const item of items) {
    if (item.kind === 'repeat') {
      send(clue)
      bits.number(item.count)
    } else if (item.value === clue) {
      send(clue)
      bits.number(0)
      bits.put(0, 1)
      bits.put(clue, 8)
    } else send(item.value)
  }
  send(clue)
  bits.number(0)
  bits.put(1, 1)

  const stream = bits.finish()
  const header = [HUFFMAN_FORMAT & 0xff, HUFFMAN_FORMAT >> 8, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff, clue]
  return { packed: Uint8Array.from([...header, ...stream]), lengths }
}

// Packs `data` as the game's decoder reads it. Which runs are worth sending
// as repeats depends on the codes, and the codes on which runs are sent, so
// a few rounds are tried and the smallest kept.
export function packHuffman(data: Uint8Array): Uint8Array {
  // The clue: a byte value the picture does not use, or failing that the rarest.
  const counts = new Array<number>(256).fill(0)
  for (const byte of data) counts[byte]++
  let clue = counts.indexOf(0)
  if (clue < 0) clue = counts.indexOf(Math.min(...counts))

  // To start with, a byte costs what it would as a code for how often it is used.
  const total = Math.max(1, data.length)
  let cost = counts.map((count) => (count > 0 ? Math.max(1, Math.log2(total / count)) : 16))
  cost[clue] = 8
  let best: Uint8Array | null = null
  for (let round = 0; round < 4; round++) {
    const { packed, lengths } = encode(plan(data, clue, cost), clue, data.length)
    if (!best || packed.length < best.length) best = packed
    cost = lengths.map((length) => length || 16)
  }
  return best!
}
