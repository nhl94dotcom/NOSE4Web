import { describe, expect, it } from 'vitest'
import { isLz, LzError, packLz, unpackLz } from '../src/core/lz'

function sample(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size)
  let state = seed
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < size; ) {
    // Now and then a stretch copied from somewhere earlier, near or far.
    if (i > 16 && random() < 0.3) {
      const from = Math.max(0, i - 1 - Math.floor(random() * Math.min(i, random() < 0.5 ? 0x400 : 0x10000)))
      const length = 3 + Math.floor(random() * (random() < 0.9 ? 20 : 1500))
      for (let k = 0; k < length && i < size; k++) data[i++] = data[from + k]
    } else data[i++] = random() < 0.5 ? 0 : Math.floor(random() * 256)
  }
  return data
}

describe('the SNES game’s LZ packing', () => {
  it('packs and unpacks to the same bytes, with copies near and far, short and long', () => {
    for (const [size, seed] of [[0, 1], [1, 2], [3, 3], [7, 4], [500, 5], [5000, 6], [90000, 7]]) {
      const data = sample(size, seed)
      const packed = packLz(data)
      expect(isLz(packed, 0)).toBe(true)
      expect((packed[2] << 16) | (packed[3] << 8) | packed[4]).toBe(size)
      const { data: back, packedSize } = unpackLz(packed, 0)
      expect(back).toEqual(data)
      expect(packedSize).toBe(packed.length)
    }
  })

  it('packs a long run small, as an overlapping copy', () => {
    const run = new Uint8Array(4000).fill(7)
    const packed = packLz(run)
    expect(packed.length).toBeLessThan(30)
    expect(unpackLz(packed, 0).data).toEqual(run)
  })

  it('says so for something that is not packed this way', () => {
    expect(() => unpackLz(new Uint8Array([1, 2, 3, 4, 5, 6]), 0)).toThrow(LzError)
    // A copy from before the start.
    expect(() => unpackLz(Uint8Array.from([0x10, 0xfb, 0, 0, 4, 0x00, 0x05, 0xfc]), 0)).toThrow(LzError)
  })
})
