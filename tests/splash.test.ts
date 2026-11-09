import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorRgb } from '../src/core/color'
import { buildRom, openRom } from '../src/core/rom'
import { readSplash, splashFromImage, SPLASH_HEIGHT, SPLASH_WIDTH, withOriginalSplash, withSplashImage } from '../src/core/splash'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name = 'nhl94.bin') => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// A test picture: bands of eight colours over a dark blue field, with a white square.
function testImage(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const bands = [[255, 0, 0], [255, 128, 0], [255, 255, 0], [0, 192, 0], [0, 128, 255], [128, 0, 255], [255, 0, 255], [160, 160, 160]]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const square = x > width / 3 && x < (2 * width) / 3 && y > height / 3 && y < (2 * height) / 3
      const rgb = square ? [255, 255, 255] : y < height / 4 ? bands[Math.floor((x / width) * 8)] : [0, 0, 96]
      rgba.set([...rgb, 255], (y * width + x) * 4)
    }
  }
  return rgba
}

describe.skipIf(!existsSync(path('nhl94.bin')))('the second splash screen', () => {
  it("is the original game's two pictures in retail, and wboy's full-screen one in a 30-team ROM", () => {
    const splash = readSplash(open().bytes)!
    expect(splash.original).toBe(true)
    expect(splash.picture.width).toBe(320)
    // Something of both pictures is drawn: High Score at the top, Mark Lesser below.
    const drawn = (from: number, to: number) => splash.picture.pixels.subarray(from * 320, to * 320).some((p) => p !== 128)
    expect(drawn(24, 120)).toBe(true)
    expect(drawn(128, 200)).toBe(true)
    if (local.league30Rom && existsSync(path(local.league30Rom))) expect(readSplash(open(local.league30Rom).bytes)!.original).toBe(false)
  })

  it("takes a picture of the league's own, shows it back, and puts the original back", () => {
    const project = open()
    const image = splashFromImage(testImage(640, 448), 640, 448)
    expect(image.map).toHaveLength(40 * 28)
    expect(image.tiles.length).toBeLessThan(1120)
    // Ten colours: eight bands, white and the blue field, all kept.
    expect(image.kept).toBe(image.colours)
    const hacked = openRom(buildRom(withSplashImage(project, image)))
    const splash = readSplash(hacked.bytes)!
    expect(splash.original).toBe(false)
    // The white square's middle is white, a band is red, the field is dark blue.
    const at = (x: number, y: number) => colorRgb(splash.palette[splash.picture.pixels[y * SPLASH_WIDTH + x]])
    expect(at(160, 112)).toEqual([255, 255, 255])
    expect(at(10, 10)).toEqual([255, 0, 0])
    expect(at(10, SPLASH_HEIGHT - 10)).toEqual([0, 0, 109])
    // Replacing it again reuses its room; putting the original back restores the screen.
    const again = withSplashImage(hacked, splashFromImage(testImage(320, 224), 320, 224))
    expect(again.bytes.length).toBe(hacked.bytes.length)
    const restored = withOriginalSplash(again)
    expect(readSplash(restored.bytes)).toEqual(readSplash(project.bytes))
  })

  it('fits a picture of another shape inside the screen, on black', () => {
    const image = splashFromImage(testImage(100, 200), 100, 200)
    // A tall picture leaves black down both sides: the first tile of the top row is all black.
    expect(image.map[0] & 0x7ff).toBe(image.map[1] & 0x7ff)
  })
})
