import { describe, expect, it } from 'vitest'
import { HuffmanError, isHuffman, packHuffman, unpackHuffman } from '../src/core/huffman'

// Data like the game's pictures: runs, a few common bytes and some rare ones.
function sample(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size)
  let state = seed
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < size; ) {
    const value = random() < 0.6 ? Math.floor(random() * 4) : Math.floor(random() * 256)
    const run = random() < 0.2 ? 1 + Math.floor(random() * 40) : 1
    for (let k = 0; k < run && i < size; k++) data[i++] = value
  }
  return data
}

describe('the SNES game’s packed pictures', () => {
  it('pack and unpack to the same bytes, with the header the game reads', () => {
    for (const [size, seed] of [[1, 1], [2, 2], [100, 3], [4096, 4], [31744, 5]]) {
      const data = sample(size, seed)
      const packed = packHuffman(data)
      expect(isHuffman(packed, 0)).toBe(true)
      expect([packed[0], packed[1]]).toEqual([0x30, 0xfb])
      expect((packed[2] << 16) | (packed[3] << 8) | packed[4]).toBe(size)
      const { data: back, packedSize } = unpackHuffman(packed, 0)
      expect(back).toEqual(data)
      expect(packedSize).toBe(packed.length)
    }
  })

  it('handle every byte value in use, one value only, and long runs', () => {
    const every = Uint8Array.from({ length: 2048 }, (_, i) => (i * 7) & 0xff)
    const one = new Uint8Array(5000).fill(0x42)
    const runs = Uint8Array.from({ length: 70000 }, (_, i) => (i < 65000 ? 0 : i & 0xff))
    for (const data of [every, one, runs]) expect(unpackHuffman(packHuffman(data), 0).data).toEqual(data)
    // Long runs pack small: a repeat, not a code for every byte.
    expect(packHuffman(one).length).toBeLessThan(20)
  })

  it('say so for something that is not a packed picture', () => {
    expect(() => unpackHuffman(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 0)).toThrow(HuffmanError)
    const packed = packHuffman(sample(500, 9))
    expect(() => unpackHuffman(packed.subarray(0, 20), 0)).toThrow(HuffmanError)
  })
})
