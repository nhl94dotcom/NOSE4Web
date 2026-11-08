import { describe, expect, it } from 'vitest'
import { backgroundNote, hasSeeThrough, withSeeThroughBackground } from '../src/core/background'

// An image `size` square in `paint(x, y)`'s colours, all solid.
function image(size: number, paint: (x: number, y: number) => number[]) {
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rgba.set([...paint(x, y), 255], (y * size + x) * 4)
  return { rgba, width: size, height: size }
}
const WHITE = [255, 255, 255]
const RED = [200, 0, 0]
const seeThrough = (img: { rgba: Uint8ClampedArray | Uint8Array }, x: number, y: number, size: number) => img.rgba[(y * size + x) * 4 + 3] === 0

describe('a solid background made see-through', () => {
  // A red ring with white inside it, on white: as MS Paint saves a logo.
  const ring = (x: number, y: number) => {
    const d = Math.hypot(x - 27.5, y - 27.5)
    return d >= 14 && d <= 22 ? RED : WHITE
  }

  it('clears the white around the logo and keeps the white inside it', () => {
    const made = withSeeThroughBackground(image(56, ring))!
    expect(made.colour).toBe('white')
    expect(seeThrough(made.image, 0, 0, 56)).toBe(true)
    expect(seeThrough(made.image, 55, 28, 56)).toBe(true)
    expect(seeThrough(made.image, 28, 28, 56)).toBe(false) // the white inside the ring
    expect(seeThrough(made.image, 28, 8, 56)).toBe(false) // the ring
    expect(backgroundNote(image(56, ring), made.colour)).toContain('the white around the logo was made see-through')
  })

  it('takes JPEG speckle in the background as background', () => {
    const made = withSeeThroughBackground(image(56, (x, y) => (ring(x, y) === RED ? RED : [255 - ((x * 7 + y) % 20), 250, 255])))!
    expect([0, 3, 17, 40].every((x) => seeThrough(made.image, x, 2, 56))).toBe(true)
  })

  it('leaves alone an image with see-through pixels, corners of different colours, or one colour throughout', () => {
    const exported = image(56, ring)
    exported.rgba[3] = 0
    expect(hasSeeThrough(exported)).toBe(true)
    expect(withSeeThroughBackground(exported)).toBeNull()
    expect(backgroundNote(exported, null)).toBe('')
    expect(withSeeThroughBackground(image(56, (x) => (x < 28 ? WHITE : RED)))).toBeNull()
    const plain = image(56, () => RED)
    expect(withSeeThroughBackground(plain)).toBeNull()
    expect(backgroundNote(plain, null)).toContain('no see-through pixels')
  })
})
